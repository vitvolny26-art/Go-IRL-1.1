begin;

create table if not exists public.cinema_catalog_movies (
  id uuid primary key default gen_random_uuid(),
  city_id text not null check (city_id ~ '^[a-z0-9_-]{1,80}$'),
  selection_week_start date not null,
  selection_week_end date not null,
  rank integer not null check (rank between 1 and 10),
  source_movie_key text not null,
  imdb_id text check (imdb_id is null or imdb_id ~ '^tt[0-9]{7,10}$'),
  canonical_title text not null,
  original_title text,
  release_year integer,
  duration_minutes integer,
  genres jsonb not null default '[]'::jsonb check (jsonb_typeof(genres) = 'array'),
  age_rating text,
  imdb_rating numeric,
  poster_url text,
  description text,
  director text,
  lead_actors jsonb not null default '[]'::jsonb check (jsonb_typeof(lead_actors) = 'array'),
  translations jsonb not null default '{}'::jsonb check (jsonb_typeof(translations) = 'object'),
  readiness jsonb not null default '{}'::jsonb check (jsonb_typeof(readiness) = 'object'),
  publication_state text not null default 'ready'
    check (publication_state in ('ready','proposed','approved','published','rejected','skipped')),
  approved_by text,
  approved_at timestamptz,
  published_event_id uuid references public.city_posters_events(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, selection_week_start, rank),
  unique (city_id, selection_week_start, source_movie_key)
);

create table if not exists public.cinema_catalog_screenings (
  id uuid primary key default gen_random_uuid(),
  catalog_movie_id uuid not null references public.cinema_catalog_movies(id) on delete cascade,
  source_screening_key text not null,
  cinema_key text not null,
  cinema_name text not null,
  cinema_address text,
  venue_timezone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  audio_language text,
  subtitle_languages jsonb not null default '[]'::jsonb check (jsonb_typeof(subtitle_languages) = 'array'),
  version_type text,
  format text,
  auditorium text,
  screening_tags jsonb not null default '[]'::jsonb check (jsonb_typeof(screening_tags) = 'array'),
  ticket_url text,
  source_url text,
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_movie_id, source_screening_key)
);

create index if not exists cinema_catalog_movies_city_week_rank_idx
  on public.cinema_catalog_movies(city_id, selection_week_start desc, rank);

create index if not exists cinema_catalog_screenings_movie_starts_idx
  on public.cinema_catalog_screenings(catalog_movie_id, starts_at);

create index if not exists cinema_catalog_screenings_starts_idx
  on public.cinema_catalog_screenings(starts_at);

alter table public.cinema_catalog_movies enable row level security;
alter table public.cinema_catalog_screenings enable row level security;

revoke all on public.cinema_catalog_movies from anon, authenticated;
revoke all on public.cinema_catalog_screenings from anon, authenticated;
grant select, insert, update, delete on public.cinema_catalog_movies to service_role;
grant select, insert, update, delete on public.cinema_catalog_screenings to service_role;

drop function if exists public.city_posters_cinema_catalog(text, integer);

create function public.city_posters_cinema_catalog(
  p_city_id text,
  p_limit integer default 800
)
returns table (
  screening_id uuid,
  movie_id uuid,
  cinema_id uuid,
  cinema_name text,
  cinema_address text,
  venue_timezone text,
  movie_title text,
  original_title text,
  release_year integer,
  duration_minutes integer,
  genres jsonb,
  age_rating text,
  imdb_rating numeric,
  poster_url text,
  description text,
  director text,
  lead_actors jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  local_date date,
  local_time text,
  audio_language text,
  subtitle_languages jsonb,
  version_type text,
  format text,
  auditorium text,
  screening_tags jsonb,
  ticket_url text,
  source_url text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with latest_selection as (
    select max(m.selection_week_start) as week_start
    from public.cinema_catalog_movies m
    where m.city_id = nullif(btrim(p_city_id), '')
  )
  select
    s.id as screening_id,
    m.id as movie_id,
    md5(m.city_id || ':' || s.cinema_key)::uuid as cinema_id,
    s.cinema_name,
    s.cinema_address,
    s.venue_timezone,
    m.canonical_title as movie_title,
    m.original_title,
    m.release_year,
    m.duration_minutes,
    m.genres,
    m.age_rating,
    m.imdb_rating,
    m.poster_url,
    m.description,
    m.director,
    m.lead_actors,
    s.starts_at,
    s.ends_at,
    (s.starts_at at time zone s.venue_timezone)::date as local_date,
    to_char(s.starts_at at time zone s.venue_timezone, 'HH24:MI') as local_time,
    s.audio_language,
    s.subtitle_languages,
    s.version_type,
    s.format,
    s.auditorium,
    s.screening_tags,
    s.ticket_url,
    s.source_url
  from public.cinema_catalog_movies m
  join latest_selection l on l.week_start = m.selection_week_start
  join public.cinema_catalog_screenings s on s.catalog_movie_id = m.id
  where m.city_id = nullif(btrim(p_city_id), '')
    and s.starts_at >= now() - interval '30 minutes'
  order by s.starts_at asc, m.rank asc
  limit greatest(1, least(coalesce(p_limit, 800), 800));
$$;

revoke all on function public.city_posters_cinema_catalog(text, integer) from public;
grant execute on function public.city_posters_cinema_catalog(text, integer) to anon, authenticated, service_role;

comment on table public.cinema_catalog_movies is
  'Friday-only compact Top-10 Cinema snapshot for Catalog, For You, Details and publication.';
comment on table public.cinema_catalog_screenings is
  'All known screenings for the Friday Top-10 movies across the full connected-source horizon.';
comment on function public.city_posters_cinema_catalog(text, integer) is
  'Guest-safe flat Cinema read contract for Catalog, For You and Details backed only by compact Friday Top-10 storage.';

notify pgrst, 'reload schema';

commit;
