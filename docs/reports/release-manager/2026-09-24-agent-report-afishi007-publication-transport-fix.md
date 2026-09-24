---
title: Agent Report
owner: Release Manager
status: Draft
source_of_truth: false
last_review: 2026-09-24
next_review: 2026-09-25
---

# Agent Report

## Task

Finish AFISHI007 after the exact City Posters production publication reached `telegramEventSupergroup` but failed and restored all four requested events to `ready`.

Base repository: `vitvolny26-art/Go-IRL-1.1`
Base branch: `main`
Base commit: `05dea9a` (`05dea9ac66e73caa82fc9e787e6f20eaa4dbc8a9`)
Task branch: `codex/afishi007-transport-final`
Commit: final release commit recorded by PR #1302 and GitHub checks
Merge target: GitHub `main`
Deploy target: Supabase production Edge Function `telegramEventSupergroup`

## Files inspected

- `.github/workflows/city-posters-exact-publish.yml`
- `supabase/functions/telegramEventSupergroup/index.ts`
- `supabase/functions/telegramEventSupergroup/cityPostersPublication.ts`
- `api/_shared/telegram-city-publication-core.ts`
- `src/afishi007CityPostersManualDispatch.test.ts`
- `src/akce001BTelegramCityPostersContract.test.ts`
- GitHub Actions run `35971392909`
- Supabase production `telegramEventSupergroup` logs for 2026-09-24 09:46 Europe/Prague

## Findings

- The production failure was not an outbound transport outage. Supabase logged `ReferenceError: postUrl is not defined` in `cityPostersPublication.ts` after the Telegram send call returned and before the publication ledger was written.
- GitHub Actions exposed only exit code 1 because it stopped on the non-2xx status before printing a bounded Edge error code.
- The existing per-event rollback restored the database event state, but it did not remove a Telegram message when an exception occurred between `sendPhoto`/`sendMessage` and the publication upsert.
- Because the exception occurs only after a successful Telegram send and message-id validation, the absence of a `city_posters_telegram_publications` row does not prove the absence of an orphan Telegram post. The Olomouc promotions topic requires a manual/runtime check before the final retry.
- The batch dispatcher rolled back only the currently failing event state. A later-item failure could leave earlier newly published items live.

## Changes made

- Restored the missing public Telegram post URL resolver through `resolveCityTelegramUsername`.
- Persisted the publication ledger immediately after a successful Telegram send, before share-button enrichment.
- Added cleanup for every failure after Telegram returns a message id: delete the message, mark the matching ledger row deleted, preserve a bounded error.
- Added reverse-order compensation for newly created publications when any item in the exact batch fails.
- Restored every promoted event to its previous `ready`/`published_at` state after a batch failure.
- Added bounded GitHub Actions diagnostics for HTTP status, JSON error code, and Supabase `sb-error-code` without printing response bodies or credentials.
- Added AFISHI007 and City Posters contract coverage for the resolver, post-send cleanup, batch compensation, and bounded diagnostics.

## Checks

- `pnpm install --frozen-lockfile` — PASS
- `pnpm run repo:check` — PASS
- targeted Vitest (`afishi007CityPostersManualDispatch`, `akce001BTelegramCityPostersContract`) — PASS, 19/19
- targeted ESLint for changed TypeScript files — PASS
- `pnpm exec tsc -p tsconfig.api.json --noEmit` — PASS
- `git diff --check` — PASS
- `pnpm run lint` — PASS with one pre-existing warning in `api/_shared/admin-authorization.ts`
- `pnpm run typecheck` — BLOCKED by exact-main `CityPostersPlanned` casing/missing-export error outside this patch
- `pnpm run build` — BLOCKED by the same exact-main `CityPostersPlanned` missing export
- `pnpm run test` — BLOCKED by 27 existing exact-main contract failures, largely CRLF-sensitive fixtures plus unrelated migration/runtime drift; AFISHI007 targeted tests pass
- Supabase production deployment — NOT RUN, explicit production approval required
- Production publication retry — NOT RUN, explicit production approval required

## Risks

- Run `35971392909` may have left one untracked Telegram post in the Olomouc promotions topic. Re-running before checking/removing or adopting that post can create a visible duplicate.
- The patch cannot be released until the repository-wide required runner gates are green on the exact patch commit. Current `main` is already red locally for unrelated defects.
- Compensation is best-effort across Telegram and Postgres; failures are logged explicitly instead of being reported as a successful rollback.

## Not touched

- No commit, push, pull request, merge, Edge Function deployment, or publication retry.
- No secrets, `.env`, auth, RLS, SQL, migrations, DNS, or production data changes.
- No unrelated exact-main build/test failures were modified.

## Next step

Obtain explicit approval to create and push one final commit and open a PR. Run GitHub Actions on that exact commit. After green CI and separate merge/deploy approval, deploy `telegramEventSupergroup`, verify the deployed source/version, inspect and reconcile the possible orphan Telegram post, then invoke the exact four-event publication once and verify four live Telegram posts, four active publication ledger rows, and four `published` events with non-null `published_at`.
