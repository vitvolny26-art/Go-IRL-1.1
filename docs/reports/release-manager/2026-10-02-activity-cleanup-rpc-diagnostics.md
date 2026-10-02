---
title: Activity cleanup RPC diagnostics
owner: Release Manager
status: Partial
source_of_truth: false
last_review: 2026-10-02
---

## Task and authorization
Owner authorized commit, push, Ready PR, exact-head CI, merge and cleanup of Activity e8203b66-4afe-4826-b552-8b50d63293d8, Olomouc chat -1004451765209, message 92, Sport thread 5.

## Findings and change
Baseline main a3ccd71. Cleanup 37013639420 failed at message_delete; physical deletion remains unconfirmed and production metadata unchanged. Add fixed allowlisted Telegram RPC labels using tl.RpcError.is. No provider exception text or protected values are logged. Unknown failures remain UNCLASSIFIED. Exact-target checks, deletion readback and conditional metadata reconciliation remain in force.

## Sources and files
Active release instructions, AFISHI001 checkpoint, previous runtime logs, mtcute error documentation; scripts/activity-mtproto-delete.ts, scripts/activity-mtproto-delete-core.ts, src/activityMtprotoDelete.test.ts and cleanup workflow.

## Validation
Five cleanup tests and diff check PASS during preparation. Repository checks and exact-head CI required before merge. Deno dependency typecheck runs in the protected cleanup workflow; local Deno unavailable and JSR access blocked.

## Release evidence
Repository vitvolny26-art/Go-IRL-1.1; branch fix/activity-cleanup-rpc-diagnostics; Commit: not created at preparation. PR, CI and runtime results will be reconciled in the PR and Drive report after execution.
Merge target: GitHub main. Deploy target: none. Owner-only cleanup command on control PR 1296.

## Reporting and rollback
AFISHI001 Drive checkpoint 1ppcTg4uq1JQf7563rwVFibgqWU9TuWEKqsH-MrtATkI; previous release handoff 1nmcfg8Nk7avqmjl1nyC2HaqSzrh9u_xHEZUK2S4NVsg. ClickUp MTProto search previously returned no matching task. Revert diagnostic change if needed; deletion itself is irreversible and limited to owner-approved message 92.

## Blocker and next step
RPC reason is unknown until authorized runtime execution. Require green exact-head CI, merge, green exact-main CI, new cleanup execution and physical absence proof before claiming completion.
