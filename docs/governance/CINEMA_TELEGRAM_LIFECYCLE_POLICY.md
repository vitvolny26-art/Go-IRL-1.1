---
title: Cinema Telegram Lifecycle Policy
status: Active
task: Kino000R
scope: Cinema / City Posters
---

# Cinema Telegram Lifecycle Policy

## Canonical invariant

A Telegram publication is lifecycle-bound to the exact published Cinema / City Posters event.

- When an exact Cinema / City Posters event is published, its Telegram publication is created for that exact event.
- When that event reaches terminal end-of-life because its showing/event period ended, or because the event was deleted, cancelled, expired, withdrawn, or rolled back, the exact linked Telegram post must be deleted.
- A Telegram post must not remain active after its linked event has ended or been removed from active publication.

## Cleanup safety requirements

1. Resolve the exact event identity first.
2. Resolve the exact active Telegram publication ledger row for that event.
3. Resolve the exact Telegram chat/message identity from that ledger row.
4. Fail closed if event or message identity is ambiguous.
5. Delete only that exact linked Telegram message.
6. Verify the Telegram message is physically absent after deletion.
7. Reconcile the Telegram publication ledger with `deleted_at` and durable audit evidence.
8. A green workflow/execution alone is not deletion proof.
9. Telegram deletion failure means lifecycle cleanup is incomplete and must not be silently ignored.
10. Preserve Cinema ingestion, source provenance, and audit history unless a separate explicitly approved destructive operation covers them.
11. Cleanup of one event must never delete or authorize cleanup of another event.

## Runtime relationship

Existing expiry maintenance, Telegram publication ledger handling, and governed MTProto cleanup are implementation mechanisms for this invariant. They do not weaken the invariant or permit lifecycle cleanup to be considered complete without exact identity and post-deletion verification.
