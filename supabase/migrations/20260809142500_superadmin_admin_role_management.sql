begin;

alter table public.role_invitations
  drop constraint if exists role_invitations_target_role_check;

alter table public.role_invitations
  add constraint role_invitations_target_role_check
  check (target_role in ('organizer', 'professional', 'admin'));

comment on table public.role_invitations is
  'Single-use, 24-hour bearer invitations for admin-approved organizer/professional promotion and superadmin-approved admin promotion. Raw tokens are never stored.';

create or replace function public.go_irl_create_role_invitation(
  p_token_hash text,
  p_target_role text,
  p_created_by_user_key text,
  p_expires_at timestamptz
)
returns table(id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invitation_id uuid;
  v_expires_at timestamptz;
  v_actor_role text;
begin
  if p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_target_role is null
    or p_target_role not in ('organizer', 'professional', 'admin')
    or p_created_by_user_key is null
    or p_created_by_user_key !~ '^telegram:[0-9]+$'
    or p_expires_at is null
    or p_expires_at <= now()
    or p_expires_at > now() + interval '24 hours'
  then
    raise exception 'invalid_role_invitation_request';
  end if;

  select role into v_actor_role
  from public.user_roles
  where user_key = p_created_by_user_key;

  if v_actor_role is null
    or v_actor_role not in ('admin', 'superadmin')
    or (p_target_role = 'admin' and v_actor_role <> 'superadmin')
  then
    raise exception 'access_denied';
  end if;

  insert into public.role_invitations (
    token_hash,
    target_role,
    created_by_user_key,
    expires_at
  ) values (
    p_token_hash,
    p_target_role,
    p_created_by_user_key,
    p_expires_at
  )
  returning role_invitations.id, role_invitations.expires_at
  into v_invitation_id, v_expires_at;

  insert into public.audit_log (
    actor_user_key,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_created_by_user_key,
    'role_invitation.created',
    'role_invitation',
    v_invitation_id::text,
    jsonb_build_object(
      'target_role', p_target_role,
      'expires_at', v_expires_at
    )
  );

  return query select v_invitation_id, v_expires_at;
end;
$$;

revoke execute on function public.go_irl_create_role_invitation(text, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.go_irl_create_role_invitation(text, text, text, timestamptz)
to service_role;

create or replace function public.go_irl_list_elevated_roles()
returns table(
  user_key text,
  telegram_id bigint,
  first_name text,
  last_name text,
  username text,
  role text,
  updated_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    roles.user_key,
    users.telegram_id,
    users.first_name,
    users.last_name,
    users.username,
    roles.role,
    roles.updated_at
  from public.user_roles roles
  left join public.app_users users on users.user_key = roles.user_key
  where roles.role in ('organizer', 'professional', 'moderator', 'admin', 'superadmin')
  order by roles.role, coalesce(users.first_name, ''), roles.user_key
  limit 200;
$$;

revoke execute on function public.go_irl_list_elevated_roles()
from public, anon, authenticated;
grant execute on function public.go_irl_list_elevated_roles()
to service_role;

create or replace function public.go_irl_demote_role(
  p_target_user_key text,
  p_actor_user_key text
)
returns table(status text, previous_role text, "current_role" text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_previous_role text;
  v_actor_role text;
begin
  if p_target_user_key is null
    or p_target_user_key !~ '^telegram:[0-9]+$'
    or p_actor_user_key is null
    or p_actor_user_key !~ '^telegram:[0-9]+$'
  then
    return query select 'invalid'::text, null::text, null::text;
    return;
  end if;

  select role into v_actor_role
  from public.user_roles
  where user_key = p_actor_user_key;

  select role into v_previous_role
  from public.user_roles
  where user_key = p_target_user_key
  for update;

  if not found then
    return query select 'not_found'::text, null::text, null::text;
    return;
  end if;

  if v_actor_role is null
    or v_previous_role = 'superadmin'
    or v_previous_role not in ('organizer', 'professional', 'moderator', 'admin')
    or v_actor_role not in ('admin', 'superadmin')
    or (v_previous_role = 'admin' and v_actor_role <> 'superadmin')
  then
    return query select 'role_conflict'::text, v_previous_role, v_previous_role;
    return;
  end if;

  update public.user_roles
  set role = 'user',
      note = 'Elevated role removed through admin panel',
      updated_at = now()
  where user_key = p_target_user_key
    and role = v_previous_role;

  if not found then
    return query select 'role_conflict'::text, v_previous_role, v_previous_role;
    return;
  end if;

  insert into public.audit_log (
    actor_user_key,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_actor_user_key,
    'user_role.demoted',
    'user_role',
    p_target_user_key,
    jsonb_build_object(
      'previous_role', v_previous_role,
      'current_role', 'user'
    )
  );

  return query select 'updated'::text, v_previous_role, 'user'::text;
end;
$$;

revoke execute on function public.go_irl_demote_role(text, text)
from public, anon, authenticated;
grant execute on function public.go_irl_demote_role(text, text)
to service_role;

notify pgrst, 'reload schema';

commit;
