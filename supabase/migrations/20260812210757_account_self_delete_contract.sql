-- GO IRL bounded self-delete contract.
-- Repository preparation only. Do not apply to production without a separate approval gate.

begin;

create table if not exists public.deleted_provider_identities (
  provider text not null check (provider in ('telegram', 'google', 'facebook')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  deleted_at timestamptz not null default now(),
  primary key (provider, subject_hash)
);

create table if not exists public.account_deletion_receipts (
  id uuid primary key,
  correlation_hash text not null unique check (correlation_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'scrubbed'
    check (status in ('scrubbed', 'cleanup_pending', 'completed')),
  auth_cleanup_pending integer not null default 0 check (auth_cleanup_pending >= 0),
  storage_cleanup_pending integer not null default 0 check (storage_cleanup_pending >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.account_deletion_auth_cleanup (
  receipt_id uuid not null references public.account_deletion_receipts(id) on delete cascade,
  auth_user_id uuid not null,
  provider text not null check (provider in ('google', 'facebook')),
  created_at timestamptz not null default now(),
  primary key (receipt_id, auth_user_id)
);

create table if not exists public.account_deletion_storage_cleanup (
  receipt_id uuid not null references public.account_deletion_receipts(id) on delete cascade,
  bucket_id text not null check (bucket_id = 'avatars'),
  object_path text not null,
  created_at timestamptz not null default now(),
  primary key (receipt_id, bucket_id, object_path)
);

alter table public.deleted_provider_identities enable row level security;
alter table public.account_deletion_receipts enable row level security;
alter table public.account_deletion_auth_cleanup enable row level security;
alter table public.account_deletion_storage_cleanup enable row level security;

revoke all on table public.deleted_provider_identities from public, anon, authenticated;
revoke all on table public.account_deletion_receipts from public, anon, authenticated;
revoke all on table public.account_deletion_auth_cleanup from public, anon, authenticated;
revoke all on table public.account_deletion_storage_cleanup from public, anon, authenticated;
grant select, insert, update, delete on table public.deleted_provider_identities to service_role;
grant select, insert, update, delete on table public.account_deletion_receipts to service_role;
grant select, insert, update, delete on table public.account_deletion_auth_cleanup to service_role;
grant select, insert, update, delete on table public.account_deletion_storage_cleanup to service_role;

comment on table public.deleted_provider_identities is
  'Service-only hashed identity tombstones. Prevents automatic recreation after self-delete without retaining raw provider subjects.';
comment on table public.account_deletion_receipts is
  'Non-identifying self-delete receipts and durable post-scrub cleanup status.';
comment on table public.account_deletion_auth_cleanup is
  'Service-only pending Supabase Auth user cleanup after GO IRL data scrub.';
comment on table public.account_deletion_storage_cleanup is
  'Service-only pending avatar object cleanup after GO IRL data scrub.';

create or replace function go_irl_private.reject_first_onboarding_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('go_irl.self_delete_user_key', true) = old.user_key then
    return old;
  end if;

  raise exception 'first onboarding evidence is immutable' using errcode = '55000';
end;
$$;

revoke all on function go_irl_private.reject_first_onboarding_mutation() from public, anon, authenticated;

create or replace function public.go_irl_self_delete_account(
  p_user_key text,
  p_receipt_id uuid,
  p_correlation_hash text,
  p_provider_tombstones jsonb,
  p_auth_cleanup jsonb,
  p_storage_cleanup jsonb
)
returns table(status text, receipt_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_app_user public.app_users%rowtype;
  v_role text;
  v_tombstone jsonb;
  v_cleanup jsonb;
  v_storage jsonb;
begin
  if p_user_key is null or btrim(p_user_key) = '' or p_receipt_id is null
     or coalesce(p_correlation_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_account_deletion_request' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_provider_tombstones, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_auth_cleanup, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_storage_cleanup, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_account_deletion_cleanup' using errcode = '22023';
  end if;

  select * into v_app_user
  from public.app_users
  where user_key = p_user_key
  for update;

  if not found or v_app_user.status <> 'active' then
    raise exception 'account_unavailable' using errcode = '42501';
  end if;

  select role into v_role
  from public.user_roles
  where user_key = p_user_key;

  if coalesce(v_role, 'user') <> 'user'
     or exists (select 1 from public.admin_users where user_key = p_user_key)
     or exists (select 1 from public.activities where organizer_key = p_user_key)
     or exists (select 1 from public.coach_profiles where user_key = p_user_key)
     or exists (select 1 from public.beauty_professional_profiles where owner_user_key = p_user_key)
     or exists (select 1 from public.beauty_time_blocks where created_by_user_key = p_user_key)
     or exists (select 1 from public.role_invitations where created_by_user_key = p_user_key) then
    raise exception 'account_deletion_owner_obligations' using errcode = '55000';
  end if;

  for v_tombstone in select value from jsonb_array_elements(coalesce(p_provider_tombstones, '[]'::jsonb))
  loop
    if v_tombstone ->> 'provider' not in ('telegram', 'google', 'facebook')
       or coalesce(v_tombstone ->> 'subject_hash', '') !~ '^[0-9a-f]{64}$' then
      raise exception 'invalid_provider_tombstone' using errcode = '22023';
    end if;
  end loop;

  for v_cleanup in select value from jsonb_array_elements(coalesce(p_auth_cleanup, '[]'::jsonb))
  loop
    if v_cleanup ->> 'provider' not in ('google', 'facebook')
       or coalesce(v_cleanup ->> 'auth_user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'invalid_auth_cleanup' using errcode = '22023';
    end if;
  end loop;

  for v_storage in select value from jsonb_array_elements(coalesce(p_storage_cleanup, '[]'::jsonb))
  loop
    if v_storage ->> 'bucket_id' <> 'avatars'
       or coalesce(v_storage ->> 'object_path', '') not like p_user_key || '/%' then
      raise exception 'invalid_storage_cleanup' using errcode = '22023';
    end if;
  end loop;

  insert into public.account_deletion_receipts (
    id,
    correlation_hash,
    status,
    auth_cleanup_pending,
    storage_cleanup_pending
  ) values (
    p_receipt_id,
    p_correlation_hash,
    'scrubbed',
    jsonb_array_length(coalesce(p_auth_cleanup, '[]'::jsonb)),
    jsonb_array_length(coalesce(p_storage_cleanup, '[]'::jsonb))
  );

  insert into public.deleted_provider_identities (provider, subject_hash)
  select item ->> 'provider', item ->> 'subject_hash'
  from jsonb_array_elements(coalesce(p_provider_tombstones, '[]'::jsonb)) item
  on conflict (provider, subject_hash) do nothing;

  insert into public.account_deletion_auth_cleanup (receipt_id, auth_user_id, provider)
  select p_receipt_id, (item ->> 'auth_user_id')::uuid, item ->> 'provider'
  from jsonb_array_elements(coalesce(p_auth_cleanup, '[]'::jsonb)) item;

  insert into public.account_deletion_storage_cleanup (receipt_id, bucket_id, object_path)
  select p_receipt_id, item ->> 'bucket_id', item ->> 'object_path'
  from jsonb_array_elements(coalesce(p_storage_cleanup, '[]'::jsonb)) item;

  perform set_config('go_irl.self_delete_user_key', p_user_key, true);

  delete from public.activity_chat_messages where sender_user_key = p_user_key;
  delete from public.activity_members where user_key = p_user_key;
  delete from public.coach_requests where requester_user_key = p_user_key;
  delete from public.coach_reviews where reviewer_user_key = p_user_key;
  delete from public.beauty_bookings where client_user_key = p_user_key;
  update public.beauty_booking_events set actor_user_key = null where actor_user_key = p_user_key;
  delete from public.event_notifications where user_key = p_user_key;
  delete from public.event_reminders where user_key = p_user_key;
  delete from public.favorites where user_key = p_user_key or organizer_user_key = p_user_key;

  update public.activity_chats set created_by_user_key = 'deleted-user' where created_by_user_key = p_user_key;
  update public.activity_external_telegram_chats set attached_by_user_key = 'deleted-user' where attached_by_user_key = p_user_key;
  update public.activity_telegram_chat_bindings set requested_by_user_key = 'deleted-user' where requested_by_user_key = p_user_key;
  update public.role_invitations set consumed_by_user_key = null where consumed_by_user_key = p_user_key;

  update public.audit_log
  set actor_user_key = 'deleted-user', metadata = '{}'::jsonb
  where actor_user_key = p_user_key;

  update public.audit_log
  set entity_id = null, metadata = '{}'::jsonb
  where entity_id = p_user_key
     or metadata::text like '%' || p_user_key || '%';

  delete from public.user_profile_interests where user_key = p_user_key;
  delete from public.user_profiles where user_key = p_user_key;
  delete from public.user_handles where user_key = p_user_key;
  delete from public.user_onboarding_activations where user_key = p_user_key;
  delete from public.user_provider_identities where user_key = p_user_key;
  delete from public.user_roles where user_key = p_user_key;
  delete from public.admin_users where user_key = p_user_key;
  delete from public.account_requests where user_key = p_user_key;

  if v_app_user.telegram_id is not null then
    delete from public.telegram_auth_replay where telegram_id = v_app_user.telegram_id;
  end if;

  delete from public.app_users where user_key = p_user_key;

  return query select 'scrubbed'::text, p_receipt_id;
end;
$$;

revoke all on function public.go_irl_self_delete_account(text, uuid, text, jsonb, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.go_irl_self_delete_account(text, uuid, text, jsonb, jsonb, jsonb)
to service_role;

notify pgrst, 'reload schema';

commit;
