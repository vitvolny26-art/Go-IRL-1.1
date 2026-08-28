-- GO IRL bounded Google identity transfer residual-state repair.
-- Allows only a stale, never-attempted join notification plus the exact historical
-- activity_member insert/delete audit pair after all current domain-state guards pass.

begin;

create or replace function public.go_irl_transfer_google_identity(
  p_target_user_key text,
  p_provider_binding_id text
)
returns table(status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source_user_key text;
  v_source public.app_users%rowtype;
  v_target public.app_users%rowtype;
  v_source_role text;
  v_notification_count integer;
  v_audit_count integer;
  v_audit_insert_count integer;
  v_audit_delete_count integer;
begin
  if p_target_user_key is null or btrim(p_target_user_key) = ''
     or p_provider_binding_id is null or btrim(p_provider_binding_id) = '' then
    return query select 'invalid'::text;
    return;
  end if;

  lock table public.user_provider_identities in share row exclusive mode;

  select identity.user_key
  into v_source_user_key
  from public.user_provider_identities identity
  where identity.provider = 'google'
    and identity.provider_user_id = p_provider_binding_id
    and identity.status = 'active'
  for update;

  if not found then
    return query select 'identity_missing'::text;
    return;
  end if;

  if v_source_user_key = p_target_user_key then
    return query select 'already_linked'::text;
    return;
  end if;

  select * into v_target
  from public.app_users
  where user_key = p_target_user_key
  for update;

  if not found or v_target.status <> 'active' then
    return query select 'target_unavailable'::text;
    return;
  end if;

  select * into v_source
  from public.app_users
  where user_key = v_source_user_key
  for update;

  if not found or v_source.status <> 'active'
     or v_source.auth_provider <> 'google'
     or v_source.provider_user_id <> p_provider_binding_id
     or v_source.telegram_id is not null then
    return query select 'transfer_blocked'::text;
    return;
  end if;

  if v_target.auth_provider = 'google'
     or exists (
       select 1
       from public.user_provider_identities identity
       where identity.user_key = p_target_user_key
         and identity.provider = 'google'
     ) then
    return query select 'target_provider_conflict'::text;
    return;
  end if;

  if exists (
    select 1
    from public.user_provider_identities identity
    where identity.user_key = v_source_user_key
      and not (
        identity.provider = 'google'
        and identity.provider_user_id = p_provider_binding_id
        and identity.status = 'active'
      )
  ) then
    return query select 'transfer_blocked'::text;
    return;
  end if;

  select role into v_source_role
  from public.user_roles
  where user_key = v_source_user_key;

  -- Current or privileged domain state remains a hard stop. Residual notification
  -- and audit rows are validated separately below instead of weakening these guards.
  if coalesce(v_source_role, 'user') <> 'user'
     or exists (select 1 from public.admin_users where user_key = v_source_user_key)
     or exists (select 1 from public.activities where organizer_key = v_source_user_key)
     or exists (select 1 from public.activity_members where user_key = v_source_user_key)
     or exists (select 1 from public.activity_chat_messages where sender_user_key = v_source_user_key)
     or exists (select 1 from public.activity_chats where created_by_user_key = v_source_user_key)
     or exists (select 1 from public.activity_external_telegram_chats where attached_by_user_key = v_source_user_key)
     or exists (select 1 from public.activity_telegram_chat_bindings where requested_by_user_key = v_source_user_key)
     or exists (select 1 from public.coach_profiles where user_key = v_source_user_key)
     or exists (select 1 from public.coach_requests where requester_user_key = v_source_user_key)
     or exists (select 1 from public.coach_reviews where reviewer_user_key = v_source_user_key)
     or exists (select 1 from public.beauty_professional_profiles where owner_user_key = v_source_user_key)
     or exists (select 1 from public.beauty_time_blocks where created_by_user_key = v_source_user_key)
     or exists (select 1 from public.beauty_bookings where client_user_key = v_source_user_key)
     or exists (select 1 from public.beauty_booking_events where actor_user_key = v_source_user_key)
     or exists (select 1 from public.beauty_booking_waitlist_entries where client_user_key = v_source_user_key)
     or exists (select 1 from public.event_reminders where user_key = v_source_user_key)
     or exists (select 1 from public.favorites where user_key = v_source_user_key or organizer_user_key = v_source_user_key)
     or exists (select 1 from public.role_invitations where created_by_user_key = v_source_user_key or consumed_by_user_key = v_source_user_key)
     or exists (select 1 from public.user_profile_interests where user_key = v_source_user_key)
     or exists (
       select 1
       from public.user_profiles profile
       where profile.user_key = v_source_user_key
         and (
           nullif(btrim(coalesce(profile.bio, '')), '') is not null
           or nullif(btrim(coalesce(profile.avatar_path, '')), '') is not null
           or nullif(btrim(coalesce(profile.avatar_code, '')), '') is not null
           or profile.city_id <> 'olomouc'
           or profile.is_public is distinct from true
           or profile.show_favorites is distinct from true
         )
     )
     or exists (
       select 1
       from public.account_requests request
       where request.user_key = v_source_user_key
         and request.kind <> 'account_deletion'
     ) then
    return query select 'transfer_blocked'::text;
    return;
  end if;

  -- At most one residual notification is allowed, and only when it was never leased,
  -- attempted, sent, or handed to a provider.
  select count(*) into v_notification_count
  from public.event_notifications notification
  where notification.user_key = v_source_user_key;

  if v_notification_count > 1
     or exists (
       select 1
       from public.event_notifications notification
       where notification.user_key = v_source_user_key
         and not (
           notification.kind = 'join_confirmed'
           and notification.status = 'scheduled'
           and notification.attempt_count = 0
           and notification.leased_at is null
           and notification.sent_at is null
           and notification.last_error_code is null
           and notification.provider is null
           and notification.provider_message_id is null
         )
     ) then
    return query select 'transfer_blocked'::text;
    return;
  end if;

  -- Historical audit evidence is preserved only for the exact completed membership
  -- join/leave pair. Any other reference to the duplicate remains fail-closed.
  select
    count(*),
    count(*) filter (where audit.action = 'activity_member.insert'),
    count(*) filter (where audit.action = 'activity_member.delete')
  into v_audit_count, v_audit_insert_count, v_audit_delete_count
  from public.audit_log audit
  where audit.actor_user_key = v_source_user_key
     or audit.entity_id = v_source_user_key
     or audit.metadata::text like '%' || v_source_user_key || '%';

  if v_audit_count not in (0, 2)
     or (v_audit_count = 2 and (v_audit_insert_count <> 1 or v_audit_delete_count <> 1))
     or exists (
       select 1
       from public.audit_log audit
       where (
         audit.actor_user_key = v_source_user_key
         or audit.entity_id = v_source_user_key
         or audit.metadata::text like '%' || v_source_user_key || '%'
       )
       and not (
         audit.actor_user_key = v_source_user_key
         and audit.entity_type = 'activity_member'
         and audit.action in ('activity_member.insert', 'activity_member.delete')
         and audit.entity_id is distinct from v_source_user_key
         and audit.metadata ->> 'member_user_key' = v_source_user_key
         and audit.metadata ? 'activity_id'
         and audit.metadata ? 'status'
         and (audit.metadata - 'activity_id' - 'member_user_key' - 'status') = '{}'::jsonb
       )
     ) then
    return query select 'transfer_blocked'::text;
    return;
  end if;

  perform set_config('go_irl.identity_transfer_source_user_key', v_source_user_key, true);

  delete from public.event_notifications notification
  where notification.user_key = v_source_user_key
    and notification.kind = 'join_confirmed'
    and notification.status = 'scheduled'
    and notification.attempt_count = 0
    and notification.leased_at is null
    and notification.sent_at is null
    and notification.last_error_code is null
    and notification.provider is null
    and notification.provider_message_id is null;

  update public.audit_log audit
  set actor_user_key = p_target_user_key,
      metadata = jsonb_set(audit.metadata, '{member_user_key}', to_jsonb(p_target_user_key), false)
  where audit.actor_user_key = v_source_user_key
    and audit.entity_type = 'activity_member'
    and audit.action in ('activity_member.insert', 'activity_member.delete')
    and audit.entity_id is distinct from v_source_user_key
    and audit.metadata ->> 'member_user_key' = v_source_user_key
    and audit.metadata ? 'activity_id'
    and audit.metadata ? 'status'
    and (audit.metadata - 'activity_id' - 'member_user_key' - 'status') = '{}'::jsonb;

  update public.user_provider_identities
  set user_key = p_target_user_key,
      status = 'active',
      updated_at = now()
  where provider = 'google'
    and provider_user_id = p_provider_binding_id
    and user_key = v_source_user_key;

  if not found then
    return query select 'identity_missing'::text;
    return;
  end if;

  delete from public.user_profiles where user_key = v_source_user_key;
  delete from public.user_handles where user_key = v_source_user_key;
  delete from public.user_onboarding_activations where user_key = v_source_user_key;
  delete from public.user_roles where user_key = v_source_user_key;
  delete from public.admin_users where user_key = v_source_user_key;
  delete from public.account_requests where user_key = v_source_user_key;
  delete from public.app_users where user_key = v_source_user_key;

  insert into public.audit_log (actor_user_key, action, entity_type, entity_id, metadata)
  values (
    p_target_user_key,
    'identity.transferred',
    'user_provider_identity',
    'google',
    jsonb_build_object('source_account_scrubbed', true)
  );

  return query select 'transferred'::text;
end;
$$;

revoke execute on function public.go_irl_transfer_google_identity(text, text)
from public, anon, authenticated;
grant execute on function public.go_irl_transfer_google_identity(text, text)
to service_role;

notify pgrst, 'reload schema';

commit;
