begin;

create or replace function public.go_irl_get_activity_post_event_organizer_state(p_activity_id uuid)
returns table(
  activity_id uuid,
  event_resolution text,
  organizer_event_claim text,
  organizer_responded_at timestamptz,
  organizer_roster_finalized_at timestamptz,
  participant_fallback_at timestamptz,
  feedback_id uuid,
  participant_display_name text,
  eligibility_state text,
  organizer_draft_absent boolean,
  organizer_claim text,
  participant_claim text,
  attendance_resolution text
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_outcome public.activity_post_event_outcomes%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes outcome
  where outcome.activity_id = p_activity_id;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;

  return query
  select
    v_outcome.activity_id,
    v_outcome.event_resolution,
    v_outcome.organizer_event_claim,
    v_outcome.organizer_responded_at,
    v_outcome.organizer_roster_finalized_at,
    v_outcome.participant_fallback_at,
    feedback.id,
    feedback.participant_display_name,
    feedback.eligibility_state,
    feedback.organizer_draft_absent,
    feedback.organizer_claim,
    feedback.participant_claim,
    feedback.resolution
  from (select 1) anchor
  left join public.activity_attendance_feedback feedback
    on feedback.activity_id = p_activity_id
   and feedback.eligibility_state = 'eligible'
  order by feedback.participant_display_name nulls last, feedback.id nulls last;
end;
$function$;

commit;
