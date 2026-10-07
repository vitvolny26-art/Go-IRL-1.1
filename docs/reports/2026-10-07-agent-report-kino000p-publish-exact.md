---
title: Agent Report
owner: Automation Engineer
status: Draft
source_of_truth: false
last_review: 2026-10-07
next_review: 2026-11-07
---

# Agent Report

## Task

Kino000P — add a bounded worker and workerctl path that publishes exactly one already-approved compact Cinema catalog movie by its UUID.

## Files inspected

- `scripts/cinema-ingestion-worker.ts`
- `ops/workerctl/go-irl-cinema-workerctl`
- `scripts/cinema-worker-install-contract.test.ts`
- `api/_shared/cinema-daily-candidate-publication.ts`
- `api/cinema/daily-publish.ts`
- Cinema publication governance tests and worker build configuration

## Findings

- Fresh canonical base was `origin/main@34d761d98b698d39c0e29be24bed60b3b18e315f`.
- The existing materializer already enforces exact UUID identity, approved state, readiness, atomic claim and one resulting City Posters event.
- The worker already loads the service-role Supabase configuration from its governed environment.
- The existing workerctl uses direct `systemd-run` argument passing and an existing protected environment file.

## Changes made

- Added worker CLI mode `--publish-exact --catalog-movie-id=<UUID>` with an exact two-argument contract.
- Reused `materializeApprovedDailyCinemaCandidate`, then called `publish_city_poster_events` for only `result.event_id`.
- Added workerctl action `publish-exact <sha> <catalog_movie_id>` with SHA and UUID validation and direct `systemd-run` execution using the existing environment file.
- Added a focused install/runtime contract test for single-movie input, environment wiring and absence of arbitrary shell execution.

## Checks

- Targeted Cinema tests: PASS — 3 files / 16 tests.
- `pnpm run build:cinema-ingestion-worker`: PASS.
- Compiled CLI invalid-UUID fail-closed smoke: PASS.
- Workerctl POSIX shell syntax: PASS.
- `pnpm run repo:check`: PASS — 2167 tracked files.
- `pnpm run typecheck`: PASS.
- `pnpm run lint`: PASS — 0 errors, 2 pre-existing warnings outside the patch.
- `pnpm run build`: PASS — Cinema verification 1 file / 8 tests and Vite production build.
- `pnpm run test`: PASS under LF/CI-equivalent fixture reads — 427 Vitest files passed, 1 skipped; 2106 tests passed, 3 skipped; all auxiliary Staff OS and Kino001D checks passed.
- Native Windows checkout test note: the first run had 26 unrelated literal multiline assertions fail because global Git `core.autocrlf=true` converted tracked fixtures to CRLF. A temporary read-only `readFileSync` LF normalizer reproduced the repository's Linux/CI checkout semantics; it was removed after the green rerun and was never part of the patch.
- `git diff --check`: PASS.

## Risks

- Telegram delivery remains a downstream network operation after materialization, matching the existing daily publication route behavior.
- Exact-head CI is not available before an authorized commit/push/PR and is not claimed.

## Not touched

- No commit, push, PR, merge or deployment.
- No production database, data, environment, secret, n8n activation or Telegram mutation.
- No migration, schema or RLS change.

## Next step

Obtain separate commit approval for the verified bounded patch.
