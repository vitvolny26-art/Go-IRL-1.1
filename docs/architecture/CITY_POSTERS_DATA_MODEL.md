# City Posters canonical data model

Task: AFISHI004
Status: repository-only proposal
Baseline: GitHub `main@3361660`
Production apply is NOT part of AFISHI004.

## Decision

City Posters owns a dedicated canonical data layer. `public.activities` remains the Activity participation domain and is not reused as the City Posters write model. Existing `cinema_*` tables remain the cinema vertical model and are not rewritten, backfilled, or dual-written by this increment.

The generic core is:

- `city_posters_events` — stable Event identity and publication lifecycle;
- `city_posters_event_translations` — first-class `ru`, `uk`, `cs`, `en`, `pl`, `sk` title/description rows;
- `city_posters_occurrences` — concrete scheduled sessions using `timestamptz` plus explicit event-city timezone semantics;
- `city_posters_venues` — reusable place identity;
- `city_posters_sources` — source registry, cadence, trust and health metadata;
- `city_posters_source_records` — upstream provenance, IDs/fingerprints and matching state;
- `city_posters_offers` — outbound official/ticket CTAs scoped to exactly one Event or Occurrence.

Event publication state, Occurrence schedule state and Offer availability state are independent state machines.

## Schema contract

### Event

`city_posters_events` is identity, not a schedule row. The first contract supports cinema, concerts, festivals, sport and roadmap follow-on verticals. `status` is one of `draft`, `needs_review`, `ready`, `published`, `cancelled`, `expired`, `rejected`. A published row requires `published_at`.

The migration intentionally does not put Activity membership, capacity, invite/visibility, chat, waiting-list or Activity reminder foreign keys on Event.

### Translation

Localized copy is normalized into rows keyed by `(event_id, language)` rather than Activity-style RU/CS columns. The allowed language set is exactly RU / UK / CS / EN / PL / SK. `source_kind` records whether localized copy came from a source, editorial work or a later machine-assisted flow; `verified` remains explicit.

### Occurrence

`city_posters_occurrences` stores concrete schedule entries. `starts_at`/`ends_at` use `timestamptz`; `timezone` is also persisted so rendering and source reconciliation never depend on browser timezone assumptions. Occurrence lifecycle is `scheduled`, `postponed`, `rescheduled`, `cancelled`, `ended`. Sales state is separate.

### Venue

`city_posters_venues` is a generic reusable venue identity with city, aliases, address, geo, timezone and official URL. The first migration does not merge or delete `cinema_venues`. `main@3361660` already exposes cinema through the narrow read-only `public.city_posters_cinema_catalog(text, integer)` RPC; that read projection remains backed by `cinema_venues` and is not a canonical-venue write path.

### Source and provenance

`city_posters_sources` is the generic source registry. `city_posters_source_records` preserves source-level identity and matching evidence. Stable `(source_id, entity_type, external_id)` is unique when an external ID exists. Fingerprints are secondary evidence. A record marked `matched` must point to exactly one canonical Event, Occurrence, Venue or Offer; unmatched/ambiguous/rejected records deliberately have no canonical target.

No title-only deduplication rule is encoded in the schema.

### Offer

`city_posters_offers` belongs to exactly one Event or one Occurrence. It stores provider, URL, price bounds, currency, availability, official classification and freshness. Availability is never inferred from Event publication state.

## RLS / ACL design

All seven tables have RLS enabled and explicit grants. The migration revokes first because older Supabase projects may have permissive default privileges.

`anon` receives no table privileges in AFISHI004. Public-web/guest Data API access is a separate product/security decision.

`authenticated` receives SELECT only:

- active venues are readable; moderators/admins/superadmins can read inactive venues;
- published Events are readable; moderators/admins/superadmins can read non-public states;
- translations and occurrences are readable only when the parent Event is published, or by moderation staff;
- active offers are readable only when their Event is published, or by moderation staff;
- Sources and Source Records are moderation-staff-only.

No authenticated role receives direct INSERT/UPDATE/DELETE on any City Posters canonical table. Future editorial mutations must use separately reviewed RPCs or server APIs; this avoids granting broad table-write capability simply because a staff user can moderate.

`service_role` receives explicit SELECT/INSERT/UPDATE/DELETE and is the intended server-side ingestion path. Service credentials must never enter browser code.

Staff checks reuse the existing `private.go_irl_request_can_moderate()` helper, whose current role set is moderator/admin/superadmin. New City Posters RLS helpers live in `private`, use `SECURITY DEFINER` with `search_path = ''`, and grant EXECUTE only where the policy caller needs it.

This follows current Supabase guidance: exposed `public` tables use RLS, grants are least-privilege, policies name the target role, and privileged helper functions stay outside exposed schemas.

## Cinema boundary

`main@3361660` already contains the first City Posters cinema read integration: `public.city_posters_cinema_catalog(text, integer)` projects the existing `cinema_movies`, `cinema_screenings` and `cinema_venues` model into a narrow public read contract consumed by City Posters Catalog. It is read/UI integration only; cinema ingestion remains independent and the base cinema tables retain their existing ACL/RLS.

AFISHI004 does not change that RPC, `cinema_movies`, `cinema_screenings`, `cinema_venues`, `cinema_sync_runs`, or the repo-only cinema ingestion control plane. The new generic canonical tables do not replace the existing cinema read projection. A later separately bounded integration may map persisted cinema facts into the generic canonical model when provenance/reconciliation rules are approved:

- `cinema_movies` → City Posters Event identity;
- `cinema_screenings` → City Posters Occurrence;
- `cinema_venues` → City Posters Venue;
- cinema ticket/source fields → Offer/Source Record where provenance is deterministic.

Until then, `public.city_posters_cinema_catalog(text, integer)` remains the cinema read surface and the AFISHI004 generic tables remain empty/unwired. Do not introduce cinema dual-write or backfill merely because the generic schema exists.

## Migration plan

1. Refresh GitHub `main` and production schema/migration history immediately before any future apply gate.
2. Confirm prerequisites exist: `public.go_irl_auth_user_key()`, `private.go_irl_request_can_moderate()`, and `public.go_irl_touch_updated_at()`.
3. Confirm no `city_posters_*` canonical tables already exist under a conflicting owner or contract.
4. Apply only `20260914140000_afishi004_city_posters_schema_contract.sql` in a separately approved migration gate.
5. The migration creates empty tables, indexes, helper functions, triggers, RLS policies and grants only. It contains no backfill and mutates no Activity/cinema data.
6. Run `supabase/verify_afishi004_city_posters_schema_contract.sql`; the verifier is metadata/read-only and ends with `rollback`.
7. Inspect database advisors and exact grants/policies before wiring application reads or ingestion writes.
8. Generic-canonical backfill, durable cinema-to-canonical mapping, source seeding, editorial RPCs and generic app runtime wiring are separate tasks/gates. The existing `public.city_posters_cinema_catalog(text, integer)` read RPC remains outside this migration.

## Rollback plan

The preferred rollback boundary is **before any consumer or production data exists**. Under a separately approved rollback gate:

1. stop/freeze any City Posters writers;
2. verify no runtime release depends on `city_posters_*` objects;
3. revoke client/service grants;
4. drop City Posters RLS policies;
5. drop `private.city_posters_offer_event_id(uuid, uuid)` and `private.city_posters_event_is_published(uuid)`;
6. drop tables in dependency order: `city_posters_source_records`, `city_posters_offers`, `city_posters_occurrences`, `city_posters_event_translations`, `city_posters_events`, `city_posters_sources`, `city_posters_venues`;
7. notify PostgREST schema reload;
8. re-run schema verification proving the City Posters objects are absent and Activity/cinema objects remain intact.

Do not blindly drop tables after consumers or production data exist. Once data or downstream dependencies are present, rollback becomes a preservation procedure: freeze writes, export/retain City Posters data, detach consumers, reconcile the last known-good application artifact, and use a separately reviewed reverse migration. Never delete production City Posters records merely to make a rollback convenient.

## Verification contract

Repository checks for this increment must prove:

- seven canonical tables exist in the proposal;
- Event and Occurrence stay separate;
- six language rows are first-class;
- occurrence time is `timestamptz` plus explicit timezone;
- RLS is enabled everywhere;
- `anon` has no table access;
- `authenticated` has no direct mutation privileges;
- provenance is staff-only;
- `service_role` has explicit ingestion privileges;
- Activity and cinema tables are not altered or dropped;
- the SQL verifier is rollback-only.

## Protected gates

AFISHI004 only prepares repository artifacts. Commit, push, PR, merge, production migration, production data mutation and deployment each remain separately gated. In particular, a future Git merge of this migration file does **not** authorize applying it to production Supabase.
