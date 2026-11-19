-- Sport Coach: link-only invitations distinct from participation.
-- A bearer token is SHA-256 hashed; the secret is never stored in plaintext.
create table public.coach_event_invitations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  issuer_user_key text not null references public.app_users(user_key) on delete cascade,
  token_hash bytea not null unique,
  claimed_by_user_key text references public.app_users(user_key) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index coach_event_invitations_activity_idx
  on public.coach_event_invitations(activity_id,created_at desc);
alter table public.coach_event_invitations enable row level security;
revoke all on public.coach_event_invitations from public,anon,authenticated;
grant all on public.coach_event_invitations to service_role;

create function public.go_irl_create_coach_invitation(p_activity_id uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_event public.activities%rowtype;
  v_token text;
begin
  if v_actor is null or not exists(
    select 1 from public.app_users u where u.user_key=v_actor and u.status='active'
  ) then raise exception 'trusted authentication required' using errcode='42501'; end if;
  select * into v_event from public.activities a
    where a.id=p_activity_id and a.organizer_key=v_actor
      and a.category_id='sport' and a.visibility='invite'
    for update;
  if not found then
    raise exception 'only invite-only sport organizers may create coach invitations' using errcode='42501';
  end if;
  if ((v_event.event_date + v_event.event_time)::timestamp at time zone 'Europe/Prague')
      <= now()+interval '15 minutes' then
    raise exception 'event is closed or starts too soon' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.coach_requests r
    where r.activity_id=p_activity_id and r.requester_user_key=v_actor
      and r.request_type='organizer_request' and r.status in ('pending','matched')
  ) then raise exception 'organizer must request a coach first' using errcode='22023'; end if;
  if (select count(*) from public.coach_event_invitations i
      where i.activity_id=p_activity_id and i.created_at>now()-interval '24 hours')>=5 then
    raise exception 'coach invitation rate limit exceeded' using errcode='22023';
  end if;
  -- Reissuing a code revokes unclaimed codes but never invalidates a submitted offer.
  update public.coach_event_invitations set revoked_at=now()
    where activity_id=p_activity_id and revoked_at is null and claimed_by_user_key is null;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.coach_event_invitations(activity_id,issuer_user_key,token_hash,expires_at)
    values(p_activity_id,v_actor,sha256(convert_to(v_token,'UTF8')),
      least(now()+interval '48 hours',
        (v_event.event_date+v_event.event_time)::timestamp at time zone 'Europe/Prague'));
  return v_token;
end;
$$;

-- Minimal private preview for an authenticated holder of an unexpired code.
create function public.go_irl_preview_coach_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_inv public.coach_event_invitations%rowtype;
  v_event public.activities%rowtype;
  v_offer_status text;
  v_open boolean;
  v_eligible boolean;
begin
  if v_actor is null or not exists(
    select 1 from public.app_users u where u.user_key=v_actor and u.status='active'
  ) then raise exception 'trusted authentication required' using errcode='42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'coach invitation unavailable' using errcode='22023';
  end if;
  select * into v_inv from public.coach_event_invitations i
    where i.token_hash=sha256(convert_to(p_token,'UTF8'))
      and i.revoked_at is null and i.expires_at>now()
      and (i.claimed_by_user_key is null or i.claimed_by_user_key=v_actor);
  if not found then raise exception 'coach invitation unavailable' using errcode='22023'; end if;
  select * into v_event from public.activities a
    where a.id=v_inv.activity_id and a.category_id='sport' and a.visibility='invite';
  if not found then raise exception 'coach invitation unavailable' using errcode='22023'; end if;
  select o.status into v_offer_status from public.coach_event_offers o
    where o.activity_id=v_event.id and o.candidate_user_key=v_actor;
  v_open := exists(
    select 1 from public.coach_requests r
    where r.activity_id=v_event.id and r.request_type='organizer_request'
      and r.requester_user_key=v_event.organizer_key and r.status in ('pending','matched')
  );
  v_eligible := v_actor<>v_event.organizer_key and exists(
    select 1 from public.user_profile_role_interests ri
    where ri.user_key=v_actor and ri.role_id='coach'
      and ri.interest_level in ('can_help','professional')
  );
  return jsonb_build_object(
    'title',v_event.title_ru,
    'date',v_event.event_date,
    'time',v_event.event_time,
    'cityId',v_event.city_id,
    'sportType',coalesce((
      select r.sport_type from public.coach_requests r
      where r.activity_id=v_event.id and r.request_type='organizer_request'
        and r.requester_user_key=v_event.organizer_key
      order by r.created_at desc limit 1
    ),'sport'),
    'participantCount',(
      select count(*) from public.activity_members m
      where m.activity_id=v_event.id and m.status='joined'
    ),
    -- Exact address is visible only to the accepted coach.
    'address',case when v_offer_status='accepted' then v_event.address else null end,
    'canOffer',v_open and v_eligible
      and (v_offer_status is null or v_offer_status='withdrawn'),
    'offerStatus',coalesce(v_offer_status,'none')
  );
end;
$$;

-- Invited coach may submit WITHOUT creating a participant row.
-- Locks serialize claiming and block submissions after organizer confirmation.
create function public.go_irl_submit_invited_coach_offer(p_token text,p_display_name text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_inv public.coach_event_invitations%rowtype;
  v_event public.activities%rowtype;
  v_request uuid;
  v_profile uuid;
  v_offer uuid;
  v_name text := btrim(coalesce(p_display_name,''));
begin
  if v_actor is null or not exists(
    select 1 from public.app_users u where u.user_key=v_actor and u.status='active'
  ) then raise exception 'trusted authentication required' using errcode='42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'coach invitation unavailable' using errcode='22023';
  end if;
  if length(v_name)<2 or length(v_name)>80 then
    raise exception 'display name must be 2..80 characters' using errcode='22023';
  end if;
  select * into v_inv from public.coach_event_invitations i
    where i.token_hash=sha256(convert_to(p_token,'UTF8'))
      and i.revoked_at is null and i.expires_at>now()
      and (i.claimed_by_user_key is null or i.claimed_by_user_key=v_actor)
    for update;
  if not found then raise exception 'coach invitation unavailable' using errcode='22023'; end if;
  select * into v_event from public.activities a
    where a.id=v_inv.activity_id and a.category_id='sport' and a.visibility='invite';
  if not found or v_event.organizer_key=v_actor then
    raise exception 'another eligible account must accept this invitation' using errcode='42501';
  end if;
  if ((v_event.event_date+v_event.event_time)::timestamp at time zone 'Europe/Prague')<=now() then
    raise exception 'event already started' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.user_profile_role_interests ri
    where ri.user_key=v_actor and ri.role_id='coach'
      and ri.interest_level in ('can_help','professional')
  ) then raise exception 'saved coach role required' using errcode='42501'; end if;

  select r.id into v_request from public.coach_requests r
    where r.activity_id=v_event.id and r.requester_user_key=v_event.organizer_key
      and r.request_type='organizer_request' and r.status in ('pending','matched')
    for share;
  if v_request is null then
    raise exception 'coach request is no longer open' using errcode='22023';
  end if;
  if exists(
    select 1 from public.coach_requests r
    where r.activity_id=v_event.id and r.request_type='organizer_request'
      and r.status='confirmed'
  ) then raise exception 'coach already assigned' using errcode='22023'; end if;

  -- Preserve verified profiles rather than changing their existing display names.
  insert into public.coach_profiles(user_key,display_name)
    values(v_actor,v_name) on conflict(user_key) do nothing;
  select p.id into v_profile from public.coach_profiles p
    where p.user_key=v_actor and p.is_active=true;
  if v_profile is null then
    raise exception 'active coach profile required' using errcode='42501';
  end if;
  insert into public.coach_event_offers(activity_id,candidate_user_key,coach_profile_id,status)
    values(v_event.id,v_actor,v_profile,'pending')
    on conflict on constraint coach_event_offers_one_per_candidate
    do update set status='pending',coach_profile_id=excluded.coach_profile_id,
      updated_at=now() where public.coach_event_offers.status='withdrawn'
    returning id into v_offer;
  if v_offer is null then
    raise exception 'coach already offered or was declined' using errcode='22023';
  end if;
  update public.coach_event_invitations set claimed_by_user_key=v_actor
    where id=v_inv.id;
  return v_offer;
end;
$$;

create function public.go_irl_revoke_coach_invitation(p_activity_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_count integer;
begin
  if v_actor is null or not exists(
    select 1 from public.activities a
    where a.id=p_activity_id and a.organizer_key=v_actor
      and a.visibility='invite' and a.category_id='sport'
  ) then raise exception 'organizer required' using errcode='42501'; end if;
  update public.coach_event_invitations set revoked_at=now()
    where activity_id=p_activity_id and revoked_at is null and claimed_by_user_key is null;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.go_irl_create_coach_invitation(uuid) from public,anon,authenticated;
revoke all on function public.go_irl_preview_coach_invitation(text) from public,anon,authenticated;
revoke all on function public.go_irl_submit_invited_coach_offer(text,text) from public,anon,authenticated;
revoke all on function public.go_irl_revoke_coach_invitation(uuid) from public,anon,authenticated;
grant execute on function public.go_irl_create_coach_invitation(uuid) to authenticated;
grant execute on function public.go_irl_preview_coach_invitation(text) to authenticated;
grant execute on function public.go_irl_submit_invited_coach_offer(text,text) to authenticated;
grant execute on function public.go_irl_revoke_coach_invitation(uuid) to authenticated;
