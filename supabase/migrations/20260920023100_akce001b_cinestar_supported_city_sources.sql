-- Akce001B: declare CineStar venue/source configs for supported promotion cities.
-- Repository migration only. Applying this is a production-data/config mutation and requires separate explicit approval.
-- New sources are intentionally disabled and approval gates are not activated here.
begin;

insert into public.cinema_venues (
  city_id, city_name, name, slug, chain, venue_type, website_url, schedule_url, fetch_method, parser_key,
  trust_score, monitor_enabled, active, fetch_interval_minutes, timezone, source_id
) values
  ('praha','Praha','CineStar Praha Anděl','praha-andel-cinestar','CineStar','multiplex','https://cinestar.cz/cz/praha5','https://cinestar.cz/cz/praha5/filmy','html','cinestar_cz',100,false,true,1440,'Europe/Prague','cinestar_cz'),
  ('praha','Praha','CineStar Praha Černý Most','praha-cerny-most-cinestar','CineStar','multiplex','https://cinestar.cz/cz/praha9','https://cinestar.cz/cz/praha9/filmy','html','cinestar_cz',100,false,true,1440,'Europe/Prague','cinestar_cz'),
  ('ostrava','Ostrava','CineStar Ostrava','ostrava-cinestar','CineStar','multiplex','https://cinestar.cz/cz/ostrava','https://cinestar.cz/cz/ostrava/filmy','html','cinestar_cz',100,false,true,1440,'Europe/Prague','cinestar_cz')
on conflict (slug) do update
set city_id=excluded.city_id,city_name=excluded.city_name,name=excluded.name,chain=excluded.chain,website_url=excluded.website_url,
    schedule_url=excluded.schedule_url,fetch_method=excluded.fetch_method,parser_key=excluded.parser_key,timezone=excluded.timezone,
    source_id=excluded.source_id,updated_at=now();

insert into public.cinema_sources (
  venue_id, source_id, adapter_key, source_url, fetch_method, parser_version, timezone, enabled,
  fetch_interval_minutes, expected_horizon_days, min_records, config
)
select v.id,'cinestar_cz','cinestar_cz',v.website_url || '/','html','1.0.0',v.timezone,false,1440,5,1,
  jsonb_build_object('promotionScope','venue','cityPromotionMaterialization',true)
from public.cinema_venues v
where v.slug in ('praha-andel-cinestar','praha-cerny-most-cinestar','ostrava-cinestar')
on conflict (venue_id, source_id) do update
set adapter_key=excluded.adapter_key,source_url=excluded.source_url,fetch_method=excluded.fetch_method,parser_version=excluded.parser_version,
    timezone=excluded.timezone,enabled=public.cinema_sources.enabled,fetch_interval_minutes=excluded.fetch_interval_minutes,
    expected_horizon_days=excluded.expected_horizon_days,min_records=excluded.min_records,
    config=public.cinema_sources.config || excluded.config,updated_at=now();

commit;
