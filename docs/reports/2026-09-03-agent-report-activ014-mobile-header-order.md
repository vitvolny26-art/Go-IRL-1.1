---
title: Agent Report — Activ014 Mobile Header and City Cleanup
owner: AI Fixer / QA + UX Polish Agent
status: Draft
source_of_truth: false
last_review: 2026-09-03
next_review: 2026-09-10
---

# Agent Report

## Task

Apply the owner-requested mobile header order and remove Přerov from the shared application city registry under one Activ014 task. City and Language must sit immediately after the GO IRL logo, the admin build badge must sit in the upper-right corner on mobile, the notifications bell must sit directly below it, and Přerov must no longer be exposed by the shared city configuration.

## Files inspected

- `src/components/DevPanel.tsx`
- `src/components/DevPanel.test.ts`
- `src/styles.css`
- `src/config/cities.ts`
- `src/config/cities.test.ts`
- `docs/reports/README.md`
- PR #1095 review threads

## Findings

The initial Activ014 patch passed CI but review identified three layout defects: desktop badge overlap risk, insufficient parent-level mobile alignment, and an overly broad notification selector that could also target nested beauty workspace controls. Review also identified the missing durable task report. The shared city registry still exposed `prerov`, and its config test listed the same city in the approved set.

## Changes made

- Keep the admin build badge in the existing header-controls flow on desktop.
- On mobile only, position the build badge in the upper-right corner.
- On mobile only, position the direct notification child below the badge.
- Set the mobile header parent and controls to start alignment so City + Language follow the logo instead of being separated by `space-between`.
- Scope the notification selector to a direct child of `.header-controls`.
- Update the DevPanel test contract.
- Remove `prerov` from `src/config/cities.ts` so shared city selectors/clients no longer expose Přerov.
- Update the approved city-set regression test accordingly.

## Checks

Initial head `319ceb5ca3f69055a47f80d0aa7de4cd53d057f7`, GitHub Actions CI run `33722817037`:

- `pnpm run test` PASS
- `pnpm run typecheck` PASS
- `pnpm run lint` PASS
- `pnpm run build` PASS
- repository/diff/bundle-budget checks PASS

Current combined Activ014 head requires fresh exact-head CI after the review fixes and city-registry change; final status must be verified before merge.

## Risks

Removing Přerov from the shared city registry intentionally removes it from application surfaces driven by that registry. Historical database/migration records are not modified. Runtime/UI verification is still required after an approved merge/deploy. The current task does not authorize merge or deployment.

## Not touched

No SQL, RLS, schema, migrations, `.env`, secrets, production data, or production infrastructure changes.

## Next step

Wait for exact-head CI on PR #1095, reconcile review threads, and request separate approval before merge/deploy.
