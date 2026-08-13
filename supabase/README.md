---
title: GO IRL Supabase Setup
owner: Supabase Steward
status: Active
source_of_truth: true
last_review: 2026-08-13
next_review: 2026-08-20
---

# GO IRL Supabase Setup

This folder contains the database setup for the GO IRL Telegram Mini App.

## 1. Create a Supabase Project

1. Open Supabase Dashboard.
2. Create a new project.
3. Save the project URL and publishable anon key.
4. Open SQL Editor.

## 2. Apply the Base Schema

In SQL Editor, paste and run:

```sql
-- supabase/schema.sql
```

Use the full contents of `supabase/schema.sql`.

This creates:

- `public.activities`
- `public.activity_members`
- RLS helper functions
- RLS policies
- indexes
- realtime publication entries

## 3. Apply Migration v1

Production status: `supabase/migration_v1.sql` was applied manually to the production Supabase database on 2026-07-04 and verified successfully.

Verified `public.activities` columns are available in production:

- `city_id`
- `metadata`
- `participant_note`
- `activity_type`

Supabase is now the primary source of truth for these fields. The app still keeps a local fallback only as backward compatibility for older or preview databases.

After the base schema, paste and run:

```sql
-- supabase/migration_v1.sql
```

Use the full contents of `supabase/migration_v1.sql`.

This migration is safe to run again. It adds or fixes:

- `activities.updated_at`
- `admin_users` allowlist for temporary Sprint 1 admin permissions
- price limit check: `0..100000`
- existing out-of-range test prices normalized into `0..100000`
- member status check with `pending`
- indexes for organizer, visibility/date, and user status lookups
- `updated_at` trigger
- invite join policy alignment: `invite` creates `pending`, `public` creates `joined`
- organizer/admin delete policy for activities

## Apply Migrations

Use this checklist when a new Supabase project or preview database may have an older schema. The production database has already completed this checklist on 2026-07-04.

1. Open Supabase Dashboard.
2. Open your GO IRL project.
3. Go to SQL Editor.
4. Paste the full contents of `supabase/migration_v1.sql`.
5. Run the SQL.
6. Paste and run the full contents of `supabase/verify_schema.sql`.
7. Confirm every row in the verification result has `status = 'ok'`.
8. Confirm these `public.activities` columns exist:
   - `city_id`
   - `metadata`
   - `participant_note`
   - `activity_type`
9. Open production or restart the local app.
10. Create a test event.
11. Edit the event and change:
    - city
    - activity type / sport fields
    - participant note
12. Refresh the page.
13. Confirm city, activity type, sport metadata, and participant note persist after reload.

The app currently keeps a local fallback for `city_id`, `metadata`, `participant_note`, and `activity_type` so older databases do not lose edits. In production, Supabase is now the source of truth for those fields. The fallback remains only as temporary backward compatibility and can be removed after a stable production period.

## Apply Backend Foundation Migration v2

`supabase/migration_v2_backend_foundation.sql` prepares the database for production backend enforcement.

It adds:

- `public.user_roles` with roles: `user`, `organizer`, `professional`, `moderator`, `admin`
- role-aware helpers:
  - `go_irl_request_role()`
  - `go_irl_request_has_role(text[])`
  - `go_irl_request_is_admin()`
  - `go_irl_request_can_moderate()`
- `public.audit_log`
- audit triggers for `activities` and `activity_members`
- moderator/admin-aware RLS policies for event and participant moderation

Apply it after `migration_v1.sql`:

1. Open Supabase Dashboard.
2. Open the GO IRL project.
3. Go to SQL Editor.
4. Paste the full contents of `supabase/migration_v2_backend_foundation.sql`.
5. Run the SQL.
6. Paste and run the full contents of `supabase/verify_backend_foundation.sql`.
7. Confirm every row in the verification result has `status = 'ok'`.
8. Confirm existing admin keys were copied from `admin_users` into `user_roles` as `admin`.
9. Create, edit, join, approve/reject, and delete one test activity with two test users.
10. Check `audit_log` has entries for activity and member changes.

This migration is safe to run again. It does not delete existing activity data.

## Apply Security Hardening Migration v3

`supabase/migration_v3_security_hardening.sql` adds database-level length constraints for Activity text fields. This protects the database from direct REST writes that bypass frontend validation.

Apply it after migration v2:

1. Open Supabase Dashboard.
2. Open the GO IRL project.
3. Go to SQL Editor.
4. Paste the full contents of `supabase/migration_v3_security_hardening.sql`.
5. Run the SQL.
6. Paste and run the full contents of `supabase/verify_security_hardening.sql`.
7. Confirm every row has `status = 'ok'`.

The constraints are created as `NOT VALID`, which means legacy/demo rows do not block the migration, while new inserts and updates are still checked.

## Apply Trusted Telegram Auth Migration v4

`supabase/migration_v4_trusted_telegram_auth.sql` prepares the database for verified Telegram sessions.

It adds:

- `public.app_users`
- `public.telegram_auth_replay`
- `go_irl_auth_user_key()`
- JWT-claim based `go_irl_request_user_key()`
- JWT-claim based `go_irl_request_invite_activity()`
- authenticated-role RLS policies for `activities` and `activity_members`

Apply it only after the `verifyTelegramInitData` Edge Function is deployed and its secrets are configured:

1. Deploy `supabase/functions/verifyTelegramInitData`.
2. Set Edge Function secrets:
   - `TELEGRAM_BOT_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GO_IRL_JWT_SECRET`
   - optional `GO_IRL_AUTH_MAX_AGE_SECONDS`
   - optional `GO_IRL_SESSION_TTL_SECONDS`
3. Paste and run `supabase/migration_v4_trusted_telegram_auth.sql`.
4. Paste and run `supabase/verify_trusted_auth.sql`.
5. Confirm every row has `status = 'ok'`.
6. Open the Mini App inside Telegram and confirm create/join/edit/delete flows work with verified auth.

Do not apply v4 to production until the Edge Function is deployed. Once v4 is applied, production must not rely on `x-go-irl-user-key`.

## Apply Meta Provider Join Migration v9

`supabase/migrations/20260713000000_meta_provider_join.sql` adds the server-only atomic join path used by WhatsApp, Instagram, and Messenger.

It:

- allows the three Meta providers in generic `app_users`;
- keeps external provider IDs out of `activity_members.user_key`;
- serializes capacity checks by locking the target activity;
- returns idempotent `joined`, `already_joined`, `pending`, or `waitlisted` outcomes;
- revokes RPC execution from `public`, `anon`, and `authenticated`;
- grants execution only to `service_role`.

Apply with `supabase db push --linked`, then run `supabase db lint --linked --level warning` and `supabase/verify_meta_provider_join.sql`.

Do not place the service-role key in frontend or `VITE_*` variables.

## 4. RLS

RLS is enabled by the SQL files:

```sql
alter table public.activities enable row level security;
alter table public.activity_members enable row level security;
```

Do not disable RLS in production.

Legacy demo mode can send these headers from `src/supabase.ts` only when explicitly enabled for local development:

- `x-go-irl-user-key`
- `x-go-irl-invite-activity`

Production policies must use verified JWT claims from `verifyTelegramInitData`.

Critical warning: this header-based identity model is unsafe for public release because the frontend controls `x-go-irl-user-key`. A user can forge it with DevTools or direct REST calls. It is allowed only for private demo/testing until trusted Telegram `initData` verification is implemented.

Admin delete permissions are checked by `public.admin_users` through `go_irl_request_is_admin()`. Add only trusted owner keys:

```sql
insert into public.admin_users (user_key, note)
values ('telegram:123456789', 'project owner')
on conflict (user_key) do update set note = excluded.note;
```

For Sprint 1 the frontend also needs the same key in `VITE_GO_IRL_ADMIN_KEYS` so it can show admin-only UI. This is DEV/DEMO ONLY. `VITE_GO_IRL_ADMIN_KEYS` is bundled into public frontend JavaScript and must not contain real production admin identifiers. Production admin enforcement must move to trusted Telegram `initData` validation, Supabase Auth claims, or backend/RLS rules that cannot be spoofed from the browser.

After `migration_v2_backend_foundation.sql`, use `public.user_roles` as the forward-compatible role table. `public.admin_users` remains as backward compatibility for older policies and migration safety.

## 5. Environment Variables

Local `.env.local`:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_TELEGRAM_BOT_USERNAME=GOirl_bot
VITE_GO_IRL_ADMIN_KEYS=telegram:123456789,telegram_username:yourusername
VITE_GO_IRL_LEGACY_DEMO_AUTH=false
```

Do not set `VITE_GO_IRL_ADMIN_KEYS` to real production admin identifiers for public releases.

Vercel project environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_TELEGRAM_BOT_USERNAME
VITE_GO_IRL_ADMIN_KEYS
VITE_GO_IRL_LEGACY_DEMO_AUTH=false
```

Set them for Production, Preview, and Development if you use Vercel previews.

## 6. Connect to Vercel

1. Open Vercel project settings.
2. Go to Environment Variables.
3. Add the variables above.
4. Redeploy the latest `main` deployment.

## 7. Verify Database Works

1. Open the deployed Mini App.
2. Create a public event.
3. Open the app from another Telegram account.
4. Confirm the public event is visible.
5. Create an invite-only event.
6. Join from another account and confirm the request appears as `pending`.
7. Approve the request from the organizer account.
8. Confirm participant count updates.

If the app shows a database error, check:

- Vercel env variables are present.
- Supabase URL and publishable key are correct.
- RLS policies were applied.
- SQL migration completed without errors.
