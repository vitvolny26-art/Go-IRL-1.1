# Release Manager report — Kino EN/Prague catalog v5

## Scope

- Merge target: `main`.
- Deploy target: none.
- Branch: `kino-en-prague-catalog-v5` from `112d3098d61ce07d6786eb9c9c23ec1df227e54f`.
- Production writes, deployment, merge, and n8n activation were explicitly excluded.

## Outcome

- Added the official Picturehouse Ritzy schedule and movie-detail adapter for London.
- Added Cinema City Czech runtime discovery for tenant `10101` and Flora cinema `1052`.
- Kept Cinema City Quickbook as the schedule authority while joining official PL/SK/CS movie-detail metadata.
- Deduplicated equivalent localization candidates for one canonical movie identity; conflicting payloads remain ambiguous and fail closed.
- Expanded the governed runtime mirror from 3 to 7 worker-ready sources, with the remaining 10 sources fail closed.
- Renamed the City Posters planned-view component file to remove a Windows-only case collision that blocked the required typecheck without changing behavior.

## Evidence ledger

| Claim | Evidence | Scope |
| --- | --- | --- |
| Ritzy is backed by an official schedule plus per-film provenance | `picturehouse-uk.ts` joins `/api/scheduled-movies-ajax` to `/movie-details/004/...`; unit tests cover metadata and incomplete-fetch closure | EN London adapter |
| Cinema City Prague uses the requested identity | Source URL is `/cinemas/flora/1052`; CZ runtime defaults are tenant `10101`, locale `cs-CZ`, path `/cz/data-api-service` | CS Prague source |
| PL/SK/CS schedules remain authoritative | Quickbook `film-events` rows create screenings; official film links provide localized title, synopsis, poster, genres, country, age, director, cast, and duration | Cinema City adapter |
| Localization ambiguity is not silently hidden | Equivalent payloads for the same canonical identity collapse deterministically; conflicting localized payloads return `ambiguous` | Localization selector |
| Runtime boundary is fail closed | Repository validators report 17 total, 7 worker-ready, 10 fail-closed; read-only bridge reports 6 executable URLs and 1 closed URL | Repository contract mirror only |
| Required checks are green locally | `repo:check`, lint, typecheck, build, 2093 tests, bundle budget, and diff checks passed | Exact working tree before commit |

## Roles

- Activated: Release Manager.
- Supporting governed module: bounded bug-fix workflow.
- Skipped: Automation Engineer activation work, Supabase/VPS deploy roles, and production operations because deployment, n8n activation, and production writes were out of scope.

## Rollback

Revert the release commit. No external workflow activation, deployment, database mutation, or production write was performed by this task.
