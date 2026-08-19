-- MASTER005: bounded Beauty booking exact-slot waitlist foundation.
-- This migration does not auto-promote, reserve, or guarantee FIFO priority.
-- Production apply requires separate explicit approval.
-- RLS is enabled as defense-in-depth; direct client table privileges remain revoked.
-- Do not apply to production until the TypeScript notification registry/worker supports services.waitlist_slot_available.

begin;

create table if not exists public.beauty_booking_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.beauty_professional_profiles(id) on delete cascade,
  service_id uuid not null,
  client_user_key text not null references public.app_users(user_key) on delete cascade,
  slot_start timestamptz not null,
  duration_minutes_snapshot integer not null,
  buffer_minutes_snapshot integer not null default 0,
  status text not null default 'active',
  idempotency_key text not null,
  notification_count integer not null default 0,
  last_notified_at timestamptz,
  cancelled_at timestamptz,
  booked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beauty_booking_waitlist_service_profile_fk
    foreign key (service_id, profile_id)
    references public.beauty_professional_services(id, profile_id)
    on delete cascade,
  constraint beauty_booking_waitlist_duration_check
    check (duration_minutes_snapshot between 5 and 480),
  constraint beauty_booking_waitlist_buffer_check
    check (buffer_minutes_snapshot between 0 and 240),
  constraint beauty_booking_waitlist_status_check
    check (status in ('active', 'cancelled', 'booked')),
  constraint beauty_booking_waitlist_idempotency_key_check
    check (
      idempotency_key = btrim(idempotency_key)
      and char_length(idempotency_key) between 16 and 160
      and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  constraint beauty_booking_waitlist_notification_count_check
    check (notification_count >= 0),
  constraint beauty_booking_waitlist_cancelled_at_check
    check (cancelled_at is null or cancelled_at >= created_at),
  constraint beauty_booking_waitlist_booked_at_check
    check (booked_at is null or booked_at >= created_at)
);

create unique index if not exists beauty_booking_waitlist_client_idempotency_idx
on public.beauty_booking_waitlist_entries(client_user_key, idempotency_key);

create unique index if not exists beauty_booking_waitlist_active_slot_idx
on public.beauty_booking_waitlist_entries(profile_id, service_id, slot_start, client_user_key)
where status = 'active';

create index if not exists beauty_booking_waitlist_profile_slot_idx
on public.beauty_booking_waitlist_entries(profile_id, slot_start, status);

create index if not exists beauty_booking_waitlist_client_created_idx
on public.beauty_booking_waitlist_entries(client_user_key, created_at desc);

drop trigger if exists beauty_booking_waitlist_touch_updated_at
on public.beauty_booking_waitlist_entries;
create trigger beauty_booking_waitlist_touch_updated_at
before update on public.beauty_booking_waitlist_entries
for each row execute function public.go_irl_touch_updated_at();

revoke all on table public.beauty_booking_waitlist_entries from public;
revoke all on table public.beauty_booking_waitlist_entries from anon;
revoke all on table public.beauty_booking_waitlist_entries from authenticated;

alter table public.beauty_booking_waitlist_entries enable row level security;

drop policy if exists "beauty waitlist own read" on public.beauty_booking_waitlist_entries;
create policy "beauty waitlist own read"
on public.beauty_booking_waitlist_entries
for select to authenticated
using (client_user_key = public.go_irl_auth_user_key());

create or replace function public.go_irl_list_beauty_waitlistable_slots(
  p_profile_id uuid,
  p_service_id uuid,
  p_from_date date,
  p_to_date date
)
returns table (
  profile_id uuid,
  service_id uuid,
  slot_start timestamptz,
  service_end timestamptz,
  reserved_until timestamptz,
  timezone text,
  duration_minutes integer,
  buffer_minutes integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_profile_id is null or p_service_id is null
    or p_from_date is null or p_to_date is null then
    raise exception 'profile, service and date range are required' using errcode = '22023';
  end if;

  if p_to_date < p_from_date or p_to_date - p_from_date > 31 then
    raise exception 'Beauty waitlist range must be between 0 and 31 days' using errcode = '22023';
  end if;

  return query
  with selected_service as (
    select
      profile.id as profile_id,
      service.id as service_id,
      service.duration_minutes,
      service.buffer_minutes
    from public.beauty_professional_profiles profile
    join public.beauty_professional_services service
      on service.profile_id = profile.id
    where profile.id = p_profile_id
      and profile.publication_state = 'published'
      and profile.city_id = 'olomouc'
      and service.id = p_service_id
      and service.active = true
      and coalesce(service.archived, false) = false
  ),
  candidate_slots as (
    select
      service.profile_id,
      service.service_id,
      slot.slot_start,
      slot.slot_start + make_interval(mins => service.duration_minutes) as service_end,
      slot.slot_start + make_interval(mins => service.duration_minutes + service.buffer_minutes) as reserved_until,
      rule.timezone,
      service.duration_minutes,
      service.buffer_minutes
    from selected_service service
    join lateral generate_series(0, p_to_date - p_from_date) as day_offset on true
    join public.beauty_availability_rules rule
      on rule.profile_id = service.profile_id
      and rule.active = true
      and rule.weekday = extract(isodow from (p_from_date + day_offset))::smallint
    join lateral generate_series(
      ((p_from_date + day_offset)::date + rule.start_time) at time zone rule.timezone,
      (((p_from_date + day_offset)::date + rule.end_time) at time zone rule.timezone)
        - make_interval(mins => service.duration_minutes + service.buffer_minutes),
      make_interval(mins => rule.slot_interval_minutes)
    ) as slot(slot_start) on true
  )
  select
    candidate.profile_id,
    candidate.service_id,
    candidate.slot_start,
    candidate.service_end,
    candidate.reserved_until,
    candidate.timezone,
    candidate.duration_minutes,
    candidate.buffer_minutes
  from candidate_slots candidate
  where candidate.slot_start > now()
    and not exists (
      select 1
      from public.beauty_time_blocks time_block
      where time_block.profile_id = candidate.profile_id
        and time_block.blocked_range && tstzrange(candidate.slot_start, candidate.reserved_until, '[)')
    )
    and exists (
      select 1
      from public.beauty_bookings booking
      where booking.profile_id = candidate.profile_id
        and booking.status in ('pending', 'confirmed')
        and booking.reserved_range && tstzrange(candidate.slot_start, candidate.reserved_until, '[)')
    )
  order by candidate.slot_start;
end;
$$;

create or replace function public.go_irl_join_beauty_waitlist(
  p_profile_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_idempotency_key text
)
returns table (
  result text,
  waitlist_id uuid,
  waitlist_status text,
  slot_start timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_existing public.beauty_booking_waitlist_entries%rowtype;
  v_entry public.beauty_booking_waitlist_entries%rowtype;
  v_reserved_until timestamptz;
  v_duration_minutes integer;
  v_buffer_minutes integer;
  v_conflict_booking_id uuid;
  v_conflict_client_user_key text;
  v_local_date date;
begin
  if v_user_key is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.app_users app_user
    where app_user.user_key = v_user_key
      and app_user.status = 'active'
  ) then
    raise exception 'active GO IRL user required' using errcode = '42501';
  end if;

  if p_profile_id is null or p_service_id is null or p_starts_at is null then
    raise exception 'profile, service and start time are required' using errcode = '22023';
  end if;

  if char_length(v_idempotency_key) not between 16 and 160
    or v_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'invalid Beauty waitlist idempotency key' using errcode = '22023';
  end if;

  select * into v_existing
  from public.beauty_booking_waitlist_entries entry
  where entry.client_user_key = v_user_key
    and entry.idempotency_key = v_idempotency_key;

  if found then
    if v_existing.profile_id <> p_profile_id
      or v_existing.service_id <> p_service_id
      or v_existing.slot_start <> p_starts_at then
      raise exception 'waitlist idempotency key reused with different parameters' using errcode = '22023';
    end if;

    return query select
      'existing'::text,
      v_existing.id,
      v_existing.status,
      v_existing.slot_start,
      v_existing.updated_at;
    return;
  end if;

  select * into v_existing
  from public.beauty_booking_waitlist_entries entry
  where entry.profile_id = p_profile_id
    and entry.service_id = p_service_id
    and entry.client_user_key = v_user_key
    and entry.slot_start = p_starts_at
    and entry.status = 'active'
  order by entry.created_at
  limit 1;

  if found then
    return query select
      'existing'::text,
      v_existing.id,
      v_existing.status,
      v_existing.slot_start,
      v_existing.updated_at;
    return;
  end if;

  v_local_date := (p_starts_at at time zone 'Europe/Prague')::date;

  if exists (
    select 1
    from public.go_irl_list_public_beauty_availability(
      p_profile_id,
      p_service_id,
      v_local_date,
      v_local_date
    ) available
    where available.slot_start = p_starts_at
  ) then
    return query select
      'slot_available'::text,
      null::uuid,
      null::text,
      p_starts_at,
      null::timestamptz;
    return;
  end if;

  select
    waitlistable.reserved_until,
    waitlistable.duration_minutes,
    waitlistable.buffer_minutes
  into
    v_reserved_until,
    v_duration_minutes,
    v_buffer_minutes
  from public.go_irl_list_beauty_waitlistable_slots(
    p_profile_id,
    p_service_id,
    v_local_date,
    v_local_date
  ) waitlistable
  where waitlistable.slot_start = p_starts_at;

  if not found then
    return query select
      'slot_unavailable'::text,
      null::uuid,
      null::text,
      p_starts_at,
      null::timestamptz;
    return;
  end if;

  select booking.id, booking.client_user_key
  into v_conflict_booking_id, v_conflict_client_user_key
  from public.beauty_bookings booking
  where booking.profile_id = p_profile_id
    and booking.status in ('pending', 'confirmed')
    and booking.reserved_range && tstzrange(p_starts_at, v_reserved_until, '[)')
  order by booking.starts_at, booking.id
  limit 1
  for share;

  if found and v_conflict_client_user_key = v_user_key then
    return query select
      'already_booked'::text,
      null::uuid,
      null::text,
      p_starts_at,
      null::timestamptz;
    return;
  end if;

  if not found then
    if exists (
      select 1
      from public.go_irl_list_public_beauty_availability(
        p_profile_id,
        p_service_id,
        v_local_date,
        v_local_date
      ) available
      where available.slot_start = p_starts_at
    ) then
      return query select
        'slot_available'::text,
        null::uuid,
        null::text,
        p_starts_at,
        null::timestamptz;
      return;
    end if;

    return query select
      'slot_unavailable'::text,
      null::uuid,
      null::text,
      p_starts_at,
      null::timestamptz;
    return;
  end if;

  begin
    insert into public.beauty_booking_waitlist_entries (
      profile_id,
      service_id,
      client_user_key,
      slot_start,
      duration_minutes_snapshot,
      buffer_minutes_snapshot,
      status,
      idempotency_key
    ) values (
      p_profile_id,
      p_service_id,
      v_user_key,
      p_starts_at,
      v_duration_minutes,
      v_buffer_minutes,
      'active',
      v_idempotency_key
    )
    returning * into v_entry;
  exception
    when unique_violation then
      select * into v_existing
      from public.beauty_booking_waitlist_entries entry
      where entry.client_user_key = v_user_key
        and entry.idempotency_key = v_idempotency_key;

      if not found then
        select * into v_existing
        from public.beauty_booking_waitlist_entries entry
        where entry.profile_id = p_profile_id
          and entry.service_id = p_service_id
          and entry.client_user_key = v_user_key
          and entry.slot_start = p_starts_at
          and entry.status = 'active'
        order by entry.created_at
        limit 1;
      end if;

      if found then
        return query select
          'existing'::text,
          v_existing.id,
          v_existing.status,
          v_existing.slot_start,
          v_existing.updated_at;
        return;
      end if;

      raise;
  end;

  return query select
    'joined'::text,
    v_entry.id,
    v_entry.status,
    v_entry.slot_start,
    v_entry.updated_at;
end;
$$;

create or replace function public.go_irl_list_my_beauty_waitlist(p_limit integer default 50)
returns table (
  waitlist_id uuid,
  profile_id uuid,
  service_id uuid,
  waitlist_status text,
  slot_start timestamptz,
  duration_minutes integer,
  buffer_minutes integer,
  service_name jsonb,
  public_location text,
  notification_count integer,
  last_notified_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if v_user_key is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  return query
  select
    entry.id,
    entry.profile_id,
    entry.service_id,
    entry.status,
    entry.slot_start,
    entry.duration_minutes_snapshot,
    entry.buffer_minutes_snapshot,
    case
      when jsonb_typeof(service.service_name_i18n) = 'object' then service.service_name_i18n
      else jsonb_build_object('en', service.service_name)
    end,
    profile.public_location,
    entry.notification_count,
    entry.last_notified_at,
    entry.created_at,
    entry.updated_at
  from public.beauty_booking_waitlist_entries entry
  join public.beauty_professional_profiles profile
    on profile.id = entry.profile_id
  join public.beauty_professional_services service
    on service.id = entry.service_id
    and service.profile_id = entry.profile_id
  where entry.client_user_key = v_user_key
  order by
    case when entry.status = 'active' and entry.slot_start > now() then 0 else 1 end,
    entry.slot_start,
    entry.created_at desc
  limit v_limit;
end;
$$;

create or replace function public.go_irl_cancel_my_beauty_waitlist(
  p_waitlist_id uuid,
  p_expected_updated_at timestamptz
)
returns table (
  result text,
  waitlist_id uuid,
  waitlist_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_entry public.beauty_booking_waitlist_entries%rowtype;
begin
  if v_user_key is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  select * into v_entry
  from public.beauty_booking_waitlist_entries entry
  where entry.id = p_waitlist_id
    and entry.client_user_key = v_user_key
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if p_expected_updated_at is distinct from v_entry.updated_at then
    return query select 'stale'::text, v_entry.id, v_entry.status, v_entry.updated_at;
    return;
  end if;

  if v_entry.status <> 'active' then
    return query select 'invalid_state'::text, v_entry.id, v_entry.status, v_entry.updated_at;
    return;
  end if;

  update public.beauty_booking_waitlist_entries entry
  set status = 'cancelled', cancelled_at = now()
  where entry.id = v_entry.id
  returning * into v_entry;

  return query select 'changed'::text, v_entry.id, v_entry.status, v_entry.updated_at;
end;
$$;

create or replace function public.go_irl_mark_beauty_waitlist_booked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('pending', 'confirmed') then
    update public.beauty_booking_waitlist_entries entry
    set
      status = 'booked',
      booked_at = coalesce(entry.booked_at, now())
    where entry.profile_id = new.profile_id
      and entry.service_id = new.service_id
      and entry.client_user_key = new.client_user_key
      and entry.slot_start = new.starts_at
      and entry.status = 'active';
  end if;

  return new;
end;
$$;

revoke execute on function public.go_irl_mark_beauty_waitlist_booked()
from public, anon, authenticated;

drop trigger if exists beauty_booking_waitlist_mark_booked
on public.beauty_bookings;
create trigger beauty_booking_waitlist_mark_booked
after insert or update of starts_at, status on public.beauty_bookings
for each row execute function public.go_irl_mark_beauty_waitlist_booked();

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
    'services.waitlist_slot_available'
  ));

create or replace function public.go_irl_notify_available_beauty_waitlist_entries(
  p_profile_id uuid,
  p_released_start timestamptz,
  p_released_until timestamptz,
  p_source_key text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_local_date date;
  v_delivery_key text;
  v_inserted integer;
  v_notified integer := 0;
begin
  if p_profile_id is null
    or p_released_start is null
    or p_released_until is null
    or p_released_start >= p_released_until
    or nullif(btrim(coalesce(p_source_key, '')), '') is null then
    return 0;
  end if;

  for v_entry in
    select
      entry.id,
      entry.profile_id,
      entry.service_id,
      entry.client_user_key,
      entry.slot_start,
      entry.duration_minutes_snapshot,
      entry.buffer_minutes_snapshot,
      service.service_name,
      service.service_name_i18n,
      profile.public_location
    from public.beauty_booking_waitlist_entries entry
    join public.beauty_professional_profiles profile
      on profile.id = entry.profile_id
    join public.beauty_professional_services service
      on service.id = entry.service_id
      and service.profile_id = entry.profile_id
    where entry.profile_id = p_profile_id
      and entry.status = 'active'
      and entry.slot_start > now()
      and tstzrange(
        entry.slot_start,
        entry.slot_start + make_interval(
          mins => entry.duration_minutes_snapshot + entry.buffer_minutes_snapshot
        ),
        '[)'
      ) && tstzrange(p_released_start, p_released_until, '[)')
    order by entry.created_at, entry.id
  loop
    v_local_date := (v_entry.slot_start at time zone 'Europe/Prague')::date;

    if not exists (
      select 1
      from public.go_irl_list_public_beauty_availability(
        v_entry.profile_id,
        v_entry.service_id,
        v_local_date,
        v_local_date
      ) available
      where available.slot_start = v_entry.slot_start
    ) then
      continue;
    end if;

    v_delivery_key := 'beauty-waitlist:' || v_entry.id::text || ':' || md5(p_source_key);

    insert into public.event_notifications (
      user_key,
      activity_id,
      kind,
      payload,
      provider,
      delivery_key
    ) values (
      v_entry.client_user_key,
      null,
      'services.waitlist_slot_available',
      jsonb_build_object(
        'subjectType', 'beauty_booking',
        'waitlistId', v_entry.id,
        'profileId', v_entry.profile_id,
        'serviceId', v_entry.service_id,
        'title', case
          when jsonb_typeof(v_entry.service_name_i18n) = 'object' then v_entry.service_name_i18n
          else jsonb_build_object('en', v_entry.service_name)
        end,
        'date', to_char(v_entry.slot_start at time zone 'Europe/Prague', 'YYYY-MM-DD'),
        'time', to_char(v_entry.slot_start at time zone 'Europe/Prague', 'HH24:MI:SS'),
        'address', v_entry.public_location,
        'reservationGuaranteed', false,
        'source', 'beauty_waitlist',
        'openPath', '/services'
      ),
      'telegram',
      v_delivery_key
    )
    on conflict (delivery_key) do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted = 1 then
      update public.beauty_booking_waitlist_entries entry
      set
        notification_count = entry.notification_count + 1,
        last_notified_at = now()
      where entry.id = v_entry.id
        and entry.status = 'active';

      v_notified := v_notified + 1;
    end if;
  end loop;

  return v_notified;
end;
$$;

revoke execute on function public.go_irl_notify_available_beauty_waitlist_entries(uuid, timestamptz, timestamptz, text)
from public, anon, authenticated;

create or replace function public.go_irl_queue_beauty_waitlist_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.beauty_bookings%rowtype;
  v_released_start timestamptz;
  v_released_until timestamptz;
begin
  select booking.* into v_booking
  from public.beauty_bookings booking
  where booking.id = new.booking_id;

  if not found then
    return new;
  end if;

  if new.event_type = 'booking_cancelled'
    and new.from_status in ('pending', 'confirmed')
    and new.to_status = 'cancelled' then
    v_released_start := v_booking.starts_at;
    v_released_until := v_booking.reserved_until;
  elsif new.event_type = 'status_changed'
    and new.from_status = 'pending'
    and new.to_status = 'declined' then
    v_released_start := v_booking.starts_at;
    v_released_until := v_booking.reserved_until;
  elsif new.event_type = 'booking_expired'
    and new.from_status = 'pending'
    and new.to_status = 'expired' then
    v_released_start := v_booking.starts_at;
    v_released_until := v_booking.reserved_until;
  elsif new.event_type = 'status_changed'
    and new.from_status = 'confirmed'
    and new.to_status = 'confirmed'
    and new.payload ->> 'action' = 'rescheduled'
    and new.payload ? 'oldStartsAt' then
    v_released_start := (new.payload ->> 'oldStartsAt')::timestamptz;
    v_released_until := v_released_start + make_interval(
      mins => v_booking.duration_minutes_snapshot + v_booking.buffer_minutes_snapshot
    );
  else
    return new;
  end if;

  perform public.go_irl_notify_available_beauty_waitlist_entries(
    v_booking.profile_id,
    v_released_start,
    v_released_until,
    'booking-event:' || new.id::text
  );

  return new;
end;
$$;

revoke execute on function public.go_irl_queue_beauty_waitlist_release()
from public, anon, authenticated;

drop trigger if exists beauty_booking_events_queue_waitlist_release
on public.beauty_booking_events;
create trigger beauty_booking_events_queue_waitlist_release
after insert on public.beauty_booking_events
for each row execute function public.go_irl_queue_beauty_waitlist_release();

create or replace function public.go_irl_queue_beauty_waitlist_time_block_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.go_irl_notify_available_beauty_waitlist_entries(
    old.profile_id,
    old.starts_at,
    old.ends_at,
    'time-block:' || old.id::text
  );

  return old;
end;
$$;

revoke execute on function public.go_irl_queue_beauty_waitlist_time_block_release()
from public, anon, authenticated;

drop trigger if exists beauty_time_blocks_queue_waitlist_release
on public.beauty_time_blocks;
create trigger beauty_time_blocks_queue_waitlist_release
after delete on public.beauty_time_blocks
for each row execute function public.go_irl_queue_beauty_waitlist_time_block_release();

revoke all on function public.go_irl_list_beauty_waitlistable_slots(uuid, uuid, date, date) from public;
revoke all on function public.go_irl_list_beauty_waitlistable_slots(uuid, uuid, date, date) from anon;
revoke all on function public.go_irl_join_beauty_waitlist(uuid, uuid, timestamptz, text) from public;
revoke all on function public.go_irl_join_beauty_waitlist(uuid, uuid, timestamptz, text) from anon;
revoke all on function public.go_irl_list_my_beauty_waitlist(integer) from public;
revoke all on function public.go_irl_list_my_beauty_waitlist(integer) from anon;
revoke all on function public.go_irl_cancel_my_beauty_waitlist(uuid, timestamptz) from public;
revoke all on function public.go_irl_cancel_my_beauty_waitlist(uuid, timestamptz) from anon;

grant execute on function public.go_irl_list_beauty_waitlistable_slots(uuid, uuid, date, date) to authenticated;
grant execute on function public.go_irl_join_beauty_waitlist(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.go_irl_list_my_beauty_waitlist(integer) to authenticated;
grant execute on function public.go_irl_cancel_my_beauty_waitlist(uuid, timestamptz) to authenticated;

comment on table public.beauty_booking_waitlist_entries is
  'MASTER005 exact-slot Beauty waitlist. Entries never reserve a slot and do not imply FIFO priority.';
comment on function public.go_irl_list_beauty_waitlistable_slots(uuid, uuid, date, date) is
  'MASTER005 authenticated projection of currently booking-occupied Beauty slots eligible for exact-slot waitlist.';
comment on function public.go_irl_join_beauty_waitlist(uuid, uuid, timestamptz, text) is
  'MASTER005 idempotent exact-slot waitlist join. Booking creation remains the only reservation path.';
comment on function public.go_irl_cancel_my_beauty_waitlist(uuid, timestamptz) is
  'MASTER005 client-owned waitlist cancellation with stale-write protection.';

notify pgrst, 'reload schema';

commit;
