-- Activ020: align organizer rolling Telegram alert with the complete joined roster.
-- Prepared migration only; applying it requires separate production approval.
begin;

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
  v_participants jsonb;
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

  select count(*)::integer,
         coalesce(jsonb_agg(
           coalesce(nullif(btrim(member.display_name), ''), nullif(btrim(profile.display_name), ''), 'GO IRL')
           order by member.user_key
         ), '[]'::jsonb)
  into v_joined, v_participants
  from public.activity_members member
  left join public.user_profiles profile on profile.user_key = member.user_key
  where member.activity_id = new.activity_id
    and member.status = 'joined';

  v_key := 'activity:' || new.activity_id::text || ':organizer_join_alert';
  v_payload := public.go_irl_event_snapshot(v_activity)
    || jsonb_build_object(
      'deliveryMode', 'private_dm',
      'participantName', coalesce(nullif(btrim(v_name), ''), 'GO IRL'),
      'joinedCount', v_joined,
      'participantNames', v_participants,
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

commit;
