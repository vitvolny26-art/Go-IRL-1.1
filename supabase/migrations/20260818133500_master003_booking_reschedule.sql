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
    'services.booking_rescheduled'
  ));

create or replace function public.go_irl_reschedule_beauty_booking(
  p_booking_id uuid,
  p_expected_updated_at timestamptz,
  p_starts_at timestamptz
)
returns table (
  result text,
  booking_id uuid,
  booking_status text,
  starts_at timestamptz,
  service_ends_at timestamptz,
  reserved_until timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_booking public.beauty_bookings%rowtype;
  v_old_starts_at timestamptz;
  v_service_ends_at timestamptz;
  v_reserved_until timestamptz;
  v_local_start timestamp without time zone;
  v_local_reserved timestamp without time zone;
  v_allowed boolean;
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  select * into v_booking
  from public.beauty_bookings booking
  where booking.id = p_booking_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  if not public.go_irl_owns_beauty_profile(v_booking.profile_id) then
    raise exception 'current professional profile ownership required' using errcode = '42501';
  end if;

  if p_expected_updated_at is distinct from v_booking.updated_at then
    return query select 'stale'::text, v_booking.id, v_booking.status,
      v_booking.starts_at, v_booking.service_ends_at, v_booking.reserved_until, v_booking.updated_at;
    return;
  end if;

  if v_booking.status <> 'confirmed' then
    return query select 'invalid_transition'::text, v_booking.id, v_booking.status,
      v_booking.starts_at, v_booking.service_ends_at, v_booking.reserved_until, v_booking.updated_at;
    return;
  end if;

  if p_starts_at is null or p_starts_at <= now() then
    return query select 'slot_unavailable'::text, v_booking.id, v_booking.status,
      v_booking.starts_at, v_booking.service_ends_at, v_booking.reserved_until, v_booking.updated_at;
    return;
  end if;

  v_old_starts_at := v_booking.starts_at;
  v_service_ends_at := p_starts_at + make_interval(mins => v_booking.duration_minutes_snapshot);
  v_reserved_until := v_service_ends_at + make_interval(mins => v_booking.buffer_minutes_snapshot);
  v_local_start := p_starts_at at time zone 'Europe/Prague';
  v_local_reserved := v_reserved_until at time zone 'Europe/Prague';

  select exists (
    select 1
    from public.beauty_availability_rules rule
    where rule.profile_id = v_booking.profile_id
      and rule.active = true
      and rule.timezone = 'Europe/Prague'
      and rule.weekday = extract(isodow from v_local_start)::smallint
      and v_local_start::date = v_local_reserved::date
      and v_local_start::time >= rule.start_time
      and v_local_reserved::time <= rule.end_time
      and mod(
        extract(epoch from (v_local_start::time - rule.start_time))::bigint,
        rule.slot_interval_minutes::bigint * 60
      ) = 0
  ) into v_allowed;

  if not v_allowed then
    return query select 'slot_unavailable'::text, v_booking.id, v_booking.status,
      v_booking.starts_at, v_booking.service_ends_at, v_booking.reserved_until, v_booking.updated_at;
    return;
  end if;

  if exists (
    select 1
    from public.beauty_time_blocks time_block
    where time_block.profile_id = v_booking.profile_id
      and time_block.blocked_range && tstzrange(p_starts_at, v_reserved_until, '[)')
  ) then
    return query select 'slot_blocked'::text, v_booking.id, v_booking.status,
      v_booking.starts_at, v_booking.service_ends_at, v_booking.reserved_until, v_booking.updated_at;
    return;
  end if;

  begin
    update public.beauty_bookings booking
    set starts_at = p_starts_at,
        service_ends_at = v_service_ends_at,
        reserved_until = v_reserved_until
    where booking.id = v_booking.id
    returning * into v_booking;
  exception
    when exclusion_violation then
      return query select 'slot_taken'::text, v_booking.id, v_booking.status,
        v_old_starts_at,
        v_old_starts_at + make_interval(mins => v_booking.duration_minutes_snapshot),
        v_old_starts_at + make_interval(mins => v_booking.duration_minutes_snapshot + v_booking.buffer_minutes_snapshot),
        v_booking.updated_at;
      return;
  end;

  insert into public.beauty_booking_events (
    booking_id, event_type, actor_user_key, from_status, to_status, payload, deduplication_key
  ) values (
    v_booking.id,
    'status_changed',
    v_actor,
    'confirmed',
    'confirmed',
    jsonb_build_object(
      'source', 'professional_rpc',
      'action', 'rescheduled',
      'oldStartsAt', v_old_starts_at,
      'newStartsAt', v_booking.starts_at
    ),
    'beauty-booking:' || v_booking.id::text || ':rescheduled:' || extract(epoch from p_expected_updated_at)::bigint::text
  );

  return query select 'changed'::text, v_booking.id, v_booking.status,
    v_booking.starts_at, v_booking.service_ends_at, v_booking.reserved_until, v_booking.updated_at;
end;
$$;

revoke all on function public.go_irl_reschedule_beauty_booking(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.go_irl_reschedule_beauty_booking(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.go_irl_reschedule_beauty_booking(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.go_irl_queue_beauty_booking_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.beauty_bookings%rowtype;
  v_profile public.beauty_professional_profiles%rowtype;
  v_kind text;
  v_recipient_user_key text;
  v_counterpart_name text;
  v_delivery_key text;
begin
  if new.event_type = 'notification_enqueued' then return new; end if;

  select booking.* into v_booking
  from public.beauty_bookings booking
  where booking.id = new.booking_id;
  if not found then return new; end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.id = v_booking.profile_id;
  if not found then return new; end if;

  if new.event_type = 'booking_created' and new.to_status = 'confirmed' then
    v_kind := 'services.booking_confirmed';
    v_recipient_user_key := v_booking.client_user_key;
    v_counterpart_name := v_profile.display_name;
  elsif new.event_type = 'booking_created' then
    v_kind := 'services.booking_requested';
    v_recipient_user_key := v_profile.owner_user_key;
    v_counterpart_name := v_booking.client_name_snapshot;
  elsif new.event_type = 'status_changed'
    and new.from_status = 'confirmed'
    and new.to_status = 'confirmed'
    and new.payload ->> 'action' = 'rescheduled' then
    v_kind := 'services.booking_rescheduled';
    v_recipient_user_key := v_booking.client_user_key;
    v_counterpart_name := v_profile.display_name;
  elsif new.event_type = 'status_changed'
    and new.from_status = 'pending'
    and new.to_status = 'confirmed' then
    v_kind := 'services.booking_confirmed';
    v_recipient_user_key := v_booking.client_user_key;
    v_counterpart_name := v_profile.display_name;
  elsif new.event_type = 'status_changed'
    and new.from_status = 'pending'
    and new.to_status = 'declined' then
    v_kind := 'services.booking_declined';
    v_recipient_user_key := v_booking.client_user_key;
    v_counterpart_name := v_profile.display_name;
  elsif new.event_type = 'booking_cancelled' then
    v_kind := 'services.booking_cancelled';
    if new.actor_user_key = v_booking.client_user_key then
      v_recipient_user_key := v_profile.owner_user_key;
      v_counterpart_name := v_booking.client_name_snapshot;
    else
      v_recipient_user_key := v_booking.client_user_key;
      v_counterpart_name := v_profile.display_name;
    end if;
  else
    return new;
  end if;

  if v_recipient_user_key is null then return new; end if;
  v_delivery_key := 'beauty:' || new.id::text || ':' || v_recipient_user_key || ':' || v_kind;

  insert into public.event_notifications (
    user_key, activity_id, kind, payload, provider, delivery_key
  ) values (
    v_recipient_user_key,
    null,
    v_kind,
    jsonb_build_object(
      'subjectType', 'beauty_booking',
      'bookingId', v_booking.id,
      'title', v_booking.service_name_snapshot,
      'date', to_char(v_booking.starts_at at time zone 'Europe/Prague', 'YYYY-MM-DD'),
      'time', to_char(v_booking.starts_at at time zone 'Europe/Prague', 'HH24:MI:SS'),
      'address', v_booking.public_location_snapshot,
      'counterpartName', v_counterpart_name,
      'bookingStatus', coalesce(new.to_status, v_booking.status),
      'sourceEventId', new.id,
      'openPath', '/services'
    ),
    'telegram',
    v_delivery_key
  ) on conflict (delivery_key) do nothing;

  return new;
end;
$$;

revoke execute on function public.go_irl_queue_beauty_booking_notification()
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
