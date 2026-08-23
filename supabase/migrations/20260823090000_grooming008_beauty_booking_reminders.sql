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

create or replace function public.go_irl_sync_beauty_booking_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.beauty_bookings%rowtype;
  v_profile public.beauty_professional_profiles%rowtype;
  v_due_at timestamptz;
  v_kind text;
  v_offset text;
  v_delivery_key text;
begin
  if new.event_type = 'notification_enqueued' then return new; end if;

  select booking.* into v_booking
  from public.beauty_bookings booking
  where booking.id = new.booking_id;
  if not found then return new; end if;

  update public.event_notifications notification
  set status = 'cancelled',
      next_attempt_at = null,
      leased_at = null,
      updated_at = now(),
      last_error_code = 'beauty_booking_reminder_stale'
  where notification.payload ->> 'bookingId' = v_booking.id::text
    and notification.kind in ('services.booking_reminder_24h', 'services.booking_reminder_3h')
    and notification.status in ('scheduled', 'failed')
    and (
      v_booking.status <> 'confirmed'
      or notification.payload ->> 'scheduledStartsAt' is distinct from v_booking.starts_at::text
    );

  if v_booking.status <> 'confirmed' or v_booking.starts_at <= now() then return new; end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.id = v_booking.profile_id;
  if not found or v_booking.client_user_key is null then return new; end if;

  foreach v_offset in array array['24h', '3h'] loop
    if v_offset = '24h' then
      v_due_at := v_booking.starts_at - interval '24 hours';
      v_kind := 'services.booking_reminder_24h';
    else
      v_due_at := v_booking.starts_at - interval '3 hours';
      v_kind := 'services.booking_reminder_3h';
    end if;

    if v_due_at <= now() then continue; end if;

    v_delivery_key := 'beauty:booking:' || v_booking.id::text || ':starts:'
      || extract(epoch from v_booking.starts_at)::bigint::text || ':reminder:' || v_offset;

    insert into public.event_notifications (
      user_key, activity_id, kind, payload, status, next_attempt_at, provider, delivery_key
    ) values (
      v_booking.client_user_key,
      null,
      v_kind,
      jsonb_build_object(
        'subjectType', 'beauty_booking',
        'bookingId', v_booking.id,
        'title', v_booking.service_name_snapshot,
        'date', to_char(v_booking.starts_at at time zone 'Europe/Prague', 'YYYY-MM-DD'),
        'time', to_char(v_booking.starts_at at time zone 'Europe/Prague', 'HH24:MI:SS'),
        'address', v_booking.public_location_snapshot,
        'counterpartName', v_profile.display_name,
        'bookingStatus', v_booking.status,
        'scheduledStartsAt', v_booking.starts_at::text,
        'reminderOffset', v_offset,
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

revoke execute on function public.go_irl_sync_beauty_booking_reminders()
from public, anon, authenticated;

drop trigger if exists go_irl_sync_beauty_booking_reminders on public.beauty_booking_events;
create trigger go_irl_sync_beauty_booking_reminders
after insert on public.beauty_booking_events
for each row execute function public.go_irl_sync_beauty_booking_reminders();

insert into public.event_notifications (
  user_key, activity_id, kind, payload, status, next_attempt_at, provider, delivery_key
)
select
  booking.client_user_key,
  null,
  reminder.kind,
  jsonb_build_object(
    'subjectType', 'beauty_booking',
    'bookingId', booking.id,
    'title', booking.service_name_snapshot,
    'date', to_char(booking.starts_at at time zone 'Europe/Prague', 'YYYY-MM-DD'),
    'time', to_char(booking.starts_at at time zone 'Europe/Prague', 'HH24:MI:SS'),
    'address', booking.public_location_snapshot,
    'counterpartName', profile.display_name,
    'bookingStatus', booking.status,
    'scheduledStartsAt', booking.starts_at::text,
    'reminderOffset', reminder.offset_key,
    'openPath', '/services'
  ),
  'scheduled',
  reminder.due_at,
  'telegram',
  'beauty:booking:' || booking.id::text || ':starts:'
    || extract(epoch from booking.starts_at)::bigint::text || ':reminder:' || reminder.offset_key
from public.beauty_bookings booking
join public.beauty_professional_profiles profile on profile.id = booking.profile_id
cross join lateral (
  values
    ('services.booking_reminder_24h'::text, '24h'::text, booking.starts_at - interval '24 hours'),
    ('services.booking_reminder_3h'::text, '3h'::text, booking.starts_at - interval '3 hours')
) reminder(kind, offset_key, due_at)
where booking.status = 'confirmed'
  and booking.client_user_key is not null
  and reminder.due_at > now()
on conflict (delivery_key) do nothing;

notify pgrst, 'reload schema';

commit;
