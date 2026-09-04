-- POSTEVENT001 D3 preparation verifier.
-- Read-only contract verification after a future authorized apply.

do $verify$
declare
  v_bridge text;
  v_outcome_wrapper text;
  v_participant_wrapper text;
begin
  if to_regprocedure('public.go_irl_post_event_telegram_action(text,text,uuid,text)') is null then
    raise exception 'postevent001_d3_bridge_missing';
  end if;
  if to_regprocedure('go_irl_private.postevent_record_outcome_for_actor(text,uuid,text)') is null then
    raise exception 'postevent001_d3_outcome_helper_missing';
  end if;
  if to_regprocedure('go_irl_private.postevent_submit_confirmation_for_actor(text,uuid,text)') is null then
    raise exception 'postevent001_d3_participant_helper_missing';
  end if;

  select pg_get_functiondef(
    'public.go_irl_post_event_telegram_action(text,text,uuid,text)'::regprocedure
  ) into v_bridge;
  select pg_get_functiondef(
    'public.go_irl_record_activity_post_event_outcome(uuid,text)'::regprocedure
  ) into v_outcome_wrapper;
  select pg_get_functiondef(
    'public.go_irl_submit_activity_attendance_confirmation(uuid,text)'::regprocedure
  ) into v_participant_wrapper;

  if position('user_provider_identities' in v_bridge) = 0
     or position('provider_user_id' in v_bridge) = 0
     or position('identity.status = ''active''' in v_bridge) = 0
     or position('identity.consented_at is not null' in v_bridge) = 0 then
    raise exception 'postevent001_d3_identity_boundary_missing';
  end if;

  if position('postevent_record_outcome_for_actor' in v_outcome_wrapper) = 0 then
    raise exception 'postevent001_d3_outcome_wrapper_not_delegating';
  end if;
  if position('postevent_submit_confirmation_for_actor' in v_participant_wrapper) = 0 then
    raise exception 'postevent001_d3_participant_wrapper_not_delegating';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.go_irl_post_event_telegram_action(text,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'postevent001_d3_bridge_exposed_to_authenticated';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.go_irl_post_event_telegram_action(text,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'postevent001_d3_service_role_grant_missing';
  end if;
end;
$verify$;
