-- GO IRL Beauty: governed workspace ownership transfer.
-- Prepared under explicit SQL/migration approval. Production apply remains separately gated.

begin;

create table if not exists public.beauty_workspace_ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.beauty_professional_profiles(id) on delete restrict,
  requested_by_user_key text not null references public.app_users(user_key) on delete restrict,
  token_hash text not null unique,
  state text not null default 'pending_candidate',
  candidate_user_key text references public.app_users(user_key) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  candidate_claimed_at timestamptz,
  decided_at timestamptz,
  decided_by_user_key text references public.app_users(user_key) on delete restrict,
  revoked_at timestamptz,
  constraint beauty_workspace_owner_transfer_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint beauty_workspace_owner_transfer_state_check
    check (state in ('pending_candidate', 'pending_superadmin', 'approved', 'rejected')),
  constraint beauty_workspace_owner_transfer_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '3 days'),
  constraint beauty_workspace_owner_transfer_candidate_state_check
    check (
      (state = 'pending_candidate' and candidate_user_key is null and candidate_claimed_at is null and decided_at is null and decided_by_user_key is null)
      or (state = 'pending_superadmin' and candidate_user_key is not null and candidate_claimed_at is not null and decided_at is null and decided_by_user_key is null)
      or (state in ('approved', 'rejected') and candidate_user_key is not null and candidate_claimed_at is not null and decided_at is not null and decided_by_user_key is not null)
    ),
  constraint beauty_workspace_owner_transfer_revoke_state_check
    check (revoked_at is null or state in ('pending_candidate', 'pending_superadmin'))
);

create unique index if not exists beauty_workspace_owner_transfer_one_active_per_profile_idx
on public.beauty_workspace_ownership_transfers(profile_id)
where state in ('pending_candidate', 'pending_superadmin') and revoked_at is null;

create index if not exists beauty_workspace_owner_transfer_candidate_idx
on public.beauty_workspace_ownership_transfers(candidate_user_key, state)
where candidate_user_key is not null;

alter table public.beauty_workspace_ownership_transfers enable row level security;
revoke all on table public.beauty_workspace_ownership_transfers from public, anon, authenticated, service_role;

comment on table public.beauty_workspace_ownership_transfers is
  'One-time Beauty workspace ownership transfer requests. Raw transfer tokens are never stored.';

create or replace function public.go_irl_request_beauty_workspace_owner_transfer(
  p_token_hash text,
  p_expires_at timestamptz
)
returns table(status text, transfer_id uuid, profile_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_key text;
  v_profile public.beauty_professional_profiles%rowtype;
  v_transfer public.beauty_workspace_ownership_transfers%rowtype;
begin
  v_user_key := public.go_irl_auth_user_key();
  if v_user_key is null
    or not public.go_irl_current_user_is_professional()
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at is null
    or p_expires_at <= now()
    or p_expires_at > now() + interval '3 days' then
    return query select 'invalid'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.owner_user_key = v_user_key
  for update;

  if not found then
    return query select 'profile_missing'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  update public.beauty_workspace_ownership_transfers transfer
  set revoked_at = now()
  where transfer.profile_id = v_profile.id
    and transfer.state in ('pending_candidate', 'pending_superadmin')
    and transfer.revoked_at is null;

  insert into public.beauty_workspace_ownership_transfers (
    profile_id,
    requested_by_user_key,
    token_hash,
    expires_at
  ) values (
    v_profile.id,
    v_user_key,
    p_token_hash,
    p_expires_at
  ) returning * into v_transfer;

  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    v_user_key,
    'beauty_workspace_ownership_transfer.requested',
    'beauty_workspace_ownership_transfer',
    v_transfer.id::text,
    jsonb_build_object('profile_id', v_profile.id, 'expires_at', v_transfer.expires_at)
  );

  return query select 'prepared'::text, v_transfer.id, v_profile.id, v_transfer.expires_at;
end;
$$;

revoke all on function public.go_irl_request_beauty_workspace_owner_transfer(text,timestamptz) from public, anon;
grant execute on function public.go_irl_request_beauty_workspace_owner_transfer(text,timestamptz) to authenticated;

create or replace function public.go_irl_claim_beauty_workspace_owner_transfer(
  p_token_hash text,
  p_candidate_user_key text
)
returns table(status text, transfer_id uuid, profile_id uuid, current_owner_user_key text, candidate_user_key text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transfer public.beauty_workspace_ownership_transfers%rowtype;
  v_profile public.beauty_professional_profiles%rowtype;
  v_candidate_role text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_candidate_user_key is null then
    return query select 'invalid'::text, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  select transfer.* into v_transfer
  from public.beauty_workspace_ownership_transfers transfer
  where transfer.token_hash = p_token_hash
  for update;

  if not found then
    return query select 'invalid'::text, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  if v_transfer.revoked_at is not null or v_transfer.expires_at <= now() then
    return query select 'expired_or_revoked'::text, v_transfer.id, v_transfer.profile_id, v_transfer.requested_by_user_key, null::text;
    return;
  end if;

  if v_transfer.state = 'pending_superadmin' then
    if v_transfer.candidate_user_key = p_candidate_user_key then
      return query select 'already_claimed'::text, v_transfer.id, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.candidate_user_key;
    end if;
    return query select 'invalid'::text, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  if v_transfer.state <> 'pending_candidate' then
    return query select v_transfer.state, v_transfer.id, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.candidate_user_key;
    return;
  end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.id = v_transfer.profile_id
  for update;

  if not found or v_profile.owner_user_key <> v_transfer.requested_by_user_key then
    return query select 'owner_changed'::text, v_transfer.id, v_transfer.profile_id, v_transfer.requested_by_user_key, null::text;
    return;
  end if;

  if p_candidate_user_key = v_profile.owner_user_key then
    return query select 'same_owner'::text, v_transfer.id, v_transfer.profile_id, v_profile.owner_user_key, p_candidate_user_key;
    return;
  end if;

  if not exists (
    select 1 from public.app_users app_user
    where app_user.user_key = p_candidate_user_key and app_user.status = 'active'
  ) then
    return query select 'candidate_unavailable'::text, v_transfer.id, v_transfer.profile_id, v_profile.owner_user_key, p_candidate_user_key;
    return;
  end if;

  if exists (
    select 1 from public.beauty_professional_profiles profile
    where profile.owner_user_key = p_candidate_user_key
  ) then
    return query select 'profile_conflict'::text, v_transfer.id, v_transfer.profile_id, v_profile.owner_user_key, p_candidate_user_key;
    return;
  end if;

  select role into v_candidate_role
  from public.user_roles
  where user_key = p_candidate_user_key;
  if v_candidate_role is not null and v_candidate_role not in ('user', 'professional') then
    return query select 'role_conflict'::text, v_transfer.id, v_transfer.profile_id, v_profile.owner_user_key, p_candidate_user_key;
    return;
  end if;

  update public.beauty_workspace_ownership_transfers
  set state = 'pending_superadmin',
      candidate_user_key = p_candidate_user_key,
      candidate_claimed_at = now()
  where id = v_transfer.id;

  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    p_candidate_user_key,
    'beauty_workspace_ownership_transfer.candidate_claimed',
    'beauty_workspace_ownership_transfer',
    v_transfer.id::text,
    jsonb_build_object('profile_id', v_transfer.profile_id, 'current_owner_user_key', v_profile.owner_user_key)
  );

  return query select 'pending_superadmin'::text, v_transfer.id, v_transfer.profile_id, v_profile.owner_user_key, p_candidate_user_key;
end;
$$;

revoke all on function public.go_irl_claim_beauty_workspace_owner_transfer(text,text) from public, anon, authenticated;
grant execute on function public.go_irl_claim_beauty_workspace_owner_transfer(text,text) to service_role;

create or replace function public.go_irl_get_beauty_workspace_owner_transfer_status(
  p_token_hash text,
  p_candidate_user_key text
)
returns table(status text, transfer_id uuid, profile_id uuid, candidate_user_key text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transfer public.beauty_workspace_ownership_transfers%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_candidate_user_key is null then
    return query select 'invalid'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  select transfer.* into v_transfer
  from public.beauty_workspace_ownership_transfers transfer
  where transfer.token_hash = p_token_hash;

  if not found or v_transfer.candidate_user_key is distinct from p_candidate_user_key then
    return query select 'invalid'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_transfer.revoked_at is not null or (v_transfer.expires_at <= now() and v_transfer.state not in ('approved', 'rejected')) then
    return query select 'expired_or_revoked'::text, v_transfer.id, v_transfer.profile_id, v_transfer.candidate_user_key;
    return;
  end if;

  return query select v_transfer.state, v_transfer.id, v_transfer.profile_id, v_transfer.candidate_user_key;
end;
$$;

revoke all on function public.go_irl_get_beauty_workspace_owner_transfer_status(text,text) from public, anon, authenticated;
grant execute on function public.go_irl_get_beauty_workspace_owner_transfer_status(text,text) to service_role;

create or replace function public.go_irl_list_pending_beauty_workspace_owner_transfers(
  p_superadmin_user_key text
)
returns table(
  transfer_id uuid,
  profile_id uuid,
  display_name text,
  current_owner_user_key text,
  candidate_user_key text,
  candidate_claimed_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.app_users app_user
    join public.user_roles role on role.user_key = app_user.user_key
    where app_user.user_key = p_superadmin_user_key
      and app_user.status = 'active'
      and role.role = 'superadmin'
  ) then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  return query
  select
    transfer.id,
    transfer.profile_id,
    profile.display_name,
    transfer.requested_by_user_key,
    transfer.candidate_user_key,
    transfer.candidate_claimed_at,
    transfer.expires_at
  from public.beauty_workspace_ownership_transfers transfer
  join public.beauty_professional_profiles profile on profile.id = transfer.profile_id
  where transfer.state = 'pending_superadmin'
    and transfer.revoked_at is null
    and transfer.expires_at > now()
  order by transfer.candidate_claimed_at asc;
end;
$$;

revoke all on function public.go_irl_list_pending_beauty_workspace_owner_transfers(text) from public, anon, authenticated;
grant execute on function public.go_irl_list_pending_beauty_workspace_owner_transfers(text) to service_role;

create or replace function public.go_irl_decide_beauty_workspace_owner_transfer(
  p_transfer_id uuid,
  p_decision text,
  p_superadmin_user_key text
)
returns table(status text, profile_id uuid, previous_owner_user_key text, current_owner_user_key text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transfer public.beauty_workspace_ownership_transfers%rowtype;
  v_profile public.beauty_professional_profiles%rowtype;
  v_candidate_role text;
begin
  if p_decision not in ('approve', 'reject') then
    return query select 'invalid_decision'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if not exists (
    select 1
    from public.app_users app_user
    join public.user_roles role on role.user_key = app_user.user_key
    where app_user.user_key = p_superadmin_user_key
      and app_user.status = 'active'
      and role.role = 'superadmin'
  ) then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  select transfer.* into v_transfer
  from public.beauty_workspace_ownership_transfers transfer
  where transfer.id = p_transfer_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if v_transfer.state in ('approved', 'rejected') then
    return query select v_transfer.state, v_transfer.profile_id, v_transfer.requested_by_user_key,
      case when v_transfer.state = 'approved' then v_transfer.candidate_user_key else v_transfer.requested_by_user_key end;
    return;
  end if;

  if v_transfer.state <> 'pending_superadmin'
    or v_transfer.candidate_user_key is null
    or v_transfer.revoked_at is not null
    or v_transfer.expires_at <= now() then
    return query select 'not_decidable'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.requested_by_user_key;
    return;
  end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.id = v_transfer.profile_id
  for update;

  if not found or v_profile.owner_user_key <> v_transfer.requested_by_user_key then
    return query select 'owner_changed'::text, v_transfer.profile_id, v_transfer.requested_by_user_key,
      case when found then v_profile.owner_user_key else null end;
    return;
  end if;

  if p_decision = 'reject' then
    update public.beauty_workspace_ownership_transfers
    set state = 'rejected', decided_at = now(), decided_by_user_key = p_superadmin_user_key
    where id = v_transfer.id;

    insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
    values (
      p_superadmin_user_key,
      'beauty_workspace_ownership_transfer.rejected',
      'beauty_workspace_ownership_transfer',
      v_transfer.id::text,
      jsonb_build_object(
        'profile_id', v_transfer.profile_id,
        'previous_owner_user_key', v_transfer.requested_by_user_key,
        'candidate_user_key', v_transfer.candidate_user_key
      )
    );

    return query select 'rejected'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.requested_by_user_key;
    return;
  end if;

  if not exists (
    select 1 from public.app_users app_user
    where app_user.user_key = v_transfer.candidate_user_key and app_user.status = 'active'
  ) then
    return query select 'candidate_unavailable'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.requested_by_user_key;
    return;
  end if;

  if exists (
    select 1 from public.beauty_professional_profiles profile
    where profile.owner_user_key = v_transfer.candidate_user_key
      and profile.id <> v_transfer.profile_id
  ) then
    return query select 'profile_conflict'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.requested_by_user_key;
    return;
  end if;

  select role into v_candidate_role
  from public.user_roles
  where user_key = v_transfer.candidate_user_key
  for update;

  if v_candidate_role is null then
    insert into public.user_roles(user_key, role, note)
    values (v_transfer.candidate_user_key, 'professional', 'Assigned through approved Beauty workspace ownership transfer');
  elsif v_candidate_role = 'user' then
    update public.user_roles
    set role = 'professional',
        note = 'Assigned through approved Beauty workspace ownership transfer',
        updated_at = now()
    where user_key = v_transfer.candidate_user_key;
  elsif v_candidate_role <> 'professional' then
    return query select 'role_conflict'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.requested_by_user_key;
    return;
  end if;

  update public.beauty_professional_profiles
  set owner_user_key = v_transfer.candidate_user_key,
      updated_at = now()
  where id = v_transfer.profile_id
    and owner_user_key = v_transfer.requested_by_user_key;

  if not found then
    raise exception 'ownership_conflict' using errcode = '40001';
  end if;

  update public.beauty_workspace_ownership_transfers
  set state = 'approved', decided_at = now(), decided_by_user_key = p_superadmin_user_key
  where id = v_transfer.id;

  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    p_superadmin_user_key,
    'beauty_workspace_ownership_transfer.approved',
    'beauty_workspace_ownership_transfer',
    v_transfer.id::text,
    jsonb_build_object(
      'profile_id', v_transfer.profile_id,
      'previous_owner_user_key', v_transfer.requested_by_user_key,
      'current_owner_user_key', v_transfer.candidate_user_key
    )
  );

  return query select 'approved'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.candidate_user_key;
end;
$$;

revoke all on function public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text) from public, anon, authenticated;
grant execute on function public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text) to service_role;

notify pgrst, 'reload schema';

commit;
