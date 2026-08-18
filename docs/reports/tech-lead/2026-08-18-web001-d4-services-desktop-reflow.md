# WEB001-D4 — Services desktop reflow

Date: 2026-08-18

Role: Technical Lead

Repository: `vitvolny26-art/Go-IRL-1.1`

Base: `main@10aec367da00c8f10216f8d04e83c4601b9644c9`

Branch: `task/web001-d4-services-desktop-reflow`

## Scope

- Normalize the Services professional catalog to a coherent three-card desktop grid.
- Size the existing Services Home card against a reserved three-square-card desktop row.
- Recompose the opened professional detail into two desktop columns.
- Preserve the existing mobile and Telegram layouts.
- Do not add or design the two future Services Home placeholder cards.

## Production baseline

- At `1363x936`, Services Home currently renders one `532x532px` card in a two-column `1073px` grid instead of reserving three square slots.
- At the same width, the Services catalog renders a `1073px` grid with three `347px` cards, but the responsive contract drops to two columns below `1280px` while Activities remains three columns from `960px`.
- The opened professional detail remains a single `620px` column in the same `1363px` viewport and produces a long vertical flow.

## Patch

- Services Home now reserves three square desktop slots; only the existing Beauty card is rendered until the two later placeholders are designed.
- The Services professional grid now uses three columns from the existing desktop-web breakpoint.
- The professional detail groups hero/stats/actions into an intro pane and long-form sections into a content pane.
- Desktop web receives a bounded `1120px` two-column dialog with independent pane scrolling and a shared bottom action row.
- Base/mobile layout keeps both new wrappers as `display: contents`, so existing mobile order and styling remain intact.

## Verification

- `pnpm run repo:check`: PASS — 1474 tracked files.
- `pnpm run lint`: PASS — 0 errors; one pre-existing `no-console` warning in `api/_shared/admin-authorization.ts`.
- `pnpm run typecheck`: PASS.
- `pnpm run build`: PASS.
- `pnpm run test`: PASS — 210 files / 1009 tests; Staff OS PASS.
- Focused responsive contract: PASS — 6 tests.
- `git diff --check`: PASS.

## Release state

- Local patch only.
- Commit, push, Ready-for-review PR, merge, and production deploy require their explicit release gates.

## Rollback

- Before release: discard only the four source/test changes and this report on the task branch.
- After release: revert the exact D4 source commit through a separate reviewed PR and redeploy the resulting `main` SHA to VPS.

## Next

Obtain explicit approval for commit, push, and a Ready-for-review PR. Merge and VPS production deploy remain separate approvals.
