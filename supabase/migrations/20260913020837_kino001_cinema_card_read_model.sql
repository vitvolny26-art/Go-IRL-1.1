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

alter table public.cinema_venues enable row level security;
alter table public.cinema_movies enable row level security;
alter table public.cinema_sync_runs enable row level security;
alter table public.cinema_screenings enable row level security;

drop policy if exists "authenticated cinema venues read" on public.cinema_venues;
create policy "authenticated cinema venues read"
  on public.cinema_venues for select to authenticated using (true);

drop policy if exists "authenticated cinema movies read" on public.cinema_movies;
create policy "authenticated cinema movies read"
  on public.cinema_movies for select to authenticated using (true);

drop policy if exists "authenticated cinema screenings read" on public.cinema_screenings;
create policy "authenticated cinema screenings read"
  on public.cinema_screenings for select to authenticated using (true);

revoke all on public.cinema_venues, public.cinema_movies, public.cinema_sync_runs, public.cinema_screenings
  from public, anon, authenticated;
grant select on public.cinema_venues, public.cinema_movies, public.cinema_screenings to authenticated;
grant all on public.cinema_venues, public.cinema_movies, public.cinema_sync_runs, public.cinema_screenings to service_role;

create or replace view public.cinema_movie_schedule_v
with (security_invoker = true)
as
with future_screenings as (
  select
    s.id as screening_id,
    s.movie_id,
    s.cinema_id,
    v.city_id,
    v.city_name,
    v.name as cinema_name,
    v.address as cinema_address,
    coalesce(v.timezone, 'Europe/Prague') as venue_timezone,
    s.starts_at,
    s.ends_at,
    (s.starts_at at time zone coalesce(v.timezone, 'Europe/Prague'))::date as local_date,
    to_char(s.starts_at at time zone coalesce(v.timezone, 'Europe/Prague'), 'HH24:MI') as local_time,
    s.audio_language,
    s.subtitle_languages,
    s.version_type,
    s.audio_type,
    s.format,
    s.auditorium,
    s.screening_tags,
    s.price_from,
    s.price_to,
    s.currency,
    s.ticket_url,
    s.source_url,
    s.source_id
  from public.cinema_screenings s
  join public.cinema_venues v on v.id = s.cinema_id
  where s.status = 'scheduled'
    and s.starts_at >= now() - interval '30 minutes'
    and v.active = true
)
select
  fs.screening_id,
  fs.movie_id,
  fs.cinema_id,
  fs.city_id,
  fs.city_name,
  fs.cinema_name,
  fs.cinema_address,
  fs.venue_timezone,
  m.title as movie_title,
  m.original_title,
  m.release_year,
  m.duration_minutes,
  m.genres,
  m.age_rating,
  m.imdb_rating,
  m.poster_url,
  coalesce(m.synopsis_generated, '') as description,
  min(fs.local_date) over (partition by fs.movie_id, fs.city_id) as showing_from,
  max(fs.local_date) over (partition by fs.movie_id, fs.city_id) as showing_until,
  fs.starts_at,
  fs.ends_at,
  fs.local_date,
  fs.local_time,
  fs.audio_language,
  fs.subtitle_languages,
  fs.version_type,
  fs.audio_type,
  fs.format,
  fs.auditorium,
  fs.screening_tags,
  fs.price_from,
  fs.price_to,
  fs.currency,
  fs.ticket_url,
  fs.source_url,
  fs.source_id
from future_screenings fs
join public.cinema_movies m on m.id = fs.movie_id;

revoke all on public.cinema_movie_schedule_v from public, anon;
grant select on public.cinema_movie_schedule_v to authenticated, service_role;

comment on view public.cinema_movie_schedule_v is
  'Read-only city movie schedule model for GO IRL movie cards: one row per future screening with movie and venue context.';
