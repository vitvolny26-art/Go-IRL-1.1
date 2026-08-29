-- GROOMING018 A-I: canonical-user communication preferences and explicit route resolution.
-- Provider destinations remain in user_provider_identities and are only returned to service_role.

begin;

create table public.communication_routes (
  id uuid primary key default gen_random_uuid(),
  user_key text not null references public.app_users(user_key) on delete cascade,
  channel text not null check (channel in ('in_app','email','telegram','messenger','instagram','whatsapp')),
  provider_identity_id uuid references public.user_provider_identities(id) on delete set null,
  readiness text not null default 'identity_only' check (readiness in ('identity_only','candidate','ready','disabled','revoked')),
  capabilities text[] not null default '{}'::text[] check (capabilities <@ array['contact','inbound','outbound','notification']::text[]),
  consent_state text not null default 'unknown' check (consent_state in ('unknown','granted','denied','revoked')),
  health_state text not null default 'unknown' check (health_state in ('unknown','healthy','degraded','unhealthy')),
  identity_observed_at timestamptz,
  readiness_checked_at timestamptz,
  health_checked_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_route_provider_identity_check check (
    (channel = 'in_app' and provider_identity_id is null)
    or (channel <> 'in_app' and provider_identity_id is not null)
  )
);

create unique index communication_routes_in_app_user_uidx on public.communication_routes(user_key) where channel = 'in_app';
create unique index communication_routes_identity_uidx on public.communication_routes(provider_identity_id) where provider_identity_id is not null;
create index communication_routes_user_idx on public.communication_routes(user_key, channel, readiness);

create table public.communication_preferences (
  user_key text primary key references public.app_users(user_key) on delete cascade,
  state text not null default 'unconfigured' check (state in ('unconfigured','configured')),
  primary_route_id uuid references public.communication_routes(id) on delete set null,
  fallback_route_ids uuid[] not null default '{}'::uuid[],
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_preference_state_check check (
    (state = 'unconfigured' and primary_route_id is null)
    or (state = 'configured' and primary_route_id is not null)
  )
);

create table public.communication_preference_history (
  id uuid primary key default gen_random_uuid(),
  user_key text not null references public.app_users(user_key) on delete cascade,
  state text not null,
  primary_route_id uuid,
  fallback_route_ids uuid[] not null default '{}'::uuid[],
  action text not null check (action in ('created','changed','unconfigured')),
  occurred_at timestamptz not null default now()
);
create index communication_preference_history_user_idx on public.communication_preference_history(user_key, occurred_at desc);

create table public.communication_route_history (
  id uuid primary key default gen_random_uuid(),
  user_key text not null references public.app_users(user_key) on delete cascade,
  route_id uuid references public.communication_routes(id) on delete set null,
  action text not null check (action in ('verified','disabled','revoked','health_changed','recovered')),
  readiness text not null,
  consent_state text not null,
  health_state text not null,
  occurred_at timestamptz not null default now()
);
create index communication_route_history_user_idx on public.communication_route_history(user_key, occurred_at desc);

create table public.communication_delivery_audit (
  id uuid primary key default gen_random_uuid(),
  user_key text not null references public.app_users(user_key) on delete cascade,
  intent_key text not null,
  selected_route_id uuid references public.communication_routes(id) on delete set null,
  adapter text,
  attempt_number smallint not null,
  result text not null check (result in ('sent','retry','failed','cancelled','no_route','needs_attention')),
  sanitized_code text,
  occurred_at timestamptz not null default now(),
  unique(intent_key, attempt_number)
);
create index communication_delivery_audit_user_idx on public.communication_delivery_audit(user_key, occurred_at desc);

alter table public.event_notifications
  add column if not exists communication_kind text not null default 'notification',
  add column if not exists selected_route_id uuid references public.communication_routes(id) on delete set null,
  add column if not exists routing_outcome text check (routing_outcome in ('executable','in_app','no_route','needs_attention')),
  add column if not exists resolved_at timestamptz;

alter table public.event_reminders
  add column if not exists selected_route_id uuid references public.communication_routes(id) on delete set null,
  add column if not exists routing_outcome text check (routing_outcome in ('executable','no_route','needs_attention')),
  add column if not exists resolved_at timestamptz;

alter table public.communication_routes enable row level security;
alter table public.communication_preferences enable row level security;
alter table public.communication_preference_history enable row level security;
alter table public.communication_route_history enable row level security;
alter table public.communication_delivery_audit enable row level security;

create policy "communication routes own read" on public.communication_routes for select to authenticated
using (user_key = (select public.go_irl_auth_user_key()));
create policy "communication preferences own read" on public.communication_preferences for select to authenticated
using (user_key = (select public.go_irl_auth_user_key()));
create policy "communication preference history own read" on public.communication_preference_history for select to authenticated
using (user_key = (select public.go_irl_auth_user_key()));
create policy "communication route history own read" on public.communication_route_history for select to authenticated
using (user_key = (select public.go_irl_auth_user_key()));
create policy "communication delivery audit own read" on public.communication_delivery_audit for select to authenticated
using (user_key = (select public.go_irl_auth_user_key()));

grant select on public.communication_routes, public.communication_preferences, public.communication_preference_history, public.communication_route_history, public.communication_delivery_audit to authenticated;
revoke insert, update, delete on public.communication_routes, public.communication_preferences, public.communication_preference_history, public.communication_route_history, public.communication_delivery_audit from anon, authenticated;

insert into public.communication_routes (
  user_key, channel, readiness, capabilities, consent_state, health_state,
  identity_observed_at, readiness_checked_at, health_checked_at
)
select user_key, 'in_app', 'ready', array['contact','inbound','outbound','notification'], 'granted', 'healthy', now(), now(), now()
from public.app_users
on conflict do nothing;

-- Linked identities are evidence only. Do not infer permission or outbound readiness.
insert into public.communication_routes (
  user_key, channel, provider_identity_id, readiness, capabilities, consent_state,
  health_state, identity_observed_at
)
select identity.user_key, identity.provider, identity.id,
  case when identity.status = 'revoked' then 'revoked' else 'candidate' end,
  case when identity.last_inbound_at is null then array['contact']::text[] else array['contact','inbound']::text[] end,
  case when identity.consented_at is null then 'unknown' else 'granted' end,
  'unknown', coalesce(identity.last_inbound_at, identity.created_at)
from public.user_provider_identities identity
on conflict do nothing;

insert into public.communication_preferences (user_key, state)
select user_key, 'unconfigured' from public.app_users on conflict (user_key) do nothing;

create or replace function public.go_irl_sync_communication_route()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.communication_routes (
    user_key, channel, provider_identity_id, readiness, capabilities, consent_state,
    health_state, identity_observed_at, updated_at
  ) values (
    new.user_key, new.provider, new.id,
    case when new.status = 'revoked' then 'revoked' else 'candidate' end,
    case when new.last_inbound_at is null then array['contact']::text[] else array['contact','inbound']::text[] end,
    case when new.consented_at is null then 'unknown' else 'granted' end,
    'unknown', coalesce(new.last_inbound_at, new.created_at), now()
  ) on conflict (provider_identity_id) where provider_identity_id is not null do update
  set user_key = excluded.user_key,
      readiness = case when excluded.readiness = 'revoked' then 'revoked' else public.communication_routes.readiness end,
      capabilities = public.communication_routes.capabilities || array['contact']::text[],
      consent_state = case when excluded.consent_state = 'granted' then 'granted' else public.communication_routes.consent_state end,
      identity_observed_at = excluded.identity_observed_at,
      updated_at = now();
  return new;
end;
$$;
revoke execute on function public.go_irl_sync_communication_route() from public, anon, authenticated;
create trigger user_provider_identities_sync_communication_route
after insert or update of status, consented_at, last_inbound_at on public.user_provider_identities
for each row execute function public.go_irl_sync_communication_route();

create or replace function public.go_irl_create_user_communication_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_route_id uuid;
begin
  insert into public.communication_routes (
    user_key, channel, readiness, capabilities, consent_state, health_state,
    identity_observed_at, readiness_checked_at, health_checked_at
  ) values (
    new.user_key, 'in_app', 'ready', array['contact','inbound','outbound','notification'],
    'granted', 'healthy', now(), now(), now()
  ) returning id into v_route_id;
  insert into public.communication_preferences(user_key, state) values (new.user_key, 'unconfigured');
  return new;
end;
$$;
revoke execute on function public.go_irl_create_user_communication_defaults() from public, anon, authenticated;
create trigger app_users_create_communication_defaults after insert on public.app_users
for each row execute function public.go_irl_create_user_communication_defaults();

create or replace function public.go_irl_get_communication_settings()
returns table (
  route_id uuid, channel text, provider_identity_id uuid, readiness text,
  capabilities text[], consent_state text, health_state text,
  identity_observed_at timestamptz, readiness_checked_at timestamptz,
  preference_state text, primary_route_id uuid, fallback_route_ids uuid[], preference_updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select route.id, route.channel, route.provider_identity_id, route.readiness,
    route.capabilities, route.consent_state, route.health_state,
    route.identity_observed_at, route.readiness_checked_at,
    preference.state, preference.primary_route_id, preference.fallback_route_ids, preference.updated_at
  from public.communication_preferences preference
  left join public.communication_routes route on route.user_key = preference.user_key
  where preference.user_key = public.go_irl_auth_user_key()
  order by case route.channel when 'in_app' then 0 when 'email' then 1 when 'telegram' then 2 else 3 end, route.id;
$$;
revoke all on function public.go_irl_get_communication_settings() from public, anon;
grant execute on function public.go_irl_get_communication_settings() to authenticated;

create or replace function public.go_irl_set_communication_preference(p_state text, p_primary_route_id uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_current public.communication_preferences%rowtype;
  v_action text;
begin
  if v_user_key is null then raise exception 'authentication_required'; end if;
  if p_state not in ('unconfigured','configured') then raise exception 'invalid_preference_state'; end if;
  if (p_state = 'configured') <> (p_primary_route_id is not null) then raise exception 'invalid_preference_route'; end if;
  if p_primary_route_id is not null and not exists (
    select 1 from public.communication_routes route
    where route.id = p_primary_route_id and route.user_key = v_user_key
      and route.readiness = 'ready' and route.consent_state = 'granted'
      and route.health_state in ('unknown','healthy')
      and route.capabilities @> array['outbound','notification']::text[]
  ) then raise exception 'communication_route_not_executable'; end if;

  select * into v_current from public.communication_preferences where user_key = v_user_key for update;
  if found and v_current.state = p_state and v_current.primary_route_id is not distinct from p_primary_route_id then return 'unchanged'; end if;
  v_action := case when p_state = 'unconfigured' then 'unconfigured' when found then 'changed' else 'created' end;
  insert into public.communication_preferences(user_key, state, primary_route_id, fallback_route_ids, version)
  values (v_user_key, p_state, p_primary_route_id, '{}'::uuid[], 1)
  on conflict (user_key) do update set state = excluded.state, primary_route_id = excluded.primary_route_id,
    fallback_route_ids = '{}'::uuid[], version = public.communication_preferences.version + 1, updated_at = now();
  insert into public.communication_preference_history(user_key, state, primary_route_id, fallback_route_ids, action)
  values (v_user_key, p_state, p_primary_route_id, '{}'::uuid[], v_action);
  return 'saved';
end;
$$;
revoke all on function public.go_irl_set_communication_preference(text,uuid) from public, anon;
grant execute on function public.go_irl_set_communication_preference(text,uuid) to authenticated;

create or replace function public.go_irl_update_communication_route(
  p_route_id uuid, p_readiness text, p_capabilities text[], p_consent_state text,
  p_health_state text, p_action text
)
returns text language plpgsql security definer set search_path = '' as $$
declare v_route public.communication_routes%rowtype;
begin
  if p_readiness not in ('identity_only','candidate','ready','disabled','revoked')
    or p_consent_state not in ('unknown','granted','denied','revoked')
    or p_health_state not in ('unknown','healthy','degraded','unhealthy')
    or p_action not in ('verified','disabled','revoked','health_changed','recovered')
    or not (p_capabilities <@ array['contact','inbound','outbound','notification']::text[])
  then raise exception 'invalid_communication_route_state'; end if;
  if p_readiness = 'ready' and (p_consent_state <> 'granted' or not (p_capabilities @> array['outbound','notification']::text[]))
  then raise exception 'ready_route_requires_permission_and_capability'; end if;
  update public.communication_routes set readiness = p_readiness, capabilities = p_capabilities,
    consent_state = p_consent_state, health_state = p_health_state,
    readiness_checked_at = now(), health_checked_at = now(),
    disabled_at = case when p_readiness in ('disabled','revoked') then now() else null end,
    updated_at = now() where id = p_route_id returning * into v_route;
  if not found then raise exception 'communication_route_not_found'; end if;
  insert into public.communication_route_history(user_key,route_id,action,readiness,consent_state,health_state)
  values(v_route.user_key,v_route.id,p_action,v_route.readiness,v_route.consent_state,v_route.health_state);
  return 'updated';
end;
$$;
revoke all on function public.go_irl_update_communication_route(uuid,text,text[],text,text,text) from public, anon, authenticated;
grant execute on function public.go_irl_update_communication_route(uuid,text,text[],text,text,text) to service_role;

create or replace function public.go_irl_resolve_communication_route(p_user_key text, p_communication_kind text)
returns table(outcome text, reason text, route_id uuid, channel text, provider_identity_id uuid, destination_ref text)
language plpgsql stable security definer set search_path = '' as $$
declare v_preference public.communication_preferences%rowtype; v_route public.communication_routes%rowtype; v_destination text;
begin
  if p_communication_kind is null or btrim(p_communication_kind) = '' then raise exception 'invalid_communication_kind'; end if;
  select * into v_preference from public.communication_preferences where user_key = p_user_key;
  if not found or v_preference.state = 'unconfigured' or v_preference.primary_route_id is null then
    return query select 'no_route','unconfigured',null::uuid,null::text,null::uuid,null::text; return;
  end if;
  select * into v_route from public.communication_routes where id = v_preference.primary_route_id and user_key = p_user_key;
  if not found then return query select 'no_route','route_missing',v_preference.primary_route_id,null::text,null::uuid,null::text; return; end if;
  if v_route.readiness in ('disabled','revoked') then return query select 'needs_attention','disabled_or_revoked',v_route.id,v_route.channel,v_route.provider_identity_id,null::text; return; end if;
  if v_route.readiness <> 'ready' then return query select 'needs_attention','destination_unavailable',v_route.id,v_route.channel,v_route.provider_identity_id,null::text; return; end if;
  if not (v_route.capabilities @> array['outbound','notification']::text[]) then return query select 'needs_attention','missing_capability',v_route.id,v_route.channel,v_route.provider_identity_id,null::text; return; end if;
  if v_route.consent_state <> 'granted' then return query select 'needs_attention','missing_consent',v_route.id,v_route.channel,v_route.provider_identity_id,null::text; return; end if;
  if v_route.health_state in ('degraded','unhealthy') then return query select 'needs_attention','stale_or_unhealthy',v_route.id,v_route.channel,v_route.provider_identity_id,null::text; return; end if;
  if v_route.channel = 'in_app' then v_destination := p_user_key;
  else select provider_user_id into v_destination from public.user_provider_identities where id = v_route.provider_identity_id and user_key = p_user_key and status = 'active'; end if;
  if v_destination is null then return query select 'needs_attention','destination_unavailable',v_route.id,v_route.channel,v_route.provider_identity_id,null::text; return; end if;
  return query select 'executable',null::text,v_route.id,v_route.channel,v_route.provider_identity_id,v_destination;
end;
$$;
revoke all on function public.go_irl_resolve_communication_route(text,text) from public, anon, authenticated;
grant execute on function public.go_irl_resolve_communication_route(text,text) to service_role;

-- Reminder timing remains unchanged; the stored provider is treated as legacy input
-- and is replaced at claim time by the user's explicit executable primary route.
create or replace function public.go_irl_claim_due_event_reminders(p_limit integer, p_lease_seconds integer, p_providers text[])
returns setof public.event_reminders language plpgsql security definer set search_path = '' as $$
begin
  if p_limit < 1 or p_limit > 200 then raise exception 'invalid_claim_limit'; end if;
  if p_lease_seconds < 30 or p_lease_seconds > 1800 then raise exception 'invalid_lease_seconds'; end if;
  if coalesce(cardinality(p_providers),0) < 1 or not (p_providers <@ array['telegram','whatsapp','instagram','messenger']::text[]) then raise exception 'invalid_claim_providers'; end if;

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
revoke all on function public.go_irl_claim_due_event_reminders(integer,integer,text[]) from public, anon, authenticated;
grant execute on function public.go_irl_claim_due_event_reminders(integer,integer,text[]) to service_role;

-- Replace inferred-provider selection with the explicit primary route.
create or replace function public.go_irl_claim_event_notifications(p_providers text[], p_limit integer default 50, p_lease_seconds integer default 300)
returns table (id uuid, user_key text, activity_id uuid, kind text, payload jsonb, attempt_count smallint, provider text, provider_user_id text, recipient_last_inbound_at timestamptz, language_code text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_limit < 1 or p_limit > 200 then raise exception 'invalid_claim_limit'; end if;
  if p_lease_seconds < 30 or p_lease_seconds > 1800 then raise exception 'invalid_lease_seconds'; end if;
  if p_providers is null or cardinality(p_providers) = 0 or (p_providers <@ array['telegram','whatsapp','instagram','messenger']::text[]) is not true then raise exception 'invalid_providers'; end if;

  update public.event_notifications notification set status = 'sent', sent_at = now(), routing_outcome = 'in_app',
    selected_route_id = route.id, resolved_at = now(), updated_at = now()
  from public.communication_preferences preference join public.communication_routes route on route.id = preference.primary_route_id
  where notification.user_key = preference.user_key and notification.status = 'scheduled'
    and coalesce(notification.next_attempt_at, notification.created_at) <= now()
    and preference.state = 'configured' and route.channel = 'in_app' and route.readiness = 'ready'
    and route.consent_state = 'granted' and route.capabilities @> array['outbound','notification']::text[];

  update public.event_notifications notification set
    routing_outcome = (select resolution.outcome from public.go_irl_resolve_communication_route(notification.user_key, notification.communication_kind) resolution),
    last_error_code = (select left(coalesce(resolution.reason,resolution.outcome),80) from public.go_irl_resolve_communication_route(notification.user_key, notification.communication_kind) resolution),
    resolved_at = now(), updated_at = now()
  where notification.status = 'scheduled' and coalesce(notification.next_attempt_at, notification.created_at) <= now()
    and (select resolution.outcome from public.go_irl_resolve_communication_route(notification.user_key, notification.communication_kind) resolution) <> 'executable';

  return query with due as (
    select notification.id, route.id route_id, route.channel provider, identity.provider_user_id,
      identity.last_inbound_at, app_user.language_code
    from public.event_notifications notification
    join public.communication_preferences preference on preference.user_key = notification.user_key and preference.state = 'configured'
    join public.communication_routes route on route.id = preference.primary_route_id and route.user_key = notification.user_key
    join public.user_provider_identities identity on identity.id = route.provider_identity_id and identity.user_key = notification.user_key and identity.status = 'active'
    left join public.app_users app_user on app_user.user_key = notification.user_key
    where route.channel = any(p_providers) and route.readiness = 'ready' and route.consent_state = 'granted'
      and route.health_state in ('unknown','healthy') and route.capabilities @> array['outbound','notification']::text[]
      and ((notification.status = 'scheduled' and coalesce(notification.next_attempt_at, notification.created_at) <= now())
        or (notification.status = 'failed' and notification.next_attempt_at is not null and notification.next_attempt_at <= now())
        or (notification.status = 'sending' and notification.leased_at <= now() - make_interval(secs => p_lease_seconds)))
    order by coalesce(notification.next_attempt_at, notification.created_at), notification.id
    for update of notification skip locked limit p_limit
  ), claimed as (
    update public.event_notifications notification set status = 'sending', attempt_count = notification.attempt_count + 1,
      leased_at = now(), provider = due.provider, selected_route_id = due.route_id, routing_outcome = 'executable', resolved_at = now(), updated_at = now()
    from due where notification.id = due.id returning notification.*
  )
  select claimed.id, claimed.user_key, claimed.activity_id, claimed.kind, claimed.payload, claimed.attempt_count,
    due.provider, due.provider_user_id, due.last_inbound_at, due.language_code from claimed join due on due.id = claimed.id;
end;
$$;
revoke all on function public.go_irl_claim_event_notifications(text[],integer,integer) from public, anon, authenticated;
grant execute on function public.go_irl_claim_event_notifications(text[],integer,integer) to service_role;

create or replace function public.go_irl_finish_event_notification(
  p_notification_id uuid, p_outcome text, p_error_code text default null,
  p_retry_at timestamptz default null, p_provider_message_id text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_notification public.event_notifications%rowtype;
begin
  if p_outcome not in ('sent','retry','failed','cancelled') then raise exception 'invalid_notification_outcome'; end if;
  if p_outcome = 'retry' and p_retry_at is null then raise exception 'retry_time_required'; end if;
  select * into v_notification from public.event_notifications where id = p_notification_id and status = 'sending' for update;
  if not found then raise exception 'notification_not_claimed'; end if;

  update public.event_notifications set status = case when p_outcome = 'retry' then 'failed' else p_outcome end,
    next_attempt_at = case when p_outcome = 'retry' then p_retry_at else null end,
    leased_at = null, sent_at = case when p_outcome = 'sent' then now() else sent_at end,
    last_error_code = case when p_outcome in ('retry','failed','cancelled') then left(coalesce(p_error_code,'unknown'),80) else null end,
    provider_message_id = coalesce(p_provider_message_id,provider_message_id), updated_at = now()
  where id = p_notification_id;

  insert into public.communication_delivery_audit(
    user_key,intent_key,selected_route_id,adapter,attempt_number,result,sanitized_code
  ) values (
    v_notification.user_key,v_notification.delivery_key,v_notification.selected_route_id,v_notification.provider,
    v_notification.attempt_count,p_outcome,left(p_error_code,80)
  ) on conflict (intent_key,attempt_number) do update set result = excluded.result,
    sanitized_code = excluded.sanitized_code, occurred_at = now();

  if v_notification.selected_route_id is not null then
    update public.communication_routes set
      health_state = case when p_outcome = 'sent' then 'healthy' when p_outcome in ('failed','cancelled') then 'unhealthy' else health_state end,
      health_checked_at = now(), updated_at = now()
    where id = v_notification.selected_route_id;
  end if;
end;
$$;
revoke all on function public.go_irl_finish_event_notification(uuid,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.go_irl_finish_event_notification(uuid,text,text,timestamptz,text) to service_role;

notify pgrst, 'reload schema';
commit;
