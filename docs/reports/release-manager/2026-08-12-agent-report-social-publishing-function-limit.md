---
title: Agent Report — Social Publishing Function Limit
owner: Release Manager
status: Draft
source_of_truth: false
last_review: 2026-08-12
next_review: 2026-08-19
---

# Agent Report

## Task

Keep social publishing deployable on the Vercel Hobby function limit.

## Files inspected

- `api/admin/session.ts`
- `api/social/publish-event.ts`
- `vercel.json`

## Findings

Vercel rejected merged SHA `17c96dc` because it would create a thirteenth Serverless Function.

## Changes made

Moved the publishing implementation to a shared module, routed the existing public path through `api/admin/session`, and deleted the standalone function.

## Checks

- `pnpm install --frozen-lockfile` — PASS
- `pnpm run typecheck` — PASS
- `git diff --check` — PASS

## Risks

Production deploy and real Meta publishing remain to be verified after CI and merge.

## Not touched

Vercel plan, secrets, Meta configuration, and the user's main worktree.

## Next step

Run CI, merge the exact fix commit, then trigger one Vercel production deployment.
