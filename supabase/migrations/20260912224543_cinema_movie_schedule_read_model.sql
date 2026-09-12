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

comment on view public.cinema_movie_schedule_v is 'Read-only city movie schedule model for GO IRL movie cards: one row per future screening with movie and venue context.';
