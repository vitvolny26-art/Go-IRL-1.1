# Sport Coach — private-event invitation contract (2026-11-19)

Status: design + candidate implementation on a task branch; **not applied or shipped**. This document does not authorize SQL execution, merge, or production deployment.

## Problem

An invite-only Sport event is not discoverable from another account. Existing `CoachOfferPanel` requires the candidate to open the event, and `go_irl_can_offer_coach` requires an invite-only candidate to be an `activity_members` row with `status='joined'`. A coach should not need to join as an ordinary participant or consume participant capacity.

## MVP journey (two real authenticated accounts)

1. Organizer A creates an invite-only Sport event and enables `coach_requests.status='pending'` using the existing request flow.
2. A chooses **Пригласить тренера → Скопировать приглашение**. Backend creates a **coach-purpose invitation** with an unguessable, expiring secret. A shares the generated deep link with B via Telegram.
3. B opens the deep link, authenticates through trusted auth and sees a **minimal coach preview** (sport, city, date/time, participant count, conditions; no exact address, member names, or chat).
4. B must have a saved `user_profile_role_interests` coach role at `can_help` or `professional`. B presses **Готов провести**. This creates a `coach_event_offers` pending offer, **not** an `activity_members` membership.
5. A sees B's offer in the event's coach panel and accepts or declines. Acceptance atomically sets the existing coach request to `confirmed`, accepts exactly one offer, and invalidates other pending offers.
6. B sees **Вы назначены тренером**. Only after acceptance may B access coach-authorized event details. B does not automatically become a participant; event capacity remains unchanged.
7. A can revoke an unused invitation; B can withdraw a pending offer. Expired, revoked, consumed, and unrelated-purpose links fail closed.

## Security boundaries

- Invitation is a **capability scoped only to coach preview and coach offer**; it never grants participant membership or organizer rights.
- Store only a server-side SHA-256 hash of the secret, never the plaintext secret. Set a short expiry and organizer revocation; rate-limit attempts. A plain event UUID is **not** authorization.
- Do not put the secret into `startapp` logs, analytics, server logs, public metadata, or a publicly cacheable preview. The implemented browser link puts the code in the URL fragment, which is not sent in HTTP requests. For Telegram-only users, the bot `startapp=coach-invite` parameter contains NO secret; users copy and paste the code manually. Direct bot delivery and in-app inbox are follow-on tasks.
- Validate authenticated actor server-side, role-interest eligibility, event `category_id='sport'`, live `coach_requests` pending state, organizer mismatch, and invite scope. Revalidate **inside the same transaction** that creates an offer.
- Organizer can read offers for own event; candidate can read own offer; no other actor can enumerate candidates, secrets, or invite-only event metadata.
- Acceptance must lock the coach request and offers to prevent two concurrent accepted candidates; accepted offer must not be withdrawable or replaced by an unrelated actor.
- Revoke all RPC execution from `public` and `anon`; grant only needed functions to `authenticated`, with fixed `search_path`. RLS applies to all new tables.
- Audit account deletion and transfer migrations so tokens/offers cannot survive a deleted identity inappropriately.

## Suggested data and RPC boundary

- `coach_event_invitations`: id, activity_id, created_by_user_key, secret_hash, expires_at, revoked_at, created_at, last_used_at, optional target_user_key. Separate from `activity_members`.
- `go_irl_create_coach_invitation(activity_id)` organizer-only, only for invite-only Sport with active coach request; returns secret once.
- `go_irl_preview_coach_invitation(code)` trusted actor; minimal fields only, no public event-row select.
- `go_irl_submit_invited_coach_offer(code, display_name)` validates invitation and saved coach role, then creates pending offer atomically.
- `go_irl_revoke_coach_invitation(id)` organizer-only.
- Existing `go_irl_accept_coach_offer(offer_id)` remains the organizer confirmation authority.

## UX and notifications

- Organizer: `Найти тренера` → `Пригласить по ссылке`; share/copy and revoke controls.
- Coach: `Приглашение провести тренировку` preview → `Готов провести` / `Отказаться`.
- In-app `Приглашения тренеру` inbox for direct-target invites and offer status. Telegram push is **optional and opt-in**; never claim a message was sent until delivery is confirmed.
- Future discovery/matching: coach opt-in, city and sport match, explicit visibility and notification preferences. Never expose invite-only events in public search.

## Required verification before any release

1. SQL/RLS security review against actual production schema, with rollback plan; isolated DB tests.
2. Tests: A creates invitation; B with eligible saved role opens and offers without joining; A accepts; status and coach badge correct; participant count unchanged.
3. Negative tests: B without role, wrong account, anonymous, organizer as candidate, revoked/expired token, wrong event, public-only event, non-Sport event, already-confirmed request, duplicate offer, concurrent acceptance, cross-organizer read.
4. Browser and Telegram deep links across login and onboarding, including return-to-invitation behavior and no accidental regular join.
5. `pnpm repo:check`, `lint`, `typecheck`, `build`, `test`, exact-head CI and two-account E2E; separate owner approvals for SQL/RLS, merge and VPS deployment.

## Implementation note

The existing `src/invitationLink.ts` and `src/auth/activityEntryIntent.ts` parse **participant** invitations. Do not overload `/join/:eventId` for coach invitations. Use a dedicated route such as `/coach-invite#<64-hex-secret>` and an authenticated, minimal-preview backend. Do not broaden the `activities` SELECT RLS policy for invite-only events.

## Candidate implementation in this branch

- \`src/coachInvitation.ts\`: RPC client, 64-hex token validation, fragment link, short-lived sessionStorage OAuth continuity.
- \`src/components/CoachInvitationLanding.tsx\`: browser/Telegram invitation entry, minimal event preview, trusted login and coach response.
- \`src/components/CoachOfferPanel.tsx\`: organizer creates, shares and revokes a coach-specific link.
- \`src/main.tsx\`: dedicated \`/coach-invite\` and nonsecret Telegram \`startapp=coach-invite\` entry.
- \`supabase/migrations/20261119170000_sport_coach_private_invitations.sql\`: invite storage + 4 narrowly scoped RPCs with JWT-derived actor, expiry, RLS and atomic offer creation.
- \`src/coachInvitation.test.ts\`: token parser, OAuth continuity and SQL contract checks.

**Remaining gates:** isolated SQL verification (including B-with-role, B-without-role and unauthorized cross-account tests), full CI on exact head, separate SQL/RLS approval, merge approval, VPS deployment approval and real two-account smoke tests. A Telegram user without browser OAuth currently copies the code and pastes it after opening the bot's nonsecret \`coach-invite\` entry. Automated Telegram invitation messages and a coach inbox are not implemented by this candidate.
