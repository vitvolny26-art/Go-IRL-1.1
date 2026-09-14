-- Cinema schema-authority repair.
-- Restores the canonical ingestion prerequisites before Kino003 in migration order.
-- This migration is intentionally data-neutral and does not seed or enable any cinema source.

create table if not exists public.cinema_venues (
  id uuid primary key default gen_random_uuid(),
  city_id text not null,
  city_name text not null,
  name text not null,
  slug text not null unique,
  chain text,
  venue_type text not null default 'multiplex',
  address text,
  lat numeric,
  lng numeric,
  website_url text,
  schedule_url text,
  fetch_method text not null default 'html',
  parser_key text,
  trust_score numeric not null default 70,
  monitor_enabled boolean not null default false,
  active boolean not null default true,
  fetch_interval_minutes integer not null default 360 check (fetch_interval_minutes >= 60),
  last_fetched_at timestamptz,
  last_verified_at timestamptz,
  last_fetch_status text,
  timezone text not null default 'Europe/Prague',
  source_id text,
  schedule_known_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, name)
);

create table if not exists public.cinema_movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  original_title text,
  release_year integer,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  genres jsonb not null default '[]'::jsonb,
  countries jsonb not null default '[]'::jsonb,
  original_language text,
  age_rating text,
  imdb_id text unique,
  imdb_rating numeric check (imdb_rating is null or imdb_rating between 0 and 10),
  imdb_votes integer check (imdb_votes is null or imdb_votes >= 0),
  rating_status text not null default 'unknown'
    check (rating_status in ('unknown', 'pending', 'available', 'stale', 'unavailable')),
  rating_checked_at timestamptz,
  poster_url text,
  poster_source text,
  poster_rights_status text,
  synopsis_source text,
  synopsis_generated text,
  external_ids jsonb not null default '{}'::jsonb,
  movie_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cinema_movies_fingerprint_uidx
  on public.cinema_movies(movie_fingerprint)
  where movie_fingerprint is not null;

create table if not exists public.cinema_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  cinema_id uuid not null references public.cinema_venues(id) on delete cascade,
  parser_key text,
  parser_version text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  is_complete boolean not null default false,
  records_seen integer not null default 0,
  schedule_known_until date,
  response_status integer,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists cinema_sync_runs_cinema_started_idx
  on public.cinema_sync_runs(cinema_id, started_at desc);
create index if not exists cinema_sync_runs_source_started_idx
  on public.cinema_sync_runs(source_id, started_at desc);

create table if not exists public.cinema_screenings (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.cinema_movies(id) on delete cascade,
  cinema_id uuid not null references public.cinema_venues(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at >= starts_at),
  audio_language text,
  subtitles_language text,
  subtitle_languages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(subtitle_languages) = 'array'),
  audio_type text,
  version_type text,
  format text,
  auditorium text,
  price_from numeric,
  price_to numeric check (price_to is null or price_from is null or price_to >= price_from),
  currency text,
  ticket_url text,
  source_url text,
  source_id text,
  external_screening_id text,
  screening_fingerprint text,
  screening_tags jsonb not null default '[]'::jsonb,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sold_out', 'cancelled', 'stale', 'ended', 'active', 'completed', 'removed')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_seen_sync_run_id uuid references public.cinema_sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cinema_screenings_cinema_starts_idx
  on public.cinema_screenings(cinema_id, starts_at);
create index if not exists cinema_screenings_movie_cinema_idx
  on public.cinema_screenings(movie_id, cinema_id);
create index if not exists cinema_screenings_upcoming_idx
  on public.cinema_screenings(starts_at)
  where status in ('scheduled', 'sold_out', 'active');
create unique index if not exists cinema_screenings_source_external_uidx
  on public.cinema_screenings(source_id, external_screening_id)
  where source_id is not null and external_screening_id is not null;
create unique index if not exists cinema_screenings_fingerprint_uidx
  on public.cinema_screenings(screening_fingerprint)
  where screening_fingerprint is not null;

create table if not exists public.cinema_movie_sources (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.cinema_movies(id) on delete cascade,
  source_id text not null,
  external_movie_id text not null,
  source_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_movie_id)
);

create index if not exists cinema_movie_sources_movie_idx
  on public.cinema_movie_sources(movie_id);

alter table public.cinema_movie_sources enable row level security;
revoke all on public.cinema_movie_sources from public, anon, authenticated;
grant all on public.cinema_movie_sources to service_role;

create or replace function public.cinema_start_sync_run(
  p_cinema_id uuid,
  p_source_id text,
  p_parser_key text,
  p_parser_version text
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  insert into public.cinema_sync_runs (
    cinema_id,
    source_id,
    parser_key,
    parser_version,
    status,
    is_complete
  ) values (
    p_cinema_id,
    p_source_id,
    p_parser_key,
    p_parser_version,
    'running',
    false
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.cinema_upsert_screening(
  p_sync_run_id uuid,
  p_cinema_id uuid,
  p_movie_id uuid,
  p_source_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_audio_language text default null,
  p_subtitle_languages jsonb default '[]'::jsonb,
  p_audio_type text default null,
  p_version_type text default null,
  p_format text default null,
  p_screening_tags jsonb default '[]'::jsonb,
  p_ticket_url text default null,
  p_source_url text default null,
  p_external_screening_id text default null,
  p_screening_fingerprint text default null,
  p_auditorium text default null,
  p_price_from numeric default null,
  p_price_to numeric default null,
  p_currency text default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  if p_external_screening_id is null and p_screening_fingerprint is null then
    raise exception 'external_screening_id or screening_fingerprint is required';
  end if;

  if jsonb_typeof(coalesce(p_subtitle_languages, '[]'::jsonb)) <> 'array' then
    raise exception 'subtitle_languages must be a JSON array';
  end if;

  if jsonb_typeof(coalesce(p_screening_tags, '[]'::jsonb)) <> 'array' then
    raise exception 'screening_tags must be a JSON array';
  end if;

  if p_external_screening_id is not null then
    insert into public.cinema_screenings (
      movie_id, cinema_id, starts_at, ends_at,
      audio_language, subtitle_languages, audio_type, version_type, format,
      auditorium, price_from, price_to, currency,
      ticket_url, source_url, source_id, external_screening_id,
      screening_tags, status, screening_fingerprint,
      last_seen_sync_run_id, first_seen_at, last_seen_at, updated_at
    ) values (
      p_movie_id, p_cinema_id, p_starts_at, p_ends_at,
      p_audio_language, coalesce(p_subtitle_languages, '[]'::jsonb), p_audio_type, p_version_type, p_format,
      p_auditorium, p_price_from, p_price_to, p_currency,
      p_ticket_url, p_source_url, p_source_id, p_external_screening_id,
      coalesce(p_screening_tags, '[]'::jsonb), 'scheduled', p_screening_fingerprint,
      p_sync_run_id, now(), now(), now()
    )
    on conflict (source_id, external_screening_id)
      where source_id is not null and external_screening_id is not null
    do update set
      movie_id = excluded.movie_id,
      cinema_id = excluded.cinema_id,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      audio_language = excluded.audio_language,
      subtitle_languages = excluded.subtitle_languages,
      audio_type = excluded.audio_type,
      version_type = excluded.version_type,
      format = excluded.format,
      auditorium = excluded.auditorium,
      price_from = excluded.price_from,
      price_to = excluded.price_to,
      currency = excluded.currency,
      ticket_url = excluded.ticket_url,
      source_url = excluded.source_url,
      screening_tags = excluded.screening_tags,
      status = case when public.cinema_screenings.status = 'sold_out' then 'sold_out' else 'scheduled' end,
      screening_fingerprint = coalesce(excluded.screening_fingerprint, public.cinema_screenings.screening_fingerprint),
      last_seen_sync_run_id = excluded.last_seen_sync_run_id,
      last_seen_at = now(),
      updated_at = now()
    returning id into v_id;
  else
    insert into public.cinema_screenings (
      movie_id, cinema_id, starts_at, ends_at,
      audio_language, subtitle_languages, audio_type, version_type, format,
      auditorium, price_from, price_to, currency,
      ticket_url, source_url, source_id, external_screening_id,
      screening_tags, status, screening_fingerprint,
      last_seen_sync_run_id, first_seen_at, last_seen_at, updated_at
    ) values (
      p_movie_id, p_cinema_id, p_starts_at, p_ends_at,
      p_audio_language, coalesce(p_subtitle_languages, '[]'::jsonb), p_audio_type, p_version_type, p_format,
      p_auditorium, p_price_from, p_price_to, p_currency,
      p_ticket_url, p_source_url, p_source_id, null,
      coalesce(p_screening_tags, '[]'::jsonb), 'scheduled', p_screening_fingerprint,
      p_sync_run_id, now(), now(), now()
    )
    on conflict (screening_fingerprint)
      where screening_fingerprint is not null
    do update set
      movie_id = excluded.movie_id,
      cinema_id = excluded.cinema_id,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      audio_language = excluded.audio_language,
      subtitle_languages = excluded.subtitle_languages,
      audio_type = excluded.audio_type,
      version_type = excluded.version_type,
      format = excluded.format,
      auditorium = excluded.auditorium,
      price_from = excluded.price_from,
      price_to = excluded.price_to,
      currency = excluded.currency,
      ticket_url = excluded.ticket_url,
      source_url = excluded.source_url,
      screening_tags = excluded.screening_tags,
      status = case when public.cinema_screenings.status = 'sold_out' then 'sold_out' else 'scheduled' end,
      last_seen_sync_run_id = excluded.last_seen_sync_run_id,
      last_seen_at = now(),
      updated_at = now()
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;

create or replace function public.cinema_finish_sync_run(
  p_sync_run_id uuid,
  p_status text,
  p_is_complete boolean,
  p_records_seen integer default 0,
  p_schedule_known_until date default null,
  p_response_status integer default null,
  p_error_message text default null
)
returns void
language plpgsql
as $function$
begin
  if p_status not in ('success', 'partial', 'failed') then
    raise exception 'invalid cinema sync status: %', p_status;
  end if;

  if coalesce(p_records_seen, 0) < 0 then
    raise exception 'records_seen must be >= 0';
  end if;

  update public.cinema_sync_runs
     set status = p_status,
         is_complete = coalesce(p_is_complete, false),
         records_seen = coalesce(p_records_seen, 0),
         schedule_known_until = p_schedule_known_until,
         response_status = p_response_status,
         error_message = p_error_message,
         completed_at = now()
   where id = p_sync_run_id;

  if not found then
    raise exception 'cinema sync run not found: %', p_sync_run_id;
  end if;
end;
$function$;

revoke execute on function public.cinema_start_sync_run(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.cinema_start_sync_run(uuid,text,text,text)
  to service_role;

revoke execute on function public.cinema_upsert_screening(
  uuid,uuid,uuid,text,timestamptz,timestamptz,text,jsonb,text,text,text,jsonb,text,text,text,text,text,numeric,numeric,text
) from public, anon, authenticated;
grant execute on function public.cinema_upsert_screening(
  uuid,uuid,uuid,text,timestamptz,timestamptz,text,jsonb,text,text,text,jsonb,text,text,text,text,text,numeric,numeric,text
) to service_role;

revoke execute on function public.cinema_finish_sync_run(uuid,text,boolean,integer,date,integer,text)
  from public, anon, authenticated;
grant execute on function public.cinema_finish_sync_run(uuid,text,boolean,integer,date,integer,text)
  to service_role;

comment on table public.cinema_movie_sources is
  'Source provenance mapping for canonical cinema movies. Schema-authority prerequisite for Kino003.';
comment on function public.cinema_start_sync_run(uuid,text,text,text) is
  'Starts one canonical cinema sync run. Service-role only.';
comment on function public.cinema_upsert_screening(uuid,uuid,uuid,text,timestamptz,timestamptz,text,jsonb,text,text,text,jsonb,text,text,text,text,text,numeric,numeric,text) is
  'Idempotently writes one canonical cinema screening by source external id or screening fingerprint. Service-role only.';
comment on function public.cinema_finish_sync_run(uuid,text,boolean,integer,date,integer,text) is
  'Finishes one canonical cinema sync run. Service-role only.';
