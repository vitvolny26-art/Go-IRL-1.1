---
title: DIST200 Omnichannel Launch Context
owner: GO IRL Technical Archivist
status: Draft
source_of_truth: false
last_review: 2026-08-09
next_review: 2026-08-16
---

# Agent Report

## Task

Prepare the first bounded code increment for GO IRL omnichannel embedded launch support.

## Files inspected

- `ROADMAP.md`
- `docs/roadmap/ROADMAP_PART_05_GROWTH_DECISION_GATES.md`
- `src/clientSurface.ts`
- `src/launchSurface.ts`
- `src/socialAttribution.ts`
- `src/main.tsx`

## Findings

- `main` already has DIST200 smart-link attribution and multi-channel share paths.
- Runtime client detection distinguished only Telegram from generic web.
- Meta and WhatsApp in-app browser entries had no shared runtime context for channel-aware UX.
- The Drive omnichannel roadmap is planning input; GitHub remains authoritative.

## Changes made

- Added a typed launch context for Telegram, WhatsApp, Messenger, Instagram, Facebook, and web.
- Resolve the channel from verified Telegram launch data, normative smart-link attribution, or known in-app user agents.
- Publish stable `data-go-irl-client`, `data-go-irl-channel`, and `data-go-irl-in-app-browser` attributes on the root document.
- Added unit coverage for precedence, supported channels, untrusted values, browser fallback, and document attributes.

## Checks

- Targeted test: PASS, 8 tests.
- Typecheck: PASS.
- Repository hygiene: PASS, 1,379 tracked files checked.
- Lint: PASS with one pre-existing warning in `api/_shared/admin-authorization.ts`.
- Build: PASS.
- Test: PASS, 185 files and 871 tests, plus Staff OS checks.
- `git diff --check`: PASS.
- Commit: not created.

## Risks

- User-agent detection is best-effort and may change as host applications update their embedded browsers.
- Query attribution is limited to the supported `source` allowlist and is not an authentication signal.

## Not touched

- Authentication, secrets, Supabase RLS, SQL, migrations, and production configuration.
- Meta permissions, App Review, deployments, and runtime channel-specific UI.

## Next step

Use the shared launch context for channel-native UI capabilities, beginning with Messenger/Instagram in-app navigation and WhatsApp Flow handoff. Auth, secrets, Meta App Review, and production configuration remain separately gated.
