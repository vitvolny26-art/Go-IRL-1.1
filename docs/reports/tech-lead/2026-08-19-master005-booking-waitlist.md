---
title: Master005 Booking Exact-Slot Waitlist Patch Report
owner: Tech Lead
status: Commit gate approved / push not performed
source_of_truth: false
last_review: 2026-08-19
---

# Master005 — Booking exact-slot waitlist

## Evidence baseline

- Repository: `vitvolny26-art/Go-IRL-1.1`
- Base: `main@bf36be345f14401b8d93dd25e443825a5c8b8cd8`
- Branch: `task/master005-booking-waitlist`
- Branch comparison immediately before commit: identical; ahead 0 / behind 0
- Deploy target: none
- Production migration apply: not performed

## Bounded contract

Master005 adds an exact-slot notification waitlist. It does not create a booking status, hold, FIFO guarantee, or auto-promotion. `go_irl_create_beauty_booking` remains the only atomic reservation path. Waitlist availability notifications explicitly carry `reservationGuaranteed=false`.

## Prepared changes

- additive `beauty_booking_waitlist_entries` schema with `active/cancelled/booked` lifecycle and idempotency;
- own-read RLS defense-in-depth with direct table privileges still revoked;
- authenticated narrow RPCs for waitlistable slots, join, list-own, and cancel-own;
- canonical release notification on booking cancellation/decline/expiry/reschedule-old-slot and time-block deletion;
- canonical `services.waitlist_slot_available` notification kind through the existing outbox/worker;
- server-only `servicesBookingWaitlistRepository.ts` with no local waitlist fallback;
- ServiceActivityCard exact-slot join UI;
- ServicesBookingsView active waitlist list/cancel UI;
- focused repository, source-contract, notification, RLS and transactional verifier coverage.

## Verification

GREEN local/preliminary evidence before commit:

- fresh `main` remains `bf36be3`;
- task branch remains identical to `main` before commit;
- `ServiceActivityCard.tsx` production base reconstructed byte-for-byte from GitHub blob `cc746cfdc9f595f7a86ecbc27d345cc77872b162` before applying the bounded edits;
- `ServicesBookingsView.tsx` production base reconstructed byte-for-byte from GitHub blob `27439fdf0bf8db425649a579c0deec9f9ef27c77` before applying the bounded edits;
- TypeScript transpile diagnostics GREEN for all modified/new TS/TSX files after real-base reconstruction;
- RLS/ACL/notification/verifier static assertions GREEN;
- whitespace/trailing-space check GREEN;
- verifier ends in transactional `rollback`;
- semantic review corrected duplicated `wait_service_id` and an extra `end if` in the verifier before commit.

A prior synthetic-base `git apply --check` result was explicitly rejected as insufficient at the commit gate. The two production UI files were then rebuilt from exact GitHub blobs and rechecked. Full repository `pnpm` gates are not claimed because the execution container cannot resolve GitHub to materialize the complete repository. Exact-head GitHub Actions remains a later push/PR gate.

## Records

- Drive Booking report: `1qlRiPtXmYfIsXp7CUqankuZ5-9oypU2I24_23xYJSoA`
- Beauty workspace roadmap: `1HYAEI-OR8JwZWU38S1BB0HHj09p_tWn7VBoPyDd3ZyA`
- ClickUp: exact `Booking waitlist` search found no matching task during Master005 audit.

## Release gates

Commit is explicitly approved. Push, PR, production Supabase apply, production-data smoke, merge, and deploy are not authorized by this stage.
