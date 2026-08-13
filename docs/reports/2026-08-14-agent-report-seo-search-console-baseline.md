---
title: Agent Report
owner: Technical Archivist
status: Draft
source_of_truth: false
last_review: 2026-08-14
next_review: 2026-08-21
---

# Agent Report

## Task

Audit the SEO and Google Search Console baseline on fresh `main@c43e994` and prepare one bounded homepage metadata patch without changing routing, deployment, authentication, database, or production configuration.

## Files inspected

- `index.html`
- `public/robots.txt`
- `public/sitemap.xml`
- `public/googleb92001635707669c.html`
- `public/manifest.webmanifest`
- `public/service-worker.js`
- `vite.config.ts`
- `vite.config.test.ts`
- `vercel.json`
- `api/meta/event-preview.ts`
- `src/main.tsx`
- `src/launchSurface.ts`
- `src/guestAppAccess.ts`
- `src/auth/activityEntryIntent.ts`
- `tests/api/meta/event-preview.test.ts`

## Findings

- The homepage canonical, robots sitemap declaration, sitemap homepage URL, and permanent Google verification file already use `https://go-irl.fun/`.
- The homepage title and description were too generic to describe the current Olomouc Activities product.
- Homepage Open Graph and Twitter metadata were canonical but lacked consistent descriptive copy and image details.
- No homepage structured data existed; `WebSite` is supported by the actual public site without inventing organization, rating, price, address, or Event claims.
- `/e/<id>` is a public SPA entry on the VPS frontend, while the repository's dynamic OG HTML is implemented as a Vercel rewrite. This is not enough evidence that production activity URLs deliver crawlable server-rendered HTML, so dynamic activity SEO is deferred.
- Authenticated/private surfaces are not added to the sitemap by this patch.

## Changes made

- Added a useful homepage title and description aligned with the current Olomouc Activities product.
- Kept canonical, Open Graph, and Twitter metadata on `go-irl.fun` and made their copy consistent.
- Added minimal `WebSite` JSON-LD without adding a global robots directive to the shared SPA shell.
- Added a regression test for canonical metadata, crawler files, verification-file persistence, and the absence of legacy/Vercel sitemap hosts.

## Checks

- `pnpm install --frozen-lockfile` — BLOCKED: workspace network approval was unavailable; validation reused dependencies from a compatible local checkout with the same `pnpm-lock.yaml`.
- `pnpm run repo:check` — PASS.
- `pnpm run lint` — PASS with one pre-existing warning in `api/_shared/admin-authorization.ts`.
- `pnpm run typecheck` — PASS.
- `pnpm run build` — PASS.
- `pnpm run test` — PASS: 201 files, 951 tests, plus Staff OS checks.
- Dependency-free SEO/public-file assertions — PASS.
- `git diff --check` — PASS.
- Built `dist` crawler files match their source files exactly; built-index metadata verification — PASS.

## Risks

- Search Console recrawl and indexing remain asynchronous and are not guaranteed by metadata alone.
- Dynamic Activity indexing remains blocked on verified production HTML/routing behavior and a separate privacy-aware architecture review.

## Not touched

- `/e/*` routing or dynamic Activity SEO architecture
- `robots.txt`, `sitemap.xml`, or Google verification content
- Service worker/cache version
- Auth, profiles, chats, admin, Supabase, RLS, SQL, migrations, or secrets
- DNS, Caddy, VPS, Vercel, analytics, deployment, or production configuration

## Next step

Review the bounded patch and exact local check results. Create no commit, branch, PR, merge, or deployment without a separate release authorization.
