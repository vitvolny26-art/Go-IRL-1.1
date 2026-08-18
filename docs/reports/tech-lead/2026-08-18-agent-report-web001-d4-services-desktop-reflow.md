---
title: Agent Report — WEB001-D4 Services desktop reflow
owner: Technical Lead
status: Draft
source_of_truth: false
last_review: 2026-08-18
next_review: 2026-08-25
---

# Agent Report — WEB001-D4 Services desktop reflow

## Task

Bounded task `WEB001-D4`: normalize Services desktop density and redesign the opened professional detail as a desktop two-column composition while preserving mobile and Telegram behavior.

Repository: `vitvolny26-art/Go-IRL-1.1`

Base: `main@10aec367da00c8f10216f8d04e83c4601b9644c9`

Branch: `task/web001-d4-services-desktop-reflow`

Original implementation commit: `51b18de2db6949a9e88648d38ba7e6907adaebc2`

## Files inspected

- `src/responsive-shell.css`
- `src/responsive-shell.css.test.ts`
- `src/beauty/BeautyProfessionalProfilePortal.tsx`
- `src/beauty/beauty-professional-profile.css`
- `src/beauty/beauty-professional-profile-overrides.css`
- `docs/reports/README.md`

## Findings

- Services Home used a two-column desktop grid instead of reserving a three-square-card row.
- Services professional catalog dropped to two columns below `1280px`, unlike the desktop Activities density from the existing `960px` web breakpoint.
- The opened professional detail remained a narrow single-column `620px` full-height composition on desktop.
- Review of `51b18de` found that legacy `beauty-professional-profile-overrides.css` uses `!important` on backdrop/shell dimensions, which defeated the initial desktop dimensions despite the new two-column grid.
- The initial task report did not follow the mandatory repository report frontmatter/section contract.

## Changes made

- Services Home reserves a three-column square-card desktop row; only the existing Beauty card is rendered and no future placeholders were added.
- Services professional catalog uses three desktop columns from the existing `960px` web breakpoint.
- Professional detail content is grouped into intro and content panes for desktop two-column layout while base/mobile wrappers remain `display: contents`.
- Desktop web now applies bounded `1120px` profile dimensions, centered backdrop padding, height limits, radius, and close-button spacing with sufficient specificity/`!important` to win over the legacy full-screen override.
- Added a focused regression contract that explicitly covers the legacy `!important` competition.
- Replaced the non-conforming task report with this canonical agent-report structure.

## Checks

Before review feedback, on implementation commit `51b18de`:

- `pnpm run repo:check`: PASS — 1474 tracked files.
- `pnpm run lint`: PASS — 0 errors; one pre-existing `no-console` warning in `api/_shared/admin-authorization.ts`.
- `pnpm run typecheck`: PASS.
- `pnpm run build`: PASS.
- `pnpm run test`: PASS — 210 files / 1009 tests; Staff OS PASS.
- Focused responsive contract: PASS — 6 tests.
- `git diff --check`: PASS.

Review-fix follow-up: local checkout was unavailable in the release runtime because outbound GitHub DNS was unavailable; exact-head GitHub Actions is required before merge and is the authoritative verification for the follow-up commit.

## Risks

- Desktop visual correctness still requires post-deploy runtime verification; HTTP health alone is insufficient for D4 visual completion.
- The legacy full-screen Beauty profile override remains intentionally active for mobile/Telegram, so desktop rules must retain higher specificity where they intentionally differ.

## Not touched

- Mobile layout behavior.
- Telegram Mini App behavior.
- Auth, secrets, RLS, SQL, migrations, production data, DNS, or production configuration.
- Future Services Home placeholder cards.
- Unrelated WEB001-D5+ scope.

## Next step

Push the single review-fix follow-up commit, require exact-head GitHub Actions GREEN, resolve the two P1 review threads, then merge PR #891 only if the PR head and base remain correct. After merge, deploy the exact merged `main` to VPS/Caddy and perform task-specific runtime verification on `https://go-irl.fun`.
