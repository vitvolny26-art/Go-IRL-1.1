---
title: Agent Report
owner: Technical Archivist
status: Draft
source_of_truth: false
last_review: 2026-08-09
next_review: 2026-08-16
---

# Agent Report

## Task

Implement the next bounded external-entry increment after AUTH200: open canonical public Activity details inside GO IRL for shared `/e/:id` and legacy `/join/:id` routes while keeping protected actions behind trusted authentication.

## Files inspected

- `DOCS_INDEX.md`
- `README.md`
- `ROADMAP.md`
- `BACKLOG.md`
- `docs/roadmap/ROADMAP_PART_02_RELEASE_PREPARATION.md`
- `src/launchSurface.ts`
- `src/guestAppRuntime.ts`
- `src/App.tsx`
- `src/auth/activityEntryIntent.ts`
- `src/publicActivityPreviews.ts`
- `vercel.json`

## Findings

- Canonical web guests at `/e/:id` and `/join/:id` were routed to the root launch surface instead of the application.
- Legacy `/join/:id` sent unauthenticated users to a standalone preview and then discarded the semantic join intent.
- Guest click interception blocked public Activity details together with protected participation actions.
- Shared events outside the visitor's selected city could not be found through the selected-city public catalog alone.

## Changes made

- Added one public guest route policy for `/activities`, `/services`, `/e/:id`, and `/join/:id`.
- Kept Activity details publicly accessible while join, chat, participant identities, organizer profiles, and mutations remain auth-gated.
- Loads sanitized public catalogs across configured cities only for exact shared-event entry and keeps the selected-city catalog as the background list.
- Normalizes legacy `/join/:id` to `/e/:id#join`, preserving attribution parameters and intent without automatic participation.
- Raised the guest auth strip above the Activity sheet so a protected-action prompt remains actionable.
- Added focused route, intent, catalog, and access-policy tests.

## Checks

- `pnpm run repo:check` — PASS
- `pnpm run lint` — PASS with one pre-existing warning in `api/_shared/admin-authorization.ts`
- `pnpm run typecheck` — PASS
- `pnpm run build` — PASS
- `pnpm run test` — PASS, 188 files and 880 tests plus Staff OS
- `git diff --check` — PASS

## Risks

- Real canonical-host and provider-account smoke testing is not yet performed.
- Vercel still rewrites `/e/:id` to its server-rendered preview; this bounded VPS entry patch does not change fallback routing.
- Public entry depends on the existing sanitized catalog RPCs. If the RPC for the event's city is unavailable, the event fails closed as not found.

## Not touched

- Supabase RLS, SQL, migrations, tables, and production data
- OAuth provider configuration, secrets, session format, and account linking
- Automatic join or request execution
- Meta App Review, Vercel routing, DNS, domains, and deployment
- Private participant, chat, organizer, or moderation data projections

## Next step

Publish the WEB200 commit and open a draft PR only after separate authorization, then verify exact-head CI before any merge.
