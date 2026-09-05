-- ChRem002B: durable organizer post-event Telegram survey state.
-- PREPARATION ONLY. Production apply remains a separate explicit release gate.
-- Fresh source baseline: GitHub main c2c79ca05178bdddf70eff0bedc820df488e5d84.
--
-- Reuses:
-- * public.activity_post_event_outcomes for event-level post-event truth;
-- * public.activity_attendance_feedback for the canonical participant roster;
-- * public.event_notifications for delayed Telegram completion cleanup;
-- * existing active-consented Telegram identity -> canonical user_key bridge.
--
-- Does NOT add a survey table, attendance store, notification queue or webhook.

begin;

do $prerequisites$
declare
  v_claim_definition text;
begin
  if to_regclass('public.activity_post_event_outcomes') is null then
    raise exception 'chrem002b_missing_activity_post_event_outcomes';
  end if;
  if to_regclass('public.activity_attendance_feedback') is null then
    raise exception 'chrem002b_missing_activity_attendance_feedback';
  end if;
  if to_regclass('public.event_notifications') is null then
    raise exception 'chrem002b_missing_event_notifications';
  end if;
  if to_regclass('public.user_provider_identities') is null then
    raise exception 'chrem002b_missing_user_provider_identities';
  end if;
  if to_regprocedure('go_irl_private.postevent_sync_activity_snapshot()') is null then
    raise exception 'chrem002b_missing_activity_snapshot';
  end if;
  if to_regprocedure('go_irl_private.postevent_record_outcome_for_actor(text,uuid,text)') is null then
    raise exception 'chrem002b_missing_actor_outcome_helper';
  end if;
  if to_regprocedure('go_irl_private.postevent_attendance_resolution(text,text,text)') is null then
    raise exception 'chrem002b_missing_attendance_resolution';
  end if;
  if to_regprocedure('go_irl_private.postevent_recompute_event_resolution(uuid)') is null then
    raise exception 'chrem002b_missing_recompute_event_resolution';
  end if;
  if to_regprocedure('go_irl_private.postevent_write_audit(text,text,text,text,jsonb)') is null then
    raise exception 'chrem002b_missing_postevent_audit';
  end if;
  if to_regprocedure('public.go_irl_claim_event_notifications(text[],integer,integer)') is null then
    raise exception 'chrem002b_missing_notification_claim';
  end if;

  -- Fresh main contains 20260904043000_postevent001_telegram_primary_route_fix.sql.
  -- Fail closed if a target runtime skipped that older migration: organizer survey and
  -- cleanup must stay Telegram-private rather than inherit an unrelated primary route.
  select pg_get_functiondef('public.go_irl_claim_event_notifications(text[],integer,integer)'::regprocedure)
  into v_claim_definition;
  if position('telegram_route.channel = ''telegram''' in v_claim_definition) = 0
     or position('notification.kind in (' in v_claim_definition) = 0
     or position('''post_event.organizer_confirmation''' in v_claim_definition) = 0 then
    raise exception 'chrem002b_postevent_telegram_primary_route_fix_required';
  end if;
end;
$prerequisites$;

alter table public.activity_post_event_outcomes
  add column if not exists organizer_experience text,
  add column if not exists organizer_attendance_summary text,
  add column if not exists organizer_survey_completed_at timestamptz;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activity_post_event_outcomes'::regclass
      and conname = 'activity_post_event_outcomes_organizer_experience_check'
  ) then
    alter table public.activity_post_event_outcomes
      add constraint activity_post_event_outcomes_organizer_experience_check
      check (organizer_experience is null or organizer_experience in ('good','had_problems'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activity_post_event_outcomes'::regclass
      and conname = 'activity_post_event_outcomes_organizer_attendance_summary_check'
  ) then
    alter table public.activity_post_event_outcomes
      add constraint activity_post_event_outcomes_organizer_attendance_summary_check
      check (organizer_attendance_summary is null or organizer_attendance_summary in ('all_came','no_shows'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activity_post_event_outcomes'::regclass
      and conname = 'activity_post_event_outcomes_survey_stage_check'
  ) then
    alter table public.activity_post_event_outcomes
      add constraint activity_post_event_outcomes_survey_stage_check
      check (organizer_attendance_summary is null or organizer_experience is not null);
  end if;
end;
$constraints$;

create or replace function go_irl_private.postevent_sync_activity_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_timezone text;
  v_event_starts_at timestamptz;
  v_event_ends_at timestamptz;
  v_event_local_end_date date;
  v_prompt_at timestamptz;
  v_reminder_at timestamptz;
  v_fallback_at timestamptz;
  v_duration_minutes integer;
  v_existing public.activity_post_event_outcomes%rowtype;
begin
  v_timezone := go_irl_private.postevent_activity_timezone(new.city_id);
  if v_timezone is null then
    return new;
  end if;

  v_event_starts_at := go_irl_private.postevent_activity_starts_at(new.event_date, new.event_time, new.city_id);
  if v_event_starts_at is null then
    return new;
  end if;

  v_duration_minutes := go_irl_private.postevent_activity_duration_minutes(new.activity_type, new.metadata);
  v_event_ends_at := v_event_starts_at + make_interval(mins => v_duration_minutes);
  v_event_local_end_date := (v_event_ends_at at time zone v_timezone)::date;

  -- ChRem002B timing: one organizer prompt at 10:00 on the calendar day after
  -- the Activity actually ends in its canonical timezone. Owner explicitly removed
  -- the legacy 12:00 organizer reminder. organizer_reminder_at is retained only as
  -- a legacy non-null snapshot field and mirrors the 10:00 prompt time.
  v_prompt_at := go_irl_private.postevent_local_day_time(v_event_local_end_date, 1, 10, new.city_id);
  v_reminder_at := v_prompt_at;
  v_fallback_at := go_irl_private.postevent_local_day_time(v_event_local_end_date, 1, 14, new.city_id);

  select * into v_existing
  from public.activity_post_event_outcomes
  where activity_id = new.id
  for update;

  if not found then
    insert into public.activity_post_event_outcomes(
      activity_id,
      organizer_user_key,
      city_id,
      event_timezone,
      event_date,
      event_time,
      event_starts_at,
      event_ends_at,
      organizer_prompt_at,
      organizer_reminder_at,
      participant_fallback_at,
      event_resolution,
      updated_at
    ) values (
      new.id,
      new.organizer_key,
      new.city_id,
      v_timezone,
      new.event_date,
      new.event_time,
      v_event_starts_at,
      v_event_ends_at,
      v_prompt_at,
      v_reminder_at,
      v_fallback_at,
      case when new.series_occurrence_status = 'cancelled' then 'voided' else 'pending' end,
      now()
    );
  elsif v_existing.event_starts_at > now()
    and v_existing.organizer_responded_at is null
    and not exists (
      select 1
      from public.activity_attendance_feedback feedback
      where feedback.activity_id = new.id
        and (
          feedback.organizer_claim is not null
          or feedback.participant_claim is not null
          or feedback.organizer_rating is not null
        )
    ) then
    update public.activity_post_event_outcomes
    set organizer_user_key = new.organizer_key,
        city_id = new.city_id,
        event_timezone = v_timezone,
        event_date = new.event_date,
        event_time = new.event_time,
        event_starts_at = v_event_starts_at,
        event_ends_at = v_event_ends_at,
        organizer_prompt_at = v_prompt_at,
        organizer_reminder_at = v_reminder_at,
        participant_fallback_at = v_fallback_at,
        event_resolution = case
          when new.series_occurrence_status = 'cancelled' then 'voided'
          else 'pending'
        end,
        updated_at = now()
    where activity_id = new.id;
  end if;

  if new.series_occurrence_status = 'cancelled'
     and v_event_starts_at > now() then
    update public.activity_post_event_outcomes
    set event_resolution = 'voided',
        updated_at = now()
    where activity_id = new.id
      and organizer_responded_at is null;

    update public.activity_attendance_feedback
    set eligibility_state = 'voided',
        organizer_draft_absent = false,
        resolution = 'voided',
        resolved_at = now(),
        organizer_rating = null,
        rating_tags = null,
        rating_first_submitted_at = null,
        rating_updated_at = null,
        updated_at = now()
    where activity_id = new.id
      and organizer_claim is null
      and participant_claim is null;

    return new;
  end if;

  perform go_irl_private.postevent_resync_future_candidates(new.id);
  return new;
end;
$function$;

-- ChRem002B owner decision: no separate 12:00 organizer reminder. Keep exactly one
-- organizer prompt notification. Existing legacy reminder rows are cancelled best-effort
-- when they are still scheduled/failed; sent history is preserved.
create or replace function go_irl_private.postevent_sync_notifications(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_initial_key text;
  v_reminder_key text;
  v_participant record;
  v_participant_key text;
  v_participant_open boolean;
begin
  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;

  if not found then
    return;
  end if;

  v_initial_key := 'postevent:' || p_activity_id::text || ':organizer:initial';
  v_reminder_key := 'postevent:' || p_activity_id::text || ':organizer:reminder1';

  if v_outcome.event_resolution = 'voided' then
    update public.event_notifications
    set status = 'cancelled', next_attempt_at = null, leased_at = null,
        last_error_code = 'postevent_voided', selected_route_id = null,
        routing_outcome = null, resolved_at = null, updated_at = now()
    where activity_id = p_activity_id
      and kind in ('post_event.organizer_confirmation','post_event.participant_confirmation')
      and status in ('scheduled','failed');
    return;
  end if;

  if v_outcome.organizer_responded_at is null then
    insert into public.event_notifications (
      user_key, activity_id, kind, payload, status, next_attempt_at,
      provider, delivery_key, selected_route_id, routing_outcome, resolved_at
    ) values (
      v_outcome.organizer_user_key, p_activity_id, 'post_event.organizer_confirmation',
      jsonb_build_object('eventId', p_activity_id, 'postEventStage', 'organizer_initial',
        'eventDate', v_outcome.event_date, 'eventTime', v_outcome.event_time,
        'eventTimezone', v_outcome.event_timezone),
      'scheduled', v_outcome.organizer_prompt_at, null, v_initial_key, null, null, null
    )
    on conflict (delivery_key) do update
    set user_key = excluded.user_key, activity_id = excluded.activity_id, payload = excluded.payload,
        status = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.status else 'scheduled' end,
        next_attempt_at = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.next_attempt_at else excluded.next_attempt_at end,
        provider = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.provider else null end,
        selected_route_id = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.selected_route_id else null end,
        routing_outcome = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.routing_outcome else null end,
        resolved_at = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.resolved_at else null end,
        last_error_code = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.last_error_code else null end,
        updated_at = now();

    update public.event_notifications
    set status = 'cancelled', next_attempt_at = null, leased_at = null,
        last_error_code = 'chrem002b_organizer_reminder_removed', selected_route_id = null,
        routing_outcome = null, resolved_at = null, updated_at = now()
    where delivery_key = v_reminder_key
      and status in ('scheduled','failed');
  else
    update public.event_notifications
    set status = 'cancelled', next_attempt_at = null, leased_at = null,
        last_error_code = 'postevent_organizer_responded', selected_route_id = null,
        routing_outcome = null, resolved_at = null, updated_at = now()
    where delivery_key in (v_initial_key, v_reminder_key)
      and status in ('scheduled','failed');
  end if;

  v_participant_open :=
    v_outcome.organizer_event_claim is not null
    and (v_outcome.organizer_event_claim <> 'happened'
         or v_outcome.organizer_roster_finalized_at is not null);

  for v_participant in
    select feedback.id, feedback.participant_user_key, feedback.eligibility_state, feedback.participant_claim
    from public.activity_attendance_feedback feedback
    where feedback.activity_id = p_activity_id
  loop
    v_participant_key := 'postevent:' || p_activity_id::text || ':participant:' || v_participant.id::text || ':confirm';

    if v_participant.eligibility_state <> 'eligible'
       or v_participant.participant_claim is not null
       or not v_participant_open then
      update public.event_notifications
      set status = 'cancelled', next_attempt_at = null, leased_at = null,
          last_error_code = case
            when v_participant.participant_claim is not null then 'postevent_participant_responded'
            when v_participant.eligibility_state <> 'eligible' then 'postevent_participant_ineligible'
            else 'postevent_waiting_for_organizer'
          end,
          selected_route_id = null, routing_outcome = null, resolved_at = null, updated_at = now()
      where delivery_key = v_participant_key
        and status in ('scheduled','failed');
      continue;
    end if;

    insert into public.event_notifications (
      user_key, activity_id, kind, payload, status, next_attempt_at,
      provider, delivery_key, selected_route_id, routing_outcome, resolved_at
    ) values (
      v_participant.participant_user_key, p_activity_id, 'post_event.participant_confirmation',
      jsonb_build_object('eventId', p_activity_id, 'feedbackId', v_participant.id,
        'postEventStage', 'participant_confirmation', 'eventDate', v_outcome.event_date,
        'eventTime', v_outcome.event_time, 'eventTimezone', v_outcome.event_timezone),
      'scheduled', now(), null, v_participant_key, null, null, null
    )
    on conflict (delivery_key) do update
    set user_key = excluded.user_key, activity_id = excluded.activity_id, payload = excluded.payload,
        status = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.status else 'scheduled' end,
        next_attempt_at = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.next_attempt_at else least(coalesce(public.event_notifications.next_attempt_at, excluded.next_attempt_at), excluded.next_attempt_at) end,
        provider = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.provider else null end,
        selected_route_id = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.selected_route_id else null end,
        routing_outcome = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.routing_outcome else null end,
        resolved_at = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.resolved_at else null end,
        last_error_code = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.last_error_code else null end,
        updated_at = now();
  end loop;
end;
$function$;

update public.event_notifications
set status = 'cancelled', next_attempt_at = null, leased_at = null,
    last_error_code = 'chrem002b_organizer_reminder_removed', selected_route_id = null,
    routing_outcome = null, resolved_at = null, updated_at = now()
where kind = 'post_event.organizer_confirmation'
  and payload ->> 'postEventStage' = 'organizer_reminder1'
  and status in ('scheduled','failed');

-- Recalculate only still-unanswered organizer schedules. The outcome trigger re-syncs
-- the existing event_notifications rows; sent/sending delivery semantics remain governed
-- by postevent_sync_notifications and are not replayed by this update.
with recalculated as (
  select
    outcome.activity_id,
    go_irl_private.postevent_local_day_time(
      (outcome.event_ends_at at time zone outcome.event_timezone)::date,
      1,
      10,
      outcome.city_id
    ) as prompt_at,
    go_irl_private.postevent_local_day_time(
      (outcome.event_ends_at at time zone outcome.event_timezone)::date,
      1,
      10,
      outcome.city_id
    ) as reminder_at,
    go_irl_private.postevent_local_day_time(
      (outcome.event_ends_at at time zone outcome.event_timezone)::date,
      1,
      14,
      outcome.city_id
    ) as fallback_at
  from public.activity_post_event_outcomes outcome
  where outcome.organizer_responded_at is null
    and outcome.event_resolution <> 'voided'
    and outcome.event_ends_at is not null
    and outcome.event_timezone is not null
)
update public.activity_post_event_outcomes outcome
set organizer_prompt_at = recalculated.prompt_at,
    organizer_reminder_at = recalculated.reminder_at,
    participant_fallback_at = recalculated.fallback_at,
    updated_at = now()
from recalculated
where outcome.activity_id = recalculated.activity_id
  and recalculated.prompt_at is not null
  and recalculated.reminder_at is not null
  and recalculated.fallback_at is not null
  and (
    outcome.organizer_prompt_at is distinct from recalculated.prompt_at
    or outcome.organizer_reminder_at is distinct from recalculated.reminder_at
    or outcome.participant_fallback_at is distinct from recalculated.fallback_at
  );

create or replace function go_irl_private.postevent_organizer_survey_state_for_actor(
  p_actor_user_key text,
  p_activity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_roster jsonb := '[]'::jsonb;
  v_next_step text;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'feedbackId', feedback.id,
        'displayName', feedback.participant_display_name,
        'absent', feedback.organizer_draft_absent
      )
      order by lower(feedback.participant_display_name), feedback.id
    ),
    '[]'::jsonb
  )
  into v_roster
  from public.activity_attendance_feedback feedback
  where feedback.activity_id = p_activity_id
    and feedback.eligibility_state = 'eligible';

  v_next_step := case
    when v_outcome.organizer_survey_completed_at is not null then 'complete'
    when v_outcome.organizer_event_claim is null then 'outcome'
    when v_outcome.organizer_event_claim <> 'happened' then 'complete'
    when v_outcome.organizer_experience is null then 'experience'
    when v_outcome.organizer_attendance_summary is null then 'attendance'
    when v_outcome.organizer_attendance_summary = 'no_shows'
      and v_outcome.organizer_roster_finalized_at is null then 'no_shows'
    else 'complete'
  end;

  return jsonb_build_object(
    'activityId', v_outcome.activity_id,
    'eventClaim', v_outcome.organizer_event_claim,
    'experience', v_outcome.organizer_experience,
    'attendanceSummary', v_outcome.organizer_attendance_summary,
    'rosterFinalized', v_outcome.organizer_roster_finalized_at is not null,
    'completedAt', v_outcome.organizer_survey_completed_at,
    'nextStep', v_next_step,
    'roster', v_roster
  );
end;
$function$;

create or replace function go_irl_private.postevent_finalize_attendance_for_actor(
  p_actor_user_key text,
  p_activity_id uuid
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

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;
  if v_outcome.organizer_event_claim <> 'happened' then
    raise exception 'happened outcome required before attendance finalization' using errcode = '22023';
  end if;
  if v_outcome.organizer_roster_finalized_at is not null then
    return v_outcome;
  end if;

  perform 1
  from public.activity_attendance_feedback
  where activity_id = p_activity_id
    and eligibility_state = 'eligible'
  for update;

  update public.activity_attendance_feedback feedback
  set organizer_claim = case when feedback.organizer_draft_absent then 'absent' else 'attended' end,
      organizer_draft_absent = false,
      organizer_claimed_at = now(),
      resolution = go_irl_private.postevent_attendance_resolution(
        case when feedback.organizer_draft_absent then 'absent' else 'attended' end,
        feedback.participant_claim,
        feedback.eligibility_state
      ),
      resolved_at = case when feedback.participant_claim is null then null else now() end,
      updated_at = now()
  where feedback.activity_id = p_activity_id
    and feedback.eligibility_state = 'eligible';

  update public.activity_post_event_outcomes
  set organizer_roster_finalized_at = now(),
      updated_at = now()
  where activity_id = p_activity_id;

  perform go_irl_private.postevent_recompute_event_resolution(p_activity_id);
  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.attendance_finalized',
    'activity_post_event_outcome',
    p_activity_id::text,
    '{}'::jsonb
  );

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id;
  return v_outcome;
end;
$function$;

create or replace function go_irl_private.postevent_record_survey_outcome_for_actor(
  p_actor_user_key text,
  p_activity_id uuid,
  p_claim text
)
returns jsonb
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
  if p_claim not in ('happened','did_not_happen') then
    raise exception 'invalid organizer survey outcome' using errcode = '22023';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;
  if v_outcome.organizer_event_claim = p_claim then
    if p_claim = 'did_not_happen' and v_outcome.organizer_survey_completed_at is null then
      update public.activity_post_event_outcomes
      set organizer_survey_completed_at = now(), updated_at = now()
      where activity_id = p_activity_id;
    end if;
    return go_irl_private.postevent_organizer_survey_state_for_actor(v_actor, p_activity_id);
  end if;
  if v_outcome.organizer_event_claim is not null
     and v_outcome.organizer_event_claim <> p_claim
     and (
       v_outcome.organizer_experience is not null
       or v_outcome.organizer_attendance_summary is not null
       or v_outcome.organizer_roster_finalized_at is not null
       or v_outcome.organizer_survey_completed_at is not null
     ) then
    raise exception 'organizer survey outcome step already closed' using errcode = '55000';
  end if;

  perform go_irl_private.postevent_record_outcome_for_actor(v_actor, p_activity_id, p_claim);

  if v_outcome.organizer_event_claim is distinct from p_claim then
    update public.activity_attendance_feedback
    set organizer_draft_absent = false,
        updated_at = now()
    where activity_id = p_activity_id
      and eligibility_state = 'eligible'
      and organizer_claim is null;
  end if;

  update public.activity_post_event_outcomes
  set organizer_experience = null,
      organizer_attendance_summary = null,
      organizer_survey_completed_at = case when p_claim = 'did_not_happen' then now() else null end,
      updated_at = now()
  where activity_id = p_activity_id;

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.organizer_survey_outcome',
    'activity_post_event_outcome',
    p_activity_id::text,
    jsonb_build_object('claim', p_claim)
  );

  return go_irl_private.postevent_organizer_survey_state_for_actor(v_actor, p_activity_id);
end;
$function$;

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
  if v_outcome.organizer_survey_completed_at is not null
     or v_outcome.organizer_roster_finalized_at is not null then
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
      updated_at = now()
  where activity_id = p_activity_id;

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.organizer_experience',
    'activity_post_event_outcome',
    p_activity_id::text,
    jsonb_build_object('experience', p_experience)
  );

  return go_irl_private.postevent_organizer_survey_state_for_actor(v_actor, p_activity_id);
end;
$function$;

create or replace function go_irl_private.postevent_set_organizer_attendance_summary_for_actor(
  p_actor_user_key text,
  p_activity_id uuid,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_eligible_count integer;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;
  if p_summary not in ('all_came','no_shows') then
    raise exception 'invalid organizer attendance summary' using errcode = '22023';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;
  if v_outcome.organizer_event_claim <> 'happened'
     or v_outcome.organizer_experience is null then
    raise exception 'organizer experience required before attendance summary' using errcode = '22023';
  end if;
  if v_outcome.organizer_attendance_summary is not null then
    if v_outcome.organizer_attendance_summary = p_summary then
      return go_irl_private.postevent_organizer_survey_state_for_actor(v_actor, p_activity_id);
    end if;
    raise exception 'organizer attendance step already answered' using errcode = '55000';
  end if;
  if v_outcome.organizer_survey_completed_at is not null
     or v_outcome.organizer_roster_finalized_at is not null then
    raise exception 'organizer survey already completed' using errcode = '55000';
  end if;

  select count(*) into v_eligible_count
  from public.activity_attendance_feedback
  where activity_id = p_activity_id
    and eligibility_state = 'eligible';

  if p_summary = 'no_shows' and v_eligible_count = 0 then
    raise exception 'no eligible participants for no-show selection' using errcode = '22023';
  end if;

  update public.activity_post_event_outcomes
  set organizer_attendance_summary = p_summary,
      updated_at = now()
  where activity_id = p_activity_id;

  if p_summary = 'all_came' then
    update public.activity_attendance_feedback
    set organizer_draft_absent = false,
        updated_at = now()
    where activity_id = p_activity_id
      and eligibility_state = 'eligible';

    perform go_irl_private.postevent_finalize_attendance_for_actor(v_actor, p_activity_id);

    update public.activity_post_event_outcomes
    set organizer_survey_completed_at = coalesce(organizer_survey_completed_at, now()),
        updated_at = now()
    where activity_id = p_activity_id;
  end if;

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.organizer_attendance_summary',
    'activity_post_event_outcome',
    p_activity_id::text,
    jsonb_build_object('summary', p_summary)
  );

  return go_irl_private.postevent_organizer_survey_state_for_actor(v_actor, p_activity_id);
end;
$function$;

create or replace function go_irl_private.postevent_set_organizer_absence_for_actor(
  p_actor_user_key text,
  p_feedback_id uuid,
  p_absent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_feedback public.activity_attendance_feedback%rowtype;
  v_outcome public.activity_post_event_outcomes%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;
  select * into v_feedback
  from public.activity_attendance_feedback
  where id = p_feedback_id
  for update;

  if not found then
    raise exception 'feedback candidate not found' using errcode = 'P0002';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = v_feedback.activity_id
  for update;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;
  if v_outcome.organizer_event_claim <> 'happened'
     or v_outcome.organizer_attendance_summary <> 'no_shows' then
    raise exception 'no-show selection is not open' using errcode = '22023';
  end if;
  if v_outcome.organizer_roster_finalized_at is not null
     or v_outcome.organizer_survey_completed_at is not null then
    raise exception 'attendance roster already finalized' using errcode = '55000';
  end if;
  if v_feedback.eligibility_state <> 'eligible' then
    raise exception 'participant is not attendance eligible' using errcode = '22023';
  end if;
  if v_feedback.organizer_draft_absent = p_absent then
    return go_irl_private.postevent_organizer_survey_state_for_actor(v_actor, v_feedback.activity_id);
  end if;

  update public.activity_attendance_feedback
  set organizer_draft_absent = p_absent,
      updated_at = now()
  where id = p_feedback_id;

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.organizer_draft_absence',
    'activity_attendance_feedback',
    p_feedback_id::text,
    jsonb_build_object('absent', p_absent, 'source', 'chrem002b_telegram')
  );

  return go_irl_private.postevent_organizer_survey_state_for_actor(v_actor, v_feedback.activity_id);
end;
$function$;

create or replace function go_irl_private.postevent_complete_organizer_no_shows_for_actor(
  p_actor_user_key text,
  p_activity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_absent_count integer;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;
  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;
  if v_outcome.organizer_survey_completed_at is not null
     and v_outcome.organizer_roster_finalized_at is not null then
    return go_irl_private.postevent_organizer_survey_state_for_actor(v_actor, p_activity_id);
  end if;
  if v_outcome.organizer_event_claim <> 'happened'
     or v_outcome.organizer_attendance_summary <> 'no_shows' then
    raise exception 'no-show attendance summary required' using errcode = '22023';
  end if;

  select count(*) into v_absent_count
  from public.activity_attendance_feedback
  where activity_id = p_activity_id
    and eligibility_state = 'eligible'
    and organizer_draft_absent = true;

  if v_outcome.organizer_roster_finalized_at is null and v_absent_count < 1 then
    raise exception 'select at least one absent participant' using errcode = '22023';
  end if;

  perform go_irl_private.postevent_finalize_attendance_for_actor(v_actor, p_activity_id);

  update public.activity_post_event_outcomes
  set organizer_survey_completed_at = coalesce(organizer_survey_completed_at, now()),
      updated_at = now()
  where activity_id = p_activity_id;

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.organizer_survey_completed',
    'activity_post_event_outcome',
    p_activity_id::text,
    jsonb_build_object('attendanceSummary', 'no_shows', 'absentCount', v_absent_count)
  );

  return go_irl_private.postevent_organizer_survey_state_for_actor(v_actor, p_activity_id);
end;
$function$;

revoke all on function go_irl_private.postevent_organizer_survey_state_for_actor(text,uuid)
  from public, anon, authenticated;
revoke all on function go_irl_private.postevent_finalize_attendance_for_actor(text,uuid)
  from public, anon, authenticated;
revoke all on function go_irl_private.postevent_record_survey_outcome_for_actor(text,uuid,text)
  from public, anon, authenticated;
revoke all on function go_irl_private.postevent_set_organizer_experience_for_actor(text,uuid,text)
  from public, anon, authenticated;
revoke all on function go_irl_private.postevent_set_organizer_attendance_summary_for_actor(text,uuid,text)
  from public, anon, authenticated;
revoke all on function go_irl_private.postevent_set_organizer_absence_for_actor(text,uuid,boolean)
  from public, anon, authenticated;
revoke all on function go_irl_private.postevent_complete_organizer_no_shows_for_actor(text,uuid)
  from public, anon, authenticated;

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
  v_language_code text;
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_feedback public.activity_attendance_feedback%rowtype;
  v_state jsonb;
begin
  if v_telegram_user_id is null then
    raise exception 'telegram user id required' using errcode = '22023';
  end if;

  select identity.user_key, app_user.language_code
  into v_actor_user_key, v_language_code
  from public.user_provider_identities identity
  left join public.app_users app_user on app_user.user_key = identity.user_key
  where identity.provider = 'telegram'
    and identity.provider_user_id = v_telegram_user_id
    and identity.status = 'active'
    and identity.consented_at is not null
  limit 1;

  if v_actor_user_key is null then
    raise exception 'active consented Telegram identity required' using errcode = '42501';
  end if;

  if p_action = 'organizer_survey_outcome' then
    v_state := go_irl_private.postevent_record_survey_outcome_for_actor(
      v_actor_user_key, p_target_id, p_value
    );
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'organizer_experience' then
    v_state := go_irl_private.postevent_set_organizer_experience_for_actor(
      v_actor_user_key, p_target_id, p_value
    );
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'organizer_attendance_summary' then
    v_state := go_irl_private.postevent_set_organizer_attendance_summary_for_actor(
      v_actor_user_key, p_target_id, p_value
    );
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'organizer_absence' then
    if p_value not in ('absent','present') then
      raise exception 'invalid organizer absence value' using errcode = '22023';
    end if;
    v_state := go_irl_private.postevent_set_organizer_absence_for_actor(
      v_actor_user_key, p_target_id, p_value = 'absent'
    );
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'organizer_finalize' then
    if p_value <> 'done' then
      raise exception 'invalid organizer finalize value' using errcode = '22023';
    end if;
    v_state := go_irl_private.postevent_complete_organizer_no_shows_for_actor(
      v_actor_user_key, p_target_id
    );
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'organizer_outcome' then
    -- Legacy D3 callback compatibility for already-sent Telegram messages.
    v_outcome := go_irl_private.postevent_record_outcome_for_actor(
      v_actor_user_key, p_target_id, p_value
    );
    return jsonb_build_object(
      'action', 'organizer_outcome',
      'languageCode', v_language_code,
      'targetId', v_outcome.activity_id,
      'claim', v_outcome.organizer_event_claim,
      'eventResolution', v_outcome.event_resolution,
      'rosterFinalized', v_outcome.organizer_roster_finalized_at is not null
    );
  elsif p_action = 'participant_confirmation' then
    -- Preserve the existing participant callback surface unchanged.
    v_feedback := go_irl_private.postevent_submit_confirmation_for_actor(
      v_actor_user_key, p_target_id, p_value
    );
    return jsonb_build_object(
      'action', 'participant_confirmation',
      'languageCode', v_language_code,
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

create or replace function public.go_irl_update_post_event_telegram_message_id(
  p_telegram_user_id text,
  p_activity_id uuid,
  p_previous_message_id text,
  p_new_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_telegram_user_id text := nullif(btrim(coalesce(p_telegram_user_id, '')), '');
  v_actor_user_key text;
  v_updated integer;
begin
  if v_telegram_user_id is null
     or p_previous_message_id !~ '^[1-9][0-9]*$'
     or p_new_message_id !~ '^[1-9][0-9]*$' then
    raise exception 'invalid Telegram message anchor' using errcode = '22023';
  end if;

  select identity.user_key into v_actor_user_key
  from public.user_provider_identities identity
  where identity.provider = 'telegram'
    and identity.provider_user_id = v_telegram_user_id
    and identity.status = 'active'
    and identity.consented_at is not null
  limit 1;

  if v_actor_user_key is null then
    raise exception 'active consented Telegram identity required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.activity_post_event_outcomes outcome
    where outcome.activity_id = p_activity_id
      and outcome.organizer_user_key = v_actor_user_key
  ) then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;

  update public.event_notifications notification
  set provider_message_id = p_new_message_id,
      updated_at = now()
  where notification.user_key = v_actor_user_key
    and notification.activity_id = p_activity_id
    and notification.kind = 'post_event.organizer_confirmation'
    and notification.payload ->> 'postEventStage' in ('organizer_initial','organizer_reminder1')
    and notification.provider_message_id = p_previous_message_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$function$;

revoke all on function public.go_irl_update_post_event_telegram_message_id(text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.go_irl_update_post_event_telegram_message_id(text,uuid,text,text)
  to service_role;

create or replace function public.go_irl_schedule_post_event_telegram_cleanup(
  p_telegram_user_id text,
  p_activity_id uuid,
  p_provider_message_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_telegram_user_id text := nullif(btrim(coalesce(p_telegram_user_id, '')), '');
  v_actor_user_key text;
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_delivery_key text;
  v_notification_id uuid;
begin
  if v_telegram_user_id is null
     or p_provider_message_id !~ '^[1-9][0-9]*$' then
    raise exception 'invalid Telegram cleanup target' using errcode = '22023';
  end if;

  select identity.user_key into v_actor_user_key
  from public.user_provider_identities identity
  where identity.provider = 'telegram'
    and identity.provider_user_id = v_telegram_user_id
    and identity.status = 'active'
    and identity.consented_at is not null
  limit 1;

  if v_actor_user_key is null then
    raise exception 'active consented Telegram identity required' using errcode = '42501';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id;

  if not found or v_outcome.organizer_user_key <> v_actor_user_key then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;
  if v_outcome.organizer_survey_completed_at is null then
    raise exception 'organizer survey completion required before cleanup' using errcode = '22023';
  end if;

  v_delivery_key := 'postevent:' || p_activity_id::text || ':organizer:cleanup';

  insert into public.event_notifications (
    user_key,
    activity_id,
    kind,
    payload,
    status,
    attempt_count,
    next_attempt_at,
    provider,
    provider_message_id,
    delivery_key,
    selected_route_id,
    routing_outcome,
    resolved_at,
    last_error_code,
    leased_at,
    sent_at
  ) values (
    v_actor_user_key,
    p_activity_id,
    'post_event.organizer_confirmation',
    jsonb_build_object(
      'eventId', p_activity_id,
      'postEventStage', 'organizer_cleanup',
      'telegramMessageId', p_provider_message_id,
      'eventTimezone', v_outcome.event_timezone
    ),
    'scheduled',
    0,
    now(),
    null,
    null,
    v_delivery_key,
    null,
    null,
    null,
    null,
    null,
    null
  )
  on conflict (delivery_key) do update
  set user_key = excluded.user_key,
      activity_id = excluded.activity_id,
      payload = excluded.payload,
      status = 'scheduled',
      attempt_count = 0,
      next_attempt_at = excluded.next_attempt_at,
      provider = null,
      provider_message_id = null,
      selected_route_id = null,
      routing_outcome = null,
      resolved_at = null,
      last_error_code = null,
      leased_at = null,
      sent_at = null,
      updated_at = now()
  returning id into v_notification_id;

  perform go_irl_private.postevent_write_audit(
    v_actor_user_key,
    'activity_post_event.organizer_completion_cleanup_scheduled',
    'event_notification',
    v_notification_id::text,
    jsonb_build_object('activityId', p_activity_id, 'cleanupSchedule', 'next_worker_tick', 'maxExpectedMinutes', 15)
  );

  return v_notification_id;
end;
$function$;

revoke all on function public.go_irl_schedule_post_event_telegram_cleanup(text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.go_irl_schedule_post_event_telegram_cleanup(text,uuid,text)
  to service_role;

notify pgrst, 'reload schema';
commit;
