do $verify$
declare
  v_sync text;
  v_action text;
  v_state text;
  v_sample text;
  v_read text;
begin
  if to_regclass('public.activity_attendance_feedback') is null then
    raise exception 'chrem002b_participant_v1_verify_feedback_missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_attendance_feedback'
      and column_name = 'participant_repeat_intent'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_attendance_feedback'
      and column_name = 'participant_issue_step_completed_at'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_attendance_feedback'
      and column_name = 'participant_peer_sample_ids'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_attendance_feedback'
      and column_name = 'participant_peer_confirmed_ids'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_attendance_feedback'
      and column_name = 'participant_peer_step_completed_at'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_attendance_feedback'
      and column_name = 'participant_survey_completed_at'
  ) then
    raise exception 'chrem002b_participant_v1_verify_columns';
  end if;

  v_sync := lower(pg_get_functiondef('public.go_irl_claim_event_notifications(text[],integer,integer)'::regprocedure));
  if position('participant_survey_v1' in v_sync) = 0
     or position('postevent_participant_private_delivery_unavailable' in v_sync) = 0
     or position('routing_outcome = ''needs_attention''' in v_sync) = 0 then
    raise exception 'chrem002b_participant_v1_verify_private_claim_route';
  end if;

  v_sync := lower(pg_get_functiondef('go_irl_private.postevent_sync_notifications(uuid)'::regprocedure));
  if position('participant_survey_v1' in v_sync) = 0
     or position('deliverymode'', ''private_dm' in v_sync) = 0
     or position('v_outcome.participant_fallback_at' in v_sync) = 0
     or position('v_participant_open' in v_sync) > 0
     or position('postevent_waiting_for_organizer' in v_sync) > 0 then
    raise exception 'chrem002b_participant_v1_verify_private_schedule';
  end if;

  select lower(pg_get_functiondef(p.oid)) into v_sync
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'go_irl_private' and p.proname = 'postevent_sync_activity_snapshot';
  if position('1, 13, new.city_id' in v_sync) = 0
     or position('participant_fallback_at = v_participant_at' in v_sync) = 0 then
    raise exception 'chrem002b_participant_v1_verify_1300_next_day';
  end if;

  v_sample := lower(pg_get_functiondef('go_irl_private.postevent_participant_sample_ids(uuid)'::regprocedure));
  if position('md5(p_feedback_id::text || '':'' || other.id::text)' in v_sample) = 0
     or position('other.id <> respondent.id' in v_sample) = 0
     or position('other.eligibility_state = ''eligible''' in v_sample) = 0
     or position('limit 4' in v_sample) = 0 then
    raise exception 'chrem002b_participant_v1_verify_stable_sample';
  end if;

  v_state := lower(pg_get_functiondef('go_irl_private.postevent_participant_survey_state_for_actor(text,uuid)'::regprocedure));
  if position('''attendance''' in v_state) = 0
     or position('''rating''' in v_state) = 0
     or position('''issues''' in v_state) = 0
     or position('''peers''' in v_state) = 0
     or position('''repeat_intent''' in v_state) = 0
     or position('''complete''' in v_state) = 0
     or position('participant_user_key <> v_actor' in v_state) = 0 then
    raise exception 'chrem002b_participant_v1_verify_state_machine';
  end if;

  v_state := lower(pg_get_functiondef('go_irl_private.postevent_set_participant_peer_presence_for_actor(text,uuid,uuid,boolean)'::regprocedure));
  if position('participant_issue_step_completed_at is null' in v_state) = 0 then
    raise exception 'chrem002b_participant_v1_verify_peer_toggle_sequence';
  end if;

  v_state := lower(pg_get_functiondef('go_irl_private.postevent_complete_participant_peer_presence_for_actor(text,uuid)'::regprocedure));
  if position('participant rating required before peer confirmation' in v_state) = 0
     or position('participant_issue_step_completed_at is null' in v_state) = 0
     or position('participant peer step already closed' in v_state) = 0 then
    raise exception 'chrem002b_participant_v1_verify_peer_done_sequence';
  end if;

  v_action := lower(pg_get_functiondef('public.go_irl_post_event_telegram_action(text,text,uuid,text)'::regprocedure));
  if position('participant_survey_attendance' in v_action) = 0
     or position('participant_rating' in v_action) = 0
     or position('participant_issue_tag' in v_action) = 0
     or position('participant_issue_done' in v_action) = 0
     or position('participant_peer_presence' in v_action) = 0
     or position('participant_peer_done' in v_action) = 0
     or position('participant_repeat_intent' in v_action) = 0
     or position('active consented telegram identity required' in v_action) = 0 then
    raise exception 'chrem002b_participant_v1_verify_telegram_actions';
  end if;

  v_read := lower(pg_get_functiondef('public.go_irl_get_activity_post_event_participant_survey_state(uuid)'::regprocedure));
  if position('go_irl_auth_user_key()' in v_read) = 0
     or position('postevent_participant_survey_state_for_actor' in v_read) = 0 then
    raise exception 'chrem002b_participant_v1_verify_authenticated_read';
  end if;

  if not has_function_privilege('authenticated', 'public.go_irl_get_activity_post_event_participant_survey_state(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.go_irl_get_activity_post_event_participant_survey_state(uuid)', 'EXECUTE') then
    raise exception 'chrem002b_participant_v1_verify_read_acl';
  end if;

  if not has_function_privilege('service_role', 'public.go_irl_update_post_event_participant_telegram_message_id(text,uuid,text,text)', 'EXECUTE') then
    raise exception 'chrem002b_participant_v1_verify_message_anchor_acl';
  end if;

  if not has_function_privilege('service_role', 'public.go_irl_post_event_telegram_action(text,text,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.go_irl_post_event_telegram_action(text,text,uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.go_irl_post_event_telegram_action(text,text,uuid,text)', 'EXECUTE') then
    raise exception 'chrem002b_participant_v1_verify_service_bridge_acl';
  end if;

  raise notice 'CHREM002B_PARTICIPANT_SURVEY_V1_VERIFY_GREEN';
end;
$verify$;
