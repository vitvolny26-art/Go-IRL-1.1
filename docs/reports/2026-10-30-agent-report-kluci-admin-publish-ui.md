---
title: GO IRL cinema admin publish action
owner: Release Manager
status: Draft
source_of_truth: false
last_review: 2026-10-30
next_review: 2026-11-06
---

# Agent Report

## Task

Add an admin-panel action for the exact approved Kluci cinema catalog movie, using the existing protected single-movie publication API.

## Files inspected

- `src/admin/AdminLoginPage.tsx`
- `src/authSession.ts`
- `api/_shared/cinema-route-handlers/daily-publish.ts`
- `.github/workflows/vps-deploy.yml`
- `.github/workflows/ci.yml`
- `AGENTS.md`, `DOCS_INDEX.md`, `README.md`, `docs/reports/README.md`

## Findings

- Main already provides `POST /api/cinema/daily-publish`; it validates the current admin session, exact approved catalog row, readiness, poster, translations, and screening data, then verifies the Telegram result.
- The admin overview had no control for this operation.
- A push to main for source changes automatically starts the production VPS deployment workflow. Merge therefore has a production side effect.

## Changes made

- Added a confirmation-gated overview card for Kluci catalog ID `88c64632-18e5-4228-a235-5a00efc70699`.
- The card obtains the current trusted access token and calls only the existing exact-ID endpoint.
- No auth checks, server route, production data, schema, migration, or Telegram authorization were changed.
- Implementation commit: `3ab23df`.

## Checks

- Current main at implementation: `f0eedc6951a7dffe9881534b941cd90dc7dfbc68`.
- Compare confirms one changed source file, 70 additions and 1 deletion.
- Local checks: NOT RUN — no local repository checkout is attached.
- Pull-request CI: pending.

## Risks

- The UI action is intentionally scoped to the approved Kluci row.
- Merging the source change will trigger the VPS production workflow. Production deployment is not authorized by the current release request; stop before merge unless that deployment is separately approved.

## Not touched

- Authentication and role checks
- API route and publication state machine
- Supabase schema, RLS, migration, or production rows
- Telegram publishing configuration

## Next step

Complete PR CI. Before merging, resolve the automatic VPS deployment approval gate.
