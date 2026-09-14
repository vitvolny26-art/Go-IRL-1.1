create or replace function public.city_posters_cinema_catalog(
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
  select
    s.id as screening_id,
    s.movie_id,
    s.cinema_id,
    v.name as cinema_name,
    v.address as cinema_address,
    coalesce(v.timezone, 'Europe/Prague') as venue_timezone,
    m.title as movie_title,
    m.original_title,
    m.release_year,
    m.duration_minutes,
    m.genres,
    m.age_rating,
    m.imdb_rating,
    m.poster_url,
    coalesce(m.synopsis_generated, '') as description,
    s.starts_at,
    s.ends_at,
    (s.starts_at at time zone coalesce(v.timezone, 'Europe/Prague'))::date as local_date,
    to_char(s.starts_at at time zone coalesce(v.timezone, 'Europe/Prague'), 'HH24:MI') as local_time,
    s.audio_language,
    s.subtitle_languages,
    s.version_type,
    s.format,
    s.auditorium,
    s.screening_tags,
    s.ticket_url,
    s.source_url
  from public.cinema_screenings s
  join public.cinema_venues v on v.id = s.cinema_id
  join public.cinema_movies m on m.id = s.movie_id
  where v.city_id = nullif(btrim(p_city_id), '')
    and v.active = true
    and exists (
      select 1
      from public.cinema_sync_runs sr
      where sr.cinema_id = v.id
        and sr.status = 'success'
        and sr.is_complete = true
    )
    and s.status = 'scheduled'
    and s.starts_at >= now() - interval '30 minutes'
  order by s.starts_at asc
  limit greatest(1, least(coalesce(p_limit, 800), 800));
$$;

revoke all on function public.city_posters_cinema_catalog(text, integer) from public;
grant execute on function public.city_posters_cinema_catalog(text, integer) to anon, authenticated, service_role;

comment on function public.city_posters_cinema_catalog(text, integer) is
  'Public read-only City Posters cinema projection. Exposes only movie-card and screening fields; base cinema tables retain their existing ACL/RLS.';
