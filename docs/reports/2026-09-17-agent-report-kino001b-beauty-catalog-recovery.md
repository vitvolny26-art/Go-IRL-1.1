---
title: Agent Report — Kino001B Beauty Catalog Recovery
owner: AI Fixer
status: Draft
source_of_truth: false
last_review: 2026-09-17
next_review: 2026-09-24
---

# Agent Report

## Task

Restore the live Cinema Catalog and Planned cards to the approved Beauty-style presentation after the mobile production surface rendered raw poster/title/date markup.

## Files inspected

- `src/city-posters/cinema/CinemaPostersCatalog.tsx`
- `src/city-posters/cinema/cinema-posters.css`
- `src/city-posters/cinema/cinema-beauty-parity.css`
- `src/services/services-client.css`
- `src/cityPostersCinemaCardUxContract.test.ts`
- Git history around `039c3b1`, `3ffe177`, `a3b5436`, `1f3550a`, and `29ee2ef`
- Vercel deployment `dpl_8VRjGtbgxq7NwT3swPL37f2gN6Dx`

## Findings

- Deployment `8VRjGtbgxq7NwT3swPL37f2gN6Dx` is exact commit `3ffe177`, the change after which the Cinema presentation incident was recorded and reverted.
- The existing Beauty parity layer covered only `For You`; Catalog and Planned retained a separate compact markup contract.
- The runtime inline CSS guard also covered only the `cinema-for-you-*` structure, so it could not protect the Catalog markup observed in the mobile failure screenshot.

## Changes made

- Reused the stable Beauty card structure for Cinema Catalog and Planned cards.
- Preserved current Cinema data, date selection, details, share, ticket, and planned-state flows.
- Added Catalog/Planned grid and planned-state coverage to the Beauty parity layer and inline runtime fallback.
- Moved the runtime fallback style from every `For You` card to one style element per rendered Cinema surface.
- Updated the focused Cinema UX contract test.

## Checks

- `git diff --check` — PASS
- `pnpm install --frozen-lockfile` — PASS
- `pnpm run repo:check` — PASS
- `pnpm run test` — PASS on rerun: 349 files, 1708 tests; initial parallel cold run had two unrelated Sharp JPEG timeouts, both passed in isolated verification before the full rerun
- `pnpm run typecheck` — PASS
- `pnpm run lint` — PASS with one pre-existing warning in `api/_shared/admin-authorization.ts`
- `pnpm run build` — PASS; Cinema ingestion 13/13, 514 modules
- `pnpm run bundle:check` — PASS; 33 JavaScript chunks
- Focused `src/cityPostersCinemaCardUxContract.test.ts` — PASS, 7/7 before the final fallback assertion update

## Risks

- Real Telegram WebView visual acceptance remains required after deployment; local and static checks do not replace the owner screenshot gate.

## Not touched

- Auth, RLS, SQL, migrations, secrets, production data, production configuration, merge, and deployment.

## Next step

Rerun the focused contract after the final fallback assertion, review the exact diff, then obtain explicit commit authorization before creating a release commit.
