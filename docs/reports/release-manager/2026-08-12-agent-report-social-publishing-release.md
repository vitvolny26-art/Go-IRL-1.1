---
title: Agent Report — Social Publishing Release
owner: Release Manager
status: Draft
source_of_truth: false
last_review: 2026-08-12
next_review: 2026-08-19
---

# GO IRL social publishing release

## Task

Release protected publishing of a selected GO IRL event to the owned Facebook Page and Instagram Professional account.

## Files inspected

- `api/_shared/admin-authorization.ts`
- `api/_shared/env.ts`
- `.env.example`

## Findings

- Meta app is Live and publishing permissions are Standard Access for owned assets.
- Vercel has a sensitive Instagram publishing token; the existing Page messaging token is used for the owned Page fallback.

## Changes made

- Added protected `POST /api/social/publish-event`.
- The route requires existing server-side admin JWT authorization and validates a selected public/invite event UUID.
- It publishes a Facebook Page feed post and/or Instagram image post only for requested targets. The Instagram post uses the existing public GO IRL logo image plus event caption and link.

## Checks

- `pnpm run typecheck` — PASS (commit `468cab69ac94ba13deddf72f66f4327d3f0e3567`).
- GitHub CI `verify` — PASS for commit `468cab69ac94ba13deddf72f66f4327d3f0e3567`.
- API TypeScript configuration includes the route.
- No secret values are written to source or this report.

## Risks

- Instagram requires a publicly reachable image URL; the route uses the existing public GO IRL logo image.

## Not touched

- Business Verification, Messenger App Review, existing webhooks, and user working-tree changes.

## Next step

Merge the isolated PR, deploy the exact merge commit, and invoke the protected route with a selected event.

Task branch: `codex/social-publishing-release`

Code commit: `468cab69ac94ba13deddf72f66f4327d3f0e3567`

PR: `https://github.com/vitvolny26-art/Go-IRL-1.1/pull/785`
