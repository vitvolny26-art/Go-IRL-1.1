-- AFISHI007: additive public lookup for exact published City Posters events.
-- Repository migration only. Production apply requires a separate explicit approval.

begin;

create or replace function public.city_posters_event_by_slug(
  p_canonical_slug text,
  p_language text default 'en'
)
returns table (
  event_id uuid,
  occurrence_id uuid,
  city_id text,
  vertical text,
  subcategory text,
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
  occurrence_url text,
  all_day boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with matching_events as (
    select event.*
    from public.city_posters_events event
    where event.status = 'published'
      and event.canonical_slug = btrim(p_canonical_slug)
  ),
  unique_event as (
    select event.*
    from matching_events event
    where (select count(*) from matching_events) = 1
  )
  select
    event.id as event_id,
    occurrence.id as occurrence_id,
    event.city_id,
    event.vertical,
    event.subcategory,
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
    occurrence.occurrence_url,
    coalesce(
      occurrence.metadata ->> 'all_day' = 'true',
      occurrence.metadata ->> 'allDay' = 'true',
      occurrence.metadata ->> 'all_day_campaign' = 'true',
      false
    ) as all_day
  from unique_event event
  join lateral (
    select candidate.*
    from public.city_posters_occurrences candidate
    where candidate.event_id = event.id
      and candidate.status in ('scheduled', 'postponed', 'rescheduled')
      and coalesce(candidate.ends_at, candidate.starts_at + interval '3 hours') >= now()
    order by candidate.starts_at
    limit 1
  ) occurrence on true
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
  ) translation on true;
$$;

revoke all on function public.city_posters_event_by_slug(text, text) from public;
grant execute on function public.city_posters_event_by_slug(text, text)
  to anon, authenticated, service_role;

comment on function public.city_posters_event_by_slug(text, text) is
  'AFISHI007 exact read-only City Posters event projection for app/deep-link rendering. Returns only one unambiguous published upcoming event.';

notify pgrst, 'reload schema';

commit;
