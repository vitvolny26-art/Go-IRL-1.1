-- M1: additive multi-leg delivery foundation for future unified reminders.
-- No producer switch is included here. Existing event_notifications rows remain
-- on legacy_single_route and current workers keep their existing behavior.

begin;

alter table public.event_notifications
  add column if not exists delivery_mode text not null default 'legacy_single_route',
  add column if not exists subject_type text,
  add column if not exists subject_id uuid,
  add column if not exists reminder_offset_minutes smallint,
  add column if not exists scheduled_for timestamptz,
  add column if not exists logical_intent_key text;

alter table public.event_notifications
  drop constraint if exists event_notifications_delivery_mode_check,
  drop constraint if exists event_notifications_multi_leg_shape_check;

alter table public.event_notifications
  add constraint event_notifications_delivery_mode_check
  check (delivery_mode in ('legacy_single_route','multi_leg')),
  add constraint event_notifications_multi_leg_shape_check
  check (
    delivery_mode = 'legacy_single_route'
    or (
      subject_type in ('activity','booking')
      and subject_id is not null
      and reminder_offset_minutes in (15,180)
      and scheduled_for is not null
      and logical_intent_key is not null
      and btrim(logical_intent_key) <> ''
    )
  );

create unique index if not exists event_notifications_logical_intent_uidx
  on public.event_notifications(logical_intent_key)
  where logical_intent_key is not null;

create index if not exists event_notifications_multi_leg_subject_idx
  on public.event_notifications(user_key, subject_type, subject_id, scheduled_for)
  where delivery_mode = 'multi_leg';

create table if not exists public.notification_delivery_legs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.event_notifications(id) on delete cascade,
  route_id uuid not null references public.communication_routes(id) on delete restrict,
  leg_type text not null check (leg_type in ('in_app','external')),
  channel text not null check (channel in ('in_app','email','telegram','messenger','instagram','whatsapp')),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','sending','sent','failed','cancelled')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 20),
  next_attempt_at timestamptz,
  leased_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error_code text,
  leg_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_delivery_legs_one_in_app_uidx
  on public.notification_delivery_legs(notification_id)
  where leg_type = 'in_app';

create unique index if not exists notification_delivery_legs_one_active_external_uidx
  on public.notification_delivery_legs(notification_id)
  where leg_type = 'external' and status in ('scheduled','sending','failed');

create index if not exists notification_delivery_legs_due_idx
  on public.notification_delivery_legs(coalesce(next_attempt_at, scheduled_for), id)
  where status in ('scheduled','failed');

create index if not exists notification_delivery_legs_sending_lease_idx
  on public.notification_delivery_legs(leased_at, id)
  where status = 'sending';

create index if not exists notification_delivery_legs_notification_idx
  on public.notification_delivery_legs(notification_id, created_at);

alter table public.notification_delivery_legs enable row level security;

drop policy if exists "notification delivery legs own read" on public.notification_delivery_legs;
create policy "notification delivery legs own read"
on public.notification_delivery_legs
for select to authenticated
using (
  exists (
    select 1
    from public.event_notifications notification
    where notification.id = notification_delivery_legs.notification_id
      and notification.user_key = (select public.go_irl_auth_user_key())
  )
);

grant select on public.notification_delivery_legs to authenticated;
revoke insert, update, delete on public.notification_delivery_legs from anon, authenticated;

create or replace function public.go_irl_validate_notification_delivery_leg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_key text;
  v_delivery_mode text;
  v_parent_scheduled_for timestamptz;
  v_route public.communication_routes%rowtype;
begin
  select notification.user_key, notification.delivery_mode, notification.scheduled_for
  into v_user_key, v_delivery_mode, v_parent_scheduled_for
  from public.event_notifications notification
  where notification.id = new.notification_id;

  if not found then raise exception 'notification_not_found'; end if;
  if v_delivery_mode <> 'multi_leg' then raise exception 'multi_leg_notification_required'; end if;
  if new.scheduled_for is distinct from v_parent_scheduled_for then raise exception 'delivery_leg_schedule_mismatch'; end if;

  select route.* into v_route
  from public.communication_routes route
  where route.id = new.route_id;

  if not found then raise exception 'communication_route_not_found'; end if;
  if v_route.user_key <> v_user_key then raise exception 'delivery_leg_route_owner_mismatch'; end if;
  if v_route.channel <> new.channel then raise exception 'delivery_leg_channel_mismatch'; end if;
  if new.leg_type = 'in_app' and new.channel <> 'in_app' then raise exception 'in_app_route_required'; end if;
  if new.leg_type = 'external' and new.channel = 'in_app' then raise exception 'external_route_required'; end if;
  if v_route.readiness <> 'ready'
     or v_route.consent_state <> 'granted'
     or v_route.health_state not in ('unknown','healthy')
     or not (v_route.capabilities @> array['outbound','notification']::text[])
  then raise exception 'communication_route_not_executable'; end if;

  return new;
end;
$$;

revoke execute on function public.go_irl_validate_notification_delivery_leg()
from public, anon, authenticated;

drop trigger if exists notification_delivery_legs_validate on public.notification_delivery_legs;
create trigger notification_delivery_legs_validate
before insert or update of notification_id, route_id, leg_type, channel, scheduled_for
on public.notification_delivery_legs
for each row execute function public.go_irl_validate_notification_delivery_leg();

create or replace function public.go_irl_claim_notification_delivery_legs(
  p_channels text[],
  p_limit integer default 50,
  p_lease_seconds integer default 300
)
returns table (
  leg_id uuid,
  notification_id uuid,
  user_key text,
  activity_id uuid,
  kind text,
  payload jsonb,
  attempt_count smallint,
  route_id uuid,
  provider text,
  provider_user_id text,
  recipient_last_inbound_at timestamptz,
  language_code text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 200 then raise exception 'invalid_claim_limit'; end if;
  if p_lease_seconds < 30 or p_lease_seconds > 1800 then raise exception 'invalid_lease_seconds'; end if;
  if p_channels is null
     or cardinality(p_channels) = 0
     or (p_channels <@ array['telegram','whatsapp','instagram','messenger']::text[]) is not true
  then raise exception 'invalid_channels'; end if;

  return query
  with due as (
    select leg.id,
           notification.id as notification_id,
           route.id as route_id,
           route.channel as provider,
           identity.provider_user_id,
           identity.last_inbound_at,
           app_user.language_code
    from public.notification_delivery_legs leg
    join public.event_notifications notification
      on notification.id = leg.notification_id
     and notification.delivery_mode = 'multi_leg'
    join public.communication_routes route
      on route.id = leg.route_id
     and route.user_key = notification.user_key
     and route.channel = leg.channel
    join public.user_provider_identities identity
      on identity.id = route.provider_identity_id
     and identity.user_key = notification.user_key
     and identity.status = 'active'
    left join public.app_users app_user
      on app_user.user_key = notification.user_key
    where leg.leg_type = 'external'
      and leg.channel = any(p_channels)
      and route.readiness = 'ready'
      and route.consent_state = 'granted'
      and route.health_state in ('unknown','healthy')
      and route.capabilities @> array['outbound','notification']::text[]
      and (
        (leg.status = 'scheduled' and coalesce(leg.next_attempt_at, leg.scheduled_for) <= now())
        or (leg.status = 'failed' and leg.next_attempt_at is not null and leg.next_attempt_at <= now())
        or (leg.status = 'sending' and leg.leased_at <= now() - make_interval(secs => p_lease_seconds))
      )
    order by coalesce(leg.next_attempt_at, leg.scheduled_for), leg.id
    for update of leg skip locked
    limit p_limit
  ), claimed as (
    update public.notification_delivery_legs leg
    set status = 'sending',
        attempt_count = leg.attempt_count + 1,
        leased_at = now(),
        last_error_code = null,
        updated_at = now()
    from due
    where leg.id = due.id
    returning leg.*
  )
  select claimed.id,
         due.notification_id,
         notification.user_key,
         notification.activity_id,
         notification.kind,
         notification.payload,
         claimed.attempt_count,
         due.route_id,
         due.provider,
         due.provider_user_id,
         due.last_inbound_at,
         due.language_code
  from claimed
  join due on due.id = claimed.id
  join public.event_notifications notification on notification.id = due.notification_id;
end;
$$;

revoke all on function public.go_irl_claim_notification_delivery_legs(text[],integer,integer)
from public, anon, authenticated;
grant execute on function public.go_irl_claim_notification_delivery_legs(text[],integer,integer)
to service_role;

create or replace function public.go_irl_finish_notification_delivery_leg(
  p_leg_id uuid,
  p_outcome text,
  p_error_code text default null,
  p_retry_at timestamptz default null,
  p_provider_message_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leg public.notification_delivery_legs%rowtype;
  v_user_key text;
begin
  if p_outcome not in ('sent','retry','failed','cancelled') then raise exception 'invalid_delivery_leg_outcome'; end if;
  if p_outcome = 'retry' and p_retry_at is null then raise exception 'retry_time_required'; end if;

  update public.notification_delivery_legs leg
  set status = case when p_outcome = 'retry' then 'failed' else p_outcome end,
      next_attempt_at = case when p_outcome = 'retry' then p_retry_at else null end,
      leased_at = null,
      sent_at = case when p_outcome = 'sent' then now() else leg.sent_at end,
      provider_message_id = coalesce(p_provider_message_id, leg.provider_message_id),
      last_error_code = case when p_outcome in ('retry','failed','cancelled')
        then left(coalesce(p_error_code, 'unknown'), 80) else null end,
      updated_at = now()
  where leg.id = p_leg_id and leg.status = 'sending'
  returning leg.* into v_leg;

  if not found then raise exception 'delivery_leg_not_claimed'; end if;

  select notification.user_key into v_user_key
  from public.event_notifications notification
  where notification.id = v_leg.notification_id;

  insert into public.communication_delivery_audit(
    user_key, intent_key, selected_route_id, adapter, attempt_number, result, sanitized_code
  ) values (
    v_user_key,
    v_leg.leg_key,
    v_leg.route_id,
    v_leg.channel,
    v_leg.attempt_count,
    case when p_outcome = 'retry' then 'retry' else p_outcome end,
    case when p_outcome in ('retry','failed','cancelled') then left(coalesce(p_error_code, 'unknown'), 80) else null end
  ) on conflict (intent_key, attempt_number) do nothing;
end;
$$;

revoke all on function public.go_irl_finish_notification_delivery_leg(uuid,text,text,timestamptz,text)
from public, anon, authenticated;
grant execute on function public.go_irl_finish_notification_delivery_leg(uuid,text,text,timestamptz,text)
to service_role;

-- Preserve the current POSTEVENT001/generic routing behavior while preventing
-- the legacy single-row worker from consuming future multi-leg intents.
create or replace function public.go_irl_claim_event_notifications(
  p_providers text[],
  p_limit integer default 50,
  p_lease_seconds integer default 300
)
returns table (
  id uuid,
  user_key text,
  activity_id uuid,
  kind text,
  payload jsonb,
  attempt_count smallint,
  provider text,
  provider_user_id text,
  recipient_last_inbound_at timestamptz,
  language_code text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 200 then raise exception 'invalid_claim_limit'; end if;
  if p_lease_seconds < 30 or p_lease_seconds > 1800 then raise exception 'invalid_lease_seconds'; end if;
  if p_providers is null
     or cardinality(p_providers) = 0
     or (p_providers <@ array['telegram','whatsapp','instagram','messenger']::text[]) is not true
  then raise exception 'invalid_providers'; end if;

  update public.event_notifications notification
  set status = 'sent', sent_at = now(), provider = null, routing_outcome = 'in_app',
      selected_route_id = in_app_route.id, resolved_at = now(), last_error_code = null, updated_at = now()
  from public.communication_routes in_app_route
  where notification.delivery_mode = 'legacy_single_route'
    and notification.user_key = in_app_route.user_key
    and notification.kind in ('post_event.organizer_confirmation','post_event.participant_confirmation')
    and notification.status in ('scheduled','failed')
    and coalesce(notification.next_attempt_at, notification.created_at) <= now()
    and in_app_route.channel = 'in_app'
    and in_app_route.readiness = 'ready'
    and in_app_route.consent_state = 'granted'
    and in_app_route.health_state in ('unknown','healthy')
    and in_app_route.capabilities @> array['outbound','notification']::text[]
    and not (
      'telegram' = any(p_providers)
      and exists (
        select 1 from public.communication_routes telegram_route
        join public.user_provider_identities identity
          on identity.id = telegram_route.provider_identity_id
         and identity.user_key = notification.user_key
         and identity.provider = 'telegram'
         and identity.status = 'active'
        where telegram_route.user_key = notification.user_key
          and telegram_route.channel = 'telegram'
          and telegram_route.readiness = 'ready'
          and telegram_route.consent_state = 'granted'
          and telegram_route.health_state in ('unknown','healthy')
          and telegram_route.capabilities @> array['outbound','notification']::text[]
      )
    );

  update public.event_notifications notification
  set status = 'sent', sent_at = now(), routing_outcome = 'in_app', selected_route_id = route.id,
      resolved_at = now(), updated_at = now()
  from public.communication_preferences preference
  join public.communication_routes route on route.id = preference.primary_route_id
  where notification.delivery_mode = 'legacy_single_route'
    and notification.user_key = preference.user_key
    and notification.kind not in ('post_event.organizer_confirmation','post_event.participant_confirmation')
    and notification.status = 'scheduled'
    and coalesce(notification.next_attempt_at, notification.created_at) <= now()
    and preference.state = 'configured'
    and route.channel = 'in_app'
    and route.readiness = 'ready'
    and route.consent_state = 'granted'
    and route.capabilities @> array['outbound','notification']::text[];

  update public.event_notifications notification
  set routing_outcome = 'needs_attention', last_error_code = 'postevent_route_unavailable',
      resolved_at = now(), updated_at = now()
  where notification.delivery_mode = 'legacy_single_route'
    and notification.kind in ('post_event.organizer_confirmation','post_event.participant_confirmation')
    and notification.status = 'scheduled'
    and coalesce(notification.next_attempt_at, notification.created_at) <= now()
    and not (
      'telegram' = any(p_providers)
      and exists (
        select 1 from public.communication_routes telegram_route
        join public.user_provider_identities identity
          on identity.id = telegram_route.provider_identity_id
         and identity.user_key = notification.user_key
         and identity.provider = 'telegram'
         and identity.status = 'active'
        where telegram_route.user_key = notification.user_key
          and telegram_route.channel = 'telegram'
          and telegram_route.readiness = 'ready'
          and telegram_route.consent_state = 'granted'
          and telegram_route.health_state in ('unknown','healthy')
          and telegram_route.capabilities @> array['outbound','notification']::text[]
      )
    )
    and not exists (
      select 1 from public.communication_routes in_app_route
      where in_app_route.user_key = notification.user_key
        and in_app_route.channel = 'in_app'
        and in_app_route.readiness = 'ready'
        and in_app_route.consent_state = 'granted'
        and in_app_route.health_state in ('unknown','healthy')
        and in_app_route.capabilities @> array['outbound','notification']::text[]
    );

  update public.event_notifications notification
  set routing_outcome = (
        select resolution.outcome from public.go_irl_resolve_communication_route(notification.user_key, notification.communication_kind) resolution
      ),
      last_error_code = (
        select left(coalesce(resolution.reason, resolution.outcome), 80)
        from public.go_irl_resolve_communication_route(notification.user_key, notification.communication_kind) resolution
      ),
      resolved_at = now(), updated_at = now()
  where notification.delivery_mode = 'legacy_single_route'
    and notification.kind not in ('post_event.organizer_confirmation','post_event.participant_confirmation')
    and notification.status = 'scheduled'
    and coalesce(notification.next_attempt_at, notification.created_at) <= now()
    and (
      select resolution.outcome from public.go_irl_resolve_communication_route(notification.user_key, notification.communication_kind) resolution
    ) <> 'executable';

  return query
  with due as (
    select notification.id, telegram_route.id as route_id, telegram_route.channel as provider,
           identity.provider_user_id, identity.last_inbound_at, app_user.language_code
    from public.event_notifications notification
    join public.communication_routes telegram_route
      on telegram_route.user_key = notification.user_key and telegram_route.channel = 'telegram'
    join public.user_provider_identities identity
      on identity.id = telegram_route.provider_identity_id
     and identity.user_key = notification.user_key and identity.provider = 'telegram' and identity.status = 'active'
    left join public.app_users app_user on app_user.user_key = notification.user_key
    where notification.delivery_mode = 'legacy_single_route'
      and notification.kind in ('post_event.organizer_confirmation','post_event.participant_confirmation')
      and 'telegram' = any(p_providers)
      and telegram_route.readiness = 'ready'
      and telegram_route.consent_state = 'granted'
      and telegram_route.health_state in ('unknown','healthy')
      and telegram_route.capabilities @> array['outbound','notification']::text[]
      and (
        (notification.status = 'scheduled' and coalesce(notification.next_attempt_at, notification.created_at) <= now())
        or (notification.status = 'failed' and notification.next_attempt_at is not null and notification.next_attempt_at <= now())
        or (notification.status = 'sending' and notification.leased_at <= now() - make_interval(secs => p_lease_seconds))
      )

    union all

    select notification.id, route.id as route_id, route.channel as provider,
           identity.provider_user_id, identity.last_inbound_at, app_user.language_code
    from public.event_notifications notification
    join public.communication_preferences preference
      on preference.user_key = notification.user_key and preference.state = 'configured'
    join public.communication_routes route
      on route.id = preference.primary_route_id and route.user_key = notification.user_key
    join public.user_provider_identities identity
      on identity.id = route.provider_identity_id and identity.user_key = notification.user_key and identity.status = 'active'
    left join public.app_users app_user on app_user.user_key = notification.user_key
    where notification.delivery_mode = 'legacy_single_route'
      and notification.kind not in ('post_event.organizer_confirmation','post_event.participant_confirmation')
      and route.channel = any(p_providers)
      and route.readiness = 'ready'
      and route.consent_state = 'granted'
      and route.health_state in ('unknown','healthy')
      and route.capabilities @> array['outbound','notification']::text[]
      and (
        (notification.status = 'scheduled' and coalesce(notification.next_attempt_at, notification.created_at) <= now())
        or (notification.status = 'failed' and notification.next_attempt_at is not null and notification.next_attempt_at <= now())
        or (notification.status = 'sending' and notification.leased_at <= now() - make_interval(secs => p_lease_seconds))
      )
  ), locked_due as (
    select notification.id, due.route_id, due.provider, due.provider_user_id, due.last_inbound_at, due.language_code
    from public.event_notifications notification
    join due on due.id = notification.id
    order by coalesce(notification.next_attempt_at, notification.created_at), notification.id
    for update of notification skip locked
    limit p_limit
  ), claimed as (
    update public.event_notifications notification
    set status = 'sending', attempt_count = notification.attempt_count + 1, leased_at = now(),
        provider = locked_due.provider, selected_route_id = locked_due.route_id, routing_outcome = 'executable',
        resolved_at = now(), last_error_code = null, updated_at = now()
    from locked_due where notification.id = locked_due.id returning notification.*
  )
  select claimed.id, claimed.user_key, claimed.activity_id, claimed.kind, claimed.payload,
         claimed.attempt_count, locked_due.provider, locked_due.provider_user_id,
         locked_due.last_inbound_at, locked_due.language_code
  from claimed join locked_due on locked_due.id = claimed.id;
end;
$$;

revoke all on function public.go_irl_claim_event_notifications(text[],integer,integer)
from public, anon, authenticated;
grant execute on function public.go_irl_claim_event_notifications(text[],integer,integer)
to service_role;

notify pgrst, 'reload schema';
commit;
