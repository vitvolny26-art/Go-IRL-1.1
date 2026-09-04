-- POSTEVENT001 D3: service-role Telegram callback bridge for bounded post-event actions.
-- PREPARATION ONLY. Do not apply to production without a separate explicit approval gate.
-- Baseline: GitHub main 8d13d40ab2024e2a7c0cd9007b660afb1b034017.
--
-- Design:
-- * resolve Telegram provider identity -> canonical user_key inside SQL;
-- * never accept user_key or role from callback data;
-- * authenticated Mini App RPCs and Telegram service bridge call the same
--   actor-explicit private mutation helpers;
-- * no new table, queue, trigger, webhook, RLS policy, secret, or production data mutation.

begin;

do $prerequisites$
begin
  if to_regclass('public.activity_post_event_outcomes') is null then
    raise exception 'postevent001_d3_missing_activity_post_event_outcomes';
  end if;
  if to_regclass('public.activity_attendance_feedback') is null then
    raise exception 'postevent001_d3_missing_activity_attendance_feedback';
  end if;
  if to_regclass('public.user_provider_identities') is null then
    raise exception 'postevent001_d3_missing_user_provider_identities';
  end if;
  if to_regprocedure('public.go_irl_auth_user_key()') is null then
    raise exception 'postevent001_d3_missing_auth_user_key';
  end if;
  if to_regprocedure('go_irl_private.postevent_attendance_resolution(text,text,text)') is null then
    raise exception 'postevent001_d3_missing_attendance_resolution';
  end if;
  if to_regprocedure('go_irl_private.postevent_recompute_event_resolution(uuid)') is null then
    raise exception 'postevent001_d3_missing_recompute_event_resolution';
  end if;
  if to_regprocedure('go_irl_private.postevent_write_audit(text,text,text,text,jsonb)') is null then
    raise exception 'postevent001_d3_missing_postevent_audit';
  end if;
end;
$prerequisites$;

create or replace function go_irl_private.postevent_record_outcome_for_actor(
  p_actor_user_key text,
  p_activity_id uuid,
  p_claim text
)
returns public.activity_post_event_outcomes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_outcome public.activity_post_event_outcomes%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;
  if p_claim not in ('happened','did_not_happen','problem') then
    raise exception 'invalid post-event outcome claim' using errcode = '22023';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;
  if v_outcome.event_resolution = 'voided' then
    raise exception 'post-event outcome is voided' using errcode = '22023';
  end if;
  if now() < v_outcome.event_ends_at then
    raise exception 'activity has not finished' using errcode = '22023';
  end if;
  if v_outcome.organizer_roster_finalized_at is not null
     and p_claim <> v_outcome.organizer_event_claim then
    raise exception 'organizer outcome locked after roster finalization' using errcode = '55000';
  end if;

  update public.activity_post_event_outcomes
  set organizer_event_claim = p_claim,
      organizer_responded_at = coalesce(organizer_responded_at, now()),
      event_resolution = case when p_claim = 'problem' then 'disputed' else 'pending' end,
      updated_at = now()
  where activity_id = p_activity_id
  returning * into v_outcome;

  perform go_irl_private.postevent_recompute_event_resolution(p_activity_id);

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.organizer_outcome',
    'activity_post_event_outcome',
    p_activity_id::text,
    jsonb_build_object('claim', p_claim)
  );

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id;

  return v_outcome;
end;
$function$;

create or replace function go_irl_private.postevent_submit_confirmation_for_actor(
  p_actor_user_key text,
  p_feedback_id uuid,
  p_claim text
)
returns public.activity_attendance_feedback
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_feedback public.activity_attendance_feedback%rowtype;
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_resolution text;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;
  if p_claim not in ('attended','absent','event_did_not_happen') then
    raise exception 'invalid participant attendance claim' using errcode = '22023';
  end if;

  select * into v_feedback
  from public.activity_attendance_feedback
  where id = p_feedback_id
  for update;

  if not found or v_feedback.participant_user_key <> v_actor then
    raise exception 'feedback participant required' using errcode = '42501';
  end if;
  if v_feedback.eligibility_state <> 'eligible' then
    raise exception 'participant is not attendance eligible' using errcode = '22023';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = v_feedback.activity_id
  for update;

  if not found or v_outcome.event_resolution = 'voided' then
    raise exception 'post-event outcome unavailable' using errcode = '22023';
  end if;

  if v_outcome.organizer_event_claim is null
     or (
       v_outcome.organizer_event_claim = 'happened'
       and v_outcome.organizer_roster_finalized_at is null
     ) then
    raise exception 'participant confirmation not open yet' using errcode = '22023';
  end if;

  v_resolution := go_irl_private.postevent_attendance_resolution(
    v_feedback.organizer_claim,
    p_claim,
    v_feedback.eligibility_state
  );

  update public.activity_attendance_feedback
  set participant_claim = p_claim,
      participant_claimed_at = now(),
      resolution = v_resolution,
      resolved_at = case when v_resolution = 'pending' then null else now() end,
      organizer_rating = case when v_resolution = 'attended' then organizer_rating else null end,
      rating_tags = case when v_resolution = 'attended' then rating_tags else null end,
      rating_first_submitted_at = case when v_resolution = 'attended' then rating_first_submitted_at else null end,
      rating_updated_at = case when v_resolution = 'attended' then rating_updated_at else null end,
      updated_at = now()
  where id = p_feedback_id
  returning * into v_feedback;

  perform go_irl_private.postevent_recompute_event_resolution(v_feedback.activity_id);

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.participant_confirmation',
    'activity_attendance_feedback',
    p_feedback_id::text,
    jsonb_build_object('claim', p_claim)
  );

  return v_feedback;
end;
$function$;

revoke all on function go_irl_private.postevent_record_outcome_for_actor(text,uuid,text)
from public, anon, authenticated;
revoke all on function go_irl_private.postevent_submit_confirmation_for_actor(text,uuid,text)
from public, anon, authenticated;

create or replace function public.go_irl_record_activity_post_event_outcome(
  p_activity_id uuid,
  p_claim text
)
returns public.activity_post_event_outcomes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := public.go_irl_auth_user_key();
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  return go_irl_private.postevent_record_outcome_for_actor(
    v_actor,
    p_activity_id,
    p_claim
  );
end;
$function$;

create or replace function public.go_irl_submit_activity_attendance_confirmation(
  p_feedback_id uuid,
  p_claim text
)
returns public.activity_attendance_feedback
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := public.go_irl_auth_user_key();
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  return go_irl_private.postevent_submit_confirmation_for_actor(
    v_actor,
    p_feedback_id,
    p_claim
  );
end;
$function$;

revoke all on function public.go_irl_record_activity_post_event_outcome(uuid,text)
from public, anon;
revoke all on function public.go_irl_submit_activity_attendance_confirmation(uuid,text)
from public, anon;
grant execute on function public.go_irl_record_activity_post_event_outcome(uuid,text)
to authenticated;
grant execute on function public.go_irl_submit_activity_attendance_confirmation(uuid,text)
to authenticated;

create or replace function public.go_irl_post_event_telegram_action(
  p_telegram_user_id text,
  p_action text,
  p_target_id uuid,
  p_value text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_telegram_user_id text := nullif(btrim(coalesce(p_telegram_user_id, '')), '');
  v_actor_user_key text;
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_feedback public.activity_attendance_feedback%rowtype;
begin
  if v_telegram_user_id is null then
    raise exception 'telegram user id required' using errcode = '22023';
  end if;

  select identity.user_key
  into v_actor_user_key
  from public.user_provider_identities identity
  where identity.provider = 'telegram'
    and identity.provider_user_id = v_telegram_user_id
    and identity.status = 'active'
    and identity.consented_at is not null
  limit 1;

  if v_actor_user_key is null then
    raise exception 'active consented Telegram identity required' using errcode = '42501';
  end if;

  if p_action = 'organizer_outcome' then
    v_outcome := go_irl_private.postevent_record_outcome_for_actor(
      v_actor_user_key,
      p_target_id,
      p_value
    );

    return jsonb_build_object(
      'action', 'organizer_outcome',
      'targetId', v_outcome.activity_id,
      'claim', v_outcome.organizer_event_claim,
      'eventResolution', v_outcome.event_resolution,
      'rosterFinalized', v_outcome.organizer_roster_finalized_at is not null
    );
  elsif p_action = 'participant_confirmation' then
    v_feedback := go_irl_private.postevent_submit_confirmation_for_actor(
      v_actor_user_key,
      p_target_id,
      p_value
    );

    return jsonb_build_object(
      'action', 'participant_confirmation',
      'targetId', v_feedback.id,
      'activityId', v_feedback.activity_id,
      'claim', v_feedback.participant_claim,
      'attendanceResolution', v_feedback.resolution,
      'ratingAvailable', v_feedback.resolution = 'attended'
    );
  end if;

  raise exception 'invalid post-event Telegram action' using errcode = '22023';
end;
$function$;

revoke all on function public.go_irl_post_event_telegram_action(text,text,uuid,text)
from public, anon, authenticated;
grant execute on function public.go_irl_post_event_telegram_action(text,text,uuid,text)
to service_role;

notify pgrst, 'reload schema';

commit;
