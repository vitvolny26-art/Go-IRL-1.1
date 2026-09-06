do $verify$
declare
  v_oid oid := to_regprocedure('public.go_irl_get_activity_post_event_organizer_state(uuid)');
  v_def text;
  v_result text;
  v_security_definer boolean;
  v_config text[];
begin
  if v_oid is null then
    raise exception 'postevent001_zero_participant_verify_rpc_missing';
  end if;

  select
    pg_get_functiondef(v_oid),
    pg_get_function_result(v_oid),
    p.prosecdef,
    p.proconfig
  into v_def, v_result, v_security_definer, v_config
  from pg_proc p
  where p.oid = v_oid;

  if v_result <> 'TABLE(activity_id uuid, event_resolution text, organizer_event_claim text, organizer_responded_at timestamp with time zone, organizer_roster_finalized_at timestamp with time zone, participant_fallback_at timestamp with time zone, feedback_id uuid, participant_display_name text, eligibility_state text, organizer_draft_absent boolean, organizer_claim text, participant_claim text, attendance_resolution text)' then
    raise exception 'postevent001_zero_participant_verify_result_shape';
  end if;

  if not v_security_definer then
    raise exception 'postevent001_zero_participant_verify_security_definer';
  end if;

  if not ('search_path=pg_catalog, public' = any(coalesce(v_config, array[]::text[]))) then
    raise exception 'postevent001_zero_participant_verify_search_path';
  end if;

  if position('trusted authenticated user required' in v_def) = 0
     or position('activity organizer required' in v_def) = 0
     or position('v_outcome.organizer_user_key <> v_actor' in v_def) = 0 then
    raise exception 'postevent001_zero_participant_verify_actor_guard';
  end if;

  if position('left join public.activity_attendance_feedback feedback' in lower(v_def)) = 0
     or position('feedback.activity_id = p_activity_id' in lower(v_def)) = 0
     or position('feedback.eligibility_state = ''eligible''' in lower(v_def)) = 0 then
    raise exception 'postevent001_zero_participant_verify_left_join';
  end if;

  if position('from public.activity_attendance_feedback feedback' in lower(v_def)) > 0 then
    raise exception 'postevent001_zero_participant_verify_inner_only_projection';
  end if;

  raise notice 'POSTEVENT001_ZERO_PARTICIPANT_VERIFY_GREEN';
end;
$verify$;
