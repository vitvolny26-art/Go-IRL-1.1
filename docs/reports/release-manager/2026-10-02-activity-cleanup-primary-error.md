---
title: Activity cleanup primary error preservation
owner: Release Manager
status: Partial
source_of_truth: false
last_review: 2026-10-02
---

## Task and authorization
Release Manager continues the owner's explicitly repeated commit/push/Ready PR/CI/merge/cleanup chain for Activity e8203b66-4afe-4826-b552-8b50d63293d8, chat -1004451765209, message 92, Sport thread 5. Repository vitvolny26-art/Go-IRL-1.1; baseline main 04ce4cf; branch fix/activity-cleanup-primary-error. Merge target: GitHub main. Deploy target: none.

## Findings
Cleanup 37016704761 / job 110869237689 failed at message_delete with telegram_rpc=UNCLASSIFIED. Configuration validation and Deno typecheck passed. Telegram absence remains unconfirmed; independent metadata readback remains active=true and messageId=92. Teardown logs do not prove the primary runtime cause.

## Changes and sources
Preserve a primary exception if Telegram destroy also fails; distinguish shutdown-only failures by stage. Add fixed allowlisted exception types, RPC_ERROR classification and known source-filename/numeric-line locations without logging arbitrary provider messages or stacks. Exact-target guards, physical readback and conditional metadata reconciliation remain unchanged.
Inspected cleanup script/core/test/workflow, active release contracts, AFISHI001 checkpoint and pinned mtcute v0.32.2 deleteMessagesById/client/base/error sources.

## Checks
Local repo:check, lint (two existing warnings), typecheck, build and diff PASS. Full vitest 1900 passed / 3 skipped with invocation-only maxWorkers=2/testTimeout=30000; additional repository test suites PASS. Final lint after location-label addition PASS. Exact-head hosted/self-hosted CI are required before merge. Protected cleanup workflow performs Deno typecheck before mutation.

## Evidence and reporting
Commit: not created at report preparation. Runtime/source/PR/CI evidence will be recorded in the PR discussion and Drive handoff following execution.
Repository report: docs/reports/release-manager/2026-10-02-activity-cleanup-primary-error.md.
Drive handoff: 1nmcfg8Nk7avqmjl1nyC2HaqSzrh9u_xHEZUK2S4NVsg. AFISHI001 checkpoint: 1ppcTg4uq1JQf7563rwVFibgqWU9TuWEKqsH-MrtATkI. ClickUp MTProto search returned no matching task during the preceding release.

## Next step and rollback
Require green exact-head CI, merge, green exact-main CI, then one new owner-only cleanup command through control PR 1296. Physical absence must precede reconciliation. This diagnostic patch is not an established deletion fix. Revert source change if needed; deletion is irreversible and restricted to message 92.
