create or replace view public.sport_city_schedule_v
with (security_barrier = true)
as
select
  ce.id::text as occurrence_id,
  coalesce(nullif(ce.payload->>'series_id', ''), nullif(ce.payload->>'sport_event_id', ''), ce.canonical_event_id) as series_id,
  ce.canonical_event_id,
  ce.city_id,
  ce.city as city_name,
  coalesce(nullif(ce.payload->>'series_title', ''), nullif(ce.title_normalized, ''), ce.title_original) as event_title,
  ce.title_original as occurrence_title,
  coalesce(nullif(ce.payload->>'sport_type', ''), ce.category) as sport_type,
  nullif(ce.payload->>'competition', '') as competition,
  nullif(ce.payload->>'home_team', '') as home_team,
  nullif(ce.payload->>'away_team', '') as away_team,
  nullif(ce.payload->>'stage', '') as stage,
  ce.short_ai_summary as description,
  case
    when lower(coalesce(ce.image_usage_status, '')) in ('allowed', 'licensed', 'owned', 'direct_allowed') then ce.image_url
    else null
  end as image_url,
  md5(coalesce(ce.city_id, '') || '|' || coalesce(nullif(ce.venue_normalized, ''), ce.venue_name, ce.venue_address, 'venue')) as venue_id,
  ce.venue_name,
  ce.venue_address,
  ce.starts_at,
  ce.ends_at,
  substring(ce.starts_at from 1 for 10) as local_date,
  substring(ce.starts_at from 12 for 5) as local_time,
  ce.price_min,
  ce.price_max,
  ce.currency,
  ce.ticket_url,
  ce.source_url,
  ce.organizer_name,
  ce.tags,
  ce.source_id
from public.canonical_events ce
where lower(coalesce(ce.status, '')) in ('approved', 'published', 'public')
  and lower(coalesce(ce.lifecycle_status, 'active')) not in ('cancelled', 'expired')
  and coalesce(ce.starts_at, '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
  and substring(ce.starts_at from 1 for 10) >= current_date::text
  and (
    lower(coalesce(ce.category, '')) = any (array['sport','sports','football','soccer','hockey','basketball','volleyball','tennis','running','marathon','cycling'])
    or exists (
      select 1
      from unnest(coalesce(ce.tags, array[]::text[])) as tag(value)
      where lower(tag.value) = any (array['sport','sports','football','soccer','hockey','basketball','volleyball','tennis','running','marathon','cycling'])
    )
  );

revoke all on public.sport_city_schedule_v from public;
grant select on public.sport_city_schedule_v to anon, authenticated;

comment on view public.sport_city_schedule_v is 'Read-only public city sport schedule for GO IRL cards. Exposes only approved/published/public future sport events; source canonical_events remains RLS-locked.';
