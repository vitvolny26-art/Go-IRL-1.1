# 2026-09-10 — Activ015 — Activity Publish Quota + Organizer Gate

Status: Partial / implemented on branch / code exact-head CI green / merge and production release gated

Role: Tech Lead
Task: Activ015
Repository: `vitvolny26-art/Go-IRL-1.1`
Baseline: `main@34d9fc78eb07024de4128b8b2aff2e0f8c257a5a`
Source branch: `activ015-activity-publish-quota-organizer-gate`
PR: #1142
Implementation code head before this report-only successor: `012a183bc815199f4e43669765d30a85c8cf0191`
Code CI: run `34470317572`, verify job `102848440963` — SUCCESS on exact code head `012a183bc815199f4e43669765d30a85c8cf0191`.

## Owner decision

Ordinary/new users may publish at most 2 new Activities per calendar day until they become an Organizer. Organizer eligibility requires at least 10 successfully confirmed completed Activities. Promotion remains explicitly admin-controlled; after approval the user receives the global Organizer role and the public Verified Organizer badge. Exact global Organizers may publish up to 5 new Activities per calendar day.

The owner explicitly approved bounded SQL/RPC/RLS/migration work for Activ015 on 2026-09-10. Merge, VPS/Vercel deploy, production migration application, production data changes, `.env`, secrets and infrastructure changes remain separate protected gates and were not performed.

## Authority inspected

- Activities roadmap: `Activ080 — Activities — Next Implementation Roadmap — 2026-08-03`.
- AI Instructions Index role: `ROLE_TECH_LEAD` / Tech Lead v1.1.
- Repository governance/onboarding: `AGENTS.md`, `DOCS_INDEX.md`, `README.md`, `docs/onboarding/CHATGPT_PROJECT_SETUP.md`, `docs/reports/README.md`, `ROADMAP.md`, `BACKLOG.md`, `docs/audit/KNOWLEDGE_DEBT.md`, `docs/GO_IRL_CONSTITUTION.md`, and Trust roadmap material.
- Existing Activities create paths, recurring-series RPC, Admin005 role invitation flow, POSTEVENT attendance/outcome contracts, organizer profile UI and current role store.

## Findings

1. Single Activity creation currently writes directly to `public.activities`; recurring creation uses `go_irl_create_weekly_activity_series` and materializes occurrences with one multi-row `INSERT ... SELECT generate_series(...)`.
2. A client-only quota would therefore be bypassable and would not satisfy the backend-first business-rule contract.
3. A naive `COUNT(*)` check in a row trigger is insufficient for concurrent and multi-row recurring inserts under PostgreSQL statement snapshots.
4. Existing canonical data already provides the organizer role (`public.user_roles`) and qualifying post-event trust facts (`activity_post_event_outcomes`, `activity_attendance_feedback`), so no parallel Organizer or trust model is needed.
5. Existing Organizer Profile had no Verified Organizer badge surface.

## Implemented changes

### Atomic Activity publication quota

`supabase/migrations/20260910124500_activ015_activity_publish_quota_organizer_gate.sql`

- Adds protected `public.activity_daily_publish_usage` keyed by `(user_key, local_date)`.
- No client role receives direct table access.
- Backfills the migration-day usage from already-created Activities so deployment cannot grant extra slots during that day.
- Adds a `BEFORE INSERT` trigger on `public.activities`, covering both direct single create and recurring materialization.
- Uses the authenticated canonical user key as actor authority and rejects organizer-key impersonation.
- Forces authenticated `created_at` to server statement time to prevent quota backdating.
- Uses Europe/Prague calendar-day semantics.
- Applies limit `2` to every non-Organizer role and `5` only to exact persisted global role `organizer`.
- Uses an atomic `INSERT ... ON CONFLICT DO UPDATE ... WHERE publish_count < limit` usage increment. The primary-key row lock serializes concurrent creates; every recurring occurrence consumes a slot. If any occurrence exceeds the quota, the exception rolls back the whole Activity/series transaction and its usage increments.
- Editing existing Activities does not consume quota because enforcement is insert-only.
- Deleting a successfully published Activity does not refund the slot.

### Organizer eligibility and manual approval

The existing single-use admin Organizer invitation remains the manual human approval mechanism. `go_irl_redeem_role_invitation` now requires, for target role `organizer`, at least 10 distinct qualifying Activities before role assignment. A qualifying Activity must have:

- candidate as organizer;
- organizer claim `happened`;
- event resolution `confirmed_happened`;
- at least one eligible non-organizer participant with attendance resolution `attended`.

Ineligible candidates receive the already-supported `invalid` result and the invitation is not consumed. Eligible candidates continue through the existing `public.user_roles` assignment and audit-log path. Professional invitation behavior remains unchanged. Safety/fraud/integrity remains an admin-review responsibility; Activ015 does not invent a parallel moderation store.

### Verified Organizer badge

`supabase/migrations/20260910131500_activ015_verified_organizer_badge_projection.sql` adds a bounded boolean projection RPC, `go_irl_is_verified_organizer`, instead of exposing `user_roles` to the client. `OrganizerProfilePortal` queries this projection and shows a localized ShieldCheck badge only for exact global Organizers:

- RU: `Проверенный организатор`
- UK: `Перевірений організатор`
- CS: `Ověřený organizátor`
- EN: `Verified Organizer`

The badge is visually scoped through `src/activ015-organizer-badge.css`.

### Compatibility and verification

- Added `src/activ015ActivityPublishQuotaContract.test.ts`.
- Added `src/activ015VerifiedOrganizerBadge.test.ts`.
- Added `supabase/verify_activ015_activity_publish_quota_organizer_gate.sql`.
- Updated the historical Admin005 SQL verifier to use a `professional` generic redemption fixture, because an empty-account Organizer redemption is now intentionally invalid under the 10-Activity gate.

## Verification evidence

Implementation code head `012a183bc815199f4e43669765d30a85c8cf0191` passed GitHub Actions CI run `34470317572`, verify job `102848440963`:

- dependency install — GREEN;
- repository check — GREEN;
- diff check — GREEN;
- tests — GREEN;
- typecheck — GREEN;
- lint — GREEN;
- build — GREEN;
- bundle budget — GREEN.

Fresh main remained `34d9fc78eb07024de4128b8b2aff2e0f8c257a5a` during implementation/reconciliation. PR #1142 contains the bounded Activ015 patch; no merge or production release has occurred.

## Runtime / production status

Not applied to production. The production database has not received the Activ015 migrations and the public app has not received the Verified Organizer UI patch. Therefore runtime quota enforcement, production Organizer redemption, and visual badge smoke are intentionally still unverified.

## Rollback

Before release, rollback is simply to close/discard PR #1142. After an authorized release, rollback must be prepared against the exact merged migration state: remove the Activ015 trigger/projection, restore the previous `go_irl_redeem_role_invitation` definition, and handle the protected usage table according to the approved rollback plan. No production rollback was needed in this branch-only phase.

## Knowledge Base

Canonical Activities KB is not updated as shipped current behavior while PR #1142 remains unmerged and production unchanged. Full KB reconciliation, including affected canonical documents and append-only `99 — Activities Knowledge Patch Sync Log`, is mandatory after an authorized release and runtime verification before Activ015 can be marked Completed.

## Blockers / next protected gates

- Explicit merge approval is required before merging PR #1142.
- Explicit production migration/deploy approval is required before applying the SQL migrations or releasing the frontend.
- Runtime/DB verification and real UI smoke are required after release.
- Activities Knowledge Base synchronization + Drive readback are required before `Completed`.
