# Sport Coach — private-event invitation contract (2026-11-19)

Status: design and implementation contract; **not shipped**. This document does not authorize SQL execution, merge, or production deployment.

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
- Store only a server-side hash of the secret, never the plaintext secret. Set a short expiry and organizer revocation; rate-limit attempts. A plain event UUID is **not** authorization.
- Do not put the secret into `startapp` logs, analytics, server logs, public metadata, or a publicly cacheable preview. Avoid query-string leakage to third parties. Use a server-exchanged one-time code if Telegram deep-link transport requires it.
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

The existing `src/invitationLink.ts` and `src/auth/activityEntryIntent.ts` parse **participant** invitations. Do not overload `/join/:eventId` for coach invitations. Use a dedicated route such as `/coach-invite/:code` and an authenticated, minimal-preview backend. Do not broaden the `activities` SELECT RLS policy for invite-only events.
