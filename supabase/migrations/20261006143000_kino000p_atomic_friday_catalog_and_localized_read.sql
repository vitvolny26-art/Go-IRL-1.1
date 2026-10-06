begin;

create or replace function public.replace_cinema_catalog_week(
  p_city_id text,
  p_week_start date,
  p_week_end date,
  p_movies jsonb
)
returns table (
  movie_count integer,
  screening_count integer
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_existing_count integer;
  v_existing_ready_count integer;
  v_movie_count integer;
  v_screening_count integer;
begin
  if nullif(btrim(p_city_id), '') is null or p_city_id !~ '^[a-z0-9_-]{1,80}$' then
    raise exception 'cinema_catalog_city_invalid';
  end if;
  if p_week_start is null or p_week_end is null or p_week_end < p_week_start then
    raise exception 'cinema_catalog_week_invalid';
  end if;
  if jsonb_typeof(p_movies) <> 'array' or jsonb_array_length(p_movies) <> 10 then
    raise exception 'cinema_catalog_movies_not_10';
  end if;

  if (
    select count(distinct (movie ->> 'rank')::integer)
    from jsonb_array_elements(p_movies) movie
    where (movie ->> 'rank') ~ '^[0-9]+$'
      and (movie ->> 'rank')::integer between 1 and 10
  ) <> 10 then
    raise exception 'cinema_catalog_rank_set_invalid';
  end if;

  if (
    select count(distinct nullif(btrim(movie ->> 'source_movie_key'), ''))
    from jsonb_array_elements(p_movies) movie
  ) <> 10 then
    raise exception 'cinema_catalog_movie_identity_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_movies) movie
    where nullif(btrim(movie ->> 'canonical_title'), '') is null
       or coalesce(btrim(movie ->> 'imdb_id'), '') !~ '^tt[0-9]{7,10}$'
       or nullif(btrim(movie ->> 'description'), '') is null
       or coalesce((movie ->> 'duration_minutes')::integer, 0) <= 0
       or coalesce(jsonb_typeof(movie -> 'genres'), 'null') <> 'array'
       or coalesce(jsonb_array_length(movie -> 'genres'), 0) = 0
       or coalesce(btrim(movie ->> 'poster_url'), '') !~ '^https://'
       or coalesce((movie -> 'readiness' ->> 'ready')::boolean, false) is not true
       or (
         nullif(btrim(movie ->> 'director'), '') is null
         and coalesce(movie -> 'readiness' ->> 'director_status', '') <> 'verified_unavailable'
       )
       or (
         (
           coalesce(jsonb_typeof(movie -> 'lead_actors'), 'null') <> 'array'
           or coalesce(jsonb_array_length(movie -> 'lead_actors'), 0) = 0
         )
         and coalesce(movie -> 'readiness' ->> 'lead_actors_status', '') <> 'verified_unavailable'
       )
       or coalesce(jsonb_typeof(movie -> 'translations'), 'null') <> 'object'
       or coalesce(jsonb_typeof(movie -> 'screenings'), 'null') <> 'array'
       or coalesce(jsonb_array_length(movie -> 'screenings'), 0) = 0
  ) then
    raise exception 'cinema_catalog_movie_package_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_movies) movie
    cross join lateral (values ('ru'),('uk'),('cs'),('en'),('pl'),('sk')) required(language)
    where nullif(btrim(movie -> 'translations' -> required.language ->> 'title'), '') is null
       or nullif(btrim(movie -> 'translations' -> required.language ->> 'description'), '') is null
  ) then
    raise exception 'cinema_catalog_translations_incomplete';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_movies) movie
    cross join lateral jsonb_array_elements(movie -> 'screenings') screening
    where nullif(btrim(screening ->> 'source_screening_key'), '') is null
       or nullif(btrim(screening ->> 'cinema_key'), '') is null
       or nullif(btrim(screening ->> 'cinema_name'), '') is null
       or nullif(btrim(screening ->> 'venue_timezone'), '') is null
       or nullif(btrim(screening ->> 'starts_at'), '') is null
  ) then
    raise exception 'cinema_catalog_screening_package_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_movies) movie
    cross join lateral (
      select screening ->> 'source_screening_key' as source_screening_key
      from jsonb_array_elements(movie -> 'screenings') screening
      group by screening ->> 'source_screening_key'
      having count(*) > 1
    ) duplicate
  ) then
    raise exception 'cinema_catalog_screening_identity_duplicate';
  end if;

  select count(*),
         count(*) filter (where coalesce((readiness ->> 'ready')::boolean, false))
    into v_existing_count, v_existing_ready_count
  from public.cinema_catalog_movies
  where city_id = p_city_id
    and selection_week_start = p_week_start;

  if exists (
    select 1
    from public.cinema_catalog_movies
    where city_id = p_city_id
      and selection_week_start = p_week_start
      and (
        publication_state <> 'ready'
        or approved_by is not null
        or approved_at is not null
        or published_event_id is not null
        or published_at is not null
      )
  ) then
    raise exception 'cinema_catalog_week_publication_locked';
  end if;

  if v_existing_ready_count > 0 then
    raise exception 'cinema_catalog_week_already_materialized';
  end if;

  if v_existing_count > 0 and exists (
    select 1
    from public.cinema_catalog_movies
    where city_id = p_city_id
      and selection_week_start = p_week_start
      and coalesce((readiness ->> 'bootstrap')::boolean, false) is not true
  ) then
    raise exception 'cinema_catalog_week_existing_nonbootstrap';
  end if;

  if v_existing_count > 0 then
    delete from public.cinema_catalog_movies
    where city_id = p_city_id
      and selection_week_start = p_week_start;
  end if;

  insert into public.cinema_catalog_movies (
    city_id,
    selection_week_start,
    selection_week_end,
    rank,
    source_movie_key,
    imdb_id,
    canonical_title,
    original_title,
    release_year,
    duration_minutes,
    genres,
    age_rating,
    imdb_rating,
    poster_url,
    description,
    director,
    lead_actors,
    translations,
    readiness,
    publication_state,
    approved_by,
    approved_at,
    published_event_id,
    published_at,
    updated_at
  )
  select
    p_city_id,
    p_week_start,
    p_week_end,
    (movie ->> 'rank')::integer,
    btrim(movie ->> 'source_movie_key'),
    btrim(movie ->> 'imdb_id'),
    btrim(movie ->> 'canonical_title'),
    nullif(btrim(movie ->> 'original_title'), ''),
    nullif(movie ->> 'release_year', '')::integer,
    nullif(movie ->> 'duration_minutes', '')::integer,
    movie -> 'genres',
    nullif(btrim(movie ->> 'age_rating'), ''),
    nullif(movie ->> 'imdb_rating', '')::numeric,
    btrim(movie ->> 'poster_url'),
    btrim(movie ->> 'description'),
    nullif(btrim(movie ->> 'director'), ''),
    coalesce(movie -> 'lead_actors', '[]'::jsonb),
    movie -> 'translations',
    movie -> 'readiness',
    'ready',
    null,
    null,
    null,
    null,
    now()
  from jsonb_array_elements(p_movies) movie
  order by (movie ->> 'rank')::integer;

  insert into public.cinema_catalog_screenings (
    catalog_movie_id,
    source_screening_key,
    cinema_key,
    cinema_name,
    cinema_address,
    venue_timezone,
    starts_at,
    ends_at,
    audio_language,
    subtitle_languages,
    version_type,
    format,
    auditorium,
    screening_tags,
    ticket_url,
    source_url,
    source_id,
    updated_at
  )
  select
    catalog.id,
    btrim(screening ->> 'source_screening_key'),
    btrim(screening ->> 'cinema_key'),
    btrim(screening ->> 'cinema_name'),
    nullif(btrim(screening ->> 'cinema_address'), ''),
    btrim(screening ->> 'venue_timezone'),
    (screening ->> 'starts_at')::timestamptz,
    nullif(screening ->> 'ends_at', '')::timestamptz,
    nullif(btrim(screening ->> 'audio_language'), ''),
    coalesce(screening -> 'subtitle_languages', '[]'::jsonb),
    nullif(btrim(screening ->> 'version_type'), ''),
    nullif(btrim(screening ->> 'format'), ''),
    nullif(btrim(screening ->> 'auditorium'), ''),
    coalesce(screening -> 'screening_tags', '[]'::jsonb),
    nullif(btrim(screening ->> 'ticket_url'), ''),
    nullif(btrim(screening ->> 'source_url'), ''),
    nullif(btrim(screening ->> 'source_id'), ''),
    now()
  from jsonb_array_elements(p_movies) movie
  join public.cinema_catalog_movies catalog
    on catalog.city_id = p_city_id
   and catalog.selection_week_start = p_week_start
   and catalog.source_movie_key = btrim(movie ->> 'source_movie_key')
  cross join lateral jsonb_array_elements(movie -> 'screenings') screening;

  select count(*) into v_movie_count
  from public.cinema_catalog_movies
  where city_id = p_city_id
    and selection_week_start = p_week_start;

  select count(*) into v_screening_count
  from public.cinema_catalog_screenings screening
  join public.cinema_catalog_movies movie on movie.id = screening.catalog_movie_id
  where movie.city_id = p_city_id
    and movie.selection_week_start = p_week_start;

  if v_movie_count <> 10 or v_screening_count < 10 then
    raise exception 'cinema_catalog_replace_readback_invalid';
  end if;

  return query select v_movie_count, v_screening_count;
end;
$$;

revoke all on function public.replace_cinema_catalog_week(text, date, date, jsonb) from public, anon, authenticated;
grant execute on function public.replace_cinema_catalog_week(text, date, date, jsonb) to service_role;

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
  'Guest-safe localized Cinema read contract for Catalog, For You and Details backed only by ready Friday Top-10 storage.';
comment on function public.city_posters_cinema_catalog(text, integer) is
  'Compatibility wrapper for pre-localization Cinema clients; defaults movie text to English with canonical fallback.';

notify pgrst, 'reload schema';

commit;
