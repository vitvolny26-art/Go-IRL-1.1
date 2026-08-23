-- GROOMING008: schedule Beauty booking reminders on the canonical notification outbox.
-- Repository migration only. Production apply requires separate explicit approval.
-- Reuses public.event_notifications; no parallel reminder queue/worker is introduced.

begin;

alter table public.event_notifications
  drop constraint if exists event_notifications_kind_check;

alter table public.event_notifications
  add constraint event_notifications_kind_check
  check (kind in (
    'join_confirmed',
    'join_pending',
    'join_waitlisted',
    'request_approved',
    'request_rejected',
    'event_changed',
    'event_cancelled',
    'services.booking_requested',
    'services.booking_confirmed',
    'services.booking_declined',
    'services.booking_cancelled',
    'services.booking_rescheduled',
    'services.waitlist_slot_available',
    'services.booking_reminder_24h',
    'services.booking_reminder_3h'
  ));

create or replace function public.go_irl_queue_beauty_booking_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.beauty_bookings%rowtype;
  v_profile public.beauty_professional_profiles%rowtype;
  v_due_at timestamptz;
  v_delivery_key text;
  v_hours integer;
  v_kind text;
begin
  select booking.* into v_booking
  from public.beauty_bookings booking
  where booking.id = new.booking_id;
  if not found then return new; end if;

  -- Suppress reminders that have not yet been leased when the canonical booking state changes.
  if v_booking.status <> 'confirmed'
    or new.event_type in ('booking_cancelled', 'booking_expired')
    or (
      new.event_type = 'status_changed'
      and new.from_status = 'confirmed'
      and new.to_status = 'confirmed'
      and new.payload ->> 'action' = 'rescheduled'
    ) then
    update public.event_notifications notification
    set
      status = 'cancelled',
      next_attempt_at = null,
      leased_at = null,
      last_error_code = 'booking_state_changed',
      updated_at = now()
    where notification.kind in ('services.booking_reminder_24h', 'services.booking_reminder_3h')
      and notification.payload ->> 'bookingId' = v_booking.id::text
      and notification.status in ('scheduled', 'failed');
  end if;

  if v_booking.status <> 'confirmed' then
    return new;
  end if;

  if not (
    (new.event_type = 'booking_created' and new.to_status = 'confirmed')
    or (
      new.event_type = 'status_changed'
      and new.from_status = 'pending'
      and new.to_status = 'confirmed'
    )
    or (
      new.event_type = 'status_changed'
      and new.from_status = 'confirmed'
      and new.to_status = 'confirmed'
      and new.payload ->> 'action' = 'rescheduled'
    )
  ) then
    return new;
  end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.id = v_booking.profile_id;
  if not found or v_booking.client_user_key is null then return new; end if;

  foreach v_hours in array array[24, 3]
  loop
    v_due_at := v_booking.starts_at - make_interval(hours => v_hours);
    if v_due_at <= now() then
      continue;
    end if;

    v_kind := case v_hours
      when 24 then 'services.booking_reminder_24h'
      else 'services.booking_reminder_3h'
    end;
    v_delivery_key := 'beauty-reminder:' || v_booking.id::text || ':'
      || extract(epoch from v_booking.starts_at)::bigint::text || ':' || v_hours::text;

    insert into public.event_notifications (
      user_key,
      activity_id,
      kind,
      payload,
      status,
      next_attempt_at,
      provider,
      delivery_key
    ) values (
      v_booking.client_user_key,
      null,
      v_kind,
      jsonb_build_object(
        'subjectType', 'beauty_booking',
        'bookingId', v_booking.id,
        'profileId', v_booking.profile_id,
        'serviceId', v_booking.service_id,
        'title', v_booking.service_name_snapshot,
        'date', to_char(v_booking.starts_at at time zone 'Europe/Prague', 'YYYY-MM-DD'),
        'time', to_char(v_booking.starts_at at time zone 'Europe/Prague', 'HH24:MI:SS'),
        'address', v_booking.public_location_snapshot,
        'counterpartName', v_profile.display_name,
        'bookingStatus', v_booking.status,
        'scheduledStartsAt', v_booking.starts_at,
        'reminderOffsetHours', v_hours,
        'sourceEventId', new.id,
        'openPath', '/services'
      ),
      'scheduled',
      v_due_at,
      'telegram',
      v_delivery_key
    ) on conflict (delivery_key) do nothing;
  end loop;

  return new;
end;
$$;

revoke execute on function public.go_irl_queue_beauty_booking_reminders()
from public, anon, authenticated;

drop trigger if exists beauty_booking_events_queue_reminders
on public.beauty_booking_events;
create trigger beauty_booking_events_queue_reminders
after insert on public.beauty_booking_events
for each row execute function public.go_irl_queue_beauty_booking_reminders();

notify pgrst, 'reload schema';

commit;
