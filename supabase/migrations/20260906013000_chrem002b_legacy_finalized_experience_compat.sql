-- ChRem002B compatibility: allow legacy finalized activities to backfill Q2 only.
-- Scope: preserve historical attendance truth. Never reopen or rewrite finalized roster data.

begin;

create or replace function go_irl_private.postevent_set_organizer_experience_for_actor(
  p_actor_user_key text,
  p_activity_id uuid,
  p_experience text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_legacy_finalized_backfill boolean;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;
  if p_experience not in ('good','had_problems') then
    raise exception 'invalid organizer experience' using errcode = '22023';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;
  if v_outcome.organizer_event_claim <> 'happened' then
    raise exception 'happened outcome required before organizer experience' using errcode = '22023';
  end if;

  v_legacy_finalized_backfill :=
    v_outcome.organizer_roster_finalized_at is not null
    and v_outcome.organizer_survey_completed_at is null
    and v_outcome.organizer_experience is null
    and v_outcome.organizer_attendance_summary is null;

  if v_outcome.organizer_survey_completed_at is not null then
    raise exception 'organizer survey already completed' using errcode = '55000';
  end if;
  if v_outcome.organizer_roster_finalized_at is not null
     and not v_legacy_finalized_backfill then
    raise exception 'organizer survey already completed' using errcode = '55000';
  end if;
  if v_outcome.organizer_experience is not null then
    if v_outcome.organizer_experience = p_experience then
      return go_irl_private.postevent_organizer_survey_state_for_actor(v_actor, p_activity_id);
    end if;
    raise exception 'organizer experience step already answered' using errcode = '55000';
  end if;

  update public.activity_post_event_outcomes
  set organizer_experience = p_experience,
      organizer_survey_completed_at = case
        when v_legacy_finalized_backfill then now()
        else organizer_survey_completed_at
      end,
      updated_at = now()
  where activity_id = p_activity_id;

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.organizer_experience',
    'activity_post_event_outcome',
    p_activity_id::text,
    jsonb_build_object(
      'experience', p_experience,
      'legacyFinalizedBackfill', v_legacy_finalized_backfill,
      'attendanceReopened', false
    )
  );

  return go_irl_private.postevent_organizer_survey_state_for_actor(v_actor, p_activity_id);
end;
$function$;

revoke all on function go_irl_private.postevent_set_organizer_experience_for_actor(text,uuid,text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
