-- ChRem002C: one rolling private Telegram join alert per Activity for the organizer.
-- SOURCE CANDIDATE ONLY. Production apply, commit, push, PR, merge and deploy remain separate gates.

begin;

do $kind_constraint$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid)
  into v_definition
  from pg_constraint
  where conrelid = 'public.event_notifications'::regclass
    and conname = 'event_notifications_kind_check';

  if v_definition is null then
    raise exception 'chrem002c_event_notification_kind_constraint_missing';
  end if;

  if position('activity.organizer_join_alert' in v_definition) = 0 then
    if position('post_event.participant_confirmation' in v_definition) = 0 then
      raise exception 'chrem002c_event_notification_kind_constraint_shape_changed';
    end if;
    v_definition := replace(
      v_definition,
      '''post_event.participant_confirmation''',
      '''post_event.participant_confirmation'', ''activity.organizer_join_alert'''
    );
    alter table public.event_notifications drop constraint event_notifications_kind_check;
    execute 'alter table public.event_notifications add constraint event_notifications_kind_check ' || v_definition;
  end if;
end;
$kind_constraint$;

create or replace function public.go_irl_queue_organizer_join_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_activity public.activities%rowtype;
  v_name text;
  v_joined integer;
  v_payload jsonb;
  v_key text;
begin
  if new.status <> 'joined'
     or (tg_op = 'UPDATE' and old.status = 'joined') then
    return new;
  end if;

  select activity.* into v_activity
  from public.activities activity
  where activity.id = new.activity_id;

  if not found or new.user_key = v_activity.organizer_key then
    return new;
  end if;

  select profile.display_name into v_name
  from public.user_profiles profile
  where profile.user_key = new.user_key;

  select count(*)::integer into v_joined
  from public.activity_members member
  where member.activity_id = new.activity_id
    and member.status = 'joined'
    and member.user_key <> v_activity.organizer_key;

  v_key := 'activity:' || new.activity_id::text || ':organizer_join_alert';
  v_payload := public.go_irl_event_snapshot(v_activity)
    || jsonb_build_object(
      'deliveryMode', 'private_dm',
      'participantName', coalesce(nullif(btrim(v_name), ''), 'GO IRL'),
      'joinedCount', v_joined,
      'capacity', v_activity.capacity
    );

  insert into public.event_notifications (
    user_key, activity_id, kind, payload, status, next_attempt_at,
    provider, delivery_key, selected_route_id, routing_outcome, resolved_at
  ) values (
    v_activity.organizer_key, new.activity_id, 'activity.organizer_join_alert',
    v_payload, 'scheduled', now(), null, v_key, null, null, null
  )
  on conflict (delivery_key) do update
  set user_key = excluded.user_key,
      activity_id = excluded.activity_id,
      kind = excluded.kind,
      payload = excluded.payload
        || case
          when public.event_notifications.status = 'sending'
            then jsonb_build_object('rollingPending', true)
          when public.event_notifications.provider_message_id is not null
            then jsonb_build_object(
              'previousTelegramMessageId',
              public.event_notifications.provider_message_id
            )
          else '{}'::jsonb
        end,
      status = case
        when public.event_notifications.status = 'sending' then 'sending'
        else 'scheduled'
      end,
      next_attempt_at = case
        when public.event_notifications.status = 'sending'
          then public.event_notifications.next_attempt_at
        else now()
      end,
      leased_at = case
        when public.event_notifications.status = 'sending'
          then public.event_notifications.leased_at
        else null
      end,
      provider = case
        when public.event_notifications.status = 'sending'
          then public.event_notifications.provider
        else null
      end,
      selected_route_id = case
        when public.event_notifications.status = 'sending'
          then public.event_notifications.selected_route_id
        else null
      end,
      routing_outcome = case
        when public.event_notifications.status = 'sending'
          then public.event_notifications.routing_outcome
        else null
      end,
      resolved_at = case
        when public.event_notifications.status = 'sending'
          then public.event_notifications.resolved_at
        else null
      end,
      last_error_code = case
        when public.event_notifications.status = 'sending'
          then public.event_notifications.last_error_code
        else null
      end,
      updated_at = now();

  return new;
end;
$function$;

revoke execute on function public.go_irl_queue_organizer_join_alert()
from public, anon, authenticated;

drop trigger if exists activity_members_queue_organizer_join_alert on public.activity_members;
create trigger activity_members_queue_organizer_join_alert
after insert or update of status on public.activity_members
for each row execute function public.go_irl_queue_organizer_join_alert();

create or replace function public.go_irl_reschedule_pending_organizer_join_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.kind = 'activity.organizer_join_alert'
     and new.status = 'sent'
     and coalesce((new.payload ->> 'rollingPending')::boolean, false) then
    update public.event_notifications
    set status = 'scheduled',
        next_attempt_at = now(),
        leased_at = null,
        payload = (new.payload - 'rollingPending')
          || jsonb_build_object(
            'previousTelegramMessageId',
            coalesce(new.provider_message_id, new.payload ->> 'previousTelegramMessageId')
          ),
        updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$function$;

revoke execute on function public.go_irl_reschedule_pending_organizer_join_alert()
from public, anon, authenticated;

drop trigger if exists event_notifications_reschedule_pending_organizer_join_alert
on public.event_notifications;
create trigger event_notifications_reschedule_pending_organizer_join_alert
after update of status, provider_message_id on public.event_notifications
for each row
when (new.kind = 'activity.organizer_join_alert' and new.status = 'sent')
execute function public.go_irl_reschedule_pending_organizer_join_alert();

do $claim_contract$
declare
  v_definition text;
  v_guard text := $guard$activity.organizer_join_alert_private_telegram_unavailable$guard$;
  v_marker text := $marker$  -- POSTEVENT001 is a kind-level channel policy:$marker$;
  v_injection text := $injection$
  update public.event_notifications notification
  set status = 'cancelled',
      next_attempt_at = null,
      leased_at = null,
      provider = null,
      selected_route_id = null,
      routing_outcome = 'needs_attention',
      resolved_at = now(),
      last_error_code = 'activity.organizer_join_alert_private_telegram_unavailable',
      updated_at = now()
  where notification.kind = 'activity.organizer_join_alert'
    and notification.status in ('scheduled','failed','sending')
    and coalesce(notification.next_attempt_at, notification.created_at) <= now()
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

$injection$;
begin
  select pg_get_functiondef(
    'public.go_irl_claim_event_notifications(text[],integer,integer)'::regprocedure
  ) into v_definition;

  if position('activity.organizer_join_alert' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '''post_event.participant_confirmation''',
      '''post_event.participant_confirmation'', ''activity.organizer_join_alert'''
    );
  end if;

  if position(v_guard in v_definition) = 0 then
    if position(v_marker in v_definition) = 0 then
      raise exception 'chrem002c_notification_claim_shape_changed';
    end if;
    v_definition := replace(v_definition, v_marker, v_injection || v_marker);
  end if;

  execute v_definition;
end;
$claim_contract$;

notify pgrst, 'reload schema';
commit;
