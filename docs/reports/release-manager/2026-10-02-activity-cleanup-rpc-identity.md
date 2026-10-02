---
title: Activity cleanup RPC constructor identity repair
owner: Release Manager
status: Partial
source_of_truth: false
last_review: 2026-10-02
---

## Task and scope
Continue the owner-repeated commit/push/Ready PR/CI/merge/cleanup chain for exact Activity e8203b66-4afe-4826-b552-8b50d63293d8, chat -1004451765209, message 92, Sport thread 5. Role Release Manager; repository vitvolny26-art/Go-IRL-1.1; main baseline 6bdd09d; branch fix/activity-cleanup-rpc-identity. Merge target GitHub main; deploy target none.

## Runtime evidence and sources
Cleanup 37019438614 / job 110878410856 failed at message_delete, error_type=Error, error_origin=delete-messages:35:21, telegram_rpc=UNCLASSIFIED. Pinned JSR source maps line 35 to channels.deleteMessages. Logs show downloads of core 0.32.2 and 0.32.3. Deno 0.32.2 index exports jsr:@mtcute/core@^0.32.2. RpcError.is in pinned core compares exact constructor identity. Cross-version error copies can defeat classification. The actual Telegram reason and physical deletion remain unconfirmed; metadata unchanged.
Sources: cleanup workflow logs, scripts/activity-mtproto-delete.ts/core, src/activityMtprotoDelete.test.ts, JSR Deno/core pinned sources and npm core 0.32.2 RpcError implementation, active release contracts and AFISHI001 checkpoint.

## Change
Recognize structured numeric code/string text fields in Error objects as a fallback to RpcError.is. Emit only a literal code from the existing fixed allowlist, never arbitrary text. Preserve primary-error handling, source-location labels, target guards and physical readback before metadata reconciliation. No dependency, credentials or permissions changes.

## Checks and release evidence
Actual-script foreign-error-copy/suppression scenarios 3/3 PASS. Lint/typecheck/focused cleanup 5/5/diff PASS. Full repository gates and exact-head hosted/self-hosted CI required before merge. Commit: not created at report preparation; references reconciled through PR and Drive handoff after runtime.

## Reporting, next and rollback
Drive handoff 1nmcfg8Nk7avqmjl1nyC2HaqSzrh9u_xHEZUK2S4NVsg; AFISHI001 checkpoint 1ppcTg4uq1JQf7563rwVFibgqWU9TuWEKqsH-MrtATkI. ClickUp MTProto search returned no matching task in the same release session. Repository report docs/reports/release-manager/2026-10-02-activity-cleanup-rpc-identity.md. Require green CI, merge, exact-main CI and one new owner-only cleanup through PR 1296. Revert diagnostics if needed; deletion is irreversible and restricted to message 92.
