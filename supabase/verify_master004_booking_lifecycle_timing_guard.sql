-- MASTER004 repository verification.
-- Run only after the MASTER004 migration in a disposable or separately approved environment.
-- Fixtures are transactional and rolled back.

begin;

create temporary table master004_verify_context (
  professional_user_key text not null,
  profile_id uuid not null,
  service_id uuid not null,
  future_booking_id uuid not null,
  future_updated_at timestamptz not null,
  completed_booking_id uuid not null,
  completed_updated_at timestamptz not null,
  no_show_booking_id uuid not null,
  no_show_updated_at timestamptz not null
) on commit drop;

create temporary table master004_verify_results (
  label text primary key,
  result text,
  booking_id uuid,
  booking_status text,
  updated_at timestamptz
) on commit drop;

grant select on master004_verify_context to authenticated;
grant select, insert on master004_verify_results to authenticated;

do $$
declare
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_professional text := 'master004-pro-' || v_suffix;
  v_client text := 'master004-client-' || v_suffix;
  v_profile uuid := gen_random_uuid();
  v_service uuid := gen_random_uuid();
  v_future_booking uuid := gen_random_uuid();
  v_completed_booking uuid := gen_random_uuid();
  v_no_show_booking uuid := gen_random_uuid();
  v_future_start timestamptz := now() + interval '2 hours';
  v_past_start timestamptz := now() - interval '3 hours';
  v_future_updated_at timestamptz;
  v_completed_updated_at timestamptz;
  v_no_show_updated_at timestamptz;
begin
  insert into public.app_users (
    id, auth_provider, provider_user_id, user_key, first_name, status
  ) values
    (gen_random_uuid(), 'google', 'pro-' || v_suffix, v_professional, 'Master004 Pro', 'active'),
    (gen_random_uuid(), 'google', 'client-' || v_suffix, v_client, 'Master004 Client', 'active');

  insert into public.user_roles (user_key, role, note)
  values (v_professional, 'professional', 'Master004 verification')
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
    'beauty-master004-' || substring(md5(v_professional) from 1 for 16),
    'olomouc',
    'Master004 Verify',
    'Olomouc centrum',
    '@master004_verify',
    'Horní náměstí 1, Olomouc',
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
  ) values (
    v_service,
    v_profile,
    'master004-service',
    'Master004 service',
    jsonb_build_object('en', 'Master004 service'),
    60,
    1200,
    15,
    'CZK',
    true,
    0,
    false
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
      v_future_booking,
      v_profile,
      v_service,
      v_client,
      'confirmed',
      v_future_start,
      v_future_start + interval '60 minutes',
      v_future_start + interval '75 minutes',
      'Master004 Client',
      '@master004_client',
      jsonb_build_object('en', 'Master004 service'),
      60,
      15,
      1200,
      'CZK',
      'Olomouc centrum',
      'Horní náměstí 1, Olomouc',
      'master004-future-' || v_suffix
    ),
    (
      v_completed_booking,
      v_profile,
      v_service,
      v_client,
      'confirmed',
      v_past_start,
      v_past_start + interval '60 minutes',
      v_past_start + interval '75 minutes',
      'Master004 Client',
      '@master004_client',
      jsonb_build_object('en', 'Master004 service'),
      60,
      15,
      1200,
      'CZK',
      'Olomouc centrum',
      'Horní náměstí 1, Olomouc',
      'master004-completed-' || v_suffix
    ),
    (
      v_no_show_booking,
      v_profile,
      v_service,
      v_client,
      'confirmed',
      v_past_start - interval '2 hours',
      v_past_start - interval '1 hour',
      v_past_start - interval '45 minutes',
      'Master004 Client',
      '@master004_client',
      jsonb_build_object('en', 'Master004 service'),
      60,
      15,
      1200,
      'CZK',
      'Olomouc centrum',
      'Horní náměstí 1, Olomouc',
      'master004-no-show-' || v_suffix
    );

  select updated_at into v_future_updated_at from public.beauty_bookings where id = v_future_booking;
  select updated_at into v_completed_updated_at from public.beauty_bookings where id = v_completed_booking;
  select updated_at into v_no_show_updated_at from public.beauty_bookings where id = v_no_show_booking;

  insert into master004_verify_context (
    professional_user_key,
    profile_id,
    service_id,
    future_booking_id,
    future_updated_at,
    completed_booking_id,
    completed_updated_at,
    no_show_booking_id,
    no_show_updated_at
  ) values (
    v_professional,
    v_profile,
    v_service,
    v_future_booking,
    v_future_updated_at,
    v_completed_booking,
    v_completed_updated_at,
    v_no_show_booking,
    v_no_show_updated_at
  );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'authenticated',
    'go_irl_user_key', (select professional_user_key from master004_verify_context)
  )::text,
  true
);

insert into master004_verify_results (label, result, booking_id, booking_status, updated_at)
select 'future_completed', result, booking_id, booking_status, updated_at
from public.go_irl_transition_beauty_booking(
  (select future_booking_id from master004_verify_context),
  'confirmed',
  (select future_updated_at from master004_verify_context),
  'completed'
);

insert into master004_verify_results (label, result, booking_id, booking_status, updated_at)
select 'future_no_show', result, booking_id, booking_status, updated_at
from public.go_irl_transition_beauty_booking(
  (select future_booking_id from master004_verify_context),
  'confirmed',
  (select future_updated_at from master004_verify_context),
  'no_show'
);

insert into master004_verify_results (label, result, booking_id, booking_status, updated_at)
select 'future_cancelled', result, booking_id, booking_status, updated_at
from public.go_irl_transition_beauty_booking(
  (select future_booking_id from master004_verify_context),
  'confirmed',
  (select future_updated_at from master004_verify_context),
  'cancelled'
);

insert into master004_verify_results (label, result, booking_id, booking_status, updated_at)
select 'past_completed', result, booking_id, booking_status, updated_at
from public.go_irl_transition_beauty_booking(
  (select completed_booking_id from master004_verify_context),
  'confirmed',
  (select completed_updated_at from master004_verify_context),
  'completed'
);

insert into master004_verify_results (label, result, booking_id, booking_status, updated_at)
select 'past_no_show', result, booking_id, booking_status, updated_at
from public.go_irl_transition_beauty_booking(
  (select no_show_booking_id from master004_verify_context),
  'confirmed',
  (select no_show_updated_at from master004_verify_context),
  'no_show'
);

reset role;

do $$
declare
  v_result master004_verify_results%rowtype;
  v_rejected_event_count integer;
  v_changed_event_count integer;
begin
  select * into v_result from master004_verify_results where label = 'future_completed';
  if v_result.result <> 'invalid_transition' or v_result.booking_status <> 'confirmed' then
    raise exception 'future completed transition was not rejected';
  end if;

  select * into v_result from master004_verify_results where label = 'future_no_show';
  if v_result.result <> 'invalid_transition' or v_result.booking_status <> 'confirmed' then
    raise exception 'future no_show transition was not rejected';
  end if;

  select * into v_result from master004_verify_results where label = 'future_cancelled';
  if v_result.result <> 'changed' or v_result.booking_status <> 'cancelled' then
    raise exception 'future cancellation behavior regressed';
  end if;

  select * into v_result from master004_verify_results where label = 'past_completed';
  if v_result.result <> 'changed' or v_result.booking_status <> 'completed' then
    raise exception 'post-service completed transition failed';
  end if;

  select * into v_result from master004_verify_results where label = 'past_no_show';
  if v_result.result <> 'changed' or v_result.booking_status <> 'no_show' then
    raise exception 'post-service no_show transition failed';
  end if;

  select count(*) into v_rejected_event_count
  from public.beauty_booking_events
  where booking_id = (select future_booking_id from master004_verify_context)
    and to_status in ('completed', 'no_show');

  if v_rejected_event_count <> 0 then
    raise exception 'rejected early lifecycle transitions created audit events';
  end if;

  select count(*) into v_changed_event_count
  from public.beauty_booking_events
  where booking_id in (
    (select future_booking_id from master004_verify_context),
    (select completed_booking_id from master004_verify_context),
    (select no_show_booking_id from master004_verify_context)
  );

  if v_changed_event_count <> 3 then
    raise exception 'expected exactly three changed transition events, found %', v_changed_event_count;
  end if;
end;
$$;

rollback;
