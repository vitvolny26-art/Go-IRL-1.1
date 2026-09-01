---
title: Agent Report
owner: Technical Archivist
status: Draft
source_of_truth: false
last_review: 2026-09-01
next_review: 2026-09-15
---

# Agent Report

## Task

Create one bounded async import boundary on top of `50cd25bc` to restore VPS bundle headroom.

## Files inspected

- `src/main.tsx`
- `src/services/ServicesClientViews.tsx`
- `src/services/ServicesBookingsPortal.tsx`
- `src/beauty/BeautyHomeEntryPortal.tsx`
- `src/beauty/BeautyProfessionalProfilePortal.tsx`
- `src/beauty/BeautyShareCardStaffStatusPortal.tsx`
- `src/beauty/ServicesBottomNavigationPortal.tsx`
- `vite.config.ts`

## Findings

Services catalog and the independent Services/Beauty portal group were still statically imported by the entry module.

## Changes made

- Added `ServicesExperiencePortals` as one lazy-loaded group.
- Lazy-loaded the public Services catalog route.
- Preserved the existing portal order and all route conditions.

## Checks

- `pnpm run lint` — PASS (one pre-existing warning in `api/_shared/admin-authorization.ts`).
- `pnpm run typecheck` — PASS (exact-head CI #2710 / run 33571472401 / verify 100066147159).
- `pnpm run build` — PASS; entry `40.64 KiB` gzip; largest JS chunk `76.53 KiB` gzip.
- `pnpm run test` — PASS; 296 files and 1,422 tests.

## Next step

Run normal PR CI and verify Services and `/masters` manually in the release environment.
