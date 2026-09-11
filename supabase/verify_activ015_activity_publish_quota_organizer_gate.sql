begin;

-- Activ015 structural verifier. Run after the matching migration in an approved
-- local/staging environment. It makes no durable data changes.

do $$
declare
  v_trigger_def text;
  v_quota_def text;
  v_count_def text;
  v_redeem_def text;
begin
  select pg_get_triggerdef(t.oid)
  into v_trigger_def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'activities'
    and t.tgname = 'activ015_activity_daily_publish_limit'
    and not t.tgisinternal;

  if v_trigger_def is null
    or position('BEFORE INSERT' in upper(v_trigger_def)) = 0
  then
    raise exception 'activ015_daily_publish_trigger_missing';
  end if;

  if to_regclass('public.activity_daily_publish_usage') is null then
    raise exception 'activ015_daily_publish_usage_missing';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'activity_daily_publish_usage'
      and constraint_row.contype = 'p'
  ) then
    raise exception 'activ015_daily_publish_usage_primary_key_missing';
  end if;

  select pg_get_functiondef('go_irl_private.activ015_enforce_activity_daily_publish_limit()'::regprocedure)
  into v_quota_def;

  if position('v_limit := case when v_role = ''organizer'' then 5 else 2 end' in v_quota_def) = 0 then
    raise exception 'activ015_role_limits_missing';
  end if;
  if position('at time zone ''Europe/Prague''' in v_quota_def) = 0 then
    raise exception 'activ015_calendar_day_timezone_missing';
  end if;
  if position('on conflict (user_key, local_date) do update' in lower(v_quota_def)) = 0
    or position('publish_count = public.activity_daily_publish_usage.publish_count + 1' in v_quota_def) = 0
    or position('where public.activity_daily_publish_usage.publish_count < v_limit' in v_quota_def) = 0
  then
    raise exception 'activ015_atomic_usage_gate_missing';
  end if;
  if position('new.created_at := v_now' in v_quota_def) = 0 then
    raise exception 'activ015_created_at_authority_missing';
  end if;
  if position('activity_daily_publish_limit_reached' in v_quota_def) = 0 then
    raise exception 'activ015_stable_limit_error_missing';
  end if;

  select pg_get_functiondef('go_irl_private.activ015_organizer_qualifying_activity_count(text)'::regprocedure)
  into v_count_def;

  if position('outcome.event_resolution = ''confirmed_happened''' in v_count_def) = 0
    or position('feedback.eligibility_state = ''eligible''' in v_count_def) = 0
    or position('feedback.resolution = ''attended''' in v_count_def) = 0
    or position('feedback.participant_user_key <> p_user_key' in v_count_def) = 0
  then
    raise exception 'activ015_qualifying_activity_contract_missing';
  end if;

  select pg_get_functiondef('public.go_irl_redeem_role_invitation(text,text)'::regprocedure)
  into v_redeem_def;

  if position('v_invitation.target_role = ''organizer''' in v_redeem_def) = 0
    or position('v_qualifying_count < 10' in v_redeem_def) = 0
    or position('activ015_organizer_qualifying_activity_count' in v_redeem_def) = 0
  then
    raise exception 'activ015_organizer_redemption_gate_missing';
  end if;

  raise notice 'Activ015 Activity publish quota + organizer gate structural verification: PASS';
end;
$$;

rollback;
