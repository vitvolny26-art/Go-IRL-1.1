---
title: Agent Report — Olomouc Telegram activity autopost
owner: AI Fixer
status: Draft
source_of_truth: false
last_review: 2026-09-01
next_review: 2026-09-08
---

# Agent Report

## Task

Connect new public Olomouc activities to the correct city Telegram group, automatically post and pin them in the relevant Czech topic, remove the Telegram message after the event ends, and expose the correct city chat from the event details view.

## Files inspected

- `src/store.ts`
- `src/types.ts`
- `src/config/cities.ts`
- `src/components/ExternalTelegramChatPanel.tsx`
- `src/eventInteractionState.ts`
- `src/invitationLink.ts`
- `api/reminders/run.ts`
- existing reminder and notification workers
- Telegram Web group `Go IRL — Olomouc`

## Findings

- No existing n8n workflow or application code implemented city-group activity autoposting.
- The correct group is Telegram supergroup `-1004451765209`, with stable public URL `https://t.me/GoIRL_Olomouc`.
- The group had only the owner and no bot, so posting, pinning, and deletion could not work.
- Existing Vercel reminder worker already runs with Supabase service access and the production Telegram bot token, so extending it avoids a duplicate scheduler or schema migration.

## Changes made

- Added `@GOirl_bot` to the correct Olomouc group and promoted it with only `Delete Messages` and `Pin Messages` rights.
- Added canonical Olomouc Telegram group and topic IDs to city configuration.
- Added a worker sync that:
  - selects Olomouc activities;
  - publishes only public, not-yet-finished events;
  - routes them to `Pokecat`, `Hudba a večírky`, `Kultura`, `Sport`, `Venku`, `Vzdělávání / networking`, `Hry / komunita`, or `Kam s dětmi`;
  - sends bilingual Czech/Russian text;
  - pins the new message;
  - unpins and deletes it after the event end time;
  - removes a tracked post immediately if the event becomes non-public;
  - signs stored Telegram message state so user-editable metadata cannot forge a message ID for deletion.
- Added the stable Olomouc city-chat button to public event details.
- Preserved signed Telegram state when an organizer edits an activity.
- Added focused unit and UX coverage.

## Checks

- `pnpm run lint` — PASS with one pre-existing warning in `api/_shared/admin-authorization.ts`.
- `pnpm run build` — PASS.
- `pnpm run typecheck` — PASS.
- Focused tests — PASS, 13/13.
- Full `pnpm run test` on Windows — 1391/1411 tests passed; 20 existing exact-source assertions failed because the checked-out files use CRLF while those tests require LF. The mandatory GitHub Linux runner remains the release authority.
- `git diff --check` — PASS.

## Risks

- The worker must already be scheduled in production and `REMINDER_WORKER_ENABLED=true`; this is existing production infrastructure, not changed here.
- A real Telegram post was not sent during preparation because that would create user-visible production content. Production smoke test is still required after release authorization.
- Deleting an activity row before the cleanup worker sees it can leave its Telegram post behind; end-time cleanup and visibility-change cleanup are covered. Cancellation/delete cleanup should be added in a later bounded task if required.

## Not touched

- No Supabase schema, migration, RLS, auth, secret, or `.env` change.
- No n8n workflow created or published.
- No commit, push, pull request, merge, or deployment.

## Next step

Obtain explicit release authorization, create one final commit, run the required GitHub runner checks on that exact commit, then deploy and perform one controlled Olomouc event smoke test.
