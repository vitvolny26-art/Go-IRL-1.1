-- MASTER005 repository verification.
-- Run only after the MASTER005 migration in a disposable or separately approved environment.
-- Fixtures are transactional and rolled back.

begin;

create temporary table master005_verify_context (
  professional_user_key text not null,
  occupant_user_key text not null,
  client_a_user_key text not null,
  client_b_user_key text not null,
  profile_id uuid not null,
  booking_service_id uuid not null,
  wait_service_id uuid not null,
  slot_a timestamptz not null,
  slot_b timestamptz not null,
  booking_a_id uuid not null,
  booking_b_id uuid not null,
  booking_a_updated_at timestamptz not null,
  booking_b_updated_at timestamptz not null,
  wait_a_id uuid,
  wait_b_id uuid,
  wait_a_updated_at timestamptz,
  wait_b_updated_at timestamptz
) on commit drop;

create temporary table master005_verify_join_results (
  label text primary key,
  result text,
  waitlist_id uuid,
  waitlist_status text,
  slot_start timestamptz,
  updated_at timestamptz
) on commit drop;

create temporary table master005_verify_transition_results (
  label text primary key,
  result text,
  booking_id uuid,
  booking_status text,
  updated_at timestamptz
) on commit drop;

create temporary table master005_verify_cancel_results (
  label text primary key,
  result text,
  waitlist_id uuid,
  waitlist_status text,
  updated_at timestamptz
) on commit drop;

create temporary table master005_verify_booking_results (
  label text primary key,
  result text,
  booking_id uuid,
  booking_status text,
  starts_at timestamptz,
  service_ends_at timestamptz,
  reserved_until timestamptz,
  updated_at timestamptz
) on commit drop;

grant select, update on master005_verify_context to authenticated;
grant select, insert on master005_verify_join_results to authenticated;
grant select, insert on master005_verify_transition_results to authenticated;
grant select, insert on master005_verify_cancel_results to authenticated;
grant select, insert on master005_verify_booking_results to authenticated;

do $$
declare
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_professional text := 'master005-pro-' || v_suffix;
  v_occupant text := 'master005-occupant-' || v_suffix;
  v_client_a text := 'master005-client-a-' || v_suffix;
  v_client_b text := 'master005-client-b-' || v_suffix;
  v_profile uuid := gen_random_uuid();
  v_booking_service uuid := gen_random_uuid();
  v_wait_service uuid := gen_random_uuid();
  v_booking_a uuid := gen_random_uuid();
  v_booking_b uuid := gen_random_uuid();
  v_local_date date := (now() at time zone 'Europe/Prague')::date + 2;
  v_booking_a_start timestamptz := (v_local_date + time '10:00') at time zone 'Europe/Prague';
  v_booking_b_start timestamptz := (v_local_date + time '12:00') at time zone 'Europe/Prague';
  v_slot_a timestamptz := (v_local_date + time '10:30') at time zone 'Europe/Prague';
  v_slot_b timestamptz := (v_local_date + time '12:30') at time zone 'Europe/Prague';
  v_booking_a_updated_at timestamptz;
  v_booking_b_updated_at timestamptz;
begin
  insert into public.app_users (
    id, auth_provider, provider_user_id, user_key, first_name, status
  ) values
    (gen_random_uuid(), 'google', 'pro-' || v_suffix, v_professional, 'Master005 Pro', 'active'),
    (gen_random_uuid(), 'google', 'occupant-' || v_suffix, v_occupant, 'Master005 Occupant', 'active'),
    (gen_random_uuid(), 'google', 'client-a-' || v_suffix, v_client_a, 'Master005 Client A', 'active'),
    (gen_random_uuid(), 'google', 'client-b-' || v_suffix, v_client_b, 'Master005 Client B', 'active');

  insert into public.user_roles (user_key, role, note)
  values (v_professional, 'professional', 'Master005 verification')
  on conflict (user_key) do update set role = excluded.role, note = excluded.note;

  insert into public.beauty_professional_profiles (
    id,
    owner_user_key,
    slug,
    city_id,
    display_name,
    public_location,
    contact,
    exact_address,
    publication_state
  ) values (
    v_profile,
    v_professional,
    'beauty-master005-' || substring(md5(v_professional) from 1 for 16),
    'olomouc',
    'Master005 Verify',
    'Olomouc centrum',
    '@master005_verify',
    'Horni namesti 1, Olomouc',
    'published'
  );

  insert into public.beauty_professional_services (
    id,
    profile_id,
    client_key,
    service_name,
    service_name_i18n,
    duration_minutes,
    price_czk,
    buffer_minutes,
    currency,
    active,
    sort_order,
    archived
  ) values
    (
      v_booking_service,
      v_profile,
      'master005-booking-service',
      'Master005 long service',
      jsonb_build_object('en', 'Master005 long service'),
      60,
      1200,
      15,
      'CZK',
      true,
      0,
      false
    ),
    (
      v_wait_service,
      v_profile,
      'master005-wait-service',
      'Master005 short service',
      jsonb_build_object('en', 'Master005 short service'),
      30,
      700,
      0,
      'CZK',
      true,
      1,
      false
    );

  insert into public.beauty_availability_rules (
    profile_id,
    weekday,
    start_time,
    end_time,
    timezone,
    slot_interval_minutes,
    active
  ) values (
    v_profile,
    extract(isodow from v_local_date)::smallint,
    time '09:00',
    time '14:30',
    'Europe/Prague',
    30,
    true
  );

  insert into public.beauty_bookings (
    id,
    profile_id,
    service_id,
    client_user_key,
    status,
    starts_at,
    service_ends_at,
    reserved_until,
    confirmed_at,
    client_name_snapshot,
    client_contact_snapshot,
    service_name_snapshot,
    duration_minutes_snapshot,
    buffer_minutes_snapshot,
    price_czk_snapshot,
    currency,
    public_location_snapshot,
    exact_address_snapshot,
    idempotency_key
  ) values
    (
      v_booking_a,
      v_profile,
      v_booking_service,
      v_occupant,
      'confirmed',
      v_booking_a_start,
      v_booking_a_start + interval '60 minutes',
      v_booking_a_start + interval '75 minutes',
      now(),
      'Master005 Occupant',
      '@master005_occupant',
      jsonb_build_object('en', 'Master005 long service'),
      60,
      15,
      1200,
      'CZK',
      'Olomouc centrum',
      'Horni namesti 1, Olomouc',
      'master005-booking-a-' || v_suffix
    ),
    (
      v_booking_b,
      v_profile,
      v_booking_service,
      v_occupant,
      'confirmed',
      v_booking_b_start,
      v_booking_b_start + interval '60 minutes',
      v_booking_b_start + interval '75 minutes',
      now(),
      'Master005 Occupant',
      '@master005_occupant',
      jsonb_build_object('en', 'Master005 long service'),
      60,
      15,
      1200,
      'CZK',
      'Olomouc centrum',
      'Horni namesti 1, Olomouc',
      'master005-booking-b-' || v_suffix
    );

  select updated_at into v_booking_a_updated_at
  from public.beauty_bookings where id = v_booking_a;
  select updated_at into v_booking_b_updated_at
  from public.beauty_bookings where id = v_booking_b;

  insert into master005_verify_context (
    professional_user_key,
    occupant_user_key,
    client_a_user_key,
    client_b_user_key,
    profile_id,
    booking_service_id,
    wait_service_id,
    slot_a,
    slot_b,
    booking_a_id,
    booking_b_id,
    booking_a_updated_at,
    booking_b_updated_at
  ) values (
    v_professional,
    v_occupant,
    v_client_a,
    v_client_b,
    v_profile,
    v_booking_service,
    v_wait_service,
    v_slot_a,
    v_slot_b,
    v_booking_a,
    v_booking_b,
    v_booking_a_updated_at,
    v_booking_b_updated_at
  );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'go_irl_user_key', (select client_a_user_key from master005_verify_context)
  )::text,
  true
);

do $$
begin
  if not exists (
    select 1
    from public.go_irl_list_beauty_waitlistable_slots(
      (select profile_id from master005_verify_context),
      (select wait_service_id from master005_verify_context),
      ((select slot_a from master005_verify_context) at time zone 'Europe/Prague')::date,
      ((select slot_a from master005_verify_context) at time zone 'Europe/Prague')::date
    ) slot
    where slot.slot_start = (select slot_a from master005_verify_context)
  ) then
    raise exception 'overlap waitlistable slot A missing';
  end if;
end;
$$;

insert into master005_verify_join_results
select
  'join_a',
  result,
  waitlist_id,
  waitlist_status,
  slot_start,
  updated_at
from public.go_irl_join_beauty_waitlist(
  (select profile_id from master005_verify_context),
  (select wait_service_id from master005_verify_context),
  (select slot_a from master005_verify_context),
  'master005-wait-a-1234567890'
);

insert into master005_verify_join_results
select
  'join_a_retry',
  result,
  waitlist_id,
  waitlist_status,
  slot_start,
  updated_at
from public.go_irl_join_beauty_waitlist(
  (select profile_id from master005_verify_context),
  (select wait_service_id from master005_verify_context),
  (select slot_a from master005_verify_context),
  'master005-wait-a-1234567890'
);

reset role;
select set_config('request.jwt.claims', '{}'::text, true);

update master005_verify_context
set wait_a_id = (
  select waitlist_id from master005_verify_join_results where label = 'join_a'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'go_irl_user_key', (select client_b_user_key from master005_verify_context)
  )::text,
  true
);

insert into master005_verify_join_results
select
  'join_b',
  result,
  waitlist_id,
  waitlist_status,
  slot_start,
  updated_at
from public.go_irl_join_beauty_waitlist(
  (select profile_id from master005_verify_context),
  (select wait_service_id from master005_verify_context),
  (select slot_b from master005_verify_context),
  'master005-wait-b-1234567890'
);

reset role;
select set_config('request.jwt.claims', '{}'::text, true);

update master005_verify_context
set wait_b_id = (
  select waitlist_id from master005_verify_join_results where label = 'join_b'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'go_irl_user_key', (select professional_user_key from master005_verify_context)
  )::text,
  true
);

insert into master005_verify_transition_results
select
  'cancel_booking_a',
  result,
  booking_id,
  booking_status,
  updated_at
from public.go_irl_transition_beauty_booking(
  (select booking_a_id from master005_verify_context),
  'confirmed',
  (select booking_a_updated_at from master005_verify_context),
  'cancelled'
);

insert into master005_verify_transition_results
select
  'cancel_booking_b',
  result,
  booking_id,
  booking_status,
  updated_at
from public.go_irl_transition_beauty_booking(
  (select booking_b_id from master005_verify_context),
  'confirmed',
  (select booking_b_updated_at from master005_verify_context),
  'cancelled'
);

reset role;
select set_config('request.jwt.claims', '{}'::text, true);

do $$
begin
  if (select result from master005_verify_join_results where label = 'join_a') <> 'joined' then
    raise exception 'join A did not return joined';
  end if;
  if (select result from master005_verify_join_results where label = 'join_a_retry') <> 'existing' then
    raise exception 'join A retry did not return existing';
  end if;
  if (select waitlist_id from master005_verify_join_results where label = 'join_a_retry')
    is distinct from (select waitlist_id from master005_verify_join_results where label = 'join_a') then
    raise exception 'join A retry returned a different waitlist row';
  end if;
  if (select result from master005_verify_join_results where label = 'join_b') <> 'joined' then
    raise exception 'join B did not return joined';
  end if;
  if (select result from master005_verify_transition_results where label = 'cancel_booking_a') <> 'changed' then
    raise exception 'booking A cancellation did not change';
  end if;
  if (select result from master005_verify_transition_results where label = 'cancel_booking_b') <> 'changed' then
    raise exception 'booking B cancellation did not change';
  end if;

  if (select count(*) from public.event_notifications notification
      where notification.kind = 'services.waitlist_slot_available'
        and notification.user_key = (select client_a_user_key from master005_verify_context)
        and notification.payload ->> 'waitlistId' = (select wait_a_id::text from master005_verify_context)) <> 1 then
    raise exception 'client A waitlist availability notification missing or duplicated';
  end if;

  if (select count(*) from public.event_notifications notification
      where notification.kind = 'services.waitlist_slot_available'
        and notification.user_key = (select client_b_user_key from master005_verify_context)
        and notification.payload ->> 'waitlistId' = (select wait_b_id::text from master005_verify_context)) <> 1 then
    raise exception 'client B waitlist availability notification missing or duplicated';
  end if;

  if exists (
    select 1
    from public.event_notifications notification
    where notification.kind = 'services.waitlist_slot_available'
      and notification.payload ->> 'reservationGuaranteed' <> 'false'
  ) then
    raise exception 'waitlist notification incorrectly guarantees a reservation';
  end if;

  if (select notification_count from public.beauty_booking_waitlist_entries
      where id = (select wait_a_id from master005_verify_context)) <> 1
    or (select status from public.beauty_booking_waitlist_entries
      where id = (select wait_a_id from master005_verify_context)) <> 'active' then
    raise exception 'waitlist A was not kept active after notification';
  end if;

  if (select notification_count from public.beauty_booking_waitlist_entries
      where id = (select wait_b_id from master005_verify_context)) <> 1
    or (select status from public.beauty_booking_waitlist_entries
      where id = (select wait_b_id from master005_verify_context)) <> 'active' then
    raise exception 'waitlist B was not kept active after notification';
  end if;
end;
$$;

update master005_verify_context
set
  wait_a_updated_at = (
    select updated_at from public.beauty_booking_waitlist_entries
    where id = master005_verify_context.wait_a_id
  ),
  wait_b_updated_at = (
    select updated_at from public.beauty_booking_waitlist_entries
    where id = master005_verify_context.wait_b_id
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'go_irl_user_key', (select client_a_user_key from master005_verify_context)
  )::text,
  true
);

insert into master005_verify_cancel_results
select
  'cancel_wait_a',
  result,
  waitlist_id,
  waitlist_status,
  updated_at
from public.go_irl_cancel_my_beauty_waitlist(
  (select wait_a_id from master005_verify_context),
  (select wait_a_updated_at from master005_verify_context)
);

reset role;
select set_config('request.jwt.claims', '{}'::text, true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'go_irl_user_key', (select client_b_user_key from master005_verify_context)
  )::text,
  true
);

insert into master005_verify_booking_results
select
  'book_wait_b',
  result,
  booking_id,
  booking_status,
  starts_at,
  service_ends_at,
  reserved_until,
  updated_at
from public.go_irl_create_beauty_booking(
  (select profile_id from master005_verify_context),
  (select wait_service_id from master005_verify_context),
  (select slot_b from master005_verify_context),
  'Master005 Client B',
  '@master005_client_b',
  'master005-book-after-wait-1234567890'
);

reset role;
select set_config('request.jwt.claims', '{}'::text, true);

do $$
declare
  v_kind_def text;
begin
  if (select result from master005_verify_cancel_results where label = 'cancel_wait_a') <> 'changed'
    or (select waitlist_status from master005_verify_cancel_results where label = 'cancel_wait_a') <> 'cancelled' then
    raise exception 'waitlist A cancellation failed';
  end if;

  if (select result from master005_verify_booking_results where label = 'book_wait_b') <> 'created' then
    raise exception 'booking from waitlist B did not create';
  end if;

  if (select status from public.beauty_booking_waitlist_entries
      where id = (select wait_b_id from master005_verify_context)) <> 'booked' then
    raise exception 'waitlist B was not closed as booked after booking creation';
  end if;

  if (select booked_at from public.beauty_booking_waitlist_entries
      where id = (select wait_b_id from master005_verify_context)) is null then
    raise exception 'waitlist B booked_at missing';
  end if;

  if has_table_privilege('authenticated', 'public.beauty_booking_waitlist_entries', 'SELECT') then
    raise exception 'authenticated direct waitlist table read must remain revoked';
  end if;

  if not exists (
    select 1
    from pg_class relation
    where relation.oid = 'public.beauty_booking_waitlist_entries'::regclass
      and relation.relrowsecurity
  ) then
    raise exception 'waitlist RLS must be enabled';
  end if;

  if not exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'beauty_booking_waitlist_entries'
      and policy.policyname = 'beauty waitlist own read'
      and policy.cmd = 'SELECT'
      and 'authenticated' = any(policy.roles)
      and coalesce(policy.qual, '') like '%client_user_key%go_irl_auth_user_key%'
  ) then
    raise exception 'waitlist own-read RLS policy missing or malformed';
  end if;

  if has_function_privilege(
    'anon',
    'public.go_irl_list_beauty_waitlistable_slots(uuid,uuid,date,date)',
    'EXECUTE'
  ) then
    raise exception 'anon waitlistable-slot RPC execute must remain revoked';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.go_irl_list_beauty_waitlistable_slots(uuid,uuid,date,date)',
    'EXECUTE'
  ) then
    raise exception 'authenticated waitlistable-slot RPC execute missing';
  end if;

  if has_function_privilege(
    'anon',
    'public.go_irl_join_beauty_waitlist(uuid,uuid,timestamptz,text)',
    'EXECUTE'
  ) then
    raise exception 'anon waitlist join execute must remain revoked';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.go_irl_join_beauty_waitlist(uuid,uuid,timestamptz,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated waitlist join execute missing';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.go_irl_notify_available_beauty_waitlist_entries(uuid,timestamptz,timestamptz,text)',
    'EXECUTE'
  ) then
    raise exception 'waitlist notification helper must not be client executable';
  end if;

  select pg_get_constraintdef(oid)
  into v_kind_def
  from pg_constraint
  where conrelid = 'public.event_notifications'::regclass
    and conname = 'event_notifications_kind_check';

  if position('services.waitlist_slot_available' in coalesce(v_kind_def, '')) = 0 then
    raise exception 'waitlist notification kind missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.beauty_booking_events'::regclass
      and tgname = 'beauty_booking_events_queue_waitlist_release'
      and not tgisinternal
  ) then
    raise exception 'booking-event waitlist release trigger missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.beauty_bookings'::regclass
      and tgname = 'beauty_booking_waitlist_mark_booked'
      and not tgisinternal
  ) then
    raise exception 'booking waitlist booked trigger missing';
  end if;
end;
$$;

rollback;
