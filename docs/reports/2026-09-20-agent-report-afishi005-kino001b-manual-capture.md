---
title: Agent Report — AFISHI005 Kino001B Manual Capture
owner: Automation Engineer
status: Draft
source_of_truth: false
last_review: 2026-09-20
next_review: 2026-09-27
---

# Agent Report — AFISHI005 Kino001B Manual Capture

## Task

Capture the seven pending official cinema sources through a manual-only n8n
candidate, preserve sanitized response evidence, add payload-specific replay
parsers, and promote only sources proven by deterministic replay.

## Files inspected

- Google Drive AFISHI005 Kino001B Automation Runtime Handoff
- Google Drive GO IRL Automation Workflows Rating Publishing
- Google Drive GO IRL Kino001B Audit Movies Screenings Runs
- GitHub main at 5a5ef8dd5f88c2fb7873537588aeaf542aa52fc4
- n8n workflow lCno753Nul6Lj1wq

## Findings

- Existing handoff coverage was 10/17.
- Planeta Kino returned official SSR schedule data and replayed deterministically
  to 10 normalized screenings.
- KARO returned an application shell. Its official bundle exposed the public
  movie-schedule request, but a context-free request returned HTTP 400.
- CinemaPark was unreachable from n8n.
- Kinomax returned Yandex SmartCaptcha.
- ODEON, Cineworld, and Multikino returned Cloudflare blocks or challenges.

## Changes made

- Added a manual-only Kino001B capture workflow snapshot.
- Added sanitized fixtures and capture metadata with SHA-256 hashes.
- Added a source-specific Planeta Kino parser and deterministic replay.
- Added validators for capture evidence, source matrix, workflow invariants,
  forbidden fields, and dry-run normalization.
- Updated parser-ready coverage to 11/17. Six sources remain fail-closed.

## Checks

- node scripts/validate-manual-capture.cjs — PASS
- node scripts/replay-captured-kino001b.cjs — PASS
- node scripts/validate-kino001b-monitor.cjs — PASS
- node scripts/dry-run-kino001b.cjs — PASS
- pnpm run repo:check — PASS
- pnpm run lint — PASS with one pre-existing warning
- pnpm run typecheck — PASS
- pnpm run build — PASS
- pnpm run test — PASS, 356 files / 1760 tests
- pnpm run bundle:check — PASS
- git diff --check — PASS

The first full test attempt hit the existing 5-second JPEG rendering timeout.
The isolated test passed on immediate rerun, and the subsequent complete suite
passed without code changes.

## Risks

- The evidence fixtures are time-bound official responses and must not be
  treated as live schedule data.
- The remaining sources require a suitable regional/browser capture runtime or
  documented official API access.

## Not touched

- Daily Schedule activation
- Credentials, secrets, or .env
- Supabase, SQL, schema, RLS, migrations, or production data
- VPS/Vercel infrastructure or configuration
- IMDb/TMDB enrichment, subtitles, or inferred audio language

## Next step

Review the exact-head CI result. Keep Kino001B inactive and schedule-free.
Deployment target remains none for this evidence-only automation patch.
