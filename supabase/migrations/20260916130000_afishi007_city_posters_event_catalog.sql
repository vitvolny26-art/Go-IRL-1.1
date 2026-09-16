-- AFISHI007: narrow public read projection for canonical City Posters events.
-- Base city_posters_* tables remain closed to anon. This function exposes published catalog rows only.

begin;

create or replace function public.city_posters_event_catalog(
  p_city_id text,
  p_vertical text,
  p_language text default 'en',
  p_time_filter text default 'today',
  p_query text default '',
  p_limit integer default 100
)
returns table (
  event_id uuid,
  occurrence_id uuid,
  vertical text,
  canonical_slug text,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  venue_name text,
  venue_address text,
  hero_media_url text,
  organizer_name text,
  occurrence_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  with catalog as (
    select
      event.id as event_id,
      occurrence.id as occurrence_id,
      event.vertical,
      event.canonical_slug,
      translation.title,
      translation.description,
      occurrence.starts_at,
      occurrence.ends_at,
      occurrence.timezone,
      venue.canonical_name as venue_name,
      venue.address as venue_address,
      event.hero_media_url,
      event.organizer_name,
      occurrence.occurrence_url
    from public.city_posters_events event
    join public.city_posters_occurrences occurrence on occurrence.event_id = event.id
    left join public.city_posters_venues venue on venue.id = occurrence.venue_id
    join lateral (
      select candidate.title, candidate.description
      from public.city_posters_event_translations candidate
      where candidate.event_id = event.id
      order by case
        when candidate.language = p_language then 0
        when candidate.language = 'en' then 1
        when candidate.language = 'ru' then 2
        else 3
      end, candidate.language
      limit 1
    ) translation on true
    where event.status = 'published'
      and occurrence.status in ('scheduled', 'postponed', 'rescheduled')
      and event.city_id = btrim(p_city_id)
      and event.vertical = p_vertical
      and (
        p_time_filter = 'now'
        and occurrence.starts_at <= now() + interval '60 minutes'
        and coalesce(occurrence.ends_at, occurrence.starts_at + interval '3 hours') >= now()
        or p_time_filter = 'today'
        and (occurrence.starts_at at time zone occurrence.timezone)::date = (now() at time zone occurrence.timezone)::date
        or p_time_filter = 'tomorrow'
        and (occurrence.starts_at at time zone occurrence.timezone)::date = (now() at time zone occurrence.timezone)::date + 1
        or p_time_filter = 'weekend'
        and (occurrence.starts_at at time zone occurrence.timezone)::date between
          (case
            when extract(isodow from (now() at time zone occurrence.timezone))::integer >= 6
              then (now() at time zone occurrence.timezone)::date - (extract(isodow from (now() at time zone occurrence.timezone))::integer - 6)
            else (now() at time zone occurrence.timezone)::date + (6 - extract(isodow from (now() at time zone occurrence.timezone))::integer)
          end)
          and
          (case
            when extract(isodow from (now() at time zone occurrence.timezone))::integer >= 6
              then (now() at time zone occurrence.timezone)::date - (extract(isodow from (now() at time zone occurrence.timezone))::integer - 6)
            else (now() at time zone occurrence.timezone)::date + (6 - extract(isodow from (now() at time zone occurrence.timezone))::integer)
          end) + 1
      )
      and (
        btrim(coalesce(p_query, '')) = ''
        or translation.title ilike '%' || btrim(p_query) || '%'
        or coalesce(event.organizer_name, '') ilike '%' || btrim(p_query) || '%'
        or coalesce(venue.canonical_name, '') ilike '%' || btrim(p_query) || '%'
      )
  )
  select * from catalog
  order by starts_at, title
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.city_posters_event_catalog(text, text, text, text, text, integer) from public;
grant execute on function public.city_posters_event_catalog(text, text, text, text, text, integer)
  to anon, authenticated, service_role;

commit;
