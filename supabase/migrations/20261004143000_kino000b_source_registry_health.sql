begin;

create or replace view public.cinema_source_registry_health_v as
with latest_parse as (
  select distinct on (pr.source_config_id)
    pr.source_config_id,
    pr.status as parse_status,
    pr.scope_complete,
    pr.completed_at
  from public.cinema_parse_runs pr
  order by pr.source_config_id, pr.completed_at desc nulls last, pr.created_at desc
),
latest_snapshot as (
  select distinct on (ss.source_config_id)
    ss.source_config_id,
    ss.fetch_status,
    ss.fetched_at
  from public.cinema_source_snapshots ss
  order by ss.source_config_id, ss.fetched_at desc, ss.created_at desc
)
select
  s.id as source_config_id,
  s.venue_id,
  v.city_id,
  v.city_name,
  v.name as venue_name,
  v.active as venue_active,
  v.monitor_enabled,
  v.trust_score,
  s.source_id,
  s.adapter_key,
  s.source_url,
  s.fetch_method,
  s.parser_version,
  s.enabled as source_enabled,
  s.fetch_interval_minutes,
  s.expected_horizon_days,
  s.min_records,
  s.next_fetch_at,
  s.last_attempt_at,
  s.last_success_at,
  s.consecutive_failures,
  v.last_fetch_status as venue_last_fetch_status,
  v.schedule_known_until,
  lp.parse_status as latest_parse_status,
  lp.scope_complete as latest_scope_complete,
  lp.completed_at as latest_parse_completed_at,
  ls.fetch_status as latest_snapshot_status,
  ls.fetched_at as latest_snapshot_at,
  case
    when not v.active then 'quarantined'
    when s.source_id = 'cinemax_cz' and s.adapter_key <> 'cinemax_cz_ajax' then 'quarantined'
    when s.source_id = 'cinestar_cz' and s.adapter_key <> 'cinestar_cz' then 'quarantined'
    when s.source_id = 'kinometropol_cz' and s.adapter_key <> 'metropol_entradio_cz' then 'quarantined'
    when s.source_id = 'premiere_cinemas_cz' and s.adapter_key <> 'premiere_cz' then 'quarantined'
    when lp.parse_status = 'quarantined' or lp.scope_complete = false then 'quarantined'
    when s.consecutive_failures >= 3
      or coalesce(ls.fetch_status, v.last_fetch_status) = 'failed' then 'failing'
    when coalesce(ls.fetch_status, v.last_fetch_status) = 'partial'
      or lp.parse_status = 'failed' then 'partial'
    when s.last_success_at is null then 'partial'
    else 'healthy'
  end as health_status,
  (
    s.enabled
    and v.active
    and v.monitor_enabled
  ) as monitoring_requested
from public.cinema_sources s
join public.cinema_venues v on v.id = s.venue_id
left join latest_parse lp on lp.source_config_id = s.id
left join latest_snapshot ls on ls.source_config_id = s.id;

comment on view public.cinema_source_registry_health_v is
  'Kino000B read-only cinema source registry health projection. It does not enable sources or venues. Adapter registration is enforced in application code before enqueue.';

commit;
