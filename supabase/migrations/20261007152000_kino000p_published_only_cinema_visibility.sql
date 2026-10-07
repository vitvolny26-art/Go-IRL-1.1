begin;

-- KINO000P corrective visibility:
-- Friday ready rows remain internal storage; Catalog / For You / Details expose only
-- exact movies that completed owner-approved publication.

create or replace function public.city_posters_cinema_catalog(
  p_city_id text,
  p_language text,
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
  with requested_language as (
    select case lower(btrim(coalesce(p_language, 'en')))
      when 'ru' then 'ru'
      when 'uk' then 'uk'
      when 'cs' then 'cs'
      when 'en' then 'en'
      when 'pl' then 'pl'
      when 'sk' then 'sk'
      else 'en'
    end as language
  ),
  latest_selection as (
    select max(m.selection_week_start) as week_start
    from public.cinema_catalog_movies m
    where m.city_id = nullif(btrim(p_city_id), '')
      and coalesce((m.readiness ->> 'ready')::boolean, false)
    and m.publication_state = 'published'
  )
  select
    s.id as screening_id,
    m.id as movie_id,
    md5(m.city_id || ':' || s.cinema_key)::uuid as cinema_id,
    s.cinema_name,
    s.cinema_address,
    s.venue_timezone,
    coalesce(nullif(btrim(m.translations -> lang.language ->> 'title'), ''), m.canonical_title) as movie_title,
    m.original_title,
    m.release_year,
    m.duration_minutes,
    m.genres,
    m.age_rating,
    m.imdb_rating,
    m.poster_url,
    coalesce(nullif(btrim(m.translations -> lang.language ->> 'description'), ''), m.description) as description,
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
  cross join requested_language lang
  join latest_selection l on l.week_start = m.selection_week_start
  join public.cinema_catalog_screenings s on s.catalog_movie_id = m.id
  where m.city_id = nullif(btrim(p_city_id), '')
    and coalesce((m.readiness ->> 'ready')::boolean, false)
    and s.starts_at >= now() - interval '30 minutes'
  order by s.starts_at asc, m.rank asc
  limit greatest(1, least(coalesce(p_limit, 800), 800));
$$;

revoke all on function public.city_posters_cinema_catalog(text, text, integer) from public;
grant execute on function public.city_posters_cinema_catalog(text, text, integer) to anon, authenticated, service_role;

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
  select *
  from public.city_posters_cinema_catalog(p_city_id, 'en', p_limit);
$$;

revoke all on function public.city_posters_cinema_catalog(text, integer) from public;
grant execute on function public.city_posters_cinema_catalog(text, integer) to anon, authenticated, service_role;

comment on function public.replace_cinema_catalog_week(text, date, date, jsonb) is
  'Service-role-only atomic Friday Top-10 materialization. Replaces empty or legacy bootstrap week only and locks after a ready package exists.';
comment on function public.city_posters_cinema_catalog(text, text, integer) is
  'Guest-safe localized Cinema read contract for Catalog, For You and Details backed only by owner-published Friday catalog movies.';
comment on function public.city_posters_cinema_catalog(text, integer) is
  'Compatibility wrapper for pre-localization Cinema clients; defaults movie text to English with canonical fallback.';

notify pgrst, 'reload schema';

commit;
