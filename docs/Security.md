---
title: Security Architecture
owner: Security Lead
status: Draft
source_of_truth: false
last_review: 2026-08-13
next_review: 2026-08-20
---

# Security Architecture

This document captures implemented security foundations and remaining tasks. It is not a claim of full production security until the Edge Function is deployed, required secrets are configured, migration v4 is applied, and production smoke tests pass.

## Trusted Telegram Authentication

GO IRL now has a trusted Telegram authentication path implemented in code:

- frontend reads raw `Telegram.WebApp.initData`;
- frontend sends it to `verifyTelegramInitData`;
- Supabase Edge Function verifies Telegram HMAC with `TELEGRAM_BOT_TOKEN`;
- Edge Function validates `auth_date`;
- Edge Function stores replay hashes in `telegram_auth_replay`;
- Edge Function creates or updates `app_users`;
- Edge Function returns a short-lived JWT signed with `GO_IRL_JWT_SECRET`;
- Supabase client sends that token through `accessToken`;
- migration v4 moves RLS helpers to verified JWT claims.

Legacy behavior:

- frontend reads Telegram `initDataUnsafe`;
- frontend builds `x-go-irl-user-key`;
- Supabase RLS helpers read that header;
- `VITE_GO_IRL_ADMIN_KEYS` can be included in the public frontend bundle for demo UI visibility.

Legacy risk:

- `initDataUnsafe` is not a cryptographic proof;
- any user can forge `x-go-irl-user-key` in DevTools or direct REST calls;
- a forged key can impersonate another user/organizer and can attempt admin-like flows if real admin keys are exposed.

Release rule:

**Public release is blocked until the Edge Function is deployed with secrets, migration v4 is applied, and trusted-auth smoke tests pass.**

## Supabase RLS

Every user-facing table must have RLS enabled.

Rules:

- Users read/update their own private rows.
- Public events are readable by all.
- Private/invite events require organizer, participant, invite token, or approved access.
- Service role is used only by backend/n8n.
- Event deletion is allowed only for the organizer or an admin role.
- Moderator/admin review access is separated from regular user access.

## Least Privilege API

- Frontend uses only anon/publishable key.
- Service role key never ships to browser.
- n8n stores service credentials outside Git.
- Sprint 1 admin UI uses `VITE_GO_IRL_ADMIN_KEYS` only to reveal owner controls in dev/demo.
- `VITE_GO_IRL_ADMIN_KEYS` is public because every `VITE_*` value is bundled into frontend JavaScript.
- Do not put real production Telegram IDs, usernames, or privileged identifiers in `VITE_GO_IRL_ADMIN_KEYS`.
- Supabase also requires a trusted database role entry for elevated permissions.
- `public.user_roles` is the forward-compatible role table after `migration_v2_backend_foundation.sql`.
- `public.admin_users` remains only as backward compatibility and migration seed input.
- This is temporary: production admin must not rely only on client-side env/localStorage.
- Admin moderation uses separate permissions later.

## Sensitive Data Separation

Separate:

- auth identity
- public profile
- private profile/preferences
- notification delivery identifiers
- AI logs
- audit logs

## Token and Session Strategy

Implemented target flow:

1. Frontend sends raw `Telegram.WebApp.initData` to a trusted endpoint.
2. Endpoint validates Telegram HMAC with the bot token.
3. Endpoint creates/finds the user.
4. Endpoint returns a trusted session/JWT.
5. Supabase RLS uses `auth.uid()` or verified JWT claims.
6. Admin/moderator roles are loaded from server-side role tables.

Required Edge Function secrets:

- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GO_IRL_JWT_SECRET`

Optional controls:

- `GO_IRL_AUTH_MAX_AGE_SECONDS`
- `GO_IRL_SESSION_TTL_SECONDS`

## Rate Limiting and Abuse Protection

Planned limits:

- event creation
- join requests
- reports
- messages when chat exists
- source/admin actions

## Backend Roles

Current roles:

- `user`
- `organizer`
- `professional`
- `moderator`
- `admin`

Organizer status comes from the event `organizer_key`. Database role status comes from `public.user_roles`:

- `user`: normal participant.
- `organizer`: enables the Activities organizer entry; ownership of individual Activities still comes from `activities.organizer_key`.
- `professional`: enables the Services professional entry and required Beauty setup; production Services data remains separately gated.
- `moderator`: can review and moderate scoped records.
- `admin`: can manage high-risk platform actions and receives both domain cabinet entries in the client shell.

### Admin-issued role invitations

Admin005 adds a repository-level design for single-use Telegram role invitations. The link is an unbound bearer credential until it is redeemed, so it must be sent privately. The server verifies Telegram `initData`, resolves the recipient as `telegram:<numeric_id>`, and permits only `user` to `organizer` or `user` to `professional` promotion. It never introduces a separate `master` database role.

The token expires after 24 hours, is consumed atomically, and is stored only as a SHA-256 hash. Creation checks the administrator against the current `public.user_roles` row. Existing elevated roles cannot be overwritten through an invitation. Migration application, Edge Function deployment, production configuration, merge, and production smoke remain separately approved gates.

The legacy Sprint 1 allowlist exists only for dev/demo UI visibility and migration compatibility:

- frontend: `VITE_GO_IRL_ADMIN_KEYS=telegram:<numeric_id>,telegram_username:<username>`
- database compatibility table: `public.admin_users.user_key`
- local compatibility switch: `VITE_GO_IRL_LEGACY_DEMO_AUTH=true`

The frontend allowlist only controls visibility of admin UI. It is not production security. Real delete/moderation permission must be enforced by Supabase RLS through `public.user_roles` and must be paired with trusted Telegram `initData` validation plus server-issued claims before public release.

## Admin Allowlist Policy

`VITE_GO_IRL_ADMIN_KEYS`:

- DEV/DEMO ONLY.
- Must not contain real production privileged identifiers.
- Must be removed from the production security model before public release.
- Must be replaced by server-side verified roles.

Backlog owner: `SEC-ADMIN-001 Remove public admin allowlist from frontend bundle`.

## Reporting and Blocking

Planned:

- report user
- block user
- block prevents profile visibility and messages
- moderation queue for abuse

## Optional Activity Chat Security

Activity Chat is optional and temporary. It is a coordination tool for a real-life Activity, not a permanent messenger.

Access rules:

- Organizer can access chat for their Activity.
- Confirmed participants can access chat.
- Admin/moderator can access chat through separate moderation permissions.
- Guests cannot access chat.
- Pending users cannot access chat.
- Rejected users cannot access chat.
- Blocked users cannot access chat with the blocker where the product model allows separation.

RLS approach:

- `activity_chats` has RLS enabled.
- `activity_chat_members` has RLS enabled.
- `activity_chat_messages` has RLS enabled.
- User can read a chat only when they are an active chat member or have admin/moderator permission.
- User can read messages only for visible, non-archived chats where they are a member.
- Pending Activity membership is not enough for chat membership.
- Service role/n8n can archive chats through a controlled cleanup workflow.

Moderation:

- Every message can be reported.
- Reported chats can receive moderation hold.
- n8n cleanup must not archive/delete chats with active moderation hold.
- Audit logs should record moderation actions without excessive personal data.

Retention:

- Default MVP behavior is archive 24 hours after Activity end.
- Archived messages are hidden from UI.
- Hard delete requires privacy review.
- Chat contents must not be sent to AI APIs without explicit consent.

## Secrets

- no service keys in frontend
- no bot token in repository
- no OpenAI/n8n secrets in repository
- rotate exposed Telegram bot tokens immediately

## Audit Logs

Log:

- activity create/update/delete
- activity membership create/update/delete
- reports
- blocks
- privacy setting changes
- suspicious actions
- admin moderation actions

Do not log excessive personal data.

`supabase/migration_v2_backend_foundation.sql` creates `public.audit_log` and database triggers for `activities` and `activity_members`. The metadata is intentionally minimal: activity id, visibility, city, activity type, member key, and member status.

## Data Integrity

Client-side validation is useful for UX but can be bypassed with direct Supabase REST calls. `supabase/migration_v3_security_hardening.sql` adds database constraints for:

- activity text length;
- title length;
- description length;
- address length;
- location URL length;
- participant note length.

The constraints are created as `NOT VALID` to avoid breaking legacy/demo rows while still enforcing new writes and updates.

## Reputation Security

RLI, Trust Score, Community Contribution, and attendance confirmations are safety-sensitive systems.

Rules:

- Trust Score is internal only and must not be exposed as a public rating.
- RLI changes must be written through an auditable ledger.
- Attendance confirmations must be protected from self-confirmation abuse.
- Reports and confirmations need abuse limits before affecting major penalties.
- Referral rewards require anti-fraud checks and should count only after 3 confirmed Activities by the invited user.
- Raw geolocation must not be stored as movement history.
- Optional geolocation confirmation stores only the result needed for audit.
- Significant penalties require auditability, moderator review where appropriate, and an appeal path.
- No tokenization, crypto, or financial reward mechanics are part of the MVP.
