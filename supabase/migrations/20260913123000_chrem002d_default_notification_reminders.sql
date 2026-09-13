begin;

-- ChRem002D
-- 1) Default notification route is derived from the trusted auth surface:
--    Telegram auth -> Telegram, web/provider auth -> GO IRL in-app.
-- 2) A real Activity participant membership enables T-3h by default.
-- 3) Confirmed Beauty/Master bookings keep the existing T-24h + T-3h scheduler,
--    but receive the same auth-derived communication default.
-- 4) Explicit Settings choices remain authoritative and are never overwritten.

alter table public.communication_preferences
  add column if not exists selection_source text not null default 'system_default';

alter table public.communication_preference_history
  add column if not exists selection_source text not null default 'system_default';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.communication_preferences'::regclass
      and conname = 'communication_preferences_selection_source_check'
  ) then
    alter table public.communication_preferences
      add constraint communication_preferences_selection_source_check
      check (selection_source in ('system_default','first_join','settings'));
  end if;
end $$;

create or replace function public.go_irl_get_communication_settings()
returns table(
  route_id uuid,
  channel text,
  provider_identity_id uuid,
  readiness text,
  capabilities text[],
  consent_state text,
  health_state text,
  identity_observed_at timestamptz,
  readiness_checked_at timestamptz,
  preference_state text,
  primary_route_id uuid,
  fallback_route_ids uuid[],
  preference_updated_at timestamptz,
  preference_selection_source text
)
language sql
stable
security definer
set search_path = ''
as $$
  select route.id, route.channel, route.provider_identity_id, route.readiness,
    route.capabilities, route.consent_state, route.health_state,
    route.identity_observed_at, route.readiness_checked_at,
    preference.state, preference.primary_route_id, preference.fallback_route_ids,
    preference.updated_at, preference.selection_source
  from public.communication_preferences preference
  left join public.communication_routes route on route.user_key = preference.user_key
  where preference.user_key = public.go_irl_auth_user_key()
  order by case route.channel when 'in_app' then 0 when 'email' then 1 when 'telegram' then 2 else 3 end, route.id;
$$;

revoke all on function public.go_irl_get_communication_settings() from public, anon;
grant execute on function public.go_irl_get_communication_settings() to authenticated;

create or replace function public.go_irl_set_communication_preference(
  p_state text,
  p_primary_route_id uuid,
  p_selection_source text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_current public.communication_preferences%rowtype;
  v_route public.communication_routes%rowtype;
  v_action text;
begin
  if v_user_key is null then raise exception 'authentication_required'; end if;
  if p_state not in ('unconfigured','configured') then raise exception 'invalid_preference_state'; end if;
  if (p_state = 'configured') <> (p_primary_route_id is not null) then raise exception 'invalid_preference_route'; end if;
  if p_selection_source not in ('first_join','settings') then raise exception 'invalid_preference_selection_source'; end if;

  if p_primary_route_id is not null then
    select * into v_route
    from public.communication_routes route
    where route.id = p_primary_route_id and route.user_key = v_user_key;

    if not found then raise exception 'communication_route_not_owned'; end if;

    if not (
      (
        v_route.readiness = 'ready'
        and v_route.consent_state = 'granted'
        and v_route.health_state in ('unknown','healthy')
        and v_route.capabilities @> array['outbound','notification']::text[]
      )
      or (
        v_route.channel = 'telegram'
        and v_route.readiness not in ('disabled','revoked')
        and v_route.consent_state not in ('denied','revoked')
      )
    ) then
      raise exception 'communication_route_not_selectable';
    end if;
  end if;

  select * into v_current
  from public.communication_preferences
  where user_key = v_user_key
  for update;

  if found
     and v_current.state = p_state
     and v_current.primary_route_id is not distinct from p_primary_route_id
     and v_current.selection_source = p_selection_source
  then
    return 'unchanged';
  end if;

  v_action := case
    when p_state = 'unconfigured' then 'unconfigured'
    when found then 'changed'
    else 'created'
  end;

  insert into public.communication_preferences(
    user_key, state, primary_route_id, fallback_route_ids, version, selection_source
  )
  values (
    v_user_key, p_state, p_primary_route_id, '{}'::uuid[], 1, p_selection_source
  )
  on conflict (user_key) do update
  set state = excluded.state,
      primary_route_id = excluded.primary_route_id,
      fallback_route_ids = '{}'::uuid[],
      version = public.communication_preferences.version + 1,
      selection_source = excluded.selection_source,
      updated_at = now();

  insert into public.communication_preference_history(
    user_key, state, primary_route_id, fallback_route_ids, action, selection_source
  )
  values (
    v_user_key, p_state, p_primary_route_id, '{}'::uuid[], v_action, p_selection_source
  );

  return 'saved';
end;
$$;

create or replace function public.go_irl_set_communication_preference(
  p_state text,
  p_primary_route_id uuid default null
)
returns text
language sql
security definer
set search_path = ''
as $$
  select public.go_irl_set_communication_preference(p_state, p_primary_route_id, 'settings');
$$;

revoke all on function public.go_irl_set_communication_preference(text,uuid,text) from public, anon;
revoke all on function public.go_irl_set_communication_preference(text,uuid) from public, anon;
grant execute on function public.go_irl_set_communication_preference(text,uuid,text) to authenticated;
grant execute on function public.go_irl_set_communication_preference(text,uuid) to authenticated;

-- Server-only idempotent default seeding. Manual settings (selection_source=settings)
-- and historical explicit first-join choices are never overwritten.
create or replace function public.go_irl_seed_notification_preference(p_user_key text)
returns table(route_id uuid, channel text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_provider text;
  v_preference public.communication_preferences%rowtype;
  v_route public.communication_routes%rowtype;
  v_action text;
begin
  if p_user_key is null or btrim(p_user_key) = '' then
    return;
  end if;

  select * into v_preference
  from public.communication_preferences
  where user_key = p_user_key
  for update;

  if found
     and v_preference.state = 'configured'
     and v_preference.primary_route_id is not null
     and v_preference.selection_source in ('first_join','settings')
  then
    select * into v_route
    from public.communication_routes
    where id = v_preference.primary_route_id and user_key = p_user_key;
    if found then
      return query select v_route.id, v_route.channel;
      return;
    end if;
  end if;

  select auth_provider into v_auth_provider
  from public.app_users
  where user_key = p_user_key and status = 'active';

  if not found then return; end if;

  -- Current trusted auth has two delivery-safe defaults:
  -- Telegram trusted auth -> Telegram; provider/web auth -> in-app.
  -- A system default may be recomputed; explicit first_join/settings choices above may not.
  select * into v_route
  from public.communication_routes route
  where route.user_key = p_user_key
    and route.channel = case when v_auth_provider = 'telegram' then 'telegram' else 'in_app' end
    and (
      (
        route.channel = 'telegram'
        and route.readiness not in ('disabled','revoked')
        and route.consent_state not in ('denied','revoked')
      )
      or (
        route.channel = 'in_app'
        and route.readiness = 'ready'
        and route.consent_state = 'granted'
        and route.health_state in ('unknown','healthy')
        and route.capabilities @> array['outbound','notification']::text[]
      )
    )
  order by route.id
  limit 1;

  if not found then
    select * into v_route
    from public.communication_routes route
    where route.user_key = p_user_key
      and route.channel = 'in_app'
      and route.readiness = 'ready'
      and route.consent_state = 'granted'
      and route.health_state in ('unknown','healthy')
      and route.capabilities @> array['outbound','notification']::text[]
    order by route.id
    limit 1;
  end if;

  if not found then return; end if;

  if v_preference.user_key is not null
     and v_preference.state = 'configured'
     and v_preference.primary_route_id = v_route.id
     and v_preference.selection_source = 'system_default'
  then
    return query select v_route.id, v_route.channel;
    return;
  end if;

  v_action := case when v_preference.user_key is null then 'created' else 'changed' end;

  insert into public.communication_preferences(
    user_key, state, primary_route_id, fallback_route_ids, version, selection_source
  ) values (
    p_user_key, 'configured', v_route.id, '{}'::uuid[], 1, 'system_default'
  )
  on conflict (user_key) do update
  set state = 'configured',
      primary_route_id = excluded.primary_route_id,
      fallback_route_ids = '{}'::uuid[],
      version = public.communication_preferences.version + 1,
      selection_source = 'system_default',
      updated_at = now();

  insert into public.communication_preference_history(
    user_key, state, primary_route_id, fallback_route_ids, action, selection_source
  ) values (
    p_user_key, 'configured', v_route.id, '{}'::uuid[], v_action, 'system_default'
  );

  return query select v_route.id, v_route.channel;
end;
$$;

revoke all on function public.go_irl_seed_notification_preference(text) from public, anon, authenticated;
grant execute on function public.go_irl_seed_notification_preference(text) to service_role;

-- Event reminders now accept GO IRL in-app as the stored seed route. The actual
-- external route is still resolved from communication_preferences at claim time.
alter table public.event_reminders drop constraint if exists event_reminders_provider_check;
alter table public.event_reminders
  add constraint event_reminders_provider_check
  check (provider in ('in_app','telegram','whatsapp','instagram','messenger'));

create or replace function public.go_irl_upsert_event_reminder(
  p_activity_id uuid,
  p_provider text,
  p_lead_minutes smallint
)
returns public.event_reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_activity public.activities%rowtype;
  v_event_starts_at timestamptz;
  v_scheduled_for timestamptz;
  v_result public.event_reminders%rowtype;
begin
  if v_user_key is null then raise exception 'authentication_required'; end if;
  if p_provider not in ('in_app','telegram','whatsapp','instagram','messenger') then raise exception 'unsupported_reminder_provider'; end if;
  if p_lead_minutes not in (15,60,180,1440) then raise exception 'unsupported_reminder_lead'; end if;

  select activity.* into v_activity
  from public.activities activity
  where activity.id = p_activity_id
    and private.go_irl_can_read_activity(activity.id, activity.visibility, activity.organizer_key);
  if not found then raise exception 'event_not_found_or_not_allowed'; end if;

  if p_provider <> 'in_app' and not exists (
    select 1 from public.user_provider_identities identity
    where identity.user_key = v_user_key
      and identity.provider = p_provider
      and identity.status = 'active'
  ) then raise exception 'provider_not_linked'; end if;

  v_event_starts_at := make_timestamptz(
    extract(year from v_activity.event_date)::integer,
    extract(month from v_activity.event_date)::integer,
    extract(day from v_activity.event_date)::integer,
    extract(hour from v_activity.event_time)::integer,
    extract(minute from v_activity.event_time)::integer,
    0,
    'Europe/Prague'
  );
  v_scheduled_for := v_event_starts_at - make_interval(mins => p_lead_minutes);
  if v_scheduled_for <= now() then raise exception 'reminder_time_passed'; end if;

  if p_provider <> 'in_app' then
    update public.user_provider_identities
    set consented_at = coalesce(consented_at, now()), updated_at = now()
    where user_key = v_user_key and provider = p_provider;
  end if;

  insert into public.event_reminders (
    user_key, activity_id, provider, lead_minutes, event_starts_at, scheduled_for,
    status, attempt_count, next_attempt_at, leased_at, sent_at, last_error_code,
    delivery_key, updated_at
  ) values (
    v_user_key, p_activity_id, p_provider, p_lead_minutes, v_event_starts_at, v_scheduled_for,
    'scheduled', 0, null, null, null, null,
    'reminder:' || v_user_key || ':' || p_activity_id::text || ':' || p_provider || ':' || p_lead_minutes::text,
    now()
  )
  on conflict (user_key, activity_id, provider, lead_minutes) do update
  set event_starts_at = excluded.event_starts_at,
      scheduled_for = excluded.scheduled_for,
      status = 'scheduled', attempt_count = 0, next_attempt_at = null,
      leased_at = null, sent_at = null, last_error_code = null,
      delivery_key = excluded.delivery_key, updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.go_irl_replace_event_reminders(
  p_activity_id uuid,
  p_provider text,
  p_lead_minutes smallint[]
)
returns setof public.event_reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_lead smallint;
begin
  if v_user_key is null then raise exception 'authentication_required'; end if;
  if p_provider not in ('in_app','telegram','whatsapp','instagram','messenger') then raise exception 'unsupported_reminder_provider'; end if;
  if p_lead_minutes is null or cardinality(p_lead_minutes) = 0 then raise exception 'reminder_lead_required'; end if;
  if exists (select 1 from unnest(p_lead_minutes) lead where lead not in (15,60,180,1440)) then raise exception 'unsupported_reminder_lead'; end if;

  delete from public.event_reminders
  where user_key = v_user_key and activity_id = p_activity_id;

  foreach v_lead in array (select array_agg(distinct lead order by lead) from unnest(p_lead_minutes) lead)
  loop
    return next public.go_irl_upsert_event_reminder(p_activity_id, p_provider, v_lead);
  end loop;
  return;
end;
$$;

-- In-app reminders require no provider worker. When due, resolve the current
-- primary route and mark the reminder sent/in-app. External routes continue to
-- be leased to the existing worker exactly as before.
create or replace function public.go_irl_claim_due_event_reminders(
  p_limit integer,
  p_lease_seconds integer,
  p_providers text[]
)
returns setof public.event_reminders
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 200 then raise exception 'invalid_claim_limit'; end if;
  if p_lease_seconds < 30 or p_lease_seconds > 1800 then raise exception 'invalid_lease_seconds'; end if;
  if coalesce(cardinality(p_providers),0) < 1 or not (p_providers <@ array['telegram','whatsapp','instagram','messenger']::text[]) then raise exception 'invalid_claim_providers'; end if;

  update public.event_reminders reminder
  set status = 'sent',
      sent_at = now(),
      next_attempt_at = null,
      leased_at = null,
      provider = 'in_app',
      selected_route_id = route.id,
      routing_outcome = 'executable',
      resolved_at = now(),
      last_error_code = null,
      updated_at = now()
  from public.communication_preferences preference
  join public.communication_routes route
    on route.id = preference.primary_route_id
   and route.user_key = preference.user_key
  where reminder.user_key = preference.user_key
    and preference.state = 'configured'
    and route.channel = 'in_app'
    and route.readiness = 'ready'
    and route.consent_state = 'granted'
    and route.health_state in ('unknown','healthy')
    and route.capabilities @> array['outbound','notification']::text[]
    and (
      (reminder.status in ('scheduled','failed') and coalesce(reminder.next_attempt_at,reminder.scheduled_for) <= now())
      or (reminder.status = 'sending' and reminder.leased_at <= now() - make_interval(secs => p_lease_seconds))
    );

  update public.event_reminders reminder set
    routing_outcome = (select resolution.outcome from public.go_irl_resolve_communication_route(reminder.user_key,'reminder') resolution),
    last_error_code = (select left(coalesce(resolution.reason,resolution.outcome),80) from public.go_irl_resolve_communication_route(reminder.user_key,'reminder') resolution),
    resolved_at = now(), updated_at = now()
  where reminder.status in ('scheduled','failed') and coalesce(reminder.next_attempt_at,reminder.scheduled_for) <= now()
    and (select resolution.outcome from public.go_irl_resolve_communication_route(reminder.user_key,'reminder') resolution) <> 'executable';

  return query with due as (
    select reminder.id, route.id route_id, route.channel
    from public.event_reminders reminder
    join public.communication_preferences preference on preference.user_key = reminder.user_key and preference.state = 'configured'
    join public.communication_routes route on route.id = preference.primary_route_id and route.user_key = reminder.user_key
    join public.user_provider_identities identity on identity.id = route.provider_identity_id and identity.user_key = reminder.user_key and identity.status = 'active'
    where route.channel = any(p_providers) and route.readiness = 'ready' and route.consent_state = 'granted'
      and route.health_state in ('unknown','healthy') and route.capabilities @> array['outbound','notification']::text[]
      and ((reminder.status in ('scheduled','failed') and coalesce(reminder.next_attempt_at,reminder.scheduled_for) <= now())
        or (reminder.status = 'sending' and reminder.leased_at <= now() - make_interval(secs => p_lease_seconds)))
    order by coalesce(reminder.next_attempt_at,reminder.scheduled_for),reminder.id
    for update of reminder skip locked limit p_limit
  )
  update public.event_reminders reminder set status = 'sending', attempt_count = reminder.attempt_count + 1,
    leased_at = now(), provider = due.channel, selected_route_id = due.route_id,
    routing_outcome = 'executable', resolved_at = now(), last_error_code = null, updated_at = now()
  from due where reminder.id = due.id returning reminder.*;
end;
$$;

-- Durable Activity membership is the single trigger point for defaults, so a
-- Telegram supergroup Join button and an in-app Join behave the same.
create or replace function public.go_irl_sync_activity_join_notification_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity public.activities%rowtype;
  v_route record;
  v_event_starts_at timestamptz;
  v_scheduled_for timestamptz;
begin
  if tg_op = 'DELETE' then
    delete from public.event_reminders
    where user_key = old.user_key and activity_id = old.activity_id;
    return old;
  end if;

  if new.status <> 'joined' then
    if tg_op = 'UPDATE' and old.status = 'joined' then
      delete from public.event_reminders
      where user_key = new.user_key and activity_id = new.activity_id;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'joined' then
    return new;
  end if;

  select * into v_activity from public.activities where id = new.activity_id;
  if not found or v_activity.organizer_key = new.user_key then return new; end if;

  select * into v_route
  from public.go_irl_seed_notification_preference(new.user_key)
  limit 1;
  if not found then return new; end if;

  -- Never overwrite an explicit per-Activity reminder choice.
  if exists (
    select 1 from public.event_reminders
    where user_key = new.user_key and activity_id = new.activity_id
  ) then return new; end if;

  v_event_starts_at := make_timestamptz(
    extract(year from v_activity.event_date)::integer,
    extract(month from v_activity.event_date)::integer,
    extract(day from v_activity.event_date)::integer,
    extract(hour from v_activity.event_time)::integer,
    extract(minute from v_activity.event_time)::integer,
    0,
    'Europe/Prague'
  );
  v_scheduled_for := v_event_starts_at - interval '3 hours';
  if v_scheduled_for <= now() then return new; end if;

  insert into public.event_reminders (
    user_key, activity_id, provider, lead_minutes, event_starts_at, scheduled_for,
    status, attempt_count, next_attempt_at, leased_at, sent_at, last_error_code,
    delivery_key, updated_at
  ) values (
    new.user_key, new.activity_id, v_route.channel, 180, v_event_starts_at, v_scheduled_for,
    'scheduled', 0, null, null, null, null,
    'reminder:' || new.user_key || ':' || new.activity_id::text || ':' || v_route.channel || ':180',
    now()
  )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.go_irl_sync_activity_join_notification_defaults() from public, anon, authenticated;

drop trigger if exists chrem002d_activity_join_notification_defaults on public.activity_members;
create trigger chrem002d_activity_join_notification_defaults
after insert or delete or update of status on public.activity_members
for each row execute function public.go_irl_sync_activity_join_notification_defaults();

-- Reuse the existing Beauty/Master canonical 24h + 3h outbox. The only change
-- is to seed the same auth-derived communication default before those reminders
-- are enqueued. No second notification queue/worker is introduced.
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
  if new.event_type = 'notification_enqueued' then
    return new;
  end if;

  select booking.* into v_booking
  from public.beauty_bookings booking
  where booking.id = new.booking_id;

  if not found then return new; end if;

  update public.event_notifications notification
  set status = 'cancelled', next_attempt_at = null, leased_at = null,
      updated_at = now(), last_error_code = 'beauty_booking_reminder_stale'
  where notification.payload ->> 'bookingId' = v_booking.id::text
    and notification.kind in ('services.booking_reminder_24h','services.booking_reminder_3h')
    and notification.status in ('scheduled','failed')
    and (
      v_booking.status <> 'confirmed'
      or notification.payload ->> 'scheduledStartsAt' is distinct from v_booking.starts_at::text
    );

  if v_booking.status <> 'confirmed' or v_booking.starts_at <= now() then return new; end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.id = v_booking.profile_id;

  if not found or v_booking.client_user_key is null then return new; end if;

  perform public.go_irl_seed_notification_preference(v_booking.client_user_key);

  foreach v_offset in array array['24h','3h']
  loop
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
        'subjectType','beauty_booking',
        'bookingId',v_booking.id,
        'profileId',v_booking.profile_id,
        'serviceId',v_booking.service_id,
        'title',v_booking.service_name_snapshot,
        'date',to_char(v_booking.starts_at at time zone 'Europe/Prague','YYYY-MM-DD'),
        'time',to_char(v_booking.starts_at at time zone 'Europe/Prague','HH24:MI:SS'),
        'address',v_booking.public_location_snapshot,
        'counterpartName',v_profile.display_name,
        'bookingStatus',v_booking.status,
        'scheduledStartsAt',v_booking.starts_at::text,
        'reminderOffset',v_offset,
        'sourceEventId',new.id,
        'openPath','/services'
      ),
      'scheduled', v_due_at, 'telegram', v_delivery_key
    ) on conflict (delivery_key) do nothing;
  end loop;

  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
