-- Read-only verifier for ChRem002B organizer survey state migration.

do $verify$
declare
  v_definition text;
  v_claim_definition text;
  v_snapshot_definition text;
  v_sync_definition text;
  v_rls boolean;
begin
  if to_regclass('public.activity_post_event_outcomes') is null then
    raise exception 'chrem002b_verify_outcomes_missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='activity_post_event_outcomes'
      and column_name='organizer_experience' and data_type='text'
  ) then raise exception 'chrem002b_verify_experience_column_missing'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='activity_post_event_outcomes'
      and column_name='organizer_attendance_summary' and data_type='text'
  ) then raise exception 'chrem002b_verify_attendance_summary_column_missing'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='activity_post_event_outcomes'
      and column_name='organizer_survey_completed_at' and data_type='timestamp with time zone'
  ) then raise exception 'chrem002b_verify_completed_column_missing'; end if;

  select c.relrowsecurity into v_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='activity_post_event_outcomes';
  if coalesce(v_rls,false) is not true then
    raise exception 'chrem002b_verify_outcomes_rls_disabled';
  end if;

  if to_regprocedure('go_irl_private.postevent_record_survey_outcome_for_actor(text,uuid,text)') is null
     or to_regprocedure('go_irl_private.postevent_set_organizer_experience_for_actor(text,uuid,text)') is null
     or to_regprocedure('go_irl_private.postevent_set_organizer_attendance_summary_for_actor(text,uuid,text)') is null
     or to_regprocedure('go_irl_private.postevent_set_organizer_absence_for_actor(text,uuid,boolean)') is null
     or to_regprocedure('go_irl_private.postevent_complete_organizer_no_shows_for_actor(text,uuid)') is null then
    raise exception 'chrem002b_verify_private_survey_helpers_missing';
  end if;

  if to_regprocedure('public.go_irl_post_event_telegram_action(text,text,uuid,text)') is null
     or to_regprocedure('public.go_irl_update_post_event_telegram_message_id(text,uuid,text,text)') is null
     or to_regprocedure('public.go_irl_schedule_post_event_telegram_cleanup(text,uuid,text)') is null then
    raise exception 'chrem002b_verify_service_bridge_missing';
  end if;

  select pg_get_functiondef('public.go_irl_post_event_telegram_action(text,text,uuid,text)'::regprocedure)
  into v_definition;
  if position('p_action = ''organizer_survey_outcome''' in v_definition) = 0
     or position('p_action = ''organizer_experience''' in v_definition) = 0
     or position('p_action = ''organizer_attendance_summary''' in v_definition) = 0
     or position('p_action = ''organizer_absence''' in v_definition) = 0
     or position('p_action = ''organizer_finalize''' in v_definition) = 0
     or position('identity.provider = ''telegram''' in v_definition) = 0
     or position('identity.status = ''active''' in v_definition) = 0
     or position('identity.consented_at is not null' in v_definition) = 0 then
    raise exception 'chrem002b_verify_bridge_contract_missing';
  end if;

  if has_function_privilege('authenticated', 'public.go_irl_post_event_telegram_action(text,text,uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.go_irl_post_event_telegram_action(text,text,uuid,text)', 'EXECUTE') then
    raise exception 'chrem002b_verify_bridge_exposed';
  end if;
  if not has_function_privilege('service_role', 'public.go_irl_post_event_telegram_action(text,text,uuid,text)', 'EXECUTE') then
    raise exception 'chrem002b_verify_bridge_service_role_missing';
  end if;

  select pg_get_functiondef('public.go_irl_schedule_post_event_telegram_cleanup(text,uuid,text)'::regprocedure)
  into v_definition;
  if position('''postEventStage'', ''organizer_cleanup''' in v_definition) = 0
     or position('next_attempt_at' in v_definition) = 0
     or position('cleanupSchedule' in v_definition) = 0
     or position('interval ''60 seconds''' in v_definition) > 0
     or position('kind' in v_definition) = 0
     or position('''post_event.organizer_confirmation''' in v_definition) = 0 then
    raise exception 'chrem002b_verify_cleanup_contract_missing';
  end if;

  select pg_get_functiondef('go_irl_private.postevent_sync_activity_snapshot()'::regprocedure)
  into v_snapshot_definition;
  if position('(v_event_ends_at at time zone v_timezone)::date' in v_snapshot_definition) = 0
     or position('postevent_local_day_time(v_event_local_end_date, 1, 10, new.city_id)' in v_snapshot_definition) = 0 then
    raise exception 'chrem002b_verify_next_day_after_end_10_missing';
  end if;

  select pg_get_functiondef('go_irl_private.postevent_sync_notifications(uuid)'::regprocedure)
  into v_sync_definition;
  if position('''postEventStage'', ''organizer_reminder1''' in v_sync_definition) <> 0
     or position('chrem002b_organizer_reminder_removed' in v_sync_definition) = 0 then
    raise exception 'chrem002b_verify_organizer_reminder_not_removed';
  end if;

  if exists (
    select 1
    from public.event_notifications notification
    where notification.kind = 'post_event.organizer_confirmation'
      and notification.payload ->> 'postEventStage' = 'organizer_reminder1'
      and notification.status in ('scheduled','failed')
  ) then
    raise exception 'chrem002b_verify_pending_organizer_reminder_exists';
  end if;

  select pg_get_functiondef('public.go_irl_claim_event_notifications(text[],integer,integer)'::regprocedure)
  into v_claim_definition;
  if position('telegram_route.channel = ''telegram''' in v_claim_definition) = 0
     or position('''post_event.organizer_confirmation''' in v_claim_definition) = 0 then
    raise exception 'chrem002b_verify_postevent_telegram_route_missing';
  end if;
end;
$verify$;
