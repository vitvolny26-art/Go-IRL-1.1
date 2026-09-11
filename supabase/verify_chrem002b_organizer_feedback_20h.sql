-- Read-only verifier for ChRem002B organizer feedback 20:00 source contract.

do $verify$
declare
  v_snapshot text;
  v_sync text;
  v_claim text;
begin
  if to_regprocedure('go_irl_private.postevent_organizer_feedback_snapshot(uuid)') is null then
    raise exception 'chrem002b_feedback_verify_snapshot_missing';
  end if;

  select lower(pg_get_functiondef('go_irl_private.postevent_organizer_feedback_snapshot(uuid)'::regprocedure))
  into v_snapshot;
  if position('participant_survey_completed_at is not null' in v_snapshot) = 0
     or position('organizer_rating' in v_snapshot) = 0
     or position('rating_tags' in v_snapshot) = 0
     or position('participant_repeat_intent' in v_snapshot) = 0
     or position('feedbackresponsecount' in v_snapshot) = 0
     or position('feedbackaveragerating' in v_snapshot) = 0
     or position('feedbacktagcounts' in v_snapshot) = 0
     or position('feedbackrepeatyescount' in v_snapshot) = 0
     or position('feedbackrepeatnocount' in v_snapshot) = 0 then
    raise exception 'chrem002b_feedback_verify_snapshot_contract_missing';
  end if;
  if position('participant_display_name' in v_snapshot) > 0
     or position('participant_user_key' in v_snapshot) > 0 then
    raise exception 'chrem002b_feedback_verify_identity_leak';
  end if;

  select lower(pg_get_functiondef('go_irl_private.postevent_sync_notifications(uuid)'::regprocedure))
  into v_sync;
  if position('organizer_feedback' in v_sync) = 0
     or position('organizer:feedback' in v_sync) = 0
     or position('postevent_local_day_time' in v_sync) = 0
     or position(', 1,' in v_sync) = 0
     or position(', 20,' in v_sync) = 0
     or position('deliverymode'', ''private_dm' in v_sync) = 0 then
    raise exception 'chrem002b_feedback_verify_schedule_contract_missing';
  end if;

  select lower(pg_get_functiondef('public.go_irl_claim_event_notifications(text[],integer,integer)'::regprocedure))
  into v_claim;
  if position('postevent_organizer_feedback_private_delivery_unavailable' in v_claim) = 0
     or position('postevent_organizer_feedback_snapshot' in v_claim) = 0
     or position('feedbacksnapshotat' in v_claim) = 0 then
    raise exception 'chrem002b_feedback_verify_claim_contract_missing';
  end if;
end;
$verify$;
