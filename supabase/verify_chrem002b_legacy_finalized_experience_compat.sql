-- Read-only verifier for ChRem002B legacy-finalized Q2 compatibility.

do $verify$
declare
  v_definition text;
begin
  if to_regprocedure('go_irl_private.postevent_set_organizer_experience_for_actor(text,uuid,text)') is null then
    raise exception 'chrem002b_legacy_compat_experience_helper_missing';
  end if;

  select pg_get_functiondef(
    'go_irl_private.postevent_set_organizer_experience_for_actor(text,uuid,text)'::regprocedure
  ) into v_definition;

  if position('v_legacy_finalized_backfill' in v_definition) = 0
     or position('organizer_roster_finalized_at is not null' in v_definition) = 0
     or position('organizer_attendance_summary is null' in v_definition) = 0
     or position('when v_legacy_finalized_backfill then now()' in v_definition) = 0
     or position('legacyFinalizedBackfill' in v_definition) = 0
     or position('attendanceReopened' in v_definition) = 0 then
    raise exception 'chrem002b_legacy_compat_contract_missing';
  end if;

  if position('update public.activity_attendance_feedback' in v_definition) > 0
     or position('organizer_roster_finalized_at = null' in v_definition) > 0 then
    raise exception 'chrem002b_legacy_compat_attendance_mutation_detected';
  end if;
end;
$verify$;
