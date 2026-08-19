-- MASTER005 P2 repository verification.
-- Run after both MASTER005 migrations in a disposable or separately approved environment.
-- Catalog assertions are transactional and rolled back.

begin;

do $$
declare
  v_notify_source text;
begin
  if to_regclass('public.beauty_booking_waitlist_entries') is null then
    raise exception 'master005_waitlist_table_missing';
  end if;

  select p.prosrc
  into v_notify_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'go_irl_notify_available_beauty_waitlist_entries'
    and p.pronargs = 4;

  if v_notify_source is null then
    raise exception 'master005_waitlist_notify_function_missing';
  end if;

  if position('user_provider_identities' in v_notify_source) = 0
    or position('v_has_external_delivery' in v_notify_source) = 0 then
    raise exception 'master005_waitlist_delivery_capability_detection_missing';
  end if;

  if position('in_app_plus_provider' in v_notify_source) = 0
    or position('in_app_only' in v_notify_source) = 0 then
    raise exception 'master005_waitlist_in_app_delivery_mode_missing';
  end if;

  if position(E'\n      ''telegram'',\n      v_delivery_key\n' in v_notify_source) > 0 then
    raise exception 'master005_waitlist_notify_still_forces_telegram';
  end if;

  if position(E'\n      null,\n      v_delivery_key\n' in v_notify_source) = 0 then
    raise exception 'master005_waitlist_notify_provider_not_selectable';
  end if;

  if position('case when v_has_external_delivery then ''scheduled'' else ''sent'' end' in v_notify_source) = 0 then
    raise exception 'master005_waitlist_in_app_terminal_state_missing';
  end if;

  if not has_table_privilege('authenticated', 'public.event_notifications', 'SELECT') then
    raise exception 'master005_event_notifications_own_read_grant_missing';
  end if;

  if not exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'event_notifications'
      and policy.policyname = 'event notifications own read'
      and policy.cmd = 'SELECT'
      and 'authenticated' = any(policy.roles)
      and coalesce(policy.qual, '') like '%user_key%go_irl_auth_user_key%'
  ) then
    raise exception 'master005_event_notifications_own_read_policy_missing';
  end if;

  if has_function_privilege('anon', 'public.go_irl_notify_available_beauty_waitlist_entries(uuid,timestamp with time zone,timestamp with time zone,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.go_irl_notify_available_beauty_waitlist_entries(uuid,timestamp with time zone,timestamp with time zone,text)', 'EXECUTE') then
    raise exception 'master005_waitlist_notify_execute_exposed';
  end if;
end;
$$;

rollback;
