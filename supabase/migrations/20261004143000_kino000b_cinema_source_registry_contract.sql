begin;

create or replace view public.cinema_source_registry_v
with (security_invoker = true)
as
select
  s.id as source_config_id,
  s.venue_id,
  v.city_id,
  v.city_name,
  v.name as venue_name,
  v.chain,
  v.active as venue_active,
  v.monitor_enabled,
  v.trust_score,
  v.last_fetch_status as venue_last_fetch_status,
  v.schedule_known_until,
  v.timezone as venue_timezone,
  s.source_id,
  s.adapter_key,
  s.source_url,
  s.fetch_method,
  s.parser_version,
  s.timezone as source_timezone,
  s.enabled as source_enabled,
  s.fetch_interval_minutes,
  s.expected_horizon_days,
  s.min_records,
  s.next_fetch_at,
  s.last_attempt_at,
  s.last_success_at,
  s.consecutive_failures,
  latest_snapshot.fetch_status as latest_snapshot_status,
  latest_snapshot.fetched_at as latest_snapshot_at,
  latest_parse.status as latest_parse_status,
  latest_parse.scope_complete as latest_parse_scope_complete,
  latest_parse.completed_at as latest_parse_completed_at,
  case
    when not v.active then 'quarantined'
    when s.source_url !~ '^https://' then 'quarantined'
    when s.timezone is distinct from v.timezone then 'quarantined'
    when latest_parse.status = 'quarantined' then 'quarantined'
    when s.consecutive_failures >= 2 or v.last_fetch_status = 'failed' or latest_snapshot.fetch_status = 'failed' then 'failing'
    when s.consecutive_failures = 1
      or v.last_fetch_status = 'partial'
      or latest_snapshot.fetch_status = 'partial'
      or s.last_success_at is null
      or (v.schedule_known_until is not null and v.schedule_known_until < (now() at time zone v.timezone)::date)
      then 'partial'
    else 'healthy'
  end::text as health_status,
  (
    s.source_url ~ '^https://'
    and s.fetch_interval_minutes between 60 and 10080
    and s.expected_horizon_days between 1 and 31
    and s.min_records >= 0
    and s.timezone = v.timezone
    and v.trust_score between 0 and 100
  ) as configuration_consistent,
  (s.enabled and v.active and v.monitor_enabled) as monitoring_flags_enabled
from public.cinema_sources s
join public.cinema_venues v on v.id = s.venue_id
left join lateral (
  select ss.fetch_status, ss.fetched_at
  from public.cinema_source_snapshots ss
  where ss.source_config_id = s.id
  order by ss.fetched_at desc, ss.id desc
  limit 1
) latest_snapshot on true
left join lateral (
  select pr.status, pr.scope_complete, pr.completed_at
  from public.cinema_parse_runs pr
  where pr.source_config_id = s.id
  order by coalesce(pr.completed_at, pr.started_at) desc, pr.id desc
  limit 1
) latest_parse on true;

revoke all on public.cinema_source_registry_v from public, anon, authenticated;
grant select on public.cinema_source_registry_v to service_role;

comment on view public.cinema_source_registry_v is
  'Kino000B read-only cinema source registry projection. Health is healthy/partial/failing/quarantined. Adapter registration remains an application-code check and is never inferred from database configuration.';

commit;
