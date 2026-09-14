---
title: Agent Report — LANG003 Six-language Canonicalization
owner: AI Fixer
status: Draft
source_of_truth: false
last_review: 2026-09-14
next_review: 2026-09-21
---

# Agent Report — LANG003 Six-language Canonicalization

## Task

Promote the canonical application language contract from RU/UK/CS/EN to RU/UK/CS/EN/PL/SK on fresh `main` at `ee1a290fb52a47390f624ccea79a77de1eda3b60`, without protected-area changes.

## Files inspected

- Canonical language, UI language and persistence modules under `src/`.
- Localized application, activity, service, beauty, share and onboarding copy under `src/`.
- Six-language share-card contracts under `api/` and `src/`.
- LANG003 regression tests and repository quality scripts.

## Findings

- The supplied codemod expanded the canonical type but left many four-key localized objects incompatible with the new six-language contract.
- Several tests still asserted the former four-language fallback behavior.
- Social share persistence still restricted assets to four locales.

## Changes made

- Extended the canonical `Language` contract to `ru | uk | cs | en | pl | sk`.
- Added explicit PL/SK keys to localized application objects; existing English and Czech content is used where dedicated copy was not already available.
- Preserved `i18nLegacy.ts` as an explicit four-language internal boundary.
- Updated language parsing, persistence, sharing, reminders, routes and tests to retain PL/SK as canonical values.
- Added dedicated PL/SK City Posters copy.

## Checks

- `git diff --check` — PASS
- `pnpm install --frozen-lockfile` — PASS
- `pnpm run repo:check` — PASS
- `pnpm run test` — PASS (334 files, 1634 tests; staff OS tests PASS)
- `pnpm run typecheck` — PASS
- `pnpm run lint` — PASS with one pre-existing warning in `api/_shared/admin-authorization.ts`
- `pnpm run build` — PASS
- `pnpm run bundle:check` — PASS (31 JavaScript chunks)

## Risks

- Some newly explicit PL/SK values intentionally begin with English/Czech content and require later native-copy review.
- Exact-head GitHub Actions verification has not run because commit, push and PR were explicitly excluded.

## Not touched

- SQL, migrations, Supabase RLS, Auth behavior, secrets, environment files, production configuration and production data.
- Commit, push, pull request, merge and deployment.

## Next step

Owner review of the local LANG003 patch and native PL/SK copy quality before any separately authorized commit.
