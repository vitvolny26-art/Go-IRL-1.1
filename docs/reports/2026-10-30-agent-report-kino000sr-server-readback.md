---
title: Kino000(SR) exact source bindings and diagnostic server readback
owner: Automation Engineer
status: Draft
source_of_truth: false
last_review: 2026-10-30
next_review: 2026-10-31
---

# Kino000(SR) — local implementation, no release

## Task

Continue the existing Kino000(SR). Repair the source registry namespace/venue mismatch and implement a read-only server diagnostic that cannot mistake missing attempt history for an unattempted film. Status: Partial / Gated. Commit: not created. Merge target: GitHub main. Deploy target: none.

## Files inspected

GitHub main `0dba7e0cd0b0db89efa9d28cdd35dd0a8dbba6b8`: AGENTS.md, DOCS_INDEX.md, README.md, onboarding setup, Automation Engineer charter, reporting contract, daily candidate publisher, daily-publish route, Telegram city-posters publisher, tsconfig.api.json. Existing local SR source, routes and tests came from Kino000SR-sequence-review-20261030.patch. Current Cinema Handoff/Roadmap and n8n execution #51710 were read.

## Findings

Direct read-only PROD SQL confirmed four Olomouc registry rows and four active venues. Source IDs in #51710 differ from registry chain IDs. `cinestar_cz` exists for several venues and is not a unique selector. Pinned mappings below were corroborated by #51710 source URLs and the live source-row/venue links, not inferred from movie titles.

| SR source ID | Exact registry row ID | Registry source ID | Exact venue ID | Observed enabled |
| --- | --- | --- | --- | --- |
| cs_olomouc_premiere | 5e7151bf-4b34-4d9f-9d94-d9c04187a66c | premiere_cinemas_cz | 03ce6924-f552-48bc-bfeb-75970ddaafe4 | true |
| cs_olomouc_cinestar | 9ef5b312-c33d-40ee-b1b3-da02ede1bfa4 | cinestar_cz | 813ab215-5b87-493e-9f07-8e2a14b4ec7b | false |
| cs_olomouc_cinemax | 9fd0e69e-e124-4da2-b998-d36fa0805c8a | cinemax_cz | fb0d735e-0402-47f4-b542-bd091bb79595 | false |
| cs_olomouc_metropol | 4e44d287-dd51-40fd-9f04-d1125f2aa859 | kinometropol_cz | c69faa27-d952-4f09-9e85-8f738996e7f7 | false |

Current cycle `2026-10-22..2026-11-04` has zero Top7 catalog rows. No catalog UUIDs were fabricated. The actual source snapshot remains n8n #51710, run `kino-weekly-olomouc-2026-10-29T07:17:57.612Z`.

Existing Telegram ledger is mutable and contains current message/destination/deletion/error state. It is not a durable attempt history. It cannot prove `reused=false`, never-attempted status, exact source-run lineage or completeness of earlier failures. The current final cinema publication audit does not persist those provider-result fields and treats an audit insert failure as a warning. The diagnostic must therefore remain blocked even if catalog, event and ledger rows look consistent.

## Changes made

- Added server-owned exact source-row/venue/URL bindings; unknown aliases, changed URLs, changed row IDs, wrong venues, inactive venues and disabled sources fail closed. Preserve SR source IDs in screening namespaces.
- Changed `sr-catalog-plan` to query registry rows by exact UUID rather than ambiguous chain source ID. Retained count equality and read-only behavior.
- Added `cinema-sr-sequence-readback.ts` and authenticated `sr-sequence-review.ts`. Reads bounded catalog/event/ledger rows; checks exact week, source run and relation identities; client input is limited to week_key/source_run_id and cannot submit attempts or proof flags.
- Readback always returns blocked/no-action under the current schema: attempt history and exact Telegram attempt proof are unavailable. It does not call the pure sequencer with an invented empty attempt array, infer that retry is safe, or authorize progression.
- Added a pure append-only publication-attempt journal contract/validator. It requires a `started` row before side effects, preserves `failed`/`unknown`, and requires catalog-event, Telegram-message and independent-receipt fields for `succeeded`. This is a local contract only; it performs no database write.
- Included the new route in tsconfig.api.json and updated/added regression tests. No existing publisher or atomic claim was changed.

## Checks

- PASS — 66/66 existing isolated Node regression tests rerun over current TypeScript stripped to executable JavaScript. Registry fixtures updated to the exact binding contract.
- PASS — 34/34 new isolated Node behavior checks (binding tampering, incomplete readbacks, identity changes, unknown history, ledger errors, input spoofing).
- PASS — 7/7 new mocked HTTP smoke checks (method, auth, body bounds, invalid input, missing catalog and DB failure). These use mocked dependencies, not deployed HTTP or installed Supabase package types.
- PASS — local functions evaluated over fresh live SQL snapshot: Premiere resolves; three disabled sources reject; absent current-cycle catalog blocks. This is live-row reconciliation, not a deployed endpoint test or Telegram delivery verification.
- TypeScript typecheck BLOCKED — `pnpm run typecheck` returned `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`: this is a partial local source draft, not a complete dependency-installed checkout.
- Full pnpm repo:check/lint/build/test, real Vitest, installed-package API typecheck and exact-head CI NOT RUN. Node type stripping is not typechecking.
- PASS — cumulative patch whitespace check, clean application against the baseline tsconfig and byte equality for all 17 changed files. ZIP integrity is verified at final packaging and recorded in the delivery checkpoint.

## Supabase schema readback (2026-10-30)

Direct read-only inspection of PROD project `tygfsvjkznypilfyyvdc` confirmed:

- `public.cinema_sr_publication_attempts` does not exist (`to_regclass` returned `NULL`); therefore it has no columns, indexes, RLS or policies.
- `public.city_posters_telegram_publications` exists with only final-state fields: `event_id`, city/chat/message IDs, language, expiry/published/updated timestamps, `deleted_at` and `last_error`. Its primary key is `event_id`; it has an expiry index. It has RLS enabled and no listed policies.
- `public.audit_log` contains generic actor/action/entity/metadata/timestamp fields, but no durable attempt UUID, source run, provider reuse outcome or independent delivery receipt contract.
- No migration, insert, update, policy change, RLS change or other Supabase mutation was performed.

Conclusion: the journal readback correctly remains blocked by a real schema capability gap, not by an empty result. A reviewed migration and server-side writer are still required before the Top7 sequencer can consume attempt history.

## Prepared migration (not applied)

Added `supabase/migrations/20261030000000_create_cinema_sr_publication_attempts.sql` to the local package. It creates the bounded Top7 attempt table, exact identity/receipt checks, scope index, forced RLS with no public grants, and a trigger that blocks deletes, identity rewrites and edits after terminal status. This is a migration draft only: no `apply_migration`, insert, update, policy change or production schema mutation was performed.

## Risks

Bindings are specific to the observed PROD registry. A different environment or changed registry row/URL fails closed and requires independently verified bindings; do not fall back to name/host matching. Three sources remain disabled. Current-week catalog UUIDs, poster/localization provenance and complete screening coverage remain unresolved. The newly added endpoint is a diagnostic and has no success/publication branch until a reviewed durable attempt reader exists.

## Not touched

No commit, push, PR, merge, deployment, n8n edit/activation/publication, production SQL/data/config mutation, source enabling, materialization, atomic claim or Telegram send. No .env, credentials, auth policy, RLS or migrations changed. Existing admin authorization helper is reused unchanged.

## Next step

Complete repository/dependency checks before any release request. Design durable per-attempt evidence inside the existing publication path: exact attempt UUID, catalog UUID, candidate/week/run/rank, authorization reference, claim state, event UUID, actual destination chat/topic, provider message ID, exact `published`/`reused` outcome, error/unknown status, timestamps and independent receipt reference. Record a started attempt before side effects and never infer attempt absence from a missing final-success audit. Enforce idempotency/atomic claim, stop on failed/unknown/in-progress attempts, preserve append-only audit and do not automatically retry. This is a design requirement, not an implemented storage contract or migration. Any production storage/apply, publisher cutover, deploy or send remains a separate gate.
