---
title: COMM-001 Event Topics Runtime — Tech Lead Report
owner: Tech Lead
status: Partial
source_of_truth: true
work_id: COMM-001
last_review: 2026-08-24
next_review: 2026-08-24
---

# COMM-001 Event Topics Runtime

## Task
Implement the bounded runtime contract for one canonical Telegram forum supergroup with one forum topic per GO IRL event, on top of the already-applied production schema migration.

## Files inspected
- `supabase/functions/telegramEventSupergroup/index.ts`
- `src/telegramEventSupergroup.ts`
- `src/externalTelegramChat.ts`
- `src/externalTelegramChatRepository.ts`
- `src/components/ExternalTelegramChatPanel.tsx`
- associated tests
- production `activities` column metadata (read-only)

## Findings
- Fresh GitHub authority before the change: `main@90b9f7ccb197cccd02b2c60c243f3e49f3629a1c`.
- Production schema already contains `telegram_message_thread_id` and topic lifecycle timestamps.
- Existing runtime still used the legacy `startgroup` binding flow and did not create Telegram forum topics.
- The existing participant-safe access rule already exposes the activity Telegram row to the organizer and `joined` participants, so no second membership store is required.

## Changes made
- Added trusted organizer `create_topic` action in `telegramEventSupergroup`.
- Added canonical supergroup runtime config contract `TELEGRAM_EVENT_SUPERGROUP_CHAT_ID`; no value or invite secret is committed.
- Added Telegram `getChat`, `createChatInviteLink`, and `createForumTopic` flow with reuse of an existing active topic row.
- Persisted forum `message_thread_id`, topic timestamps, canonical chat metadata, and a participant-safe group invite link.
- Added derived private topic URL `t.me/c/<chat>/<thread>`.
- Changed event lifecycle presentation to `deletion_due` at event end + 24 hours.
- Replaced the event panel's primary legacy group-binding UI with `Создать тему в Telegram`, `Вступить в группу`, and `Открыть тему события`.
- Preserved legacy startgroup helpers/backend handling for compatibility, but they are no longer exposed by the event panel.

## Checks
- Local full repository `pnpm` gates were not run because the available container cannot resolve `github.com` for a fresh checkout.
- GitHub Actions exact-head CI is mandatory after commit/PR creation.
- Production runtime is not changed by this commit/PR preparation.
- Production config `TELEGRAM_EVENT_SUPERGROUP_CHAT_ID` is not set by this change.
- Automatic `deleteForumTopic` worker is not implemented in this Tech Lead slice; only `topic_delete_after` and client lifecycle state are prepared.

## Evidence ledger
Claim | Evidence | Scope
--- | --- | ---
Fresh base is `90b9f7c` | GH:main@90b9f7ccb197cccd02b2c60c243f3e49f3629a1c | repository base before task commit
Production topic columns exist | SUPABASE:tygfsvjkznypilfyyvdc information_schema read | `public.activity_external_telegram_chats`
Runtime patch is bounded to Telegram event topics | GH:feat/comm001-event-topics-runtime | files listed in this report
Production config and delete worker remain gated | GH:docs/reports/tech-lead/2026-08-24-comm001-event-topics-runtime.md | this bounded task

## Next step
Run GitHub Actions on the exact task commit. If GREEN, separately authorize production configuration for the canonical Telegram supergroup and an Automation Engineer lifecycle worker before any production release.
