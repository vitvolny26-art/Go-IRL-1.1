begin;

create table if not exists public.organizer_team_relationships (
  id uuid primary key default gen_random_uuid(),
  organizer_user_key text not null references public.app_users(user_key) on delete cascade,
  member_user_key text not null references public.app_users(user_key) on delete cascade,
  status text not null default 'pending',
  source text not null default 'favorite_organizer',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_team_relationships_pair_unique unique (organizer_user_key, member_user_key),
  constraint organizer_team_relationships_not_self check (organizer_user_key <> member_user_key),
  constraint organizer_team_relationships_status_check check (status in ('pending','accepted','declined','withdrawn')),
  constraint organizer_team_relationships_source_check check (source = 'favorite_organizer'),
  constraint organizer_team_relationships_state_timestamps_check check (
    (status = 'pending' and responded_at is null and accepted_at is null and declined_at is null and withdrawn_at is null)
    or (status = 'accepted' and responded_at is not null and accepted_at is not null and declined_at is null and withdrawn_at is null)
    or (status = 'declined' and responded_at is not null and accepted_at is null and declined_at is not null and withdrawn_at is null)
    or (status = 'withdrawn' and responded_at is null and accepted_at is null and declined_at is null and withdrawn_at is not null)
  )
);

create index if not exists organizer_team_relationships_organizer_status_idx
  on public.organizer_team_relationships(organizer_user_key, status, updated_at desc);

create index if not exists organizer_team_relationships_member_status_idx
  on public.organizer_team_relationships(member_user_key, status, updated_at desc);

alter table public.organizer_team_relationships enable row level security;

drop trigger if exists organizer_team_relationships_touch_updated_at on public.organizer_team_relationships;
create trigger organizer_team_relationships_touch_updated_at
before update on public.organizer_team_relationships
for each row execute function public.go_irl_touch_updated_at();

drop policy if exists "organizer team relationship participant read" on public.organizer_team_relationships;
create policy "organizer team relationship participant read"
on public.organizer_team_relationships for select to authenticated
using (
  organizer_user_key = public.go_irl_auth_user_key()
  or member_user_key = public.go_irl_auth_user_key()
);

revoke all on table public.organizer_team_relationships from public;
revoke all on table public.organizer_team_relationships from anon;
revoke all on table public.organizer_team_relationships from authenticated;
grant select on table public.organizer_team_relationships to authenticated;

create or replace function public.go_irl_sync_organizer_team_relationship_from_favorite()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.subject_type = 'organizer'
      and old.status = 'active'
      and (
        new.subject_type <> 'organizer'
        or new.status <> 'active'
        or new.organizer_user_key is distinct from old.organizer_user_key
      ) then
      update public.organizer_team_relationships relationship
      set status = 'withdrawn', withdrawn_at = now()
      where relationship.organizer_user_key = old.organizer_user_key
        and relationship.member_user_key = old.user_key
        and relationship.status = 'pending';
    end if;
  end if;

  if new.subject_type = 'organizer' then
    if new.organizer_user_key is null then
      raise exception 'organizer favorite requires organizer_user_key' using errcode = '23514';
    end if;

    if new.user_key = new.organizer_user_key then
      raise exception 'self organizer favorite is not allowed' using errcode = '23514';
    end if;

    if new.status = 'active' then
      insert into public.organizer_team_relationships (
        organizer_user_key, member_user_key, status, source
      ) values (
        new.organizer_user_key, new.user_key, 'pending', 'favorite_organizer'
      )
      on conflict (organizer_user_key, member_user_key) do nothing;
    elsif new.status = 'removed' then
      update public.organizer_team_relationships relationship
      set status = 'withdrawn', withdrawn_at = now()
      where relationship.organizer_user_key = new.organizer_user_key
        and relationship.member_user_key = new.user_key
        and relationship.status = 'pending';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.go_irl_sync_organizer_team_relationship_from_favorite() from public, anon, authenticated;

drop trigger if exists favorites_sync_organizer_team_relationship on public.favorites;
create trigger favorites_sync_organizer_team_relationship
after insert or update on public.favorites
for each row execute function public.go_irl_sync_organizer_team_relationship_from_favorite();

create or replace function public.go_irl_respond_team_request(
  p_member_user_key text,
  p_decision text,
  p_expected_updated_at timestamptz
)
returns table (
  result text,
  organizer_user_key text,
  member_user_key text,
  relationship_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_relationship public.organizer_team_relationships%rowtype;
  v_target_status text;
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.app_users app_user
    where app_user.user_key = v_actor and app_user.status = 'active'
  ) then
    raise exception 'active GO IRL user required' using errcode = '42501';
  end if;

  if p_member_user_key is null or btrim(p_member_user_key) = '' then
    raise exception 'member user key is required' using errcode = '22023';
  end if;

  v_target_status := case p_decision
    when 'accept' then 'accepted'
    when 'decline' then 'declined'
    else null
  end;

  if v_target_status is null then
    raise exception 'decision must be accept or decline' using errcode = '22023';
  end if;

  select relationship.* into v_relationship
  from public.organizer_team_relationships relationship
  where relationship.organizer_user_key = v_actor
    and relationship.member_user_key = p_member_user_key
  for update;

  if not found then
    return query select 'not_found'::text, v_actor, p_member_user_key, null::text, null::timestamptz;
    return;
  end if;

  if v_relationship.status = v_target_status then
    return query select 'existing'::text, v_relationship.organizer_user_key,
      v_relationship.member_user_key, v_relationship.status, v_relationship.updated_at;
    return;
  end if;

  if p_expected_updated_at is null or p_expected_updated_at is distinct from v_relationship.updated_at then
    return query select 'stale'::text, v_relationship.organizer_user_key,
      v_relationship.member_user_key, v_relationship.status, v_relationship.updated_at;
    return;
  end if;

  if v_relationship.status <> 'pending' then
    return query select 'invalid_transition'::text, v_relationship.organizer_user_key,
      v_relationship.member_user_key, v_relationship.status, v_relationship.updated_at;
    return;
  end if;

  update public.organizer_team_relationships relationship
  set status = v_target_status,
      responded_at = now(),
      accepted_at = case when v_target_status = 'accepted' then now() else null end,
      declined_at = case when v_target_status = 'declined' then now() else null end
  where relationship.id = v_relationship.id
  returning relationship.* into v_relationship;

  return query select 'changed'::text, v_relationship.organizer_user_key,
    v_relationship.member_user_key, v_relationship.status, v_relationship.updated_at;
end;
$$;

revoke all on function public.go_irl_respond_team_request(text, text, timestamptz) from public;
revoke execute on function public.go_irl_respond_team_request(text, text, timestamptz) from anon;
grant execute on function public.go_irl_respond_team_request(text, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';

commit;
