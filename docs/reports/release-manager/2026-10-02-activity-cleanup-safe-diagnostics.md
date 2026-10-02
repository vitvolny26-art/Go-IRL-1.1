---
title: Activity cleanup safe diagnostics
owner: Release Manager
status: Partial
source_of_truth: false
last_review: 2026-10-02
---

## Task
Release the owner-approved diagnostic correction and execute the exact Olomouc volleyball cleanup. Target: activity e8203b66-4afe-4826-b552-8b50d63293d8, chat -1004451765209, message 92, Sport thread 5. Deploy target: none.

## Files inspected
scripts/activity-mtproto-delete.ts, scripts/activity-mtproto-delete-core.ts, src/activityMtprotoDelete.test.ts, .github/workflows/city-posters-mtproto-delete.yml, repository reporting contract and Active indexed release instructions.

## Findings
Main baseline a39967f. Cleanup run 37010742806 / job 110849589533 passed protected credential validation and Deno typecheck, then failed with the generic activity_cleanup_failed. Physical deletion remains unconfirmed.

## Changes made
Record a fixed execution stage and application-owned error code. Provider errors and protected configuration values remain suppressed. Exact-target validation, deletion/readback and conditional metadata reconciliation are unchanged.

## Checks
Repository hygiene, lint (two pre-existing warnings), typecheck and build PASS. Five focused cleanup tests PASS. Default full suite hit four image-render 5-second timeouts; full suite with invocation-only maxWorkers=2/testTimeout=30000 PASS: 1900 passed, 3 skipped. Repository test configuration unchanged. This candidate report does not claim runtime success.

## Role
Release Manager, continuing the owner-approved release chain.

## Sources inspected
Active AI Instructions Index and Common/Evidence/Bootstrap/Retrieval/Release contracts; Master Roadmap; Product Roadmap; AFISHI001 current cleanup checkpoint; current GitHub main; failed runtime job 110849589533.

## Evidence ledger
Claim | Evidence | Scope
--- | --- | ---
Baseline contains dependency repair | GH:scripts/activity-mtproto-delete.ts@a39967f | Exact baseline source
Credentials and Deno check passed before runtime failure | RUNTIME:37010742806 | Previous exact cleanup attempt
Current cleanup checkpoint remains Partial | DRIVE:1ppcTg4uq1JQf7563rwVFibgqWU9TuWEKqsH-MrtATkI | Activity 92 only

## GitHub
Repository vitvolny26-art/Go-IRL-1.1, main baseline a39967f, branch fix/activity-cleanup-safe-diagnostics. Commit not created at report preparation. Ready PR and CI references will be recorded after release.

## ClickUp
Search for MTProto returned no matching task; no unrelated task altered.

## Deployment target
Merge target: GitHub main. Deploy target: none. Protected GitHub Actions cleanup only. Rollback: revert the diagnostic source change; deletion itself is irreversible and remains restricted to message 92.

## Google Drive
Current operational checkpoint: AFISHI001, DRIVE:1ppcTg4uq1JQf7563rwVFibgqWU9TuWEKqsH-MrtATkI. Release report reconciliation follows runtime evidence.

## Blockers
Runtime failure stage has not yet been established. No claim that message 92 was deleted.

## Risks
Diagnostics identify the failing stage; an additional correction may be needed after runtime evidence. Metadata alone does not establish physical presence or absence.

## Not touched
No schema/RLS/credential changes, Edge/VPS deployment, scheduler activation or unrelated publication changes.

## Next step
Complete local verification, create the authorized commit and Ready PR, require exact-head CI, merge, then run the owner-only exact cleanup command in control PR 1296. Confirm Telegram absence before metadata reconciliation.
