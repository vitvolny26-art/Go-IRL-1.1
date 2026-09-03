# GROOMING018-J — Superadmin Beauty Cabinet Lifecycle

Status: source design committed / not applied
Base GitHub main: `c20ab9d9f52fba263639e636e76a8945a9dae78c`
Production apply: NOT authorized by this document

## Goal

Add an explicit Beauty cabinet-management lifecycle without impersonating a professional account.

Logical UI lifecycle:

`platform_managed -> handoff_pending -> master_managed`

Persistence intentionally stores only the durable management authority:

- `platform_managed`: GO IRL / superadmin operates the cabinet.
- `master_managed`: the real professional owns and operates the cabinet.
- `handoff_pending`: derived from a live, non-revoked `platform_handoff` transfer row; it is not persisted on the profile, so token expiry cannot leave a stale lifecycle state.

`publication_state` remains independent (`draft | published | hidden`). A platform-managed cabinet may be published.

## Security invariants

1. No professional impersonation, JWT substitution, or mutation of request auth claims.
2. Professional owner RPCs remain owner-bound.
3. Superadmin cabinet RPCs are service-role-only and independently verify an active `superadmin` user key.
4. Superadmin content save never changes `owner_user_key` or `management_state`.
5. `master_managed -> platform_managed` is an explicit audited admin adoption action.
6. `platform_managed -> master_managed` occurs only through the one-time Google-verified platform handoff claim.
7. Existing master-to-master ownership transfer retains candidate claim -> `pending_superadmin` -> explicit approve/reject.
8. One active ownership/handoff token per profile remains enforced by the existing partial unique index.
9. Raw handoff tokens remain hash-only.
10. Existing profiles are NOT silently classified as `platform_managed` by the migration. Schema default is `master_managed`; current GO IRL-operated profiles require a later explicit production-data adoption gate.

## Schema delta

### `beauty_professional_profiles`

Add:

- `management_state text not null default 'master_managed'`
- `management_updated_at timestamptz not null default now()`
- CHECK: `management_state in ('platform_managed', 'master_managed')`

No persisted `handoff_pending` value.

### `beauty_workspace_ownership_transfers`

Add:

- `transfer_kind text not null default 'owner_transfer'`
- `initiated_by_superadmin_user_key text null references app_users(user_key)`
- CHECK: `transfer_kind in ('owner_transfer', 'platform_handoff')`
- CHECK:
  - `owner_transfer` => `initiated_by_superadmin_user_key is null`
  - `platform_handoff` => `initiated_by_superadmin_user_key is not null`

Existing rows remain `owner_transfer` and preserve the old state machine.

## RPC contract

### `go_irl_admin_list_beauty_workspaces(p_superadmin_user_key text)`

Service role only.

Returns every Beauty profile with:

- profile identity and publication state;
- owner user key;
- durable `management_state`;
- derived `lifecycle_state` (`handoff_pending` when a live platform handoff exists);
- active platform handoff id/expiry where applicable;
- aggregate workspace revision.

### `go_irl_admin_get_beauty_workspace(p_profile_id uuid, p_superadmin_user_key text)`

Service role only.

Returns one complete editable server snapshot:

- profile fields;
- six-language content;
- portfolio;
- services including specialization/client key;
- availability rules;
- owner and management state;
- derived lifecycle state;
- aggregate revision.

### `go_irl_admin_save_beauty_workspace(p_profile_id uuid, p_workspace jsonb, p_expected_updated_at timestamptz, p_superadmin_user_key text)`

Service role only.

Updates an existing profile only. It does not create a new owner/profile and does not mutate owner/management authority.

The server-shaped `p_workspace` payload uses snake_case keys:

- `display_name`
- `public_location`
- `contact`
- `exact_address`
- `publication_state`
- `description_i18n`
- `instagram_url`
- `experience_i18n`
- `specialization_i18n`
- `hygiene_i18n`
- `materials_i18n`
- `spoken_languages_i18n`
- `certificates_i18n`
- `booking_notes_i18n`
- `portfolio[]`
- `services[]`
- `availability[]`

It preserves the canonical constraints already used by professional save:

- 1..50 services;
- at least one active service;
- 0..24 portfolio items;
- HTTPS portfolio images;
- Nails/Barber specialization only;
- duration/price/buffer bounds;
- `Europe/Prague` availability with at most 21 rows;
- six-language sanitization through existing `go_irl_beauty_i18n_sanitize`.

CAS uses the aggregate max revision across profile, non-archived services, and availability rows. A stale client receives `status='conflict'` and no mutation.

Every successful admin save writes `audit_log` action `beauty_workspace_admin.saved`.

### `go_irl_admin_adopt_beauty_workspace(p_profile_id uuid, p_expected_management_updated_at timestamptz, p_superadmin_user_key text)`

Service role only.

Explicitly changes only `master_managed -> platform_managed` with CAS, rejects an active transfer, and records `beauty_workspace_management.adopted`.

There is intentionally no generic RPC that flips a platform-managed cabinet directly to master-managed.

### `go_irl_prepare_beauty_platform_handoff(p_profile_id uuid, p_token_hash text, p_expires_at timestamptz, p_superadmin_user_key text)`

Service role only.

Requirements:

- exact active superadmin;
- existing `platform_managed` profile;
- valid SHA-256 token hash;
- expiry > now and <= 3 days;
- revokes any prior active transfer for the profile;
- inserts `transfer_kind='platform_handoff'`, current technical owner snapshot, and initiating superadmin;
- records `beauty_workspace_platform_handoff.prepared`.

### Existing owner-transfer RPC changes

`go_irl_request_beauty_workspace_owner_transfer`:

- allowed only for `master_managed` profiles;
- explicitly inserts `transfer_kind='owner_transfer'`.

`go_irl_claim_beauty_workspace_owner_transfer`:

- existing `owner_transfer`: unchanged candidate validation, then `pending_superadmin`;
- new `platform_handoff`: after the same Google candidate validation/profile/role conflict checks, atomically:
  - candidate becomes/retains `professional`;
  - `beauty_professional_profiles.owner_user_key` moves to candidate;
  - `management_state='master_managed'`;
  - transfer becomes `approved`;
  - `decided_by_user_key` is the superadmin that prepared the handoff;
  - audit is recorded;
  - returns `approved` immediately.

The existing claim Edge Function already handles an immediate `approved` result by issuing a fresh professional GO IRL session, so no Edge source change is required for this database foundation.

`go_irl_decide_beauty_workspace_owner_transfer`:

- only `owner_transfer` rows are decidable;
- successful master-to-master approval leaves/sets `management_state='master_managed'`.

## Admin API/UI follow-up

A later non-SQL source slice should add API actions backed by these RPCs and a shared Beauty editor repository. The UI must not call owner-bound `get_my_* / save_my_*` while in superadmin mode.

Recommended API actions:

- `list_beauty_workspaces`
- `get_beauty_workspace`
- `save_beauty_workspace`
- `adopt_beauty_workspace`
- `prepare_beauty_platform_handoff`

## Safe test-mode boundary

A production-safe `Тестировать` action is intentionally NOT mixed into this migration. A real test booking needs a separate booking-lifecycle contract, because simply creating an ordinary booking would trigger customer-facing side effects.

Follow-up test-mode design should introduce an explicit admin-test marker at the booking boundary and prove suppression in all downstream channels before activation:

- reminders / notifications;
- Telegram / Meta outbound;
- Google Calendar sync;
- customer communication routing;
- analytics/review prompts where applicable.

Until that cross-system suppression is implemented and verified, superadmin preview/edit is safe, but synthetic production bookings are not.

## Production rollout plan (future, separately authorized)

1. Apply migration and run structural verification.
2. Read back privileges/function definitions.
3. Explicitly classify the known GO IRL-operated profiles via `go_irl_admin_adopt_beauty_workspace` under a production-data gate.
4. Add/admin-release API + editor UI.
5. Verify list/get/save/preview on one platform-managed cabinet.
6. Prepare a handoff token without completing it; verify derived `handoff_pending`, expiry and revocation.
7. With a real intended professional, complete Google claim and verify immediate atomic transfer + fresh professional session.
8. Independently retest legacy master-to-master transfer still requires superadmin approval.
