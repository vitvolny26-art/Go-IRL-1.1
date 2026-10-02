---
title: AFISHI018A replacement artwork candidate
owner: AI Fixer
status: Draft
source_of_truth: false
last_review: 2026-10-02
next_review: 2026-10-02
---

# AFISHI018A — replacement artwork candidate

## Task

Move event 28bbdcc5-659c-4282-87fc-3515afa3f969 from Pokecat/thread 2 to Venku/thread 6 in chat -1004451765209 through the existing publisher. Current status: Partial; code candidate locally verified, production replacement not completed.

Role: AI Fixer, explicitly confirmed. Base: main@81414f58623aca08aeedf16cb4440c45afd70d75. Local branch: fix/afishi018a-replacement-artwork. Commit: not created. Merge target: GitHub main. Deploy target: none for this preparation step.

## Files inspected

- AGENTS.md, DOCS_INDEX.md, README.md, docs/onboarding/CHATGPT_PROJECT_SETUP.md, docs/reports/README.md
- supabase/functions/telegramEventSupergroup/cityPostersPublication.ts and index.ts
- api/_shared/telegram-city-publication-core.ts
- src/akce001BTelegramCityPostersContract.test.ts
- .github/workflows/city-posters-exact-publish.yml
- api/telegram/event-share-card.ts and vercel.json

## Findings

Governed exact-ID publish run 36973114409 / job 110731103514 reached the production Edge Function using the existing GitHub production secret, without exporting secret values. HTTP 502; function_logs at 06:21:07 UTC reported telegram_sendPhoto_failed:Bad Request: IMAGE_PROCESS_FAILED. Deployed v96 replacement uploads original hero_media_url bytes; the event uses an AVIF source. New publication already uses controlled City Posters artwork, but replacement still used the original image.

Production readback after failure: chat -1004451765209, message 97, deleted_at=null, last_error=null, telegram_topic_kind=outdoor. No successful replacement was claimed. No automatic retry was made.

## Changes made

- Replacement now passes telegramMediaUrl(event.canonical_slug,ui) to existing multipart upload helper.
- Existing contract assertion updated to the controlled artwork path.
- Three behavioral tests cover controlled PNG/thread 6 replacement, restoration and replacement cleanup after old-message deletion failure, and fail-closed behavior before Telegram send when image fetch fails.
- Existing ledger compare-and-update, same-chat deletion requirement, photo identity verification and rollback code are unchanged.

## Checks

- pnpm install --frozen-lockfile: PASS, lockfile unchanged.
- pnpm run repo:check: PASS.
- pnpm run lint: PASS, two pre-existing no-console warnings outside this patch.
- pnpm run typecheck: PASS after adapting the test's runtime import to preserve the browser/Deno typecheck boundary.
- pnpm run build: PASS, Cinema checks 30/30.
- pnpm run test: PASS on final run: 388 files passed, 1 skipped; 1886 tests passed, 3 skipped; Staff OS and Kino001D ancillary checks passed.
- An earlier full run timed out once in the existing Telegram JPEG render test; isolated rerun passed 14/14, then unchanged full suite passed. No timeout limit or assertion was weakened.
- pnpm run bundle:check: PASS, 34 JavaScript chunks.
- git diff --check: PASS.
- GitHub exact-head CI: NOT RUN — no commit/push/PR authorized.
- Production fix verification: NOT RUN — candidate not released or deployed to Edge.

## Risks

Tests mock provider and database responses; they do not prove physical production movement/deletion. Controlled artwork endpoint must be available during replacement. Existing cleanup failure handling is retained. Release and production Edge rollout require separate approval; VPS rollout alone does not update the Edge Function.

## Not touched

No commit, push, PR, merge, deployment, SQL/schema/RLS, credentials, secrets or production configuration mutation in this code preparation step. No publication ledger edits or further Telegram publication. Existing AFISHI018A ID retained; no new task created.

## Evidence ledger

| Claim | Evidence | Scope |
| --- | --- | --- |
| Production send failed before successful replacement | RUNTIME:36973114409; job 110731103514; function_logs 2026-10-02T06:21:07.143Z | Exact event UUID only |
| Same-chat replacement retains mandatory old-message deletion and rollback | GH:supabase/functions/telegramEventSupergroup/cityPostersPublication.ts@81414f58623aca08aeedf16cb4440c45afd70d75 | Replacement branch |
| Candidate redirects replacement image fetch to the existing controlled artwork endpoint | Local branch fix/afishi018a-replacement-artwork; behavioral tests 3/3; final suite 1886 passed | Uncommitted candidate only |

## Next step

Obtain explicit commit approval for this bounded candidate. Push, Ready PR, exact-head CI, merge and production Edge rollout remain separate gates. After the fixed runtime is live, recheck current ledger/event state and invoke the existing exact-ID publisher only once for the approved event, verify message ID/thread 6/old-message cleanup and ledger, then sync durable City Posters status and reread it before Completed.
