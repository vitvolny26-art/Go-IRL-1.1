# Cinema ingestion v2 runbook

Status: TEST-only rollout. Production writes and automatic publishing are forbidden until explicit release approval.

## Core invariant

Cinema ingestion is a replayable pipeline, not a one-shot scraper:

`cinema_sources -> immutable snapshot -> parse/staging -> movie identity -> screening identity -> atomic sync -> domain events`

Fetch, parse, resolve and sync are separate steps. A parser failure or incomplete source window must never make existing canonical screenings disappear.

## Control plane

The canonical runtime lives in PostgreSQL/Supabase:

- `cinema_sources` — venue/source/adapter configuration and cadence.
- `cinema_source_snapshots` — immutable raw fetch evidence.
- `cinema_parse_runs` — parser/completeness result for one snapshot/version.
- `cinema_screening_staging` — normalized rows before canonical writes.
- `cinema_ingestion_jobs` — reusable queue.
- `cinema_events` — deduplicated domain events after canonical changes.
- `cinema_publish_jobs` — publishing queue; kept separate and disabled during TEST rollout.
- `cinema_ingestion_health_v` — source health projection.

Control-plane tables have RLS enabled with no client policies. Mutating control-plane RPCs are executable by `service_role` only.

## Queue ownership

The Node worker claims only:

- `FETCH`
- `PARSE`
- `RESOLVE`
- `SYNC`

It deliberately does not claim `ARCHIVE_DRIVE`, `ENRICH`, `EMIT_EVENTS` or `PUBLISH`.

`ARCHIVE_DRIVE` is processed by the external daily automation/connector so Google credentials are not mixed into the ingestion worker. Publishing remains a separate downstream concern.

## Daily scheduling

Sources are due according to `cinema_sources.next_fetch_at` and `fetch_interval_minutes`.

`cinema_enqueue_due_sources()` creates at most one successful/active FETCH job per source and local calendar date using a dedupe key:

`fetch:<source_config_id>:YYYY-MM-DD`

The initial Premiere Olomouc source runs at a 1440-minute cadence in `Europe/Prague`.

## Adapter contract

Every source-specific adapter implements:

1. `fetchSnapshot(source)` — fetch all pages/chunks required to prove the source window.
2. `parseSnapshot(source, snapshot)` — emit the common normalized screening contract plus completeness evidence.

Source-specific parsing must not write canonical tables directly.

Current adapter: `premiere_cz`.

Premiere strategy:

1. Fetch `/filmy/`.
2. Discover same-origin `/filmy/<slug>/` film pages.
3. Fetch all discovered film pages.
4. Parse projection rows from film pages.
5. Use film slug as `external_movie_id`.
6. Prefer source screening IDs when present; otherwise generate a deterministic screening fingerprint.

All fetched HTML pages are preserved inside the immutable snapshot payload.

## Completeness gate

`scope_complete=true` is allowed only when all of the following are true:

- required fetches completed successfully;
- parser is non-fatal;
- parser result is non-zero;
- valid rows meet the source minimum;
- all required pages/chunks for that adapter were fetched;
- parsed maximum schedule date reaches `expected_until`.

If any condition fails, the parse run is quarantined. No RESOLVE/SYNC job is created from an incomplete parse run.

## Movie resolver

Resolution order is deterministic:

1. exact `cinema_movie_sources(source_id, external_movie_id)` mapping;
2. exact `cinema_movies.movie_fingerprint`;
3. bounded normalized title/original-title + release year match, with duration tolerance;
4. if exactly one candidate exists, persist provenance mapping;
5. if multiple candidates exist, mark ambiguous and quarantine;
6. only when no deterministic candidate exists, call `cinema_resolve_or_create_movie()`.

Ambiguous rows never become writable.

## Screening identity

Preferred identity:

`source_id + external_screening_id`

Fallback identity when the source provides no stable screening ID:

SHA-256 over stable source/movie/local-time/language/version/format attributes.

Replay of the same snapshot must produce the same identity.

## Atomic sync

Canonical application is one PostgreSQL transaction through:

`cinema_apply_parse_run(parse_run_id)`

The RPC refuses to run unless the parse is complete and every staging row is fully resolved and `safe_to_write=true`.

Inside the transaction it:

1. starts one `cinema_sync_run`;
2. upserts all screenings;
3. marks staging rows written;
4. finishes the sync run as complete;
5. updates source/venue health;
6. emits one deduplicated `CINEMA_SYNC_COMPLETE` event.

Any error rolls the entire apply back.

The RPC does **not** reconcile or deactivate missing screenings.

## Missing-screening safety

Disappearance reconciliation is a separate future operation and is forbidden unless a complete source window is proven.

Never deactivate/delete prior screenings because of:

- HTTP failure;
- partial fetch;
- zero parser result;
- parser fatal error;
- incomplete date horizon;
- unresolved/ambiguous movie identity.

## Drive archival

Every daily source run should archive:

- raw immutable snapshot;
- normalized schedule/parse summary;
- source/date/content hash/snapshot ID;
- completeness result and any error evidence.

The daily log must be idempotent per source/local date/content identity. A replay must not create duplicate archive/log records.

## Worker commands

Compile/check the worker and Premiere adapter fixture:

```bash
pnpm run verify:cinema-ingestion
```

Build the standalone worker:

```bash
pnpm run build:cinema-ingestion-worker
```

Run one queue batch locally/server-side:

```bash
GO_IRL_CINEMA_WORKER_ENABLED=true pnpm run worker:cinema-ingestion -- --once
```

Required server-only environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GO_IRL_CINEMA_WORKER_ENABLED=true`

During TEST rollout both Supabase values must point to **GO IRL 1.1 TEST**. Never place the service-role key in chat, Git, Drive or client-visible `VITE_*` variables.

## Verification

Database smoke scripts:

- `supabase/verification/cinema_ingestion_v2_smoke.sql`
- `supabase/verification/cinema_atomic_apply_parse_run_smoke.sql`

Adapter fixture:

- `api/_shared/cinema-adapters/premiere-cz.test.ts`

Required release evidence before PROD/publish approval:

- deterministic movie resolution green;
- complete live source snapshot archived;
- identical snapshot replay creates no duplicate movies/mappings/screenings;
- atomic apply green;
- partial/zero/error runs leave canonical data unchanged;
- at least a second independent Olomouc source passes the same gates.
