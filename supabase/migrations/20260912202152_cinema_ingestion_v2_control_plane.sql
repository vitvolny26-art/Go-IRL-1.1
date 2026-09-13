create table if not exists public.cinema_sources (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.cinema_venues(id) on delete cascade,
  source_id text not null,
  adapter_key text not null,
  source_url text not null,
  fetch_method text not null default 'html',
  parser_version text not null default '1.0.0',
  timezone text not null default 'Europe/Prague',
  enabled boolean not null default true,
  fetch_interval_minutes integer not null default 1440 check (fetch_interval_minutes >= 60),
  expected_horizon_days integer not null default 5 check (expected_horizon_days between 1 and 31),
  min_records integer not null default 1 check (min_records >= 0),
  config jsonb not null default '{}'::jsonb,
  next_fetch_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, source_id)
);

create index if not exists cinema_sources_due_idx
  on public.cinema_sources(enabled, next_fetch_at)
  where enabled = true;

create table if not exists public.cinema_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_config_id uuid not null references public.cinema_sources(id) on delete cascade,
  venue_id uuid not null references public.cinema_venues(id) on delete cascade,
  source_id text not null,
  source_url text not null,
  fetched_at timestamptz not null default now(),
  http_status integer,
  fetch_status text not null default 'fetched' check (fetch_status in ('fetched','failed','partial')),
  raw_format text not null default 'html',
  raw_text text,
  raw_payload jsonb,
  content_hash text,
  parser_version text not null,
  drive_file_id text,
  drive_file_url text,
  drive_saved_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (raw_text is not null or raw_payload is not null or fetch_status = 'failed')
);

create index if not exists cinema_source_snapshots_source_time_idx
  on public.cinema_source_snapshots(source_config_id, fetched_at desc);
create index if not exists cinema_source_snapshots_hash_idx
  on public.cinema_source_snapshots(source_config_id, content_hash)
  where content_hash is not null;
create index if not exists cinema_source_snapshots_drive_pending_idx
  on public.cinema_source_snapshots(fetched_at)
  where fetch_status = 'fetched' and drive_saved_at is null;

create table if not exists public.cinema_parse_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.cinema_source_snapshots(id) on delete cascade,
  source_config_id uuid not null references public.cinema_sources(id) on delete cascade,
  adapter_key text not null,
  parser_version text not null,
  status text not null default 'running' check (status in ('running','success','failed','quarantined')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_parsed integer not null default 0 check (records_parsed >= 0),
  records_valid integer not null default 0 check (records_valid >= 0),
  records_rejected integer not null default 0 check (records_rejected >= 0),
  min_schedule_date date,
  max_schedule_date date,
  expected_until date,
  fetch_complete boolean not null default false,
  parser_complete boolean not null default false,
  scope_complete boolean not null default false,
  fatal_error boolean not null default false,
  zero_result boolean not null default false,
  error_message text,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (snapshot_id, parser_version)
);

create table if not exists public.cinema_screening_staging (
  id uuid primary key default gen_random_uuid(),
  parse_run_id uuid not null references public.cinema_parse_runs(id) on delete cascade,
  source_config_id uuid not null references public.cinema_sources(id) on delete cascade,
  row_no integer not null check (row_no > 0),
  external_screening_id text,
  screening_fingerprint text,
  external_movie_id text,
  movie_fingerprint text,
  title text,
  original_title text,
  release_year integer,
  duration_minutes integer,
  starts_at_local timestamp without time zone,
  timezone text not null,
  normalized_payload jsonb not null,
  validation_errors jsonb not null default '[]'::jsonb,
  movie_id uuid references public.cinema_movies(id) on delete set null,
  screening_id uuid references public.cinema_screenings(id) on delete set null,
  safe_to_write boolean not null default false,
  sync_status text not null default 'pending' check (sync_status in ('pending','resolved','written','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parse_run_id, row_no)
);

create index if not exists cinema_screening_staging_pending_idx
  on public.cinema_screening_staging(parse_run_id, sync_status);
create index if not exists cinema_screening_staging_ext_idx
  on public.cinema_screening_staging(source_config_id, external_screening_id)
  where external_screening_id is not null;

create table if not exists public.cinema_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('FETCH','ARCHIVE_DRIVE','PARSE','RESOLVE','SYNC','ENRICH','EMIT_EVENTS','PUBLISH')),
  source_config_id uuid references public.cinema_sources(id) on delete cascade,
  snapshot_id uuid references public.cinema_source_snapshots(id) on delete cascade,
  parse_run_id uuid references public.cinema_parse_runs(id) on delete cascade,
  entity_id uuid,
  priority integer not null default 100,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cinema_ingestion_jobs_dedupe_uq
  on public.cinema_ingestion_jobs(dedupe_key)
  where dedupe_key is not null and status in ('queued','running','succeeded');
create index if not exists cinema_ingestion_jobs_claim_idx
  on public.cinema_ingestion_jobs(status, run_after, priority, created_at)
  where status = 'queued';

create table if not exists public.cinema_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  venue_id uuid references public.cinema_venues(id) on delete set null,
  city_id text,
  movie_id uuid references public.cinema_movies(id) on delete set null,
  screening_id uuid references public.cinema_screenings(id) on delete set null,
  sync_run_id uuid references public.cinema_sync_runs(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (dedupe_key)
);

create index if not exists cinema_events_unprocessed_idx
  on public.cinema_events(created_at)
  where processed_at is null;

create table if not exists public.cinema_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.cinema_events(id) on delete cascade,
  channel text not null,
  publish_key text not null,
  status text not null default 'queued' check (status in ('queued','drafted','published','failed','cancelled')),
  content jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  published_at timestamptz,
  external_post_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (publish_key)
);

create or replace function public.cinema_ingestion_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cinema_sources_touch_updated_at on public.cinema_sources;
create trigger cinema_sources_touch_updated_at
before update on public.cinema_sources
for each row execute function public.cinema_ingestion_touch_updated_at();

drop trigger if exists cinema_screening_staging_touch_updated_at on public.cinema_screening_staging;
create trigger cinema_screening_staging_touch_updated_at
before update on public.cinema_screening_staging
for each row execute function public.cinema_ingestion_touch_updated_at();

drop trigger if exists cinema_ingestion_jobs_touch_updated_at on public.cinema_ingestion_jobs;
create trigger cinema_ingestion_jobs_touch_updated_at
before update on public.cinema_ingestion_jobs
for each row execute function public.cinema_ingestion_touch_updated_at();

drop trigger if exists cinema_publish_jobs_touch_updated_at on public.cinema_publish_jobs;
create trigger cinema_publish_jobs_touch_updated_at
before update on public.cinema_publish_jobs
for each row execute function public.cinema_ingestion_touch_updated_at();

create or replace function public.cinema_enqueue_due_sources(p_now timestamptz default now(), p_limit integer default 50)
returns table(job_id uuid, source_config_id uuid, venue_id uuid, source_id text)
language plpgsql
as $$
begin
  return query
  with due as (
    select s.id, s.venue_id, s.source_id,
           ('fetch:' || s.id::text || ':' || to_char((p_now at time zone s.timezone)::date, 'YYYY-MM-DD')) as dk
    from public.cinema_sources s
    where s.enabled = true
      and s.next_fetch_at <= p_now
    order by s.next_fetch_at, s.id
    limit greatest(1, least(coalesce(p_limit,50), 500))
    for update skip locked
  ), ins as (
    insert into public.cinema_ingestion_jobs(job_type, source_config_id, dedupe_key, payload)
    select 'FETCH', d.id, d.dk, jsonb_build_object('venue_id', d.venue_id, 'source_id', d.source_id)
    from due d
    on conflict do nothing
    returning id, source_config_id
  ), bumped as (
    update public.cinema_sources s
       set last_attempt_at = p_now,
           next_fetch_at = p_now + make_interval(mins => s.fetch_interval_minutes)
      from due d
     where s.id = d.id
     returning s.id
  )
  select j.id, s.id, s.venue_id, s.source_id
  from ins j
  join public.cinema_sources s on s.id = j.source_config_id;
end;
$$;

create or replace function public.cinema_claim_ingestion_jobs(
  p_worker text,
  p_limit integer default 10,
  p_job_types text[] default null
)
returns setof public.cinema_ingestion_jobs
language plpgsql
as $$
begin
  return query
  with c as (
    select j.id
    from public.cinema_ingestion_jobs j
    where j.status = 'queued'
      and j.run_after <= now()
      and (p_job_types is null or j.job_type = any(p_job_types))
    order by j.priority asc, j.created_at asc
    limit greatest(1, least(coalesce(p_limit,10), 100))
    for update skip locked
  )
  update public.cinema_ingestion_jobs j
     set status='running',
         locked_at=now(),
         locked_by=p_worker,
         started_at=coalesce(j.started_at, now()),
         attempt=j.attempt+1
    from c
   where j.id=c.id
  returning j.*;
end;
$$;

create or replace function public.cinema_finish_ingestion_job(
  p_job_id uuid,
  p_success boolean,
  p_result jsonb default '{}'::jsonb,
  p_error_message text default null,
  p_retry_after_minutes integer default null
)
returns void
language plpgsql
as $$
declare
  v_job public.cinema_ingestion_jobs%rowtype;
begin
  select * into v_job from public.cinema_ingestion_jobs where id=p_job_id for update;
  if not found then raise exception 'Unknown cinema ingestion job %', p_job_id; end if;

  if p_success then
    update public.cinema_ingestion_jobs
       set status='succeeded', result=coalesce(p_result,'{}'::jsonb), error_message=null, finished_at=now(), locked_at=null, locked_by=null
     where id=p_job_id;
  elsif v_job.attempt < v_job.max_attempts and p_retry_after_minutes is not null then
    update public.cinema_ingestion_jobs
       set status='queued', error_message=p_error_message,
           run_after=now()+make_interval(mins => greatest(1,p_retry_after_minutes)),
           locked_at=null, locked_by=null
     where id=p_job_id;
  else
    update public.cinema_ingestion_jobs
       set status='failed', error_message=p_error_message, finished_at=now(), locked_at=null, locked_by=null
     where id=p_job_id;
  end if;
end;
$$;

create or replace view public.cinema_ingestion_health_v as
select
  s.id as source_config_id,
  s.venue_id,
  v.name as venue_name,
  v.city_id,
  s.source_id,
  s.adapter_key,
  s.parser_version,
  s.enabled,
  s.fetch_interval_minutes,
  s.next_fetch_at,
  s.last_attempt_at,
  s.last_success_at,
  s.consecutive_failures,
  (select max(ss.fetched_at) from public.cinema_source_snapshots ss where ss.source_config_id=s.id and ss.fetch_status='fetched') as last_snapshot_at,
  (select max(ss.drive_saved_at) from public.cinema_source_snapshots ss where ss.source_config_id=s.id) as last_drive_archive_at,
  (select max(pr.completed_at) from public.cinema_parse_runs pr where pr.source_config_id=s.id and pr.status='success') as last_parse_success_at
from public.cinema_sources s
join public.cinema_venues v on v.id=s.venue_id;

alter table public.cinema_sources enable row level security;
alter table public.cinema_source_snapshots enable row level security;
alter table public.cinema_parse_runs enable row level security;
alter table public.cinema_screening_staging enable row level security;
alter table public.cinema_ingestion_jobs enable row level security;
alter table public.cinema_events enable row level security;
alter table public.cinema_publish_jobs enable row level security;

comment on table public.cinema_source_snapshots is 'Immutable fetch evidence. Fetch, parse, sync and Drive archival are intentionally decoupled.';
comment on table public.cinema_ingestion_jobs is 'Reusable queue for scalable cinema ingestion. One workflow processes jobs instead of one workflow per cinema.';
comment on function public.cinema_enqueue_due_sources(timestamptz, integer) is 'Queues at most one FETCH per source per local calendar day while advancing next_fetch_at by configured interval.';
