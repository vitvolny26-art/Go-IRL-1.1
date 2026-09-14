-- AFISHI004: repository-only City Posters canonical schema contract.
-- DO NOT apply to production without a separate explicit production migration approval.
-- This migration intentionally does not modify Activity or cinema_* tables and does not backfill data.

begin;

do $prerequisites$
begin
  if to_regprocedure('public.go_irl_auth_user_key()') is null then
    raise exception 'AFISHI004 prerequisite missing: public.go_irl_auth_user_key()';
  end if;
  if to_regprocedure('private.go_irl_request_can_moderate()') is null then
    raise exception 'AFISHI004 prerequisite missing: private.go_irl_request_can_moderate()';
  end if;
  if to_regprocedure('public.go_irl_touch_updated_at()') is null then
    raise exception 'AFISHI004 prerequisite missing: public.go_irl_touch_updated_at()';
  end if;
end
$prerequisites$;

create table if not exists public.city_posters_venues (
  id uuid primary key default gen_random_uuid(),
  city_id text not null check (btrim(city_id) <> ''),
  canonical_name text not null check (btrim(canonical_name) <> ''),
  slug text not null check (btrim(slug) <> ''),
  aliases jsonb not null default '[]'::jsonb check (jsonb_typeof(aliases) = 'array'),
  venue_type text not null check (btrim(venue_type) <> ''),
  address text,
  lat numeric check (lat is null or lat between -90 and 90),
  lng numeric check (lng is null or lng between -180 and 180),
  timezone text not null default 'Europe/Prague' check (btrim(timezone) <> ''),
  official_url text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, slug)
);

create index if not exists city_posters_venues_city_active_idx
  on public.city_posters_venues(city_id, active, canonical_name);

create table if not exists public.city_posters_events (
  id uuid primary key default gen_random_uuid(),
  vertical text not null check (
    vertical in ('cinema','concerts','festivals','sport','theatre','comedy','exhibitions','family','education','nightlife','city_special','other')
  ),
  subcategory text,
  city_id text not null check (btrim(city_id) <> ''),
  canonical_slug text not null check (btrim(canonical_slug) <> ''),
  organizer_name text,
  primary_venue_id uuid references public.city_posters_venues(id) on delete set null,
  status text not null default 'draft' check (
    status in ('draft','needs_review','ready','published','cancelled','expired','rejected')
  ),
  source_confidence numeric not null default 0 check (source_confidence between 0 and 100),
  hero_media_url text,
  age_rule text,
  original_language text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, canonical_slug),
  check (status <> 'published' or published_at is not null)
);

create index if not exists city_posters_events_feed_idx
  on public.city_posters_events(city_id, vertical, status, published_at desc);
create index if not exists city_posters_events_primary_venue_idx
  on public.city_posters_events(primary_venue_id)
  where primary_venue_id is not null;

create table if not exists public.city_posters_event_translations (
  event_id uuid not null references public.city_posters_events(id) on delete cascade,
  language text not null check (language in ('ru','uk','cs','en','pl','sk')),
  title text not null check (btrim(title) <> ''),
  description text not null default '',
  source_kind text not null default 'source' check (source_kind in ('source','editorial','machine')),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, language)
);

create table if not exists public.city_posters_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.city_posters_events(id) on delete cascade,
  venue_id uuid references public.city_posters_venues(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'Europe/Prague' check (btrim(timezone) <> ''),
  room_label text,
  status text not null default 'scheduled' check (
    status in ('scheduled','postponed','rescheduled','cancelled','ended')
  ),
  sales_state text not null default 'unknown' check (
    sales_state in ('unknown','available','limited','sold_out','unavailable')
  ),
  occurrence_url text,
  rescheduled_from_occurrence_id uuid references public.city_posters_occurrences(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  check (rescheduled_from_occurrence_id is null or rescheduled_from_occurrence_id <> id)
);

create index if not exists city_posters_occurrences_event_start_idx
  on public.city_posters_occurrences(event_id, starts_at);
create index if not exists city_posters_occurrences_venue_start_idx
  on public.city_posters_occurrences(venue_id, starts_at)
  where venue_id is not null;
create index if not exists city_posters_occurrences_upcoming_idx
  on public.city_posters_occurrences(starts_at)
  where status in ('scheduled','postponed','rescheduled');

create table if not exists public.city_posters_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (btrim(source_key) <> ''),
  name text not null check (btrim(name) <> ''),
  source_type text not null check (
    source_type in ('official_venue','official_organizer','official_cinema','official_league','ticketing','city_platform','social','editorial','manual','other')
  ),
  base_url text,
  domain text,
  ingestion_method text not null check (ingestion_method in ('api','html','feed','manual','other')),
  supported_cities jsonb not null default '[]'::jsonb check (jsonb_typeof(supported_cities) = 'array'),
  supported_verticals jsonb not null default '[]'::jsonb check (jsonb_typeof(supported_verticals) = 'array'),
  cadence_minutes integer check (cadence_minutes is null or cadence_minutes >= 15),
  trust_level integer not null default 50 check (trust_level between 0 and 100),
  priority integer not null default 100 check (priority >= 0),
  owner_label text,
  active boolean not null default false,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists city_posters_sources_active_priority_idx
  on public.city_posters_sources(active, priority, source_key);

create table if not exists public.city_posters_offers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.city_posters_events(id) on delete cascade,
  occurrence_id uuid references public.city_posters_occurrences(id) on delete cascade,
  provider_name text not null check (btrim(provider_name) <> ''),
  url text not null check (btrim(url) <> ''),
  price_from numeric check (price_from is null or price_from >= 0),
  price_to numeric check (price_to is null or price_to >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  availability_state text not null default 'unknown' check (
    availability_state in ('unknown','available','limited','sold_out','unavailable')
  ),
  official boolean not null default false,
  active boolean not null default true,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((event_id is not null)::integer + (occurrence_id is not null)::integer = 1),
  check (price_to is null or price_from is null or price_to >= price_from)
);

create index if not exists city_posters_offers_event_active_idx
  on public.city_posters_offers(event_id, active)
  where event_id is not null;
create index if not exists city_posters_offers_occurrence_active_idx
  on public.city_posters_offers(occurrence_id, active)
  where occurrence_id is not null;

create table if not exists public.city_posters_source_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.city_posters_sources(id) on delete restrict,
  entity_type text not null check (entity_type in ('event','occurrence','venue','offer')),
  external_id text,
  source_url text,
  payload_fingerprint text,
  event_id uuid references public.city_posters_events(id) on delete set null,
  occurrence_id uuid references public.city_posters_occurrences(id) on delete set null,
  venue_id uuid references public.city_posters_venues(id) on delete set null,
  offer_id uuid references public.city_posters_offers(id) on delete set null,
  match_status text not null default 'unmatched' check (
    match_status in ('unmatched','matched','ambiguous','rejected')
  ),
  match_confidence numeric check (match_confidence is null or match_confidence between 0 and 100),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (last_seen_at >= first_seen_at),
  check (
    (match_status = 'matched' and (
      (entity_type = 'event' and event_id is not null and occurrence_id is null and venue_id is null and offer_id is null) or
      (entity_type = 'occurrence' and event_id is null and occurrence_id is not null and venue_id is null and offer_id is null) or
      (entity_type = 'venue' and event_id is null and occurrence_id is null and venue_id is not null and offer_id is null) or
      (entity_type = 'offer' and event_id is null and occurrence_id is null and venue_id is null and offer_id is not null)
    )) or
    (match_status <> 'matched' and event_id is null and occurrence_id is null and venue_id is null and offer_id is null)
  )
);

create unique index if not exists city_posters_source_records_external_uidx
  on public.city_posters_source_records(source_id, entity_type, external_id)
  where external_id is not null;
create index if not exists city_posters_source_records_fingerprint_idx
  on public.city_posters_source_records(source_id, payload_fingerprint)
  where payload_fingerprint is not null;
create index if not exists city_posters_source_records_match_idx
  on public.city_posters_source_records(match_status, source_id, last_seen_at desc);

create or replace function private.city_posters_event_is_published(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.city_posters_events event
    where event.id = p_event_id
      and event.status = 'published'
  );
$$;

create or replace function private.city_posters_offer_event_id(
  p_event_id uuid,
  p_occurrence_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_event_id,
    (select occurrence.event_id
       from public.city_posters_occurrences occurrence
      where occurrence.id = p_occurrence_id)
  );
$$;

revoke all on function private.city_posters_event_is_published(uuid) from public, anon;
revoke all on function private.city_posters_offer_event_id(uuid, uuid) from public, anon;
grant execute on function private.city_posters_event_is_published(uuid) to authenticated;
grant execute on function private.city_posters_offer_event_id(uuid, uuid) to authenticated;

-- Shared generic timestamp helper; no Activity business semantics are inherited.
create trigger city_posters_venues_touch_updated_at
before update on public.city_posters_venues
for each row execute function public.go_irl_touch_updated_at();
create trigger city_posters_events_touch_updated_at
before update on public.city_posters_events
for each row execute function public.go_irl_touch_updated_at();
create trigger city_posters_event_translations_touch_updated_at
before update on public.city_posters_event_translations
for each row execute function public.go_irl_touch_updated_at();
create trigger city_posters_occurrences_touch_updated_at
before update on public.city_posters_occurrences
for each row execute function public.go_irl_touch_updated_at();
create trigger city_posters_sources_touch_updated_at
before update on public.city_posters_sources
for each row execute function public.go_irl_touch_updated_at();
create trigger city_posters_offers_touch_updated_at
before update on public.city_posters_offers
for each row execute function public.go_irl_touch_updated_at();
create trigger city_posters_source_records_touch_updated_at
before update on public.city_posters_source_records
for each row execute function public.go_irl_touch_updated_at();

alter table public.city_posters_venues enable row level security;
alter table public.city_posters_events enable row level security;
alter table public.city_posters_event_translations enable row level security;
alter table public.city_posters_occurrences enable row level security;
alter table public.city_posters_sources enable row level security;
alter table public.city_posters_offers enable row level security;
alter table public.city_posters_source_records enable row level security;

-- Revoke first because legacy Supabase projects may have permissive default privileges.
revoke all on table public.city_posters_venues from public, anon, authenticated;
revoke all on table public.city_posters_events from public, anon, authenticated;
revoke all on table public.city_posters_event_translations from public, anon, authenticated;
revoke all on table public.city_posters_occurrences from public, anon, authenticated;
revoke all on table public.city_posters_sources from public, anon, authenticated;
revoke all on table public.city_posters_offers from public, anon, authenticated;
revoke all on table public.city_posters_source_records from public, anon, authenticated;

-- Signed-in clients get read-only access. Anonymous/public-web access stays closed until separately approved.
grant select on table public.city_posters_venues to authenticated;
grant select on table public.city_posters_events to authenticated;
grant select on table public.city_posters_event_translations to authenticated;
grant select on table public.city_posters_occurrences to authenticated;
grant select on table public.city_posters_sources to authenticated;
grant select on table public.city_posters_offers to authenticated;
grant select on table public.city_posters_source_records to authenticated;

-- Server-side ingestion/admin service path. service_role bypasses RLS but grants remain explicit.
grant select, insert, update, delete on table public.city_posters_venues to service_role;
grant select, insert, update, delete on table public.city_posters_events to service_role;
grant select, insert, update, delete on table public.city_posters_event_translations to service_role;
grant select, insert, update, delete on table public.city_posters_occurrences to service_role;
grant select, insert, update, delete on table public.city_posters_sources to service_role;
grant select, insert, update, delete on table public.city_posters_offers to service_role;
grant select, insert, update, delete on table public.city_posters_source_records to service_role;

create policy "city posters venues catalog read"
on public.city_posters_venues
for select to authenticated
using (
  active = true
  or (select private.go_irl_request_can_moderate())
);

create policy "city posters events catalog read"
on public.city_posters_events
for select to authenticated
using (
  status = 'published'
  or (select private.go_irl_request_can_moderate())
);

create policy "city posters translations catalog read"
on public.city_posters_event_translations
for select to authenticated
using (
  (select private.city_posters_event_is_published(event_id))
  or (select private.go_irl_request_can_moderate())
);

create policy "city posters occurrences catalog read"
on public.city_posters_occurrences
for select to authenticated
using (
  (select private.city_posters_event_is_published(event_id))
  or (select private.go_irl_request_can_moderate())
);

create policy "city posters offers catalog read"
on public.city_posters_offers
for select to authenticated
using (
  (
    active = true
    and (select private.city_posters_event_is_published(
      private.city_posters_offer_event_id(event_id, occurrence_id)
    ))
  )
  or (select private.go_irl_request_can_moderate())
);

create policy "city posters sources staff read"
on public.city_posters_sources
for select to authenticated
using ((select private.go_irl_request_can_moderate()));

create policy "city posters source records staff read"
on public.city_posters_source_records
for select to authenticated
using ((select private.go_irl_request_can_moderate()));

comment on table public.city_posters_events is
  'AFISHI004 canonical City Posters Event identity. Activity participation and cinema vertical tables remain separate.';
comment on table public.city_posters_occurrences is
  'AFISHI004 concrete City Posters schedule/session rows; Event identity is intentionally separate.';
comment on table public.city_posters_source_records is
  'AFISHI004 provenance and source matching evidence. Unmatched/ambiguous/rejected records have no canonical target.';

notify pgrst, 'reload schema';

commit;
