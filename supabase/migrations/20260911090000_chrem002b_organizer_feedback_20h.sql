-- ChRem002B organizer feedback aggregation at 20:00 next local day.
-- SOURCE CANDIDATE ONLY. Production apply, commit, push, PR, merge and deploy remain separate gates.
-- Baseline: GitHub main 83d413397397d5844292143880da5c59552f7ebb.
--
-- Reuses canonical foundations only:
-- * public.activity_post_event_outcomes;
-- * public.activity_attendance_feedback;
-- * public.event_notifications;
-- * existing post_event.organizer_confirmation Telegram routing.
--
-- No parallel feedback store, notification queue, identity store or chat system.

begin;

do $prerequisites$
begin
  if to_regclass('public.activity_post_event_outcomes') is null then
    raise exception 'chrem002b_feedback_missing_activity_post_event_outcomes';
  end if;
  if to_regclass('public.activity_attendance_feedback') is null then
    raise exception 'chrem002b_feedback_missing_activity_attendance_feedback';
  end if;
  if to_regclass('public.event_notifications') is null then
    raise exception 'chrem002b_feedback_missing_event_notifications';
  end if;
  if to_regprocedure('go_irl_private.postevent_local_day_time(date,integer,integer,text)') is null then
    raise exception 'chrem002b_feedback_missing_local_day_time';
  end if;
  if to_regprocedure('go_irl_private.postevent_sync_notifications(uuid)') is null then
    raise exception 'chrem002b_feedback_missing_notification_sync';
  end if;
  if to_regprocedure('public.go_irl_claim_event_notifications(text[],integer,integer)') is null then
    raise exception 'chrem002b_feedback_missing_notification_claim';
  end if;
end;
$prerequisites$;

-- Anonymous aggregate only. No participant identity or feedback-row identifier is returned.
create or replace function go_irl_private.postevent_organizer_feedback_snapshot(
  p_activity_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with completed as (
    select feedback.organizer_rating,
           coalesce(feedback.rating_tags, array[]::text[]) as rating_tags,
           feedback.participant_repeat_intent
    from public.activity_attendance_feedback feedback
    where feedback.activity_id = p_activity_id
      and feedback.eligibility_state = 'eligible'
      and feedback.participant_survey_completed_at is not null
  ),
  totals as (
    select count(*)::integer as response_count,
           count(organizer_rating)::integer as rating_count,
           round(avg(organizer_rating)::numeric, 2) as average_rating,
           count(*) filter (where participant_repeat_intent = 'yes')::integer as repeat_yes_count,
           count(*) filter (where participant_repeat_intent = 'no')::integer as repeat_no_count
    from completed
  ),
  tags as (
    select tag,
           count(*)::integer as tag_count
    from completed,
         lateral unnest(rating_tags) as tag
    group by tag
  )
  select jsonb_build_object(
    'feedbackResponseCount', totals.response_count,
    'feedbackRatingCount', totals.rating_count,
    'feedbackAverageRating', totals.average_rating,
    'feedbackTagCounts', coalesce(
      (select jsonb_object_agg(tags.tag, tags.tag_count order by tags.tag) from tags),
      '{}'::jsonb
    ),
    'feedbackRepeatYesCount', totals.repeat_yes_count,
    'feedbackRepeatNoCount', totals.repeat_no_count
  )
  from totals;
$function$;

-- Extend the canonical post-event notification sync in-place. The delivery key is unique per
-- Activity, so repeated syncs remain idempotent. A previously captured feedback snapshot is
-- preserved across retries/resyncs.
do $sync_injection$
declare
  v_definition text;
  v_marker text := $marker$
  update public.event_notifications
  set status = 'cancelled', next_attempt_at = null, leased_at = null,
      last_error_code = 'chrem002b_organizer_reminder_removed', selected_route_id = null,
      routing_outcome = null, resolved_at = null, updated_at = now()
  where delivery_key = v_reminder_key and status in ('scheduled','failed');
$marker$;
  v_injection text := $injection$

  if v_outcome.event_ends_at is not null
     and v_outcome.event_timezone is not null
     and v_outcome.city_id is not null then
    insert into public.event_notifications (
      user_key, activity_id, kind, payload, status, next_attempt_at,
      provider, delivery_key, selected_route_id, routing_outcome, resolved_at
    ) values (
      v_outcome.organizer_user_key,
      p_activity_id,
      'post_event.organizer_confirmation',
      jsonb_build_object(
        'eventId', p_activity_id,
        'postEventStage', 'organizer_feedback',
        'deliveryMode', 'private_dm',
        'eventDate', v_outcome.event_date,
        'eventTime', v_outcome.event_time,
        'eventTimezone', v_outcome.event_timezone
      ),
      'scheduled',
      go_irl_private.postevent_local_day_time(
        (v_outcome.event_ends_at at time zone v_outcome.event_timezone)::date,
        1,
        20,
        v_outcome.city_id
      ),
      null,
      'postevent:' || p_activity_id::text || ':organizer:feedback',
      null,
      null,
      null
    )
    on conflict (delivery_key) do update
    set user_key = excluded.user_key,
        activity_id = excluded.activity_id,
        payload = case
          when public.event_notifications.payload ? 'feedbackSnapshotAt'
            then public.event_notifications.payload
          else excluded.payload
        end,
        status = case
          when public.event_notifications.status in ('sent','sending')
            then public.event_notifications.status
          else 'scheduled'
        end,
        next_attempt_at = case
          when public.event_notifications.status in ('sent','sending')
            then public.event_notifications.next_attempt_at
          else excluded.next_attempt_at
        end,
        provider = case
          when public.event_notifications.status in ('sent','sending')
            then public.event_notifications.provider
          else null
        end,
        selected_route_id = case
          when public.event_notifications.status in ('sent','sending')
            then public.event_notifications.selected_route_id
          else null
        end,
        routing_outcome = case
          when public.event_notifications.status in ('sent','sending')
            then public.event_notifications.routing_outcome
          else null
        end,
        resolved_at = case
          when public.event_notifications.status in ('sent','sending')
            then public.event_notifications.resolved_at
          else null
        end,
        last_error_code = case
          when public.event_notifications.status in ('sent','sending')
            then public.event_notifications.last_error_code
          else null
        end,
        updated_at = now();
  end if;
$injection$;
begin
  select pg_get_functiondef('go_irl_private.postevent_sync_notifications(uuid)'::regprocedure)
  into v_definition;

  if position('''organizer_feedback''' in v_definition) = 0 then
    if position(v_marker in v_definition) = 0 then
      raise exception 'chrem002b_feedback_notification_sync_shape_changed';
    end if;
    v_definition := replace(v_definition, v_marker, v_marker || v_injection);
    execute v_definition;
  end if;
end;
$sync_injection$;

-- At claim time, fail closed to Telegram-private delivery and capture one immutable aggregate
-- snapshot. Retries reuse the same payload rather than incorporating later answers.
do $claim_injection$
declare
  v_definition text;
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
      last_error_code = 'postevent_organizer_feedback_private_delivery_unavailable',
      updated_at = now()
  where notification.kind = 'post_event.organizer_confirmation'
    and notification.payload ->> 'postEventStage' = 'organizer_feedback'
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
    );

  update public.event_notifications notification
  set payload = notification.payload
      || go_irl_private.postevent_organizer_feedback_snapshot(notification.activity_id)
      || jsonb_build_object('feedbackSnapshotAt', now()),
      updated_at = now()
  where notification.kind = 'post_event.organizer_confirmation'
    and notification.payload ->> 'postEventStage' = 'organizer_feedback'
    and not (notification.payload ? 'feedbackSnapshotAt')
    and notification.activity_id is not null
    and (
      (notification.status = 'scheduled'
        and coalesce(notification.next_attempt_at, notification.created_at) <= now())
      or (notification.status = 'failed'
        and notification.next_attempt_at is not null
        and notification.next_attempt_at <= now())
      or (notification.status = 'sending'
        and notification.leased_at <= now() - make_interval(secs => p_lease_seconds))
    );
$injection$;
begin
  select pg_get_functiondef('public.go_irl_claim_event_notifications(text[],integer,integer)'::regprocedure)
  into v_definition;

  if position('postevent_organizer_feedback_private_delivery_unavailable' in v_definition) = 0 then
    if position(v_marker in v_definition) = 0 then
      raise exception 'chrem002b_feedback_notification_claim_shape_changed';
    end if;
    v_definition := replace(v_definition, v_marker, v_marker || v_injection);
    execute v_definition;
  end if;
end;
$claim_injection$;

-- Backfill one 20:00 organizer-feedback notification for existing non-voided outcomes.
-- Sent/sending history is preserved by the canonical sync upsert rules above.
do $backfill$
declare
  v_activity_id uuid;
begin
  for v_activity_id in
    select outcome.activity_id
    from public.activity_post_event_outcomes outcome
    where outcome.event_resolution <> 'voided'
      and outcome.event_ends_at is not null
      and outcome.event_timezone is not null
      and outcome.city_id is not null
      and go_irl_private.postevent_local_day_time(
        (outcome.event_ends_at at time zone outcome.event_timezone)::date,
        1,
        20,
        outcome.city_id
      ) >= now()
  loop
    perform go_irl_private.postevent_sync_notifications(v_activity_id);
  end loop;
end;
$backfill$;

commit;
