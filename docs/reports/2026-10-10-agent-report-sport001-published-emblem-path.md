---
title: SPORT001 published emblem path repair
owner: Automation Engineer
status: Draft
source_of_truth: false
last_review: 2026-10-10
next_review: 2026-10-11
---

# Agent Report

## Task
Move the 61 SPORT001 PNG assets into the existing Vite static directory.

## Files inspected
- Base: main 17dcfb2dd120facf4b8882a2a782cb539c81591f.
- vite.config.ts: publicDir is images.
- city-posters/sports/**/team-emblems/*.png.

## Findings
The asset-only PR #1531 stored files outside the static directory. After VPS deployment, an emblem URL returned the application HTML rather than PNG.

## Changes made
Moved 61 files with git mv from city-posters/sports/ to images/city-posters/sports/, preserving relative URLs and file bytes. Branch: task/sport001-published-emblem-path. The owner authorized the corrective local commit; this report is included in that commit (see Git history for its SHA).

## Checks
- repo:check PASS.
- pnpm run build PASS (includes cinema-ingestion typecheck and 49 tests).
- bundle:check PASS.
- git diff --cached --check PASS.
- All 61 source SHA-256 values unchanged; all 61 built dist files match those values and decode as 512x512 RGBA PNG.
- pnpm run lint PASS (two existing no-console warnings; zero errors).
- pnpm run typecheck PASS.
- pnpm run test PASS, including the full Vitest suite and staff-os / KINO001D checks. Tests ran with CPU affinity 0,1 to avoid rendering contention; no test code or timeout changed.

## Risks
Production remains at 17dcfb2. Push, Ready PR, exact-head CI, merge and VPS deployment are separate release stages; this corrective step creates only a local commit.

## Not touched
Renderer/browser emblem selection, configuration, database, credentials and deployed runtime.

## Next step
Push and create a Ready PR when authorized for this corrective branch. Runtime acceptance must verify PNG content type and signature after deployment.
