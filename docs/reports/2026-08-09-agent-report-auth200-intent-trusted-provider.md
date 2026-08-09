---
title: Agent Report — AUTH200 Intent Restoration and Trusted Provider Access
owner: Technical Archivist
status: Draft
source_of_truth: false
last_review: 2026-08-09
next_review: 2026-08-23
---

# Agent Report

## Task

Implement the bounded AUTH200 client increment for semantic external-event intent restoration and trusted-provider core access.

Base commit: `dab0a26`.

## Files inspected

- `DOCS_INDEX.md`
- `README.md`
- `ROADMAP.md`
- `BACKLOG.md`
- `docs/roadmap/ROADMAP_PART_02_RELEASE_PREPARATION.md`
- `src/App.tsx`
- `src/store.ts`
- `src/authSession.ts`
- `src/auth/webAuthFlow.ts`
- `src/auth/googleWebAuth.ts`
- `src/launchSurface.ts`
- `src/guestAppRuntime.ts`
- `src/socialAttribution.ts`
- `supabase/functions/verifyGoogleSession/index.ts`
- `supabase/functions/verifyFacebookSession/index.ts`

## Findings

- OAuth preserved a same-origin return URL, but did not persist a validated semantic `view`, `join`, or `request_to_join` event intent.
- `App` handled `/join/:id` but did not reopen `/e/:id` after provider authentication.
- Store visibility did not treat `/e/:id` as an invited event entry.
- The client write guard explicitly accepted only a newly initialized Telegram session, despite provider sessions using the same trusted GO IRL JWT contract.

## Changes made

- Added a fail-closed external activity-intent parser for `/e/:id` and `/join/:id`.
- Added short-lived OAuth resume metadata for `view`, `join`, and `request_to_join`, cross-checked against the normalized same-origin return URL.
- Restored the target event card after OAuth without automatically joining or requesting participation.
- Included `/e/:id` in invited-event visibility resolution.
- Allowed verified `trusted-telegram` and `trusted-provider` identities through the same client core-write gate.
- Added focused tests for semantic intent, tamper rejection, and trusted identity sources.

## Checks

- `pnpm run repo:check` — PASS
- `pnpm run typecheck` — PASS
- `pnpm run lint` — PASS with one pre-existing warning in `api/_shared/admin-authorization.ts`
- `pnpm run build` — PASS
- `pnpm run test` — PASS: 187 files, 877 tests
- `git diff --check` — PASS

## Risks

- Real Google/Facebook callback and provider-write behavior still require approved runtime smoke verification with real accounts.
- Existing Supabase RLS remains authoritative; this client patch does not broaden database authorization.
- Public unauthenticated `/e/:id` rendering is still a separate next increment.

## Not touched

- Supabase RLS, SQL, migrations, schema, production data, or Edge Functions
- `.env`, secrets, provider credentials, or Meta App Review
- Onboarding, age gate, Terms, or Privacy acceptance
- Push, pull request, merge, or deployment

## Next step

Create the authorized local commit, then request separate explicit permission before push or opening a draft pull request. After merge, implement the public unauthenticated canonical `/e/:id` event card as a separate bounded patch.
