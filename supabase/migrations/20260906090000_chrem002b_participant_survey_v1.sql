-- ChRem002B participant post-event survey V1.
-- SOURCE CANDIDATE ONLY. Production apply and commit remain separate explicit gates.
-- Baseline: GitHub main 9110e25e0dd230ed0134f723556c77761981f832.
--
-- Reuses canonical POSTEVENT001 foundations:
-- * public.activity_post_event_outcomes;
-- * public.activity_attendance_feedback;
-- * public.event_notifications;
-- * public.user_provider_identities / app_users;
-- * existing attendance resolution + audit helpers.
--
-- No parallel survey table, attendance store, notification queue, chat system, or identity store.

begin;

do $prerequisites$
declare
  v_claim_definition text;
begin
  if to_regclass('public.activity_post_event_outcomes') is null then
    raise exception 'chrem002b_participant_v1_missing_activity_post_event_outcomes';
  end if;
  if to_regclass('public.activity_attendance_feedback') is null then
    raise exception 'chrem002b_participant_v1_missing_activity_attendance_feedback';
  end if;
  if to_regclass('public.event_notifications') is null then
    raise exception 'chrem002b_participant_v1_missing_event_notifications';
  end if;
  if to_regclass('public.user_provider_identities') is null then
    raise exception 'chrem002b_participant_v1_missing_user_provider_identities';
  end if;
  if to_regclass('public.app_users') is null then
    raise exception 'chrem002b_participant_v1_missing_app_users';
  end if;
  if to_regprocedure('public.go_irl_auth_user_key()') is null then
    raise exception 'chrem002b_participant_v1_missing_auth_user_key';
  end if;
  if to_regprocedure('go_irl_private.postevent_attendance_resolution(text,text,text)') is null then
    raise exception 'chrem002b_participant_v1_missing_attendance_resolution';
  end if;
  if to_regprocedure('go_irl_private.postevent_recompute_event_resolution(uuid)') is null then
    raise exception 'chrem002b_participant_v1_missing_recompute_event_resolution';
  end if;
  if to_regprocedure('go_irl_private.postevent_write_audit(text,text,text,text,jsonb)') is null then
    raise exception 'chrem002b_participant_v1_missing_postevent_audit';
  end if;
  if to_regprocedure('public.go_irl_claim_event_notifications(text[],integer,integer)') is null then
    raise exception 'chrem002b_participant_v1_missing_notification_claim';
  end if;

  -- Participant surveys are private Telegram DM only. Fail closed if the canonical
  -- notification claim function no longer has an explicit participant post-event branch.
  select pg_get_functiondef('public.go_irl_claim_event_notifications(text[],integer,integer)'::regprocedure)
  into v_claim_definition;
  if position('''post_event.participant_confirmation''' in v_claim_definition) = 0
     or position('telegram_route.channel = ''telegram''' in v_claim_definition) = 0 then
    raise exception 'chrem002b_participant_v1_private_telegram_route_required';
  end if;
end;
$prerequisites$;

-- Participant survey V1 is Telegram-private only. The canonical claim function currently
-- supports in-app fallback for the shared post_event.participant_confirmation kind, so
-- inject one narrow pre-claim cancellation for V1 rows when no executable Telegram route
-- exists at delivery time. This preserves the shared claim foundation and all non-V1 paths.
do $participant_private_claim_guard$
declare
  v_claim_definition text;
  v_marker text := $marker$  if p_providers is null
     or cardinality(p_providers) = 0
     or (p_providers <@ array['telegram','whatsapp','instagram','messenger']::text[]) is not true then
    raise exception 'invalid_providers';
  end if;$marker$;
  v_injection text := $injection$

  update public.event_notifications notification
  set status = 'cancelled',
      next_attempt_at = null,
      leased_at = null,
      provider = null,
      selected_route_id = null,
      routing_outcome = 'needs_attention',
      resolved_at = now(),
      last_error_code = 'postevent_participant_private_delivery_unavailable',
      updated_at = now()
  where notification.kind = 'post_event.participant_confirmation'
    and notification.payload ->> 'postEventStage' = 'participant_survey_v1'
    and (
      (notification.status = 'scheduled'
        and coalesce(notification.next_attempt_at, notification.created_at) <= now())
      or (notification.status = 'failed'
        and notification.next_attempt_at is not null
        and notification.next_attempt_at <= now())
      or (notification.status = 'sending'
        and notification.leased_at <= now() - make_interval(secs => p_lease_seconds))
    )
    and not (
      'telegram' = any(p_providers)
      and exists (
        select 1
        from public.communication_routes telegram_route
        join public.user_provider_identities identity
          on identity.id = telegram_route.provider_identity_id
         and identity.user_key = notification.user_key
         and identity.provider = 'telegram'
         and identity.status = 'active'
        where telegram_route.user_key = notification.user_key
          and telegram_route.channel = 'telegram'
          and telegram_route.readiness = 'ready'
          and telegram_route.consent_state = 'granted'
          and telegram_route.health_state in ('unknown','healthy')
          and telegram_route.capabilities @> array['outbound','notification']::text[]
      )
    );$injection$;
begin
  select pg_get_functiondef('public.go_irl_claim_event_notifications(text[],integer,integer)'::regprocedure)
  into v_claim_definition;

  if position('postevent_participant_private_delivery_unavailable' in v_claim_definition) = 0 then
    if position(v_marker in v_claim_definition) = 0 then
      raise exception 'chrem002b_participant_v1_notification_claim_shape_changed';
    end if;
    v_claim_definition := replace(v_claim_definition, v_marker, v_marker || v_injection);
    execute v_claim_definition;
  end if;
end;
$participant_private_claim_guard$;

alter table public.activity_attendance_feedback
  add column if not exists participant_repeat_intent text,
  add column if not exists participant_issue_step_completed_at timestamptz,
  add column if not exists participant_peer_sample_ids uuid[],
  add column if not exists participant_peer_confirmed_ids uuid[],
  add column if not exists participant_peer_step_completed_at timestamptz,
  add column if not exists participant_survey_completed_at timestamptz;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activity_attendance_feedback'::regclass
      and conname = 'activity_attendance_feedback_participant_repeat_intent_check'
  ) then
    alter table public.activity_attendance_feedback
      add constraint activity_attendance_feedback_participant_repeat_intent_check
      check (participant_repeat_intent is null or participant_repeat_intent in ('yes','no'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activity_attendance_feedback'::regclass
      and conname = 'activity_attendance_feedback_participant_peer_sample_size_check'
  ) then
    alter table public.activity_attendance_feedback
      add constraint activity_attendance_feedback_participant_peer_sample_size_check
      check (participant_peer_sample_ids is null or cardinality(participant_peer_sample_ids) <= 4);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activity_attendance_feedback'::regclass
      and conname = 'activity_attendance_feedback_participant_peer_confirmed_size_check'
  ) then
    alter table public.activity_attendance_feedback
      add constraint activity_attendance_feedback_participant_peer_confirmed_size_check
      check (participant_peer_confirmed_ids is null or cardinality(participant_peer_confirmed_ids) <= 4);
  end if;
end;
$constraints$;

create or replace function go_irl_private.postevent_participant_sample_ids(
  p_feedback_id uuid
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(array_agg(candidate.id order by candidate.sample_order), array[]::uuid[])
  from (
    select other.id,
           md5(p_feedback_id::text || ':' || other.id::text) as sample_order
    from public.activity_attendance_feedback respondent
    join public.activity_attendance_feedback other
      on other.activity_id = respondent.activity_id
     and other.id <> respondent.id
     and other.eligibility_state = 'eligible'
    where respondent.id = p_feedback_id
      and respondent.eligibility_state = 'eligible'
    order by md5(p_feedback_id::text || ':' || other.id::text), other.id
    limit 4
  ) candidate;
$function$;

create or replace function go_irl_private.postevent_ensure_participant_sample_for_actor(
  p_actor_user_key text,
  p_feedback_id uuid
)
returns public.activity_attendance_feedback
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_feedback public.activity_attendance_feedback%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
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

  if v_feedback.participant_peer_sample_ids is null then
    update public.activity_attendance_feedback
    set participant_peer_sample_ids = go_irl_private.postevent_participant_sample_ids(p_feedback_id),
        participant_peer_confirmed_ids = coalesce(participant_peer_confirmed_ids, array[]::uuid[]),
        updated_at = now()
    where id = p_feedback_id
    returning * into v_feedback;
  end if;

  return v_feedback;
end;
$function$;

create or replace function go_irl_private.postevent_participant_survey_state_for_actor(
  p_actor_user_key text,
  p_feedback_id uuid
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
  v_sample jsonb := '[]'::jsonb;
  v_next_step text;
  v_tags text[];
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;

  select * into v_feedback
  from public.activity_attendance_feedback
  where id = p_feedback_id;

  if not found or v_feedback.participant_user_key <> v_actor then
    raise exception 'feedback participant required' using errcode = '42501';
  end if;
  if v_feedback.eligibility_state <> 'eligible' then
    raise exception 'participant is not attendance eligible' using errcode = '22023';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = v_feedback.activity_id;

  if not found or v_outcome.event_resolution = 'voided' then
    raise exception 'post-event outcome unavailable' using errcode = '22023';
  end if;

  -- Persist the deterministic peer sample once, only after attendance+rating make
  -- the peer step relevant. Persistence makes refresh/retry stable.
  if v_feedback.participant_claim = 'attended'
     and v_feedback.organizer_rating is not null
     and (v_feedback.organizer_rating >= 4 or coalesce(cardinality(v_feedback.rating_tags), 0) > 0)
     and v_feedback.participant_peer_sample_ids is null then
    v_feedback := go_irl_private.postevent_ensure_participant_sample_for_actor(v_actor, p_feedback_id);
  end if;

  v_tags := coalesce(v_feedback.rating_tags, array[]::text[]);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'feedbackId', peer.id,
        'displayName', peer.participant_display_name,
        'confirmed', peer.id = any(coalesce(v_feedback.participant_peer_confirmed_ids, array[]::uuid[]))
      )
      order by array_position(v_feedback.participant_peer_sample_ids, peer.id)
    ),
    '[]'::jsonb
  )
  into v_sample
  from public.activity_attendance_feedback peer
  where peer.id = any(coalesce(v_feedback.participant_peer_sample_ids, array[]::uuid[]));

  v_next_step := case
    when v_feedback.participant_survey_completed_at is not null then 'complete'
    when v_feedback.participant_claim is null then 'attendance'
    when v_feedback.participant_claim <> 'attended' and v_feedback.participant_repeat_intent is null then 'repeat_intent'
    when v_feedback.participant_claim <> 'attended' then 'complete'
    when v_feedback.organizer_rating is null then 'rating'
    when v_feedback.organizer_rating <= 3 and v_feedback.participant_issue_step_completed_at is null then 'issues'
    when coalesce(cardinality(v_feedback.participant_peer_sample_ids), 0) > 0
      and v_feedback.participant_peer_step_completed_at is null then 'peers'
    when v_feedback.participant_repeat_intent is null then 'repeat_intent'
    else 'complete'
  end;

  return jsonb_build_object(
    'feedbackId', v_feedback.id,
    'activityId', v_feedback.activity_id,
    'attendance', v_feedback.participant_claim,
    'organizerRating', v_feedback.organizer_rating,
    'issueTags', v_tags,
    'issueStepCompletedAt', v_feedback.participant_issue_step_completed_at,
    'peerSample', v_sample,
    'peerStepCompletedAt', v_feedback.participant_peer_step_completed_at,
    'repeatIntent', v_feedback.participant_repeat_intent,
    'completedAt', v_feedback.participant_survey_completed_at,
    'nextStep', v_next_step
  );
end;
$function$;

create or replace function go_irl_private.postevent_submit_participant_survey_attendance_for_actor(
  p_actor_user_key text,
  p_feedback_id uuid,
  p_claim text
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
  v_resolution text;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;
  if p_claim not in ('attended','absent') then
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
  where activity_id = v_feedback.activity_id;

  if not found or v_outcome.event_resolution = 'voided' then
    raise exception 'post-event outcome unavailable' using errcode = '22023';
  end if;
  if now() < v_outcome.participant_fallback_at then
    raise exception 'participant survey not open yet' using errcode = '22023';
  end if;

  if v_feedback.participant_claim is not null then
    if v_feedback.participant_claim = p_claim then
      return go_irl_private.postevent_participant_survey_state_for_actor(v_actor, p_feedback_id);
    end if;
    if v_feedback.organizer_rating is not null
       or coalesce(cardinality(v_feedback.rating_tags), 0) > 0
       or v_feedback.participant_issue_step_completed_at is not null
       or v_feedback.participant_peer_step_completed_at is not null
       or v_feedback.participant_repeat_intent is not null
       or v_feedback.participant_survey_completed_at is not null then
      raise exception 'participant attendance step already closed' using errcode = '55000';
    end if;
  end if;

  v_resolution := go_irl_private.postevent_attendance_resolution(
    v_feedback.organizer_claim,
    p_claim,
    v_feedback.eligibility_state
  );

  update public.activity_attendance_feedback
  set participant_claim = p_claim,
      participant_claimed_at = coalesce(participant_claimed_at, now()),
      resolution = v_resolution,
      resolved_at = case when v_resolution = 'pending' then null else now() end,
      organizer_rating = case when p_claim = 'attended' then organizer_rating else null end,
      rating_tags = case when p_claim = 'attended' then rating_tags else null end,
      rating_first_submitted_at = case when p_claim = 'attended' then rating_first_submitted_at else null end,
      rating_updated_at = case when p_claim = 'attended' then rating_updated_at else null end,
      participant_issue_step_completed_at = case when p_claim = 'attended' then participant_issue_step_completed_at else null end,
      participant_peer_sample_ids = case when p_claim = 'attended' then participant_peer_sample_ids else null end,
      participant_peer_confirmed_ids = case when p_claim = 'attended' then participant_peer_confirmed_ids else null end,
      participant_peer_step_completed_at = case when p_claim = 'attended' then participant_peer_step_completed_at else null end,
      updated_at = now()
  where id = p_feedback_id;

  perform go_irl_private.postevent_recompute_event_resolution(v_feedback.activity_id);
  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.participant_survey_attendance',
    'activity_attendance_feedback',
    p_feedback_id::text,
    jsonb_build_object('claim', p_claim)
  );

  return go_irl_private.postevent_participant_survey_state_for_actor(v_actor, p_feedback_id);
end;
$function$;

create or replace function go_irl_private.postevent_set_participant_rating_for_actor(
  p_actor_user_key text,
  p_feedback_id uuid,
  p_rating integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_feedback public.activity_attendance_feedback%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'invalid organizer rating' using errcode = '22023';
  end if;

  select * into v_feedback
  from public.activity_attendance_feedback
  where id = p_feedback_id
  for update;

  if not found or v_feedback.participant_user_key <> v_actor then
    raise exception 'feedback participant required' using errcode = '42501';
  end if;
  if v_feedback.participant_claim <> 'attended' then
    raise exception 'attended participant required before rating' using errcode = '22023';
  end if;
  if v_feedback.participant_survey_completed_at is not null
     or v_feedback.participant_peer_step_completed_at is not null
     or v_feedback.participant_repeat_intent is not null then
    raise exception 'participant rating step already closed' using errcode = '55000';
  end if;

  if v_feedback.organizer_rating is not null and v_feedback.organizer_rating <> p_rating then
    raise exception 'participant rating already answered' using errcode = '55000';
  end if;

  update public.activity_attendance_feedback
  set organizer_rating = p_rating,
      rating_tags = case when p_rating >= 4 then array[]::text[] else rating_tags end,
      rating_first_submitted_at = coalesce(rating_first_submitted_at, now()),
      rating_updated_at = now(),
      updated_at = now()
  where id = p_feedback_id;

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.participant_organizer_rating',
    'activity_attendance_feedback',
    p_feedback_id::text,
    jsonb_build_object('rating', p_rating)
  );

  return go_irl_private.postevent_participant_survey_state_for_actor(v_actor, p_feedback_id);
end;
$function$;

create or replace function go_irl_private.postevent_set_participant_issue_tag_for_actor(
  p_actor_user_key text,
  p_feedback_id uuid,
  p_tag text,
  p_selected boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_feedback public.activity_attendance_feedback%rowtype;
  v_tags text[];
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;
  if p_tag not in ('organization','communication','punctuality','safety','other') then
    raise exception 'invalid participant organizer issue tag' using errcode = '22023';
  end if;

  select * into v_feedback
  from public.activity_attendance_feedback
  where id = p_feedback_id
  for update;

  if not found or v_feedback.participant_user_key <> v_actor then
    raise exception 'feedback participant required' using errcode = '42501';
  end if;
  if v_feedback.participant_claim <> 'attended'
     or v_feedback.organizer_rating is null
     or v_feedback.organizer_rating > 3 then
    raise exception 'low organizer rating required before issue tags' using errcode = '22023';
  end if;
  if v_feedback.participant_issue_step_completed_at is not null
     or v_feedback.participant_peer_step_completed_at is not null
     or v_feedback.participant_repeat_intent is not null
     or v_feedback.participant_survey_completed_at is not null then
    raise exception 'participant issue step already closed' using errcode = '55000';
  end if;

  v_tags := coalesce(v_feedback.rating_tags, array[]::text[]);
  if p_selected then
    if not p_tag = any(v_tags) then
      v_tags := array_append(v_tags, p_tag);
    end if;
  else
    v_tags := array_remove(v_tags, p_tag);
  end if;

  update public.activity_attendance_feedback
  set rating_tags = v_tags,
      rating_updated_at = now(),
      updated_at = now()
  where id = p_feedback_id;

  return go_irl_private.postevent_participant_survey_state_for_actor(v_actor, p_feedback_id);
end;
$function$;

create or replace function go_irl_private.postevent_complete_participant_issue_tags_for_actor(
  p_actor_user_key text,
  p_feedback_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_feedback public.activity_attendance_feedback%rowtype;
begin
  select * into v_feedback
  from public.activity_attendance_feedback
  where id = p_feedback_id
  for update;

  if v_actor is null or not found or v_feedback.participant_user_key <> v_actor then
    raise exception 'feedback participant required' using errcode = '42501';
  end if;
  if v_feedback.participant_claim <> 'attended'
     or v_feedback.organizer_rating is null
     or v_feedback.organizer_rating > 3
     or coalesce(cardinality(v_feedback.rating_tags), 0) < 1 then
    raise exception 'select at least one organizer issue tag' using errcode = '22023';
  end if;

  update public.activity_attendance_feedback
  set participant_issue_step_completed_at = coalesce(participant_issue_step_completed_at, now()),
      updated_at = now()
  where id = p_feedback_id;

  -- Materialize the stable peer sample now; its persisted UUID order is the survey state.
  perform go_irl_private.postevent_ensure_participant_sample_for_actor(v_actor, p_feedback_id);

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.participant_issue_tags',
    'activity_attendance_feedback',
    p_feedback_id::text,
    jsonb_build_object('tags', v_feedback.rating_tags)
  );

  return go_irl_private.postevent_participant_survey_state_for_actor(v_actor, p_feedback_id);
end;
$function$;

create or replace function go_irl_private.postevent_set_participant_peer_presence_for_actor(
  p_actor_user_key text,
  p_feedback_id uuid,
  p_peer_feedback_id uuid,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_feedback public.activity_attendance_feedback%rowtype;
  v_confirmed uuid[];
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;

  v_feedback := go_irl_private.postevent_ensure_participant_sample_for_actor(v_actor, p_feedback_id);

  if v_feedback.participant_claim <> 'attended' or v_feedback.organizer_rating is null then
    raise exception 'participant rating required before peer confirmation' using errcode = '22023';
  end if;
  if v_feedback.organizer_rating <= 3
     and (coalesce(cardinality(v_feedback.rating_tags), 0) < 1
       or v_feedback.participant_issue_step_completed_at is null) then
    raise exception 'participant issue details required before peer confirmation' using errcode = '22023';
  end if;
  if v_feedback.participant_peer_step_completed_at is not null
     or v_feedback.participant_repeat_intent is not null
     or v_feedback.participant_survey_completed_at is not null then
    raise exception 'participant peer step already closed' using errcode = '55000';
  end if;
  if not p_peer_feedback_id = any(coalesce(v_feedback.participant_peer_sample_ids, array[]::uuid[])) then
    raise exception 'peer candidate is not in stable sample' using errcode = '22023';
  end if;

  v_confirmed := coalesce(v_feedback.participant_peer_confirmed_ids, array[]::uuid[]);
  if p_confirmed then
    if not p_peer_feedback_id = any(v_confirmed) then
      v_confirmed := array_append(v_confirmed, p_peer_feedback_id);
    end if;
  else
    v_confirmed := array_remove(v_confirmed, p_peer_feedback_id);
  end if;

  update public.activity_attendance_feedback
  set participant_peer_confirmed_ids = v_confirmed,
      updated_at = now()
  where id = p_feedback_id;

  return go_irl_private.postevent_participant_survey_state_for_actor(v_actor, p_feedback_id);
end;
$function$;

create or replace function go_irl_private.postevent_complete_participant_peer_presence_for_actor(
  p_actor_user_key text,
  p_feedback_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_feedback public.activity_attendance_feedback%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;

  v_feedback := go_irl_private.postevent_ensure_participant_sample_for_actor(v_actor, p_feedback_id);

  if v_feedback.participant_claim <> 'attended' or v_feedback.organizer_rating is null then
    raise exception 'participant rating required before peer confirmation' using errcode = '22023';
  end if;
  if v_feedback.organizer_rating <= 3 and v_feedback.participant_issue_step_completed_at is null then
    raise exception 'participant issue details required before peer confirmation' using errcode = '22023';
  end if;
  if v_feedback.participant_peer_step_completed_at is not null
     or v_feedback.participant_repeat_intent is not null
     or v_feedback.participant_survey_completed_at is not null then
    raise exception 'participant peer step already closed' using errcode = '55000';
  end if;
  if coalesce(cardinality(v_feedback.participant_peer_sample_ids), 0) > 0
     and coalesce(cardinality(v_feedback.participant_peer_confirmed_ids), 0) < 1 then
    raise exception 'confirm at least one seen participant' using errcode = '22023';
  end if;

  update public.activity_attendance_feedback
  set participant_peer_step_completed_at = coalesce(participant_peer_step_completed_at, now()),
      updated_at = now()
  where id = p_feedback_id;

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.participant_peer_presence',
    'activity_attendance_feedback',
    p_feedback_id::text,
    jsonb_build_object(
      'positivePeerFeedbackIds', coalesce(v_feedback.participant_peer_confirmed_ids, array[]::uuid[]),
      'positiveEvidenceOnly', true
    )
  );

  return go_irl_private.postevent_participant_survey_state_for_actor(v_actor, p_feedback_id);
end;
$function$;

create or replace function go_irl_private.postevent_set_participant_repeat_intent_for_actor(
  p_actor_user_key text,
  p_feedback_id uuid,
  p_intent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := nullif(btrim(coalesce(p_actor_user_key, '')), '');
  v_feedback public.activity_attendance_feedback%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted actor required' using errcode = '42501';
  end if;
  if p_intent not in ('yes','no') then
    raise exception 'invalid participant repeat intent' using errcode = '22023';
  end if;

  select * into v_feedback
  from public.activity_attendance_feedback
  where id = p_feedback_id
  for update;

  if not found or v_feedback.participant_user_key <> v_actor then
    raise exception 'feedback participant required' using errcode = '42501';
  end if;
  if v_feedback.participant_claim is null then
    raise exception 'participant attendance required before repeat intent' using errcode = '22023';
  end if;
  if v_feedback.participant_claim = 'attended' then
    if v_feedback.organizer_rating is null then
      raise exception 'participant rating required before repeat intent' using errcode = '22023';
    end if;
    if v_feedback.organizer_rating <= 3 and v_feedback.participant_issue_step_completed_at is null then
      raise exception 'participant issue details required before repeat intent' using errcode = '22023';
    end if;
    if coalesce(cardinality(v_feedback.participant_peer_sample_ids), 0) > 0
       and v_feedback.participant_peer_step_completed_at is null then
      raise exception 'participant peer confirmation required before repeat intent' using errcode = '22023';
    end if;
  end if;

  if v_feedback.participant_repeat_intent is not null
     and v_feedback.participant_repeat_intent <> p_intent then
    raise exception 'participant repeat intent already answered' using errcode = '55000';
  end if;

  update public.activity_attendance_feedback
  set participant_repeat_intent = p_intent,
      participant_survey_completed_at = coalesce(participant_survey_completed_at, now()),
      updated_at = now()
  where id = p_feedback_id;

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.participant_repeat_intent',
    'activity_attendance_feedback',
    p_feedback_id::text,
    jsonb_build_object('repeatIntent', p_intent)
  );

  return go_irl_private.postevent_participant_survey_state_for_actor(v_actor, p_feedback_id);
end;
$function$;

-- Public authenticated read surface for participant state. Mutations remain actor-explicit
-- through the private helpers and the Telegram service bridge below.
create or replace function public.go_irl_get_activity_post_event_participant_survey_state(
  p_feedback_id uuid
)
returns jsonb
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
  return go_irl_private.postevent_participant_survey_state_for_actor(v_actor, p_feedback_id);
end;
$function$;

-- Canonical participant timing: private DM at 13:00 on the next local calendar day
-- after the concrete Activity ends. participant_fallback_at is reused as the existing
-- participant survey schedule field; its historical 14:00 fallback semantics are superseded.
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
  v_participant_at timestamptz;
  v_duration_minutes integer;
  v_existing public.activity_post_event_outcomes%rowtype;
begin
  v_timezone := go_irl_private.postevent_activity_timezone(new.city_id);
  if v_timezone is null then return new; end if;

  v_event_starts_at := go_irl_private.postevent_activity_starts_at(new.event_date, new.event_time, new.city_id);
  if v_event_starts_at is null then return new; end if;

  v_duration_minutes := go_irl_private.postevent_activity_duration_minutes(new.activity_type, new.metadata);
  v_event_ends_at := v_event_starts_at + make_interval(mins => v_duration_minutes);
  v_event_local_end_date := (v_event_ends_at at time zone v_timezone)::date;
  v_prompt_at := go_irl_private.postevent_local_day_time(v_event_local_end_date, 1, 10, new.city_id);
  v_reminder_at := v_prompt_at;
  v_participant_at := go_irl_private.postevent_local_day_time(v_event_local_end_date, 1, 13, new.city_id);

  select * into v_existing
  from public.activity_post_event_outcomes
  where activity_id = new.id
  for update;

  if not found then
    insert into public.activity_post_event_outcomes(
      activity_id, organizer_user_key, city_id, event_timezone, event_date, event_time,
      event_starts_at, event_ends_at, organizer_prompt_at, organizer_reminder_at,
      participant_fallback_at, event_resolution, updated_at
    ) values (
      new.id, new.organizer_key, new.city_id, v_timezone, new.event_date, new.event_time,
      v_event_starts_at, v_event_ends_at, v_prompt_at, v_reminder_at,
      v_participant_at,
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
          or feedback.participant_issue_step_completed_at is not null
          or feedback.participant_repeat_intent is not null
          or feedback.participant_survey_completed_at is not null
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
        participant_fallback_at = v_participant_at,
        event_resolution = case when new.series_occurrence_status = 'cancelled' then 'voided' else 'pending' end,
        updated_at = now()
    where activity_id = new.id;
  end if;

  if new.series_occurrence_status = 'cancelled' and v_event_starts_at > now() then
    update public.activity_post_event_outcomes
    set event_resolution = 'voided', updated_at = now()
    where activity_id = new.id and organizer_responded_at is null;

    update public.activity_attendance_feedback
    set eligibility_state = 'voided',
        organizer_draft_absent = false,
        resolution = 'voided',
        resolved_at = now(),
        organizer_rating = null,
        rating_tags = null,
        rating_first_submitted_at = null,
        rating_updated_at = null,
        participant_repeat_intent = null,
        participant_issue_step_completed_at = null,
        participant_peer_sample_ids = null,
        participant_peer_confirmed_ids = null,
        participant_peer_step_completed_at = null,
        participant_survey_completed_at = null,
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

create or replace function go_irl_private.postevent_sync_notifications(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_initial_key text;
  v_reminder_key text;
  v_participant record;
  v_participant_key text;
begin
  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;
  if not found then return; end if;

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
  else
    update public.event_notifications
    set status = 'cancelled', next_attempt_at = null, leased_at = null,
        last_error_code = 'postevent_organizer_responded', selected_route_id = null,
        routing_outcome = null, resolved_at = null, updated_at = now()
    where delivery_key in (v_initial_key, v_reminder_key)
      and status in ('scheduled','failed');
  end if;

  update public.event_notifications
  set status = 'cancelled', next_attempt_at = null, leased_at = null,
      last_error_code = 'chrem002b_organizer_reminder_removed', selected_route_id = null,
      routing_outcome = null, resolved_at = null, updated_at = now()
  where delivery_key = v_reminder_key and status in ('scheduled','failed');

  -- Supersede only unsent legacy participant-confirmation rows. Sent history is preserved.
  update public.event_notifications
  set status = 'cancelled', next_attempt_at = null, leased_at = null,
      last_error_code = 'chrem002b_participant_survey_v1_superseded', selected_route_id = null,
      routing_outcome = null, resolved_at = null, updated_at = now()
  where activity_id = p_activity_id
    and kind = 'post_event.participant_confirmation'
    and payload ->> 'postEventStage' = 'participant_confirmation'
    and status in ('scheduled','failed');

  for v_participant in
    select feedback.id,
           feedback.participant_user_key,
           feedback.eligibility_state,
           feedback.participant_survey_completed_at
    from public.activity_attendance_feedback feedback
    where feedback.activity_id = p_activity_id
  loop
    v_participant_key := 'postevent:' || p_activity_id::text || ':participant:' || v_participant.id::text || ':survey-v1';

    if v_participant.eligibility_state <> 'eligible'
       or v_participant.participant_survey_completed_at is not null then
      update public.event_notifications
      set status = 'cancelled', next_attempt_at = null, leased_at = null,
          last_error_code = case
            when v_participant.participant_survey_completed_at is not null then 'postevent_participant_survey_completed'
            else 'postevent_participant_ineligible'
          end,
          selected_route_id = null, routing_outcome = null, resolved_at = null, updated_at = now()
      where delivery_key = v_participant_key and status in ('scheduled','failed');
      continue;
    end if;

    insert into public.event_notifications (
      user_key, activity_id, kind, payload, status, next_attempt_at,
      provider, delivery_key, selected_route_id, routing_outcome, resolved_at
    ) values (
      v_participant.participant_user_key,
      p_activity_id,
      'post_event.participant_confirmation',
      jsonb_build_object(
        'eventId', p_activity_id,
        'feedbackId', v_participant.id,
        'postEventStage', 'participant_survey_v1',
        'deliveryMode', 'private_dm',
        'eventDate', v_outcome.event_date,
        'eventTime', v_outcome.event_time,
        'eventTimezone', v_outcome.event_timezone
      ),
      'scheduled', v_outcome.participant_fallback_at, null, v_participant_key, null, null, null
    )
    on conflict (delivery_key) do update
    set user_key = excluded.user_key,
        activity_id = excluded.activity_id,
        payload = excluded.payload,
        status = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.status else 'scheduled' end,
        next_attempt_at = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.next_attempt_at else excluded.next_attempt_at end,
        provider = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.provider else null end,
        selected_route_id = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.selected_route_id else null end,
        routing_outcome = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.routing_outcome else null end,
        resolved_at = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.resolved_at else null end,
        last_error_code = case when public.event_notifications.status in ('sent','sending') then public.event_notifications.last_error_code else null end,
        updated_at = now();
  end loop;
end;
$function$;

-- Reschedule unanswered, unsent participant survey notifications to canonical 13:00.
with recalculated as (
  select outcome.activity_id,
         go_irl_private.postevent_local_day_time(
           (outcome.event_ends_at at time zone outcome.event_timezone)::date,
           1, 13, outcome.city_id
         ) as participant_at
  from public.activity_post_event_outcomes outcome
  where outcome.event_resolution <> 'voided'
    and outcome.event_ends_at is not null
    and outcome.event_timezone is not null
)
update public.activity_post_event_outcomes outcome
set participant_fallback_at = recalculated.participant_at,
    updated_at = now()
from recalculated
where outcome.activity_id = recalculated.activity_id
  and recalculated.participant_at is not null
  and outcome.participant_fallback_at is distinct from recalculated.participant_at;

-- Extend the existing service-role Telegram bridge. Legacy participant_confirmation stays
-- available for already-sent callbacks; V1 actions return full participant survey state.
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
  v_parts text[];
  v_selected boolean;
  v_peer_id uuid;
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

  if p_action = 'participant_survey_attendance' then
    v_state := go_irl_private.postevent_submit_participant_survey_attendance_for_actor(v_actor_user_key, p_target_id, p_value);
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'participant_rating' then
    if p_value !~ '^[1-5]$' then raise exception 'invalid organizer rating' using errcode = '22023'; end if;
    v_state := go_irl_private.postevent_set_participant_rating_for_actor(v_actor_user_key, p_target_id, p_value::integer);
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'participant_issue_tag' then
    v_parts := string_to_array(p_value, ':');
    if cardinality(v_parts) <> 2 or v_parts[2] not in ('on','off') then
      raise exception 'invalid participant issue tag value' using errcode = '22023';
    end if;
    v_state := go_irl_private.postevent_set_participant_issue_tag_for_actor(
      v_actor_user_key, p_target_id, v_parts[1], v_parts[2] = 'on'
    );
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'participant_issue_done' then
    if p_value <> 'done' then raise exception 'invalid participant issue finalize value' using errcode = '22023'; end if;
    v_state := go_irl_private.postevent_complete_participant_issue_tags_for_actor(v_actor_user_key, p_target_id);
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'participant_peer_presence' then
    v_parts := string_to_array(p_value, ':');
    if cardinality(v_parts) <> 2 or v_parts[2] not in ('on','off') then
      raise exception 'invalid participant peer presence value' using errcode = '22023';
    end if;
    begin
      v_peer_id := v_parts[1]::uuid;
    exception when others then
      raise exception 'invalid participant peer candidate' using errcode = '22023';
    end;
    v_selected := v_parts[2] = 'on';
    v_state := go_irl_private.postevent_set_participant_peer_presence_for_actor(
      v_actor_user_key, p_target_id, v_peer_id, v_selected
    );
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'participant_peer_done' then
    if p_value <> 'done' then raise exception 'invalid participant peer finalize value' using errcode = '22023'; end if;
    v_state := go_irl_private.postevent_complete_participant_peer_presence_for_actor(v_actor_user_key, p_target_id);
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'participant_repeat_intent' then
    v_state := go_irl_private.postevent_set_participant_repeat_intent_for_actor(v_actor_user_key, p_target_id, p_value);
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'organizer_survey_outcome' then
    v_state := go_irl_private.postevent_record_survey_outcome_for_actor(v_actor_user_key, p_target_id, p_value);
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'organizer_experience' then
    v_state := go_irl_private.postevent_set_organizer_experience_for_actor(v_actor_user_key, p_target_id, p_value);
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'organizer_attendance_summary' then
    v_state := go_irl_private.postevent_set_organizer_attendance_summary_for_actor(v_actor_user_key, p_target_id, p_value);
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'organizer_absence' then
    if p_value not in ('absent','present') then raise exception 'invalid organizer absence value' using errcode = '22023'; end if;
    v_state := go_irl_private.postevent_set_organizer_absence_for_actor(v_actor_user_key, p_target_id, p_value = 'absent');
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'organizer_finalize' then
    if p_value <> 'done' then raise exception 'invalid organizer finalize value' using errcode = '22023'; end if;
    v_state := go_irl_private.postevent_complete_organizer_no_shows_for_actor(v_actor_user_key, p_target_id);
    return jsonb_build_object('action', p_action, 'languageCode', v_language_code, 'state', v_state);
  elsif p_action = 'organizer_outcome' then
    v_outcome := go_irl_private.postevent_record_outcome_for_actor(v_actor_user_key, p_target_id, p_value);
    return jsonb_build_object(
      'action', 'organizer_outcome', 'languageCode', v_language_code,
      'targetId', v_outcome.activity_id, 'claim', v_outcome.organizer_event_claim,
      'eventResolution', v_outcome.event_resolution,
      'rosterFinalized', v_outcome.organizer_roster_finalized_at is not null
    );
  elsif p_action = 'participant_confirmation' then
    v_feedback := go_irl_private.postevent_submit_confirmation_for_actor(v_actor_user_key, p_target_id, p_value);
    return jsonb_build_object(
      'action', 'participant_confirmation', 'languageCode', v_language_code,
      'targetId', v_feedback.id, 'activityId', v_feedback.activity_id,
      'claim', v_feedback.participant_claim, 'attendanceResolution', v_feedback.resolution,
      'ratingAvailable', v_feedback.resolution = 'attended'
    );
  end if;

  raise exception 'invalid post-event Telegram action' using errcode = '22023';
end;
$function$;

create or replace function public.go_irl_update_post_event_participant_telegram_message_id(
  p_telegram_user_id text,
  p_feedback_id uuid,
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
  v_feedback public.activity_attendance_feedback%rowtype;
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

  select * into v_feedback
  from public.activity_attendance_feedback
  where id = p_feedback_id;

  if v_actor_user_key is null or not found or v_feedback.participant_user_key <> v_actor_user_key then
    raise exception 'feedback participant required' using errcode = '42501';
  end if;

  update public.event_notifications notification
  set provider_message_id = p_new_message_id,
      updated_at = now()
  where notification.user_key = v_actor_user_key
    and notification.activity_id = v_feedback.activity_id
    and notification.kind = 'post_event.participant_confirmation'
    and notification.payload ->> 'feedbackId' = p_feedback_id::text
    and notification.payload ->> 'postEventStage' = 'participant_survey_v1'
    and notification.provider_message_id = p_previous_message_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$function$;

revoke all on function go_irl_private.postevent_participant_sample_ids(uuid) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_ensure_participant_sample_for_actor(text,uuid) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_participant_survey_state_for_actor(text,uuid) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_submit_participant_survey_attendance_for_actor(text,uuid,text) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_set_participant_rating_for_actor(text,uuid,integer) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_set_participant_issue_tag_for_actor(text,uuid,text,boolean) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_complete_participant_issue_tags_for_actor(text,uuid) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_set_participant_peer_presence_for_actor(text,uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_complete_participant_peer_presence_for_actor(text,uuid) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_set_participant_repeat_intent_for_actor(text,uuid,text) from public, anon, authenticated;

revoke all on function public.go_irl_get_activity_post_event_participant_survey_state(uuid) from public, anon;
grant execute on function public.go_irl_get_activity_post_event_participant_survey_state(uuid) to authenticated, service_role;
revoke all on function public.go_irl_update_post_event_participant_telegram_message_id(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.go_irl_update_post_event_participant_telegram_message_id(text,uuid,text,text) to service_role;
revoke all on function public.go_irl_post_event_telegram_action(text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.go_irl_post_event_telegram_action(text,text,uuid,text) to service_role;

commit;
