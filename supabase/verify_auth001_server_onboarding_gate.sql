-- AUTH001 server-side onboarding gate verification.
-- Run only in a disposable/test database after the AUTH001 migration.
-- All fixture data is rolled back.

begin;

insert into public.app_users (
  auth_provider,
  provider_user_id,
  user_key,
  telegram_id,
  first_name,
  status
) values
  ('telegram', 'auth001-verify-a', 'telegram:991100001', 991100001, 'AUTH001 A', 'active'),
  ('telegram', 'auth001-verify-organizer', 'telegram:991100002', 991100002, 'AUTH001 Organizer', 'active');

-- Seed public/owned activities outside authenticated user context so the verifier can
-- distinguish read access, ownership ACLs and the onboarding DELETE gate.
insert into public.activities (
  category_id,
  activity_ru,
  activity_cs,
  title_ru,
  title_cs,
  description_ru,
  description_cs,
  event_date,
  event_time,
  address,
  price,
  capacity,
  organizer,
  organizer_key,
  visibility
) values
  (
    'activities', 'AUTH001 seed', 'AUTH001 seed', 'AUTH001 seed', 'AUTH001 seed',
    '', '', current_date + 7, '18:00', 'Olomouc', 0, 8,
    'AUTH001 Organizer', 'telegram:991100002', 'public'
  ),
  (
    'activities', 'AUTH001 owned seed', 'AUTH001 owned seed',
    'AUTH001 owned seed', 'AUTH001 owned seed',
    '', '', current_date + 7, '19:00', 'Olomouc', 0, 8,
    'AUTH001 User', 'telegram:991100001', 'public'
  );

insert into public.user_provider_identities (
  user_key,
  provider,
  provider_user_id,
  status
) values (
  'telegram:991100001',
  'telegram',
  '991100001',
  'active'
);

-- Seed a deterministic published Beauty slot outside authenticated user context.
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
  '11111111-1111-4111-8111-111111111111',
  'telegram:991100002',
  'beauty-aaaaaaaaaaaaaaaa',
  'olomouc',
  'AUTH001 Beauty',
  'Olomouc centre',
  'auth001@example.test',
  'AUTH001 test address',
  'published'
);

insert into public.beauty_professional_services (
  id,
  profile_id,
  service_name,
  duration_minutes,
  price_czk,
  currency,
  active,
  service_name_i18n,
  client_key,
  buffer_minutes,
  sort_order,
  archived
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'AUTH001 Service',
  60,
  900,
  'CZK',
  true,
  '{"en":"AUTH001 Service"}'::jsonb,
  'auth001-service',
  0,
  0,
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
  '11111111-1111-4111-8111-111111111111',
  1,
  '09:00',
  '18:00',
  'Europe/Prague',
  30,
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","go_irl_user_key":"telegram:991100001"}',
  true
);

-- Public/read-only surface must remain available before onboarding. The onboarding
-- predicate itself must stay private and not create a public RPC surface.
do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible
  from public.activities
  where title_ru = 'AUTH001 seed';

  if v_visible <> 1 then
    raise exception 'public activity view was blocked before onboarding';
  end if;

  if to_regprocedure('public.go_irl_has_completed_first_onboarding()') is not null then
    raise exception 'public onboarding predicate RPC is exposed';
  end if;

  if go_irl_private.has_completed_first_onboarding(public.go_irl_auth_user_key()) then
    raise exception 'incomplete user reported as onboarded';
  end if;
end;
$$;

-- Profile bootstrap is a deliberate exception because FirstOnboardingGate saves it
-- before complete_my_first_onboarding().
select public.save_my_profile(
  'AUTH001 User',
  '',
  'olomouc',
  null,
  null,
  true,
  true,
  array[]::text[]
);

-- Protected product writes must fail server-side before onboarding, including a
-- SECURITY DEFINER Beauty booking RPC that would otherwise bypass RLS.
do $$
declare
  v_seed_activity uuid;
  v_beauty_result text;
  v_beauty_slot timestamptz := (
    date_trunc('week', now() at time zone 'Europe/Prague') + interval '14 days 10 hours'
  ) at time zone 'Europe/Prague';
begin
  select id into v_seed_activity
  from public.activities
  where title_ru = 'AUTH001 seed'
  limit 1;

  begin
    insert into public.activities (
      category_id, activity_ru, activity_cs, title_ru, title_cs,
      description_ru, description_cs, event_date, event_time, address,
      price, capacity, organizer, organizer_key, visibility
    ) values (
      'activities', 'blocked', 'blocked', 'blocked', 'blocked', '', '',
      current_date + 8, '18:00', 'Olomouc', 0, 4,
      'AUTH001 User', 'telegram:991100001', 'public'
    );
    raise exception 'activity create bypassed onboarding gate';
  exception when sqlstate '42501' then null;
  end;

  begin
    insert into public.activity_members (
      activity_id, user_key, display_name, status
    ) values (
      v_seed_activity, 'telegram:991100001', 'AUTH001 User', 'joined'
    );
    raise exception 'activity join bypassed onboarding gate';
  exception when sqlstate '42501' then null;
  end;

  begin
    insert into public.coach_profiles (user_key, display_name)
    values ('telegram:991100001', 'AUTH001 User');
    raise exception 'coach profile create bypassed onboarding gate';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.go_irl_upsert_event_reminder(v_seed_activity, 'telegram', 60::smallint);
    raise exception 'reminder upsert bypassed onboarding gate';
  exception when sqlstate '42501' then null;
  end;

  begin
    select result into v_beauty_result
    from public.go_irl_create_beauty_booking(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      v_beauty_slot,
      'AUTH001 Client',
      'auth001-client@example.test',
      'auth001-beauty-verify'
    );
    raise exception 'Beauty booking RPC bypassed onboarding gate with result %', v_beauty_result;
  exception when sqlstate '42501' then null;
  end;
end;
$$;

-- An owned row must not be deletable before onboarding. DELETE RLS rejection is a
-- zero-row mutation rather than an exception, so verify the row is still present.
delete from public.activities
where title_ru = 'AUTH001 owned seed'
  and organizer_key = 'telegram:991100001';

do $$
begin
  if not exists (
    select 1
    from public.activities
    where title_ru = 'AUTH001 owned seed'
      and organizer_key = 'telegram:991100001'
  ) then
    raise exception 'activity delete bypassed onboarding gate';
  end if;
end;
$$;

-- All configured product tables that exist in this schema must carry the boundary trigger.
do $$
declare
  v_table text;
  v_missing text[] := '{}'::text[];
begin
  foreach v_table in array array[
    'activities',
    'activity_members',
    'activity_chats',
    'activity_chat_messages',
    'activity_external_telegram_chats',
    'coach_profiles',
    'coach_requests',
    'coach_reviews',
    'event_reminders',
    'beauty_professional_profiles',
    'beauty_professional_services',
    'beauty_availability_rules',
    'beauty_time_blocks',
    'beauty_bookings',
    'beauty_booking_waitlist_entries',
    'beauty_share_cards'
  ]
  loop
    if to_regclass('public.' || v_table) is not null
       and not exists (
         select 1
         from pg_trigger trigger_row
         where trigger_row.tgrelid = to_regclass('public.' || v_table)
           and trigger_row.tgname = 'auth001_require_onboarding_write'
           and not trigger_row.tgisinternal
       ) then
      v_missing := array_append(v_missing, v_table);
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    raise exception 'AUTH001 trigger missing on: %', array_to_string(v_missing, ', ');
  end if;
end;
$$;

-- DELETE and Beauty Storage mutation policies must call the private predicate.
do $$
declare
  v_expected integer := 8;
  v_found integer;
  v_bad integer;
begin
  select count(*), count(*) filter (
    where (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
      not like '%go_irl_private.has_completed_first_onboarding%'
  )
  into v_found, v_bad
  from pg_policies
  where (schemaname, tablename, policyname) in (
    ('public', 'activities', 'organizer or admin activities delete'),
    ('public', 'activity_members', 'public members delete'),
    ('public', 'event_reminders', 'event reminders own delete'),
    ('public', 'activity_external_telegram_chats', 'external telegram chats delete organizer'),
    ('public', 'beauty_share_cards', 'beauty share cards owner delete'),
    ('storage', 'objects', 'beauty share objects owner insert'),
    ('storage', 'objects', 'beauty share objects owner update'),
    ('storage', 'objects', 'beauty share objects owner delete')
  );

  if v_found <> v_expected then
    raise exception 'AUTH001 policy coverage mismatch: expected %, found %', v_expected, v_found;
  end if;

  if v_bad <> 0 then
    raise exception 'AUTH001 policy uses non-private onboarding predicate';
  end if;
end;
$$;

select public.complete_my_first_onboarding(
  'auth001_user',
  true,
  '2026-07-29',
  '2026-07-14'
);

do $$
begin
  if not go_irl_private.has_completed_first_onboarding(public.go_irl_auth_user_key()) then
    raise exception 'completed user still reported as gated';
  end if;
end;
$$;

-- Same representative product writes must now succeed under their existing ACLs.
do $$
declare
  v_seed_activity uuid;
  v_created_activity uuid;
  v_beauty_result text;
  v_beauty_booking_id uuid;
  v_beauty_slot timestamptz := (
    date_trunc('week', now() at time zone 'Europe/Prague') + interval '14 days 10 hours'
  ) at time zone 'Europe/Prague';
begin
  select id into v_seed_activity
  from public.activities
  where title_ru = 'AUTH001 seed'
  limit 1;

  insert into public.activities (
    category_id, activity_ru, activity_cs, title_ru, title_cs,
    description_ru, description_cs, event_date, event_time, address,
    price, capacity, organizer, organizer_key, visibility
  ) values (
    'activities', 'allowed', 'allowed', 'allowed', 'allowed', '', '',
    current_date + 8, '18:00', 'Olomouc', 0, 4,
    'AUTH001 User', 'telegram:991100001', 'public'
  ) returning id into v_created_activity;

  insert into public.activity_members (
    activity_id, user_key, display_name, status
  ) values (
    v_seed_activity, 'telegram:991100001', 'AUTH001 User', 'joined'
  );

  insert into public.coach_profiles (user_key, display_name)
  values ('telegram:991100001', 'AUTH001 User');

  perform public.go_irl_upsert_event_reminder(v_seed_activity, 'telegram', 60::smallint);

  select result, booking_id
  into v_beauty_result, v_beauty_booking_id
  from public.go_irl_create_beauty_booking(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    v_beauty_slot,
    'AUTH001 Client',
    'auth001-client@example.test',
    'auth001-beauty-verify'
  );

  if v_beauty_result <> 'created' or v_beauty_booking_id is null then
    raise exception 'Beauty booking did not pass after onboarding: %', v_beauty_result;
  end if;

  delete from public.activity_members
  where activity_id = v_seed_activity
    and user_key = 'telegram:991100001';

  delete from public.activities
  where title_ru = 'AUTH001 owned seed'
    and organizer_key = 'telegram:991100001';

  if not found then
    raise exception 'owned activity delete remained gated after onboarding';
  end if;

  delete from public.activities
  where id = v_created_activity;
end;
$$;

rollback;
