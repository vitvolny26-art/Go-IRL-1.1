---
title: Agent Report — AUTO125 verification command bridge
owner: Release Manager
status: Draft
source_of_truth: false
last_review: 2026-09-05
next_review: 2026-09-12
---

# Agent Report

## Task

Implement the bounded AUTO125 command bridge tracked by GitHub Issue #1121 for pre-commit patch verification on an isolated GitHub-hosted runner and exact-commit dispatch to the existing self-hosted verifier.

## Files inspected

- `.github/workflows/vps-deploy-command.yml`
- `.github/workflows/self-hosted-verify.yml`
- `.github/workflows/vps-deploy.yml`
- `.github/workflows/ci.yml`
- `package.json`
- GitHub Issue #1121

## Findings

- Issue #1121 existed as an inert control issue; no AUTO125 implementation was present on `main`.
- The existing self-hosted verifier already accepts an exact `ref` and `expected_sha` through `workflow_dispatch`.
- The VPS command workflow provides the established repository-owner and exact-command routing pattern, but AUTO125 must never dispatch a deploy workflow.

## Changes made

- Added an Issue #1121-only, repository-owner-only `issue_comment` workflow.
- Added strict parsing for:
  - `/verify-sha <exact-40-character-commit-SHA>`;
  - `/verify-patch <exact-40-character-current-main-SHA> <exact-64-character-patch-SHA256>` with a unified patch between `-----BEGIN GO IRL PATCH-----` and `-----END GO IRL PATCH-----`.
- Normalized CRLF comment input to LF before patch hashing.
- Limited patches to 256 KiB and 100 files; rejected malformed diffs, path traversal, `.env`, secret/credential paths, production-data paths, binary patches, symlinks, and submodules.
- Split routing, patch verification, and SHA dispatch into separate jobs so the patch job has only read-only repository permission; only the non-executing SHA dispatch job receives `actions: write`.
- Applied patches only on an isolated GitHub-hosted runner and ran the full repository gate sequence.
- Routed exact commit verification only to `.github/workflows/self-hosted-verify.yml`.
- Added parser and static workflow guardrail tests.

## Checks

- YAML parse — PASS.
- Node syntax check — PASS.
- Focused AUTO125 tests — PASS, 10/10.
- `pnpm install --frozen-lockfile` — PASS.
- `pnpm run repo:check` — PASS.
- `pnpm run lint` — PASS with one pre-existing non-failing `no-console` warning in `api/_shared/admin-authorization.ts`.
- `pnpm run typecheck` — PASS.
- `pnpm run build` — PASS with existing ineffective dynamic-import warnings.
- `CI=true pnpm run test` — PASS, 316 files / 1528 tests plus Staff OS.
- `pnpm run bundle:check` — PASS with the existing preferred entry-size warning.
- `git diff --check` — PASS.
- GitHub Actions exact-head verification is not available until separately authorized commit, push, and PR steps occur.

## Risks

- The workflow remains inert until it is reviewed, committed, pushed, merged, and present on GitHub `main`.
- A `/verify-sha` command dispatches verification but does not wait for or summarize the downstream run; the downstream workflow remains the evidence authority.
- Patch verification executes repository code on an isolated GitHub-hosted runner. It receives no production secrets and has read-only repository contents permission.

## Not touched

- No deployment workflow, production runtime, Supabase schema/RLS/SQL/migration/data, `.env`, credential, secret, DNS, or domain change.
- No n8n workflow or monitor change.
- No commit, push, pull request, merge, or deployment.

## Next step

Complete local checks, then request explicit commit authorization. Push, PR, merge, activation of the Issue command path, and production deployment remain separate gates.
