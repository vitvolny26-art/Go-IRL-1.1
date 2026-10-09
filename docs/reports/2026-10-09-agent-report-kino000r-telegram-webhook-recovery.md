---
title: Agent Report — Kino000R Telegram Callback Webhook Recovery
owner: Automation Engineer
status: Draft
source_of_truth: false
last_review: 2026-10-09
next_review: 2026-10-16
---

# Agent Report — Kino000R Telegram Callback Webhook Recovery

## Task

Continue Kino000R without creating a new task ID. Audit the Telegram `callback_query` ownership gap between Supabase `telegramEventSupergroup` and the n8n Archivist, prepare a bounded recovery patch, and preserve all production and release gates.

Result: **Partial / Gated**. The observed callback delivery conflict remains highly likely but is not conclusively proven because authoritative `getWebhookInfo` evidence for both exact bots is still unavailable. Real callback delivery after remediation is not verified.

## Role

Automation Engineer, using the Active Drive operating instruction and production gate. Merge target: GitHub `main`. Deploy target: none. Commit: not created.

## Sources inspected

- GitHub `main` at `b12e703340e9fce18fcb91e6266cb30024c64ec5`.
- Drive `00 — AI Instructions Index`, Active Automation Engineer instruction, Common Operating Standard, Evidence Contract and Production Gate.
- Drive `Cinema Workspace — Current Handoff` and `Kino000A–Kino00X — Cinema Weekly Curation & Publication Roadmap`, both updated on 2026-10-09.
- n8n Archivist `ot1NwNlcqD0vOHrn`: active `610e4433-4163-4d10-b9b4-5a26a1cb6d48`, draft `add89d75-b659-4d4e-a463-e18bc33dcdf4`.
- n8n TEST Orchestra `ulCZrP3Ci0YJy1TY`: Telegram Trigger disabled in active and draft.
- Supabase production project `tygfsvjkznypilfyyvdc`, deployed `telegramEventSupergroup` ACTIVE version 104.
- Local `telegramEventSupergroup` callback handlers and tests.

## Files inspected

- `supabase/functions/telegramEventSupergroup/index.ts`
- `supabase/functions/telegramEventSupergroup/legacy.ts`
- `supabase/functions/telegramEventSupergroup/index.test.ts`
- City Posters, Communication, post-event and repeat callback handlers under `telegramEventSupergroup/`
- `docs/governance/CINEMA_TELEGRAM_LIFECYCLE_POLICY.md`
- `docs/governance/N8N_ARCHIVIST_HANDOFF.md`
- current Cinema Drive handoff and roadmap

## Findings

1. Fresh GitHub `main` remains exactly `b12e703340e9fce18fcb91e6266cb30024c64ec5`; no open remote Kino000R webhook-recovery branch was found. Historical Kino000R PRs are merged/closed context, not a current implementation branch.
2. Archivist remains active with an enabled Telegram Trigger subscribed to `message` and `callback_query`. No Archivist execution exists after `2026-10-09T13:11:50Z`, despite the owner-confirmed press of message 316.
3. TEST Orchestra has its duplicate Telegram Trigger disabled in both active and draft graphs.
4. Supabase deployed `telegramEventSupergroup` version 104 has 17 bundled files and no `kino:` or `kino:probe` handler. Its current callback chain handles City Posters, Communication, post-event and repeat callbacks; anything else can fall through to legacy behavior and receive HTTP 200.
5. Repository/runtime intent identifies two different bot surfaces: Supabase and public GO IRL links target `@GOirl_bot`, while the confirmed Archivist outbound bot is `@GoIRL_doc_bot` (ID `8675060027`). This supports **Option B — separate bots** as the minimum-risk target. It does not prove which token/webhook is currently configured in each runtime.
6. The exact Supabase bot identity and registered webhook can be exposed safely through a read-only, service-role-gated action after an approved deploy. A separate credential-safe `getWebhookInfo` check is still required for the n8n Archivist bot.
7. Rank 3 movie `57447934-fc38-4952-bd63-0a3e25d66102` was not changed or approved. The known `cs_prague_premiere` provenance blocker remains outside this patch.

## Changes made

- Created local branch `kino000r-telegram-webhook-recovery` from exact `main`.
- Added `telegramWebhookInspection.ts`:
  - sanitizes `getMe` and `getWebhookInfo` results;
  - exposes bot ID/username, exact webhook URL, `allowed_updates`, pending count and last delivery error without returning tokens;
  - validates the bounded shape and owner/message identity of `kino:probe`, `kino:approve:<uuid>` and `kino:skip:<uuid>` for safe routing diagnostics.
- Added service-role-only `inspect_telegram_webhook` action to `telegramEventSupergroup`. It calls only Telegram `getMe` and `getWebhookInfo`; it does not call `setWebhook`, `deleteWebhook` or `drop_pending_updates`.
- Added an explicit wrong-ingress guard after all existing callback handlers. Unhandled callbacks are acknowledged once with HTTP 200, logged only with bounded metadata, and never sent or published. `kino:*` is reported as `cinema_callback_wrong_ingress` instead of being silently consumed by legacy fallback.
- Added isolated contract tests for token redaction, read-only inspection, probe/approve/skip classification, malformed UUID, foreign owner/chat, missing message identity, handler ordering and retry-safe no-send behavior.

## Checks

- Targeted `telegramEventSupergroup/index.test.ts`: PASS — 11/11.
- `git diff --check`: PASS.
- `pnpm exec vitest run --maxWorkers=2 --testTimeout=30000`: PASS — 427 files passed, 1 skipped; 2117 tests passed, 3 skipped.
- `pnpm run test:staff-os`: PASS.
- `pnpm run test:kino001d-orchestration`: PASS — 7/7.
- `pnpm run test:kino001d-execution-boundary`: PASS — 5/5.
- `pnpm run test:kino001d-read-only-execution`: PASS — 5/5.
- `pnpm run repo:check`: PASS — 2174 tracked files.
- `pnpm run lint`: PASS with 0 errors and two pre-existing warnings.
- `pnpm run typecheck`: PASS.
- `pnpm run build`: PASS; Cinema ingestion tests 49/49 and Vite build completed.
- `pnpm run bundle:check`: PASS — 34 JavaScript chunks checked.
- Real `callback_query` delivery: NOT RUN / GATED. No Telegram send, webhook mutation, n8n publication or production deploy was authorized.

## GitHub

- Base/main SHA: `b12e703340e9fce18fcb91e6266cb30024c64ec5`
- Local branch: `kino000r-telegram-webhook-recovery`
- Commit: not created
- Push: none
- PR: none
- Merge: none

## ClickUp

Not changed. The task explicitly required continuing Kino000R without creating a new Task ID.

## Google Drive

Read-only inspection only. Cinema Handoff and Roadmap already record the pre-patch Partial/Gated delivery gap. They need synchronization only after the bounded code patch is approved/committed and again after real runtime verification; no Drive write was made.

## Risks

- The production root cause is not conclusive until `getMe/getWebhookInfo` is obtained for both exact bot credentials.
- Deploying this patch alone does not repair webhook registration. It improves safe diagnosis and prevents silent wrong-ingress acceptance.
- `CINEMA_OWNER_TELEGRAM_ID` must be configured only through a separately approved secret/config gate if the wrong-ingress identity diagnostics are expected to distinguish valid owner identity; absence remains fail closed.
- The n8n draft contains an additional CS Olomouc guard and must not be published incidentally as part of webhook recovery.
- The local repository gate is green with bounded workers and a 30-second per-test timeout; this does not replace the separately gated production callback proof.

## Not touched

- No commit, push, PR, merge or deploy.
- No Supabase SQL, migration, RLS, auth, secret, `.env`, production data or function deployment.
- No n8n update, publication, activation or production execution.
- No `setWebhook`, `deleteWebhook`, `drop_pending_updates` or `repair_telegram_webhook` call.
- No Telegram send, `/kino approve`, callback replay or movie publication.
- No change to movie `57447934-fc38-4952-bd63-0a3e25d66102`.

## Next step

1. Review the local diff and obtain separate approval for commit, push and PR if desired.
2. After separate deploy approval, deploy the exact reviewed Edge Function and invoke `inspect_telegram_webhook` once through the service-role channel; verify the returned bot is `@GOirl_bot` and record its webhook metadata.
3. Through a credential-safe read-only n8n mechanism, obtain `getMe/getWebhookInfo` for `@GoIRL_doc_bot`; verify URL, `callback_query` in `allowed_updates`, pending count and last errors.
4. If credentials are distinct, preserve Option B and, under a separate webhook-config approval, register each bot only to its own handler without dropping pending updates. If they are unexpectedly the same credential, stop and redesign as a single authenticated ingress before any webhook mutation.
5. Verify a new owner-authorized `kino:probe` end to end, then run a non-publishing negative matrix. Keep Kino000R **Partial / Gated** until runtime callback delivery is proven.

## Evidence ledger

| Claim | Evidence | Scope |
| --- | --- | --- |
| GitHub base inspected at exact current main | `GH:main@b12e703340e9fce18fcb91e6266cb30024c64ec5` | Repository base for this local branch |
| Current Cinema handoff records the owner click and Supabase delivery gap | `DRIVE:1eA0ZzA2jEaYKR_rsfInDKO0lxMO3emjP_nyushiqcIk` | Cinema handoff updated 2026-10-09 |
| Current Cinema roadmap keeps Kino000R gated | `DRIVE:1qo_7TiAXT-sutyTclzBBolQ_EUbi56Y72Xd0cD3HTK0` | Kino000A–Kino00X roadmap updated 2026-10-09 |
| Archivist has no execution after the confirmed probe click window | `RUNTIME:ot1NwNlcqD0vOHrn@610e4433-4163-4d10-b9b4-5a26a1cb6d48` | n8n execution search after 2026-10-09T13:11:50Z |
| Production Edge Function lacks Cinema callback handling | `RUNTIME:telegramEventSupergroup@104` | Supabase project `tygfsvjkznypilfyyvdc`, 17 deployed files |
