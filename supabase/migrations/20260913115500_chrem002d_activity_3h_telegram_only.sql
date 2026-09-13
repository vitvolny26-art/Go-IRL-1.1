begin;

-- ChRem002D corrective migration.
-- General communication preference remains auth-derived/editable.
-- Activity reminders are a separate product contract and must deliver through Telegram only.

-- Remove only the incorrect in-app Activity reminder rows introduced by the prior ChRem002D migration.
delete from public.event_reminders
where provider = 'in_app';

alter table public.event_reminders drop constraint if exists event_reminders_provider_check;
alter table public.event_reminders
  add constraint event_reminders_provider_check
  check (provider in ('telegram','whatsapp','instagram','messenger'));

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
  if p_provider not in ('telegram','whatsapp','instagram','messenger') then raise exception 'unsupported_reminder_provider'; end if;
  if p_lead_minutes not in (15,60,180,1440) then raise exception 'unsupported_reminder_lead'; end if;

  select activity.* into v_activity
  from public.activities activity
  where activity.id = p_activity_id
    and private.go_irl_can_read_activity(activity.id, activity.visibility, activity.organizer_key);
  if not found then raise exception 'event_not_found_or_not_allowed'; end if;

  if not exists (
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

  update public.user_provider_identities
  set consented_at = coalesce(consented_at, now()), updated_at = now()
  where user_key = v_user_key and provider = p_provider;

  insert into public.event_reminders (
    user_key, activity_id, provider, lead_minutes, event_starts_at, scheduled_for,
    status, attempt_count, next_attempt_at, leased_at, sent_at, last_error_code,
    delivery_key, selected_route_id, routing_outcome, resolved_at, updated_at
  ) values (
    v_user_key, p_activity_id, p_provider, p_lead_minutes, v_event_starts_at, v_scheduled_for,
    'scheduled', 0, null, null, null, null,
    'reminder:' || v_user_key || ':' || p_activity_id::text || ':' || p_provider || ':' || p_lead_minutes::text,
    null, null, null, now()
  )
  on conflict (user_key, activity_id, provider, lead_minutes) do update
  set event_starts_at = excluded.event_starts_at,
      scheduled_for = excluded.scheduled_for,
      status = 'scheduled', attempt_count = 0, next_attempt_at = null,
      leased_at = null, sent_at = null, last_error_code = null,
      delivery_key = excluded.delivery_key, selected_route_id = null,
      routing_outcome = null, resolved_at = null, updated_at = now()
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
  if p_provider not in ('telegram','whatsapp','instagram','messenger') then raise exception 'unsupported_reminder_provider'; end if;
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

-- Activity reminder delivery follows the reminder's explicit provider, not the user's
-- general communication primary route. This keeps Activity T-3h Telegram-only while
-- leaving the general communication router unchanged for other notification kinds.
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
  if coalesce(cardinality(p_providers),0) < 1
     or not (p_providers <@ array['telegram','whatsapp','instagram','messenger']::text[])
  then raise exception 'invalid_claim_providers'; end if;

  update public.event_reminders reminder
  set routing_outcome = 'needs_attention',
      last_error_code = 'provider_route_unavailable',
      resolved_at = now(),
      updated_at = now()
  where reminder.provider = any(p_providers)
    and reminder.status in ('scheduled','failed')
    and coalesce(reminder.next_attempt_at, reminder.scheduled_for) <= now()
    and not exists (
      select 1
      from public.communication_routes route
      join public.user_provider_identities identity
        on identity.id = route.provider_identity_id
       and identity.user_key = reminder.user_key
       and identity.status = 'active'
      where route.user_key = reminder.user_key
        and route.channel = reminder.provider
        and route.readiness = 'ready'
        and route.consent_state = 'granted'
        and route.health_state in ('unknown','healthy')
        and route.capabilities @> array['outbound','notification']::text[]
    );

  return query
  with due as (
    select reminder.id, route.id as route_id
    from public.event_reminders reminder
    join public.communication_routes route
      on route.user_key = reminder.user_key
     and route.channel = reminder.provider
    join public.user_provider_identities identity
      on identity.id = route.provider_identity_id
     and identity.user_key = reminder.user_key
     and identity.status = 'active'
    where reminder.provider = any(p_providers)
      and route.readiness = 'ready'
      and route.consent_state = 'granted'
      and route.health_state in ('unknown','healthy')
      and route.capabilities @> array['outbound','notification']::text[]
      and (
        (reminder.status in ('scheduled','failed') and coalesce(reminder.next_attempt_at, reminder.scheduled_for) <= now())
        or (reminder.status = 'sending' and reminder.leased_at <= now() - make_interval(secs => p_lease_seconds))
      )
    order by coalesce(reminder.next_attempt_at, reminder.scheduled_for), reminder.id
    for update of reminder skip locked
    limit p_limit
  )
  update public.event_reminders reminder
  set status = 'sending',
      attempt_count = reminder.attempt_count + 1,
      leased_at = now(),
      selected_route_id = due.route_id,
      routing_outcome = 'executable',
      resolved_at = now(),
      last_error_code = null,
      updated_at = now()
  from due
  where reminder.id = due.id
  returning reminder.*;
end;
$$;

revoke all on function public.go_irl_claim_due_event_reminders(integer,integer,text[]) from public, anon, authenticated;
grant execute on function public.go_irl_claim_due_event_reminders(integer,integer,text[]) to service_role;

create or replace function public.go_irl_sync_activity_join_notification_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity public.activities%rowtype;
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

  if tg_op = 'UPDATE' and old.status = 'joined' then return new; end if;

  select * into v_activity from public.activities where id = new.activity_id;
  if not found or v_activity.organizer_key = new.user_key then return new; end if;

  -- General notification default is still seeded from auth independently.
  perform public.go_irl_seed_notification_preference(new.user_key);

  -- Activity reminder is mandatory-Telegram: never silently fall back to in-app or another provider.
  if not exists (
    select 1 from public.user_provider_identities identity
    where identity.user_key = new.user_key
      and identity.provider = 'telegram'
      and identity.status = 'active'
  ) then return new; end if;

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
    delivery_key, selected_route_id, routing_outcome, resolved_at, updated_at
  ) values (
    new.user_key, new.activity_id, 'telegram', 180, v_event_starts_at, v_scheduled_for,
    'scheduled', 0, null, null, null, null,
    'reminder:' || new.user_key || ':' || new.activity_id::text || ':telegram:180',
    null, null, null, now()
  )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.go_irl_sync_activity_join_notification_defaults() from public, anon, authenticated;

-- Backfill only joined future participants who have Telegram linked and no explicit reminder.
with candidates as (
  select member.user_key,
         member.activity_id,
         make_timestamptz(
           extract(year from activity.event_date)::integer,
           extract(month from activity.event_date)::integer,
           extract(day from activity.event_date)::integer,
           extract(hour from activity.event_time)::integer,
           extract(minute from activity.event_time)::integer,
           0,
           'Europe/Prague'
         ) as event_starts_at
  from public.activity_members member
  join public.activities activity on activity.id = member.activity_id
  where member.status = 'joined'
    and activity.organizer_key <> member.user_key
    and exists (
      select 1 from public.user_provider_identities identity
      where identity.user_key = member.user_key
        and identity.provider = 'telegram'
        and identity.status = 'active'
    )
    and not exists (
      select 1 from public.event_reminders reminder
      where reminder.user_key = member.user_key
        and reminder.activity_id = member.activity_id
    )
), eligible as (
  select *, event_starts_at - interval '3 hours' as scheduled_for
  from candidates
  where event_starts_at - interval '3 hours' > now()
)
insert into public.event_reminders (
  user_key, activity_id, provider, lead_minutes, event_starts_at, scheduled_for,
  status, attempt_count, next_attempt_at, leased_at, sent_at, last_error_code,
  delivery_key, selected_route_id, routing_outcome, resolved_at, updated_at
)
select user_key, activity_id, 'telegram', 180, event_starts_at, scheduled_for,
       'scheduled', 0, null, null, null, null,
       'reminder:' || user_key || ':' || activity_id::text || ':telegram:180',
       null, null, null, now()
from eligible
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
