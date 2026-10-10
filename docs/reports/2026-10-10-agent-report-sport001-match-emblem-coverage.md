---
title: SPORT001 supplementary match-team emblems
owner: Automation Engineer
status: Partial
source_of_truth: false
last_review: 2026-10-10
next_review: 2026-10-11
---

# Agent Report

## Task
Address the five participant names the owner reported as absent from the 61-file SPORT001 collection. Static asset acquisition only. The full participant list of the seven published matches was not independently enumerated.

## Files inspected
- Base main/deployed VPS: `2617b82c8c276f689149e5390081696c3ce431d9` (`2617b82`).
- `images/city-posters/sports/**/team-emblems/*.png`, acquisition script and source manifest.
- Official club/federation pages recorded in `tools/sport001-emblem-acquisition/sport001_match_emblem_coverage.json`.

## Findings
- RC Olomouc, TJ Sokol Mariánské Hory and VK Prostějov B had no PNG in the new sports collection. Their actual logos are available from official club/federation sources.
- BK Loko BaliMania Plzeň already had a logo under `bk-lokomotiva-plzen.png`. Its club announcement dated 2026-09-07 explicitly says the A-team name changed while the club logo remained unchanged.
- VELORY Olomouc's federation club and match pages use `default_club_logo.png`, a generic placeholder. The affiliated Velory Academy volleyball page shows academy branding. A verified separate VELORY Olomouc club emblem was not found; neither the generic image nor academy logo is represented as the team's official emblem.

## Changes made
- Added `rugby/team-emblems/rc-olomouc.png` and `rugby/team-emblems/tj-sokol-marianske-hory.png` from official clubs.
- Added `volleyball/team-emblems/vk-prostejov-b.png` using the federation image actually displayed for VK Prostějov B.
- Added `basketball/team-emblems/bk-loko-balimania-plzen.png` as an exact byte copy of the existing verified Plzeň asset, providing a filename for the published team name.
- All paths are beneath `images/city-posters/sports/`. The collection now has 65 prepared PNGs (61 unchanged + 3 new logos + 1 alias).
- Added five-name coverage evidence including direct source URLs, source/output hashes, public URLs, Plzeň alias provenance and an explicit blocked VELORY record.
- Branch: `task/sport001-match-emblem-coverage`. Owner authorized the local commit; this report is included with the four PNGs and manifest (see Git history for the SHA).

## Checks
- `pnpm run build`: PASS, including its configured cinema-ingestion typecheck and tests.
- `pnpm run bundle:check`, `pnpm run repo:check` (2248 tracked files), and staged diff whitespace check: PASS.
- Image validation: PASS for all four additions: valid 512x512 RGBA PNGs; output SHA-256 matches recorded values and corresponding built dist files.
- Existing 61 source/build hashes: unchanged and PASS.
- Plzeň alias: exact byte/hash equality with existing `bk-lokomotiva-plzen.png`.
- Visual review: all four images display the expected actual club logos. Original artwork retained; existing acquisition normalization only fits/pads to a transparent 512x512 canvas. The white backing present in the official Prostějov source is retained.
- `pnpm run lint`: PASS (two existing no-console warnings, zero errors).
- `pnpm run typecheck`: PASS.
- Full `pnpm run test`: PASS, including staff-os and KINO001D checks. CPU affinity 0,1 was used to avoid rendering contention; no tests or timeouts changed.
- No VELORY substitute PNG created. Coverage is 4/5 of the reported names, with one explicitly blocked.

## Risks
- The seven-match collection is not complete while VELORY's verified emblem is missing. Do not claim 7/7 match coverage.
- Adding static files does not wire resolver aliases or update existing published posters. Those runtime changes are outside this candidate.
- New files are committed locally only and undeployed; production remains at `2617b82` with 61 sports PNGs. Push, Ready PR, merge and deploy remain separate release steps.

## Not touched
Existing 61 PNG bytes, renderer/resolver code, SVG asset paths, published match records, Telegram, credentials, database, production configuration and deployment.

## Next step
Obtain the official VELORY Olomouc logo or explicit confirmation from the club that the academy mark is also its team emblem. Then close the remaining coverage gap and authorize any commit/release steps separately.
