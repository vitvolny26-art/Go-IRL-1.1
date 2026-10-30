# Kino000(SR) — exact registry bindings and diagnostic readback

Local cumulative draft based on GitHub main `0dba7e0cd0b0db89efa9d28cdd35dd0a8dbba6b8`.
Commit: not created. Deploy: none. Status: Partial / Gated.

This ZIP contains the prior SR preflight/staging/policy/sequence draft plus exact source bindings, an admin-only diagnostic readback, and a pure durable-attempt journal contract/validator. It does not implement a database migration, publication, or permission to send Telegram messages.

Apply the included `.patch` to the exact baseline on a task branch. Do not copy this package README over the repository README. `verification/` contains standalone isolated behavior checks, not evidence of a full repository build/typecheck.

## New behavior

- `sr-catalog-plan` queries exact source-row UUIDs and verifies registry source ID, venue UUID and source URL against server-owned bindings. It preserves SR source IDs. Disabled sources fail closed.
- `POST /api/cinema/sr-sequence-review` accepts only `{week_key, source_run_id}` through the unchanged admin authorization helper. It reads catalog, event and Telegram ledger relations with exact counts and rejects client-provided attempts/proofs.
- The new route always returns a blocked diagnostic because the current schema cannot prove complete attempt history or an exact non-reused Telegram result. It never invokes the pure sequencer with unknown history represented as `[]`.
- The pure Top7 sequencer remains review-only and is not connected to a live publication path.
- `cinema-sr-publication-attempt-journal.ts` defines the append-only row contract: persist `started` before side effects, preserve `failed`/`unknown`, and require catalog-event, Telegram-message and independent receipt fields for `succeeded`. The live route reads the expected `cinema_sr_publication_attempts` table; until that table exists, it remains blocked and returns unknown rather than an empty history.
- `supabase/migrations/20261030000000_create_cinema_sr_publication_attempts.sql` is a prepared, unapplied migration draft. It enables forced RLS, grants no public access, pins identity fields, prevents deletes, and allows only controlled terminal transition from `started`.

## Verified in this session

- 66/66 existing isolated Node checks rerun on current source.
- 34/34 new isolated Node behavior checks.
- 7/7 mocked HTTP handler checks.
- Five checks over live SQL readback: exact Premiere binding resolves; the three disabled source bindings block; current-week missing catalog blocks.

TypeScript parsing uses Node 24 `stripTypeScriptTypes`. This is not TypeScript typechecking. Full repository pnpm checks, real Vitest, exact-head CI and deployed endpoint execution have not run. `pnpm run typecheck` is blocked by missing package.json in this partial source draft.

## Reproduce isolated checks

Run `node verification/server-readback.mjs` and `node verification/sequence-route.mjs` from this package. For the older four scripts, first emit the pure `api/_shared/cinema-sr-*.ts` modules to `.compiled/*.js` preserving `.js` imports, then run `node --test verification/verify.mjs verification/staging.mjs verification/venue-registry.mjs verification/top7-sequence.mjs`. A TypeScript compiler can emit these modules; Node 24 type stripping can execute them without typechecking.

## Remaining gates

Complete checkout/dependencies and real typecheck/lint/build/test/CI; reviewed durable per-attempt storage/reader; current-cycle exact catalog UUIDs; poster/localization provenance and screening horizon. Source enablement, catalog writes, production storage changes, n8n publication, Git release and Telegram execution require their own approvals. No protected action was performed.

See `docs/reports/2026-10-30-agent-report-kino000sr-server-readback.md` for evidence and the proposed durable-attempt requirements.
