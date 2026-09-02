-- POSTEVENT001 D1: deterministic post-event notification scheduling.
-- Repository preparation only. Production apply requires separate explicit approval.
-- IMPORTANT: deploy and verify D2 notification-contract support before applying this SQL.

begin;

alter table public.event_notifications
  drop constraint if exists event_notifications_kind_check;

alter table public.event_notifications
  add constraint event_notifications_kind_check check (kind in (
    'join_confirmed','join_pending','join_waitlisted','request_approved','request_rejected','event_changed','event_cancelled',
    'social.favorited','social.favorite_organizer_event_created',
    'services.booking_requested','services.booking_confirmed','services.booking_declined','services.booking_cancelled','services.booking_rescheduled',
    'services.waitlist_slot_available','services.booking_reminder_24h','services.booking_reminder_3h','services.booking_visit_confirmation_24h',
    'post_event.organizer_confirmation','post_event.participant_confirmation'
  ));

create or replace function go_irl_private.postevent_sync_notifications(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_initial_key text;
  v_reminder_key text;
  v_participant record;
  v_participant_key text;
  v_participant_due_at timestamptz;
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
    set status = 'cancelled',
        next_attempt_at = null,
        leased_at = null,
        last_error_code = 'postevent_voided',
        selected_route_id = null,
        routing_outcome = null,
        resolved_at = null,
        updated_at = now()
    where activity_id = p_activity_id
      and kind in ('post_event.organizer_confirmation','post_event.participant_confirmation')
      and status in ('scheduled','failed');
    return;
  end if;

  -- Only schedule bounded current/future post-event windows. No historical prompting.
  if v_outcome.participant_fallback_at <= now()
     and v_outcome.organizer_responded_at is null then
    return;
  end if;

  if v_outcome.organizer_responded_at is null then
    insert into public.event_notifications (
      user_key, activity_id, kind, payload, status, next_attempt_at,
      provider, delivery_key, selected_route_id, routing_outcome, resolved_at
    ) values (
      v_outcome.organizer_user_key,
      p_activity_id,
      'post_event.organizer_confirmation',
      jsonb_build_object(
        'eventId', p_activity_id,
        'postEventStage', 'organizer_initial',
        'eventDate', v_outcome.event_date,
        'eventTime', v_outcome.event_time,
        'eventTimezone', v_outcome.event_timezone
      ),
      'scheduled',
      v_outcome.organizer_prompt_at,
      null,
      v_initial_key,
      null,
      null,
      null
    )
    on conflict (delivery_key) do update
    set user_key = excluded.user_key,
        activity_id = excluded.activity_id,
        payload = excluded.payload,
        status = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.status
          else 'scheduled'
        end,
        next_attempt_at = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.next_attempt_at
          else excluded.next_attempt_at
        end,
        provider = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.provider
          else null
        end,
        selected_route_id = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.selected_route_id
          else null
        end,
        routing_outcome = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.routing_outcome
          else null
        end,
        resolved_at = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.resolved_at
          else null
        end,
        last_error_code = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.last_error_code
          else null
        end,
        updated_at = now();

    insert into public.event_notifications (
      user_key, activity_id, kind, payload, status, next_attempt_at,
      provider, delivery_key, selected_route_id, routing_outcome, resolved_at
    ) values (
      v_outcome.organizer_user_key,
      p_activity_id,
      'post_event.organizer_confirmation',
      jsonb_build_object(
        'eventId', p_activity_id,
        'postEventStage', 'organizer_reminder1',
        'eventDate', v_outcome.event_date,
        'eventTime', v_outcome.event_time,
        'eventTimezone', v_outcome.event_timezone
      ),
      'scheduled',
      v_outcome.organizer_reminder_at,
      null,
      v_reminder_key,
      null,
      null,
      null
    )
    on conflict (delivery_key) do update
    set user_key = excluded.user_key,
        activity_id = excluded.activity_id,
        payload = excluded.payload,
        status = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.status
          else 'scheduled'
        end,
        next_attempt_at = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.next_attempt_at
          else excluded.next_attempt_at
        end,
        provider = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.provider
          else null
        end,
        selected_route_id = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.selected_route_id
          else null
        end,
        routing_outcome = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.routing_outcome
          else null
        end,
        resolved_at = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.resolved_at
          else null
        end,
        last_error_code = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.last_error_code
          else null
        end,
        updated_at = now();
  else
    update public.event_notifications
    set status = 'cancelled',
        next_attempt_at = null,
        leased_at = null,
        last_error_code = 'postevent_organizer_responded',
        selected_route_id = null,
        routing_outcome = null,
        resolved_at = null,
        updated_at = now()
    where delivery_key in (v_initial_key, v_reminder_key)
      and status in ('scheduled','failed');
  end if;

  v_participant_open :=
    v_outcome.organizer_event_claim is not null
    and (
      v_outcome.organizer_event_claim <> 'happened'
      or v_outcome.organizer_roster_finalized_at is not null
    );

  for v_participant in
    select feedback.id,
           feedback.participant_user_key,
           feedback.eligibility_state,
           feedback.participant_claim
    from public.activity_attendance_feedback feedback
    where feedback.activity_id = p_activity_id
  loop
    v_participant_key := 'postevent:' || p_activity_id::text || ':participant:' || v_participant.id::text || ':confirm';

    if v_participant.eligibility_state <> 'eligible'
       or v_participant.participant_claim is not null then
      update public.event_notifications
      set status = 'cancelled',
          next_attempt_at = null,
          leased_at = null,
          last_error_code = case
            when v_participant.participant_claim is not null then 'postevent_participant_responded'
            else 'postevent_participant_ineligible'
          end,
          selected_route_id = null,
          routing_outcome = null,
          resolved_at = null,
          updated_at = now()
      where delivery_key = v_participant_key
        and status in ('scheduled','failed');
      continue;
    end if;

    v_participant_due_at := case
      when v_participant_open then now()
      else v_outcome.participant_fallback_at
    end;

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
        'postEventStage', 'participant_confirmation',
        'eventDate', v_outcome.event_date,
        'eventTime', v_outcome.event_time,
        'eventTimezone', v_outcome.event_timezone
      ),
      'scheduled',
      v_participant_due_at,
      null,
      v_participant_key,
      null,
      null,
      null
    )
    on conflict (delivery_key) do update
    set user_key = excluded.user_key,
        activity_id = excluded.activity_id,
        payload = excluded.payload,
        status = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.status
          else 'scheduled'
        end,
        next_attempt_at = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.next_attempt_at
          when v_participant_open then least(coalesce(public.event_notifications.next_attempt_at, excluded.next_attempt_at), excluded.next_attempt_at)
          else excluded.next_attempt_at
        end,
        provider = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.provider
          else null
        end,
        selected_route_id = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.selected_route_id
          else null
        end,
        routing_outcome = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.routing_outcome
          else null
        end,
        resolved_at = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.resolved_at
          else null
        end,
        last_error_code = case
          when public.event_notifications.status in ('sent','sending') then public.event_notifications.last_error_code
          else null
        end,
        updated_at = now();
  end loop;
end;
$$;

revoke all on function go_irl_private.postevent_sync_notifications(uuid)
from public, anon, authenticated;

create or replace function go_irl_private.postevent_sync_outcome_notifications_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform go_irl_private.postevent_sync_notifications(new.activity_id);
  return new;
end;
$$;

create or replace function go_irl_private.postevent_sync_feedback_notifications_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform go_irl_private.postevent_sync_notifications(coalesce(new.activity_id, old.activity_id));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function go_irl_private.postevent_sync_outcome_notifications_trigger()
from public, anon, authenticated;
revoke all on function go_irl_private.postevent_sync_feedback_notifications_trigger()
from public, anon, authenticated;

drop trigger if exists postevent001_sync_outcome_notifications on public.activity_post_event_outcomes;
create trigger postevent001_sync_outcome_notifications
after insert or update
on public.activity_post_event_outcomes
for each row
execute function go_irl_private.postevent_sync_outcome_notifications_trigger();

drop trigger if exists postevent001_sync_feedback_notifications on public.activity_attendance_feedback;
create trigger postevent001_sync_feedback_notifications
after insert or update or delete
on public.activity_attendance_feedback
for each row
execute function go_irl_private.postevent_sync_feedback_notifications_trigger();

-- Forward-only scheduling for outcomes whose participant fallback window has not elapsed.
select go_irl_private.postevent_sync_notifications(outcome.activity_id)
from public.activity_post_event_outcomes outcome
where outcome.event_resolution <> 'voided'
  and outcome.participant_fallback_at > now();

notify pgrst, 'reload schema';

commit;
