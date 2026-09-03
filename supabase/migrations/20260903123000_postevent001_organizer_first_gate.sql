begin;

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

    insert into public.event_notifications (
      user_key, activity_id, kind, payload, status, next_attempt_at,
      provider, delivery_key, selected_route_id, routing_outcome, resolved_at
    ) values (
      v_outcome.organizer_user_key, p_activity_id, 'post_event.organizer_confirmation',
      jsonb_build_object('eventId', p_activity_id, 'postEventStage', 'organizer_reminder1',
        'eventDate', v_outcome.event_date, 'eventTime', v_outcome.event_time,
        'eventTimezone', v_outcome.event_timezone),
      'scheduled', v_outcome.organizer_reminder_at, null, v_reminder_key, null, null, null
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

create or replace function public.go_irl_submit_activity_attendance_confirmation(p_feedback_id uuid, p_claim text)
returns public.activity_attendance_feedback
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_feedback public.activity_attendance_feedback%rowtype;
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_resolution text;
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;
  if p_claim not in ('attended','absent','event_did_not_happen') then
    raise exception 'invalid participant attendance claim' using errcode = '22023';
  end if;

  select * into v_feedback from public.activity_attendance_feedback where id = p_feedback_id for update;
  if not found or v_feedback.participant_user_key <> v_actor then
    raise exception 'feedback participant required' using errcode = '42501';
  end if;
  if v_feedback.eligibility_state <> 'eligible' then
    raise exception 'participant is not attendance eligible' using errcode = '22023';
  end if;

  select * into v_outcome from public.activity_post_event_outcomes where activity_id = v_feedback.activity_id for update;
  if not found or v_outcome.event_resolution = 'voided' then
    raise exception 'post-event outcome unavailable' using errcode = '22023';
  end if;
  if v_outcome.organizer_event_claim is null
     or (v_outcome.organizer_event_claim = 'happened' and v_outcome.organizer_roster_finalized_at is null) then
    raise exception 'participant confirmation not open yet' using errcode = '22023';
  end if;

  v_resolution := go_irl_private.postevent_attendance_resolution(v_feedback.organizer_claim, p_claim, v_feedback.eligibility_state);

  update public.activity_attendance_feedback
  set participant_claim = p_claim, participant_claimed_at = now(), resolution = v_resolution,
      resolved_at = case when v_resolution = 'pending' then null else now() end,
      organizer_rating = case when v_resolution = 'attended' then organizer_rating else null end,
      rating_tags = case when v_resolution = 'attended' then rating_tags else null end,
      rating_first_submitted_at = case when v_resolution = 'attended' then rating_first_submitted_at else null end,
      rating_updated_at = case when v_resolution = 'attended' then rating_updated_at else null end,
      updated_at = now()
  where id = p_feedback_id
  returning * into v_feedback;

  perform go_irl_private.postevent_recompute_event_resolution(v_feedback.activity_id);
  perform go_irl_private.postevent_write_audit(v_actor, 'activity_post_event.participant_confirmation', 'activity_attendance_feedback', p_feedback_id::text, jsonb_build_object('claim', p_claim));
  return v_feedback;
end;
$function$;

revoke all on function go_irl_private.postevent_sync_notifications(uuid) from public, anon, authenticated;
grant execute on function public.go_irl_submit_activity_attendance_confirmation(uuid, text) to authenticated, service_role;
revoke execute on function public.go_irl_submit_activity_attendance_confirmation(uuid, text) from public, anon;

update public.event_notifications n
set status = 'cancelled', next_attempt_at = null, leased_at = null,
    last_error_code = 'postevent_waiting_for_organizer', selected_route_id = null,
    routing_outcome = null, resolved_at = null, updated_at = now()
from public.activity_post_event_outcomes o
where n.activity_id = o.activity_id
  and n.kind = 'post_event.participant_confirmation'
  and n.status in ('scheduled','failed')
  and (o.organizer_event_claim is null
       or (o.organizer_event_claim = 'happened' and o.organizer_roster_finalized_at is null));

commit;
