begin;

-- KINO000R owner-only Cinema visibility:
-- Friday ready Top-10 storage is internal publication inventory.
-- Guest Cinema surfaces must stay empty until the exact movie reaches published
-- through the owner-approved publication state machine.

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
    case when jsonb_typeof(m.translations -> lang.language -> 'genres') = 'array'
      then m.translations -> lang.language -> 'genres'
      else '[]'::jsonb end as genres,
    m.age_rating,
    m.imdb_rating,
    m.poster_url,
    coalesce(nullif(btrim(m.translations -> lang.language ->> 'description'), ''), m.description) as description,
    nullif(btrim(m.translations -> lang.language ->> 'director'), '') as director,
    case when jsonb_typeof(m.translations -> lang.language -> 'lead_actors') = 'array'
      then m.translations -> lang.language -> 'lead_actors'
      else '[]'::jsonb end as lead_actors,
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
    and m.publication_state = 'published'
    and s.starts_at >= now() - interval '30 minutes'
  order by s.starts_at asc, m.rank asc
  limit greatest(1, least(coalesce(p_limit, 800), 800));
$$;

comment on function public.city_posters_cinema_catalog(text, text, integer) is
  'Guest-safe owner-published Cinema read: genre, director and cast come only from stored Friday six-language translations; missing metadata remains blank.';

notify pgrst, 'reload schema';

commit;
