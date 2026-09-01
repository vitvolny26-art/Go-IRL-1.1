---
title: GROOMING021 Closure Consolidation Report
owner: Release Manager
status: Draft
source_of_truth: false
last_review: 2026-09-01
next_review: 2026-09-08
---

# GROOMING021 Closure Consolidation Report

## Task

Consolidate the durable repository evidence for GROOMING021 before final task closure.

GROOMING021 began as the Beauty `save_my_beauty_profile_v4` ambiguous `profile_id` persistence repair and continued, under the same real task ID, through the production-proven Business Card service-identity correction and the final real-browser persistence UX correction.

The final user-visible browser-save source is **Commit: aa42bff** (`aa42bff5d32062a40c9f07bb2aa60901903b110e`). It adds a real Save action inside the Beauty Master Workspace Business Card and routes that action through the existing guarded workspace persistence path.

## Files inspected

- `AGENTS.md`
- `DOCS_INDEX.md`
- `README.md`
- `docs/onboarding/CHATGPT_PROJECT_SETUP.md`
- `docs/reports/README.md`
- `src/beauty/BeautyMasterWorkspacePage.tsx`
- `src/beauty/BeautyShareCardEditor.tsx`
- `src/beauty/beautyShareCardRepository.ts`
- `src/beauty/beautyShareCardServiceIdentity.ts`
- `src/beauty/BeautyMasterWorkspacePage.persistence.ux.test.ts`
- `src/beauty/BeautyShareCardEditor.media-actions.ux.test.ts`
- `src/beauty/beautyShareCardServiceIdentity.test.ts`
- `supabase/migrations/20260831114500_grooming021_beauty_save_v4_profile_id.sql`

## Findings

1. The original production profile-save failure was a real SQL ambiguity in `save_my_beauty_profile_v4`. The forward GROOMING021 migration qualified the Beauty service table reference while preserving the RPC security and execution contract; production structural verification later confirmed the ambiguous predicate was absent.
2. A first Business Card service-identity release, **Commit: 5e138c4**, incorrectly normalized selected client keys to database UUIDs. A real production smoke proved that `save_my_beauty_share_card` consumes `beauty_professional_services.client_key`; the UUID interpretation is therefore superseded historical evidence.
3. **Commit: 6dfdd8a** corrected that production contract: current client keys persist unchanged, legacy UUID selections resolve back to current client keys, non-empty selections resolve before uploads, and unknown identities fail closed. The authenticated production Save / reload / Publish / Unpublish smoke was GREEN.
4. The later real-user browser test exposed a separate client UX defect: the visible Business Card-local Update action regenerated artwork but did not invoke persistence. Production profile/card/Storage state did not advance after the user's attempt.
5. **Commit: aa42bff** fixed that final browser defect by exposing a real in-card Save on the Master Workspace and wiring it to the existing guarded `saveWorkspace()` flow. The legacy renderer-only Update action remains available only where no `onSave` contract is supplied, preserving the SetupPage auto-save behavior.
6. The owner subsequently returned **GREEN** for the final production browser/UI smoke. This clears the user/browser acceptance gate.
7. Current GitHub `main@602ba65074da9a4a40d0726f4b0e2bbfb3f7c503` remains a descendant of the GROOMING021 browser-save merge `08dc87b674945ea07a15883d303b8685214e7b4a`; a fresh compare reports `ahead_by=8`, `behind_by=0`, with `08dc87b` as merge base. The later main changes are separate workstreams.

## Changes made

This report is a documentation-only consolidation artifact required by the repository reporting contract. It introduces no new product behavior.

Previously shipped GROOMING021 behavior consolidated here includes:

- production repair of the Beauty profile-save `profile_id` ambiguity;
- Business Card service selection persisted with canonical Beauty service `client_key` values;
- legacy UUID-to-client-key restoration compatibility;
- service-identity resolution before share-card asset uploads;
- real in-card Save in Beauty Master Workspace using the existing guarded workspace persistence path;
- preservation of the SetupPage renderer-only Update behavior where SetupPage already auto-saves.

## Checks

Historical final browser-save release evidence for **Commit: aa42bff**:

- PR #1075 exact-head CI #2679 / run `33464866120` / verify `99722517975`: **PASS / SUCCESS**.
- Guarded squash merge: `main@08dc87b674945ea07a15883d303b8685214e7b4a`.
- Post-merge exact-main CI #2686 / run `33466070465` / verify `99726084277`: **PASS / SUCCESS**.
- Governed VPS execution `25031`: SSH code `0`, branch `main`, exact SHA `08dc87b674945ea07a15883d303b8685214e7b4a`, production Vite build **PASS**, `go-irl.fun` HTTP `200`, Vercel hook not called.
- Owner production browser/UI acceptance: **GREEN**.

Current ancestry/runtime reconciliation:

- Fresh GitHub main: `602ba65074da9a4a40d0726f4b0e2bbfb3f7c503`.
- Fresh compare from `08dc87b` to current main: `ahead_by=8`, `behind_by=0`, merge base `08dc87b`.
- Current-control evidence records governed VPS execution `25492` on exact `main@602ba65074da9a4a40d0726f4b0e2bbfb3f7c503`: SSH code `0`, branch `main`, production build **PASS**, `go-irl.fun` HTTP `200`.

Checks for this documentation-only report change:

- Application code checks: **NOT RUN — docs-only**.
- This report-only commit must pass the repository's exact-head GitHub Actions workflow before merge. Exact CI evidence is recorded in the PR/check ledger rather than rewritten into this immutable report after creation.

## Risks

- This report is non-authoritative evidence (`source_of_truth: false`); verified runtime and GitHub main remain authoritative.
- Until this report PR is merged, the mandatory repository closure artifact is not present on `main`, so GROOMING021 must remain IN PROGRESS.
- GitHub main may advance before merge. Exact PR head, mergeability, CI state, and current main must be rechecked before any separately authorized merge.

## Not touched

This report change does not modify application code, CSS, SQL, schema, RLS, migrations, RPC signatures, authentication, `.env`, secrets, provider configuration, production data, Storage, n8n, VPS/Vercel configuration, DNS, or production infrastructure.

No production deployment is required or authorized by this report-only gate.

## Next step

1. Publish this single-file docs-only commit on a Ready/Open PR and require exact-head GitHub Actions GREEN.
2. Stop before merge. Merge requires a separate explicit owner approval for the exact report commit.
3. After an authorized merge, read the report back from `main`, reconcile Current Control, Beauty Unified Master Roadmap, Maintenance Contract, Release Manager evidence and ClickUp, and only then mark GROOMING021 Completed if all closure gates remain GREEN.

Knowledge classification for this report-only change: **No semantic KB delta**. Reason: it consolidates already-verified GROOMING021 evidence and changes no product, runtime, role, permission, data, provider, or infrastructure semantics.
