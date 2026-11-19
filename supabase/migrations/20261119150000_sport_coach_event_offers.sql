-- Sport Coach: role-gated candidate offers and organizer acceptance.
-- Cross-account workflow; no demo-mode writes or anonymous access.
-- A dedicated offer is NOT a participant_interest coach request.

create table public.coach_event_offers (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  candidate_user_key text not null references public.app_users(user_key) on delete cascade,
  coach_profile_id uuid not null references public.coach_profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_event_offers_one_per_candidate unique (activity_id, candidate_user_key)
);

create index coach_event_offers_activity_status
  on public.coach_event_offers (activity_id, status);

-- A database-level guard against multiple accepted coaches per activity.
create unique index coach_event_offers_one_accepted_per_activity
  on public.coach_event_offers (activity_id) where status = 'accepted';

alter table public.coach_event_offers enable row level security;
revoke all on public.coach_event_offers from public, anon, authenticated;
grant select on public.coach_event_offers to authenticated, service_role;

create policy "coach event offers read own or organizer"
on public.coach_event_offers
for select to authenticated
using (
  candidate_user_key = public.go_irl_auth_user_key()
  or exists (
    select 1 from public.activities a
    where a.id = activity_id
      and a.organizer_key = public.go_irl_auth_user_key()
  )
);

-- Do not expose private request rows. Return only a state to a viewer who
-- can see the activity; the organizer's request is the single source of truth.
create function public.go_irl_public_coach_state(p_activity_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_state text;
begin
  if v_actor is null or btrim(v_actor) = '' then return 'none'; end if;
  if not exists (
    select 1 from public.activities a
    where a.id = p_activity_id
      and (
        a.visibility = 'public'
        or a.organizer_key = v_actor
        or exists (
          select 1 from public.activity_members m
          where m.activity_id = a.id and m.user_key = v_actor and m.status = 'joined'
        )
      )
  ) then return 'none'; end if;

  select case when r.status = 'confirmed' then 'confirmed' else 'requested' end
  into v_state
  from public.coach_requests r
  where r.activity_id = p_activity_id
    and r.request_type = 'organizer_request'
    and r.status in ('pending', 'matched', 'confirmed')
  order by case when r.status = 'confirmed' then 0 else 1 end, r.created_at desc
  limit 1;
  return coalesce(v_state, 'none');
end;
$$;

-- The candidate's role interests stay private; this function discloses
-- only a boolean to the authenticated candidate.
create function public.go_irl_can_offer_coach(p_activity_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
begin
  return v_actor is not null and exists (
    select 1 from public.activities a
    where a.id = p_activity_id
      and a.category_id = 'sport'
      and a.organizer_key <> v_actor
      and (
        a.visibility = 'public'
        or exists (
          select 1 from public.activity_members m
          where m.activity_id = a.id and m.user_key = v_actor and m.status = 'joined'
        )
      )
      and exists (
        select 1 from public.coach_requests r
        where r.activity_id = a.id
          and r.request_type = 'organizer_request'
          and r.status in ('pending', 'matched')
      )
      and exists (
        select 1 from public.user_profile_role_interests ri
        where ri.user_key = v_actor and ri.role_id = 'coach'
          and ri.interest_level in ('can_help', 'professional')
      )
      and exists (
        select 1 from public.app_users u
        where u.user_key = v_actor and u.status = 'active'
      )
  );
end;
$$;

create function public.go_irl_submit_coach_offer(
  p_activity_id uuid, p_display_name text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_profile_id uuid;
  v_offer_id uuid;
  v_request_id uuid;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_actor is null or v_actor = '' then
    raise exception 'trusted authentication required' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'coach display name must be 2..80 characters' using errcode = '22023';
  end if;
  if not public.go_irl_can_offer_coach(p_activity_id) then
    raise exception 'coach offer is not available for this activity' using errcode = '42501';
  end if;

  -- Serialize against organizer acceptance/cancellation of the request.
  select r.id into v_request_id
  from public.coach_requests r
  where r.activity_id = p_activity_id
    and r.request_type = 'organizer_request'
    and r.status in ('pending', 'matched')
  for share;
  if v_request_id is null then
    raise exception 'coach request is no longer open' using errcode = '22023';
  end if;

  insert into public.coach_profiles (user_key, display_name)
  values (v_actor, v_name)
  on conflict (user_key) do update
    set display_name = excluded.display_name, updated_at = now()
  returning id into v_profile_id;

  insert into public.coach_event_offers (
    activity_id, candidate_user_key, coach_profile_id, status
  ) values (p_activity_id, v_actor, v_profile_id, 'pending')
  on conflict on constraint coach_event_offers_one_per_candidate do update
    set coach_profile_id = excluded.coach_profile_id,
        status = 'pending', updated_at = now()
    where public.coach_event_offers.status = 'withdrawn'
  returning id into v_offer_id;

  if v_offer_id is null then
    select id into v_offer_id from public.coach_event_offers
    where activity_id = p_activity_id and candidate_user_key = v_actor;
  end if;
  return v_offer_id;
end;
$$;

create function public.go_irl_accept_coach_offer(p_offer_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_offer public.coach_event_offers%rowtype;
  v_activity_id uuid;
  v_request_id uuid;
begin
  if v_actor is null or v_actor = '' then
    raise exception 'trusted authentication required' using errcode = '42501';
  end if;

  select activity_id into v_activity_id
  from public.coach_event_offers where id = p_offer_id;
  if v_activity_id is null or not exists (
    select 1 from public.activities a
    where a.id = v_activity_id and a.organizer_key = v_actor
      and a.category_id = 'sport'
  ) then
    raise exception 'only the organizer can accept a coach' using errcode = '42501';
  end if;

  -- Common request lock FIRST; serializes competing candidate confirmations.
  select r.id into v_request_id
  from public.coach_requests r
  where r.activity_id = v_activity_id
    and r.request_type = 'organizer_request'
    and r.requester_user_key = v_actor
    and r.status in ('pending', 'matched')
  for update;
  if v_request_id is null then
    raise exception 'coach request is no longer open' using errcode = '22023';
  end if;

  select * into v_offer from public.coach_event_offers
  where id = p_offer_id for update;
  if not found or v_offer.status <> 'pending' or v_offer.activity_id <> v_activity_id then
    raise exception 'no pending coach offer' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.coach_profiles p
    join public.app_users u on u.user_key = p.user_key
    join public.user_profile_role_interests ri
      on ri.user_key = p.user_key and ri.role_id = 'coach'
    where p.id = v_offer.coach_profile_id
      and p.user_key = v_offer.candidate_user_key
      and p.is_active and u.status = 'active'
      and ri.interest_level in ('can_help', 'professional')
  ) then
    raise exception 'coach is no longer eligible' using errcode = '22023';
  end if;

  update public.coach_requests
  set coach_profile_id = v_offer.coach_profile_id,
      status = 'confirmed', updated_at = now()
  where id = v_request_id;

  update public.coach_event_offers
  set status = case when id = p_offer_id then 'accepted' else 'declined' end,
      updated_at = now()
  where activity_id = v_offer.activity_id and status = 'pending';
end;
$$;

create function public.go_irl_close_coach_offer(p_offer_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_offer public.coach_event_offers%rowtype;
begin
  if v_actor is null or v_actor = '' then
    raise exception 'trusted authentication required' using errcode = '42501';
  end if;
  if p_status not in ('withdrawn', 'declined') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  select * into v_offer from public.coach_event_offers
  where id = p_offer_id for update;
  if not found or v_offer.status <> 'pending' then
    raise exception 'no pending coach offer' using errcode = '22023';
  end if;

  if p_status = 'withdrawn' and v_offer.candidate_user_key <> v_actor then
    raise exception 'only candidate can withdraw' using errcode = '42501';
  end if;
  if p_status = 'declined' and not exists (
    select 1 from public.activities a
    where a.id = v_offer.activity_id and a.organizer_key = v_actor
  ) then
    raise exception 'only organizer can decline' using errcode = '42501';
  end if;
  update public.coach_event_offers
  set status = p_status, updated_at = now() where id = p_offer_id;
end;
$$;

-- SECURITY DEFINER functions are callable only with a trusted JWT.
revoke all on function public.go_irl_public_coach_state(uuid) from public, anon;
revoke all on function public.go_irl_can_offer_coach(uuid) from public, anon;
revoke all on function public.go_irl_submit_coach_offer(uuid, text) from public, anon;
revoke all on function public.go_irl_accept_coach_offer(uuid) from public, anon;
revoke all on function public.go_irl_close_coach_offer(uuid, text) from public, anon;
grant execute on function public.go_irl_public_coach_state(uuid) to authenticated;
grant execute on function public.go_irl_can_offer_coach(uuid) to authenticated;
grant execute on function public.go_irl_submit_coach_offer(uuid, text) to authenticated;
grant execute on function public.go_irl_accept_coach_offer(uuid) to authenticated;
grant execute on function public.go_irl_close_coach_offer(uuid, text) to authenticated;
