begin;

alter table public.beauty_professional_profiles
  add column if not exists confirmation_mode text not null default 'manual';

alter table public.beauty_professional_profiles
  drop constraint if exists beauty_professional_profiles_confirmation_mode_check;

alter table public.beauty_professional_profiles
  add constraint beauty_professional_profiles_confirmation_mode_check
  check (confirmation_mode in ('manual', 'automatic'));

create or replace function public.go_irl_get_my_beauty_confirmation_mode()
returns table (profile_id uuid, confirmation_mode text, updated_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select profile.id, profile.confirmation_mode, profile.updated_at
  from public.beauty_professional_profiles profile
  where profile.owner_user_key = public.go_irl_auth_user_key()
    and public.go_irl_current_user_is_professional()
  limit 1;
$$;

create or replace function public.go_irl_set_my_beauty_confirmation_mode(p_confirmation_mode text)
returns table (profile_id uuid, confirmation_mode text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mode text := lower(btrim(coalesce(p_confirmation_mode, '')));
  v_profile public.beauty_professional_profiles%rowtype;
begin
  if v_mode not in ('manual', 'automatic') then
    raise exception 'invalid Beauty confirmation mode' using errcode = '22023';
  end if;
  if not public.go_irl_current_user_is_professional() then
    raise exception 'professional role required' using errcode = '42501';
  end if;

  update public.beauty_professional_profiles profile
  set confirmation_mode = v_mode
  where profile.owner_user_key = public.go_irl_auth_user_key()
  returning * into v_profile;

  if not found then
    raise exception 'Beauty profile not found' using errcode = 'P0002';
  end if;
  return query select v_profile.id, v_profile.confirmation_mode, v_profile.updated_at;
end;
$$;

revoke all on function public.go_irl_get_my_beauty_confirmation_mode() from public;
revoke all on function public.go_irl_set_my_beauty_confirmation_mode(text) from public;
grant execute on function public.go_irl_get_my_beauty_confirmation_mode() to authenticated;
grant execute on function public.go_irl_set_my_beauty_confirmation_mode(text) to authenticated;

create or replace function public.go_irl_create_beauty_booking(
  p_profile_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_client_name text,
  p_client_contact text,
  p_idempotency_key text
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
  v_user_key text := public.go_irl_auth_user_key();
  v_client_name text := btrim(coalesce(p_client_name, ''));
  v_client_contact text := btrim(coalesce(p_client_contact, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_profile record;
  v_existing public.beauty_bookings%rowtype;
  v_booking public.beauty_bookings%rowtype;
  v_service_ends_at timestamptz;
  v_reserved_until timestamptz;
  v_local_start timestamp without time zone;
  v_local_reserved timestamp without time zone;
  v_allowed boolean;
  v_initial_status text;
begin
  if v_user_key is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.app_users app_user
    where app_user.user_key = v_user_key and app_user.status = 'active'
  ) then
    raise exception 'active GO IRL user required' using errcode = '42501';
  end if;
  if p_profile_id is null or p_service_id is null or p_starts_at is null then
    raise exception 'profile, service and start time are required' using errcode = '22023';
  end if;
  if char_length(v_client_name) not between 1 and 120
    or char_length(v_client_contact) not between 1 and 200 then
    raise exception 'valid client name and contact are required' using errcode = '22023';
  end if;
  if char_length(v_idempotency_key) not between 16 and 160
    or v_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'invalid Beauty booking idempotency key' using errcode = '22023';
  end if;

  select * into v_existing
  from public.beauty_bookings booking
  where booking.client_user_key = v_user_key
    and booking.idempotency_key = v_idempotency_key;

  if found then
    if v_existing.profile_id <> p_profile_id
      or v_existing.service_id <> p_service_id
      or v_existing.starts_at <> p_starts_at then
      raise exception 'idempotency key reused with different booking parameters' using errcode = '22023';
    end if;
    return query select 'existing'::text, v_existing.id, v_existing.status,
      v_existing.starts_at, v_existing.service_ends_at, v_existing.reserved_until, v_existing.updated_at;
    return;
  end if;

  select
    profile.id as profile_id,
    profile.public_location,
    profile.exact_address,
    profile.confirmation_mode,
    service.id as service_id,
    service.service_name,
    service.service_name_i18n,
    service.duration_minutes,
    service.buffer_minutes,
    service.price_czk,
    service.currency
  into v_profile
  from public.beauty_professional_profiles profile
  join public.beauty_professional_services service on service.profile_id = profile.id
  where profile.id = p_profile_id
    and profile.publication_state = 'published'
    and profile.city_id = 'olomouc'
    and service.id = p_service_id
    and service.active = true
    and coalesce(service.archived, false) = false;

  if not found then
    return query select 'service_unavailable'::text, null::uuid, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_initial_status := case when v_profile.confirmation_mode = 'automatic' then 'confirmed' else 'pending' end;

  if p_starts_at <= now() then
    return query select 'slot_unavailable'::text, null::uuid, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_service_ends_at := p_starts_at + make_interval(mins => v_profile.duration_minutes);
  v_reserved_until := v_service_ends_at + make_interval(mins => v_profile.buffer_minutes);
  v_local_start := p_starts_at at time zone 'Europe/Prague';
  v_local_reserved := v_reserved_until at time zone 'Europe/Prague';

  select exists (
    select 1
    from public.beauty_availability_rules rule
    where rule.profile_id = p_profile_id
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
    return query select 'slot_unavailable'::text, null::uuid, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  if exists (
    select 1 from public.beauty_time_blocks time_block
    where time_block.profile_id = p_profile_id
      and time_block.blocked_range && tstzrange(p_starts_at, v_reserved_until, '[)')
  ) then
    return query select 'slot_blocked'::text, null::uuid, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  begin
    insert into public.beauty_bookings (
      profile_id, service_id, client_user_key, status, starts_at, service_ends_at, reserved_until, confirmed_at,
      client_name_snapshot, client_contact_snapshot, service_name_snapshot, duration_minutes_snapshot,
      buffer_minutes_snapshot, price_czk_snapshot, currency, public_location_snapshot,
      exact_address_snapshot, idempotency_key
    ) values (
      p_profile_id, p_service_id, v_user_key, v_initial_status, p_starts_at, v_service_ends_at, v_reserved_until,
      case when v_initial_status = 'confirmed' then now() else null end,
      v_client_name, v_client_contact,
      case when jsonb_typeof(v_profile.service_name_i18n) = 'object' then v_profile.service_name_i18n
        else jsonb_build_object('en', v_profile.service_name) end,
      v_profile.duration_minutes, v_profile.buffer_minutes, v_profile.price_czk, v_profile.currency,
      v_profile.public_location, v_profile.exact_address, v_idempotency_key
    ) returning * into v_booking;
  exception
    when exclusion_violation then
      return query select 'slot_taken'::text, null::uuid, null::text,
        null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
      return;
    when unique_violation then
      select * into v_existing
      from public.beauty_bookings booking
      where booking.client_user_key = v_user_key
        and booking.idempotency_key = v_idempotency_key;
      if found and v_existing.profile_id = p_profile_id
        and v_existing.service_id = p_service_id
        and v_existing.starts_at = p_starts_at then
        return query select 'existing'::text, v_existing.id, v_existing.status,
          v_existing.starts_at, v_existing.service_ends_at, v_existing.reserved_until, v_existing.updated_at;
        return;
      end if;
      raise;
  end;

  insert into public.beauty_booking_events (
    booking_id, event_type, actor_user_key, from_status, to_status, payload, deduplication_key
  ) values (
    v_booking.id,
    'booking_created',
    v_user_key,
    null,
    v_initial_status,
    jsonb_build_object('source', 'client_rpc', 'confirmation_mode', v_profile.confirmation_mode),
    'beauty-booking:' || v_booking.id::text || ':created'
  );

  return query select 'created'::text, v_booking.id, v_booking.status, v_booking.starts_at,
    v_booking.service_ends_at, v_booking.reserved_until, v_booking.updated_at;
end;
$$;

revoke all on function public.go_irl_create_beauty_booking(uuid, uuid, timestamptz, text, text, text) from public;
grant execute on function public.go_irl_create_beauty_booking(uuid, uuid, timestamptz, text, text, text) to authenticated;

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
