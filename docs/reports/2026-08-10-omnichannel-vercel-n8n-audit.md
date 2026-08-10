---
title: GO IRL Vercel + n8n Omnichannel Gateway Audit
owner: Chief Archivist / Technical Lead
status: Partial
source_of_truth: false
last_review: 2026-08-10
---

# GO IRL — Vercel + n8n Omnichannel Gateway Audit

## Task

Audit the current Facebook Messenger, Instagram Direct, WhatsApp Business and Telegram integration boundaries and define the minimum safe path toward:

`Meta -> Vercel ingress -> durable event layer -> VPS workers -> GO IRL Inbox/Outbox`

No architecture rewrite, production traffic switch, secret change, Supabase migration, RLS change, auth change, merge or deploy is included in this audit.

## Authority and candidate

- Canonical repository resolved by GitHub: `vitvolny26-art/Go-IRL-1.1`.
- The owner-supplied `vitvolny26-art/GO-IRL-1.0` repository reference resolves to the current repository above; the historical 1.0 naming must not override fresh GitHub `main` evidence.
- Audit baseline: `main@191a19f46db3267072aeb0ff8ed7bd65f65a5cdf`.
- Vercel project: `go-irl-1-1` / `prj_MtabJvddKyFSr98iC18Ztf7rlZjF`.
- Vercel team: `team_BuP2F4XGjFGussJqmQrISrbj`.
- Current Vercel production deployment: `dpl_7haLKouA1gYqFd5xjQ8BmbC88VUe`.
- Deployment state: `READY`.
- Deployment GitHub SHA: `191a19f46db3267072aeb0ff8ed7bd65f65a5cdf`.
- Vercel runtime metadata reports 12 Node.js functions. This is the current function-count ceiling already reached by the project; do not add standalone Vercel API entrypoints without first reducing/consolidating the function set.

## Current webhook routes

| Route | Channel | Current entrypoint | GET verify | POST signature | Current processing |
| --- | --- | --- | --- | --- | --- |
| `/api/messenger/webhook` | Facebook Messenger | `api/messenger/webhook.ts` | `META_VERIFY_TOKEN` | `META_APP_SECRET` | synchronous provider processing before ACK |
| `/api/instagram/webhook` | Instagram Direct | `api/instagram/webhook.ts` | `INSTAGRAM_VERIFY_TOKEN` if present, otherwise `META_VERIFY_TOKEN` | `INSTAGRAM_APP_SECRET` if present, otherwise `META_APP_SECRET` | synchronous provider processing before ACK |
| `/api/whatsapp/webhook` | WhatsApp Business | `api/whatsapp/webhook.ts` | `META_VERIFY_TOKEN` | `META_APP_SECRET` | synchronous provider processing before ACK |

No separate Facebook webhook route was found. Facebook Page messaging is handled through the Messenger route.

### GET verification flow

The shared handler accepts only `hub.mode=subscribe`, requires the configured verify token to match `hub.verify_token`, requires a non-empty `hub.challenge`, and returns the challenge with HTTP 200. Invalid verification returns HTTP 403.

Read-only production probes against the latest Vercel deployment returned HTTP 403 `verification_failed` for all three routes when called without a verification token, confirming that the deployed handlers are present without exposing token values.

### POST authenticity and schema boundary

The Vercel handler buffers the request body, verifies `X-Hub-Signature-256` as HMAC-SHA256 over the raw body, then parses JSON. Invalid signatures return HTTP 401; invalid JSON returns HTTP 400.

The signature helper uses constant-time comparison. Secrets remain server-side.

### Current processing inside the webhook request

After signature verification and parsing, the request currently waits for all parsed actions through `Promise.allSettled`.

For each action, the request may perform all of the following before returning HTTP 200:

1. claim durable idempotency state in Supabase;
2. write/update provider identity state;
3. process START/STOP consent state;
4. execute activity detail or join logic;
5. perform outbound Meta Graph API sends such as Messenger welcome/invitation/join-result messages;
6. mark the inbound idempotency claim processed/failed.

If any action fails, the whole webhook request returns HTTP 500. There is no explicit in-request retry loop; recovery relies on provider redelivery plus the existing failed/stale claim re-acquisition contract.

This is not a fast-ingress architecture. Supabase latency, application RPC latency and outbound Meta API latency all sit on the webhook ACK path.

## Current duplicate protection and retries

Existing durable idempotency is implemented by `provider_inbound_events` plus service-role RPCs:

- stable key = SHA-256 of `provider:eventId`;
- primary key = `(provider, event_key)`;
- states = `processing`, `processed`, `failed`;
- failed events may be reclaimed;
- processing leases older than 5 minutes may be reclaimed;
- attempt count is capped at 20.

This is useful and should be preserved conceptually, but the table stores only the hashed event key and processing metadata. It does not store a durable normalized payload/envelope, so it cannot by itself support deferred VPS processing after a fast Vercel ACK.

Current event ID derivation:

- WhatsApp messages: provider `message.id`;
- Messenger/Instagram messages: `message.mid` where present;
- Messenger/Instagram fallback: deterministic provider + sender + provider timestamp composite;
- echo messages are ignored.

The future normalized ingress must retain provider-native message/event IDs whenever available. For event types without a native ID, derive a deterministic hash from provider, account, sender/conversation, timestamp, event type and normalized event content. Never generate a random ID for inbound idempotency.

## Logging and privacy

The shared webhook logs structural counts only: provider, object type, entry count, messaging-event counts, change field names, parsed action count, duplicate count and failure count. Processing failures log a sanitized error code. Message bodies, provider user IDs and tokens are intentionally excluded from these logs.

Keep this logging policy. Future ingress logs must not contain the normalized `payload`, sender ID, message text, access tokens or raw request body.

## ACK timing and timeout risk

Current risk: **high relative to a webhook ingress role** because ACK waits on database operations, domain processing and potentially outbound Meta network calls.

Target behavior:

1. read raw body;
2. verify signature;
3. validate supported schema/event shape;
4. derive normalized channel/event identity;
5. durably enqueue with idempotency;
6. return HTTP 200 immediately after the durable write succeeds.

If durable enqueue fails, return a retryable non-2xx response so the provider can redeliver. A duplicate durable insert is a successful ACK condition.

Heavy processing must move to VPS workers.

## Vercel function budget

Current production deployment metadata reports `nodejs: 12`. Historical release work already consolidated Meta endpoints to recover the Hobby 12-function budget.

Therefore the minimal implementation must reuse the existing three webhook entrypoints and the shared handler. Do not create a fourth omnichannel Vercel function or new standalone Meta helper routes as part of this work.

## Production callback URLs

Existing registered callbacks must not be changed during this audit.

The current Vercel aliases attached to the latest production deployment include both the historical and current project aliases. The stable current Vercel callback candidates are:

- `https://go-irl-1-1.vercel.app/api/messenger/webhook`
- `https://go-irl-1-1.vercel.app/api/instagram/webhook`
- `https://go-irl-1-1.vercel.app/api/whatsapp/webhook`

Historical callbacks on `https://go-irl-1-0.vercel.app/api/.../webhook` can remain registered while that alias remains attached and smoke is green.

Do **not** register `https://go-irl.fun/api/messenger/webhook`, `/api/instagram/webhook` or `/api/whatsapp/webhook` yet. The last verified canonical Caddy configuration proxies only `/api/meta/*`, `/e/*` and `/s/*` to Vercel. Canonical-domain callback migration would require a separate bounded Caddy routing change plus GET verification and signed POST smoke before changing Meta configuration.

## n8n audit

The n8n connector is available and returned 23 workflows.

Metadata keyword searches were performed for: Meta, Facebook, Messenger, Instagram, WhatsApp, webhook, omnichannel, inbox and messaging.

No existing production omnichannel/message gateway workflow was found.

The only Meta-named match is:

- `qjeAEoLDnLcza2td` — `TEMP — AUTH200 Credential Binding Audit` — inactive. It is a read-only SSH credential-presence audit and is not a webhook/message processor.

Relevant operational workflows that should remain outside the messaging hot path include:

- `6khfY6PmKkIVB9Qv` — `GO IRL VPS Deploy` — active release/deploy automation;
- `ulCZrP3Ci0YJy1TY` — `GO IRL — Unified Production Orchestrator — Index Resolver Pilot` — active governed orchestration;
- `925CFxQK2lRRIWwa` — `GO IRL ChatGPT Bridge` — active private AI bridge.

Six old manual error executions were found in unrelated DOM001/PR-gate/media workflows from 2026-08-07. No Meta gateway execution errors were found because no n8n Meta gateway exists.

### n8n role decision

Keep n8n as control-plane orchestration, not the data-plane message processor.

Approved/appropriate n8n roles:

- operator notifications and alerts;
- administrative automation;
- reports and scheduled summaries;
- CRM/archive synchronization;
- non-critical scheduled jobs;
- deployment/maintenance workflows under existing release governance.

Do not use n8n as:

- the only durable queue;
- the only inbound webhook processor;
- the only delivery retry state store;
- the synchronous dependency that Meta must wait for before webhook ACK.

No duplicate n8n gateway should be created at this stage.

## Existing outbound foundation

GO IRL already has a durable `event_notifications` outbox with provider, delivery key, status, attempt count, lease, retry time and provider message ID. Its claim RPC uses `FOR UPDATE SKIP LOCKED` semantics and its finish RPC records sent/retry/failed/cancelled outcomes.

This is the correct durability pattern to mirror for inbound events. Do not overload the existing event-notification table with inbound provider payloads; inbound and outbound have different lifecycle and retention semantics.

## Recommended durable event layer

Preferred minimum: **Supabase PostgreSQL durable inbound queue**, because GO IRL already depends on Supabase and already has proven lease/idempotency/outbox patterns.

This requires a new table/migration and therefore is **specification only** in this audit. No migration is authorized or applied.

Proposed table: `channel_inbound_events`.

Minimum contract:

- `id uuid primary key default gen_random_uuid()`
- `event_id text not null`
- `provider text not null` — e.g. `meta`, later `telegram`
- `channel text not null` — `messenger`, `instagram`, `whatsapp`, later `telegram`
- `account_id text`
- `sender_id text`
- `conversation_id text`
- `event_type text not null`
- `provider_timestamp timestamptz`
- `received_at timestamptz not null default now()`
- `payload jsonb not null`
- `processing_status text not null default 'queued'`
- `attempt_count smallint not null default 0`
- `leased_at timestamptz`
- `next_attempt_at timestamptz`
- `processed_at timestamptz`
- `last_error_code text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Recommended unique idempotency key:

`unique(provider, channel, account_id, event_id)`

Recommended processing states:

`queued | processing | processed | failed | dead_letter`

Recommended service-role-only RPCs, mirroring existing queue semantics:

- enqueue/upsert one normalized inbound event and return `queued | duplicate`;
- claim a bounded batch using lease + `FOR UPDATE SKIP LOCKED`;
- finish as processed/retry/failed/dead-letter;
- hard attempt cap, with bounded exponential backoff.

RLS should be enabled; `anon` and `authenticated` should have no direct insert/update/delete access. Exact policies/grants require a separately reviewed migration. No RLS or SQL was changed in this audit.

### Payload minimization

Persist the smallest validated event payload needed by the worker, not the entire raw webhook body by default. Store message text/content only where required for Inbox semantics and define retention separately. Keep raw bodies and secrets out of logs.

## Normalized event envelope

```json
{
  "event_id": "provider-stable-id",
  "provider": "meta",
  "channel": "messenger|instagram|whatsapp|telegram",
  "account_id": "provider-account-id",
  "sender_id": "provider-sender-id",
  "conversation_id": "provider-conversation-id-or-derived-1to1-key",
  "event_type": "message.text|message.interactive|postback|referral|status|...",
  "provider_timestamp": "2026-08-10T00:00:00Z",
  "received_at": "2026-08-10T00:00:01Z",
  "payload": {},
  "processing_status": "queued",
  "attempt_count": 0
}
```

Provider mapping:

- Messenger/Instagram `account_id`: page/professional account entry ID where supplied;
- WhatsApp `account_id`: `metadata.phone_number_id`;
- provider-native `message.mid` / WhatsApp `message.id` is preferred for `event_id`;
- `conversation_id` uses a provider conversation/thread identifier when supplied; for a 1:1 event without one, derive a deterministic account+sender conversation key.

## Minimal patch plan

### Patch A — ingress abstraction, no behavior switch

- add a provider-neutral normalizer under the existing shared API code;
- add unit tests for Messenger, Instagram and WhatsApp normalized envelopes;
- preserve existing routes, GET verification and signature behavior;
- do not add new Vercel function entrypoints.

### Patch B — durable inbound migration source only

- add the exact reviewed `channel_inbound_events` migration/RPC contract;
- do not apply it to production until separate owner approval;
- add source-level migration contract tests/verification SQL if the repository convention requires them.

### Patch C — fast ingress behind explicit activation gate

After the migration is separately approved/applied:

- Vercel verifies and normalizes;
- Vercel enqueues one or more events;
- Vercel returns 200 after durable enqueue/duplicate result;
- existing synchronous processor remains available as rollback path until worker smoke is green.

### Patch D — VPS worker

- reuse existing provider action/domain functions instead of rewriting them;
- poll/claim durable inbound events;
- perform provider identity updates, consent commands, activity details/join actions and outbound sends;
- finish/retry/dead-letter the inbound event;
- expose bounded health/lag metrics.

### Patch E — Inbox/Outbox convergence

- route normalized inbound results to the future unified Inbox/router;
- keep the existing durable notification outbox as the outbound durability model;
- converge provider sending behind reusable adapters without combining inbound/outbound tables.

### Patch F — Telegram later

- normalize Telegram user/bot message events into the same channel envelope in a separate bounded task;
- preserve the existing Telegram Mini App and event-supergroup webhook/binding behavior;
- do not migrate Telegram traffic until equivalent idempotency and smoke gates pass.

## Operations to move out of Vercel request lifecycle

Move to VPS worker:

- provider identity writes;
- notification consent mutation and response messages;
- activity/event detail lookup;
- join/request processing;
- Messenger welcome send;
- invitations and join-result sends;
- other outbound Meta Graph API calls;
- processing retries and dead-letter handling.

Keep in Vercel ingress:

- GET webhook verification;
- raw-body read;
- `X-Hub-Signature-256` verification;
- bounded JSON/schema validation;
- normalized event derivation;
- one durable enqueue/idempotency transaction;
- safe structural logging;
- fast HTTP ACK.

## Required secret names — values must remain private

Existing Vercel ingress/runtime names:

- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `INSTAGRAM_APP_SECRET` (when Instagram uses a separate app secret)
- `INSTAGRAM_VERIFY_TOKEN` (when Instagram uses a separate verify token)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Existing outbound worker/provider names:

- `META_GRAPH_VERSION`
- `MESSENGER_PAGE_ACCESS_TOKEN`
- `MESSENGER_PAGE_ID`
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_ACCOUNT_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_LIFECYCLE_TEMPLATE_NAME`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Telegram later/current server-side names include:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_BOT_USERNAME`

No secret values were read, copied or changed by this audit.

## Smoke gate before any traffic switch

1. existing callbacks still verify successfully;
2. invalid signature remains 401 and never enqueues;
3. valid signed fixture enqueues exactly once;
4. duplicate signed fixture returns 200 and creates no second event;
5. Vercel ACK path contains no provider outbound fetch;
6. VPS worker claims and processes one canary event;
7. retryable worker failure is retried without duplicate outbound send;
8. poison event reaches failed/dead-letter state without blocking the queue;
9. Messenger live canary passes;
10. Instagram live canary passes where permissions/window allow;
11. WhatsApp live canary passes only after number/template/permission gates are green;
12. rollback to synchronous processing is tested before production cutover.

## Rollback plan

Until the new worker path has a green smoke gate, preserve the current synchronous processor behind a configuration/activation boundary.

Rollback sequence:

1. stop worker claims;
2. switch the existing webhook handler back to the current synchronous processing path;
3. keep the same webhook URLs and verify tokens;
4. leave queued inbound events intact for forensic/replay handling;
5. confirm signed live webhook processing on the old path;
6. do not delete the durable queue during rollback.

A database migration rollback, if ever needed, must be separately owner-approved. Do not drop a queue that contains unprocessed evidence/events.

## Blockers

1. A durable normalized inbound payload queue does not exist yet. Existing `provider_inbound_events` is idempotency metadata only.
2. Creating the preferred durable table requires a new Supabase migration, which is protected and not authorized by this audit.
3. Current webhook ACK waits on DB/domain/outbound processing.
4. Vercel is already at 12 Node.js functions, so new standalone API functions are not safe without budget recovery.
5. No current n8n omnichannel gateway exists; n8n must remain outside the primary hot path.
6. Current live inbound traffic was not observed in the available short Vercel runtime-log window; live provider smoke remains a later activation gate.
7. `go-irl.fun` does not have verified bounded Caddy proxy routes for the three provider webhook paths, so canonical-domain callbacks are not ready for registration.

## Evidence

- `GH:api/messenger/webhook.ts@191a19f`
- `GH:api/instagram/webhook.ts@191a19f`
- `GH:api/whatsapp/webhook.ts@191a19f`
- `GH:api/_shared/provider-webhook.ts@191a19f`
- `GH:api/_shared/vercel-handler.ts@191a19f`
- `GH:api/_shared/meta-signature.ts@191a19f`
- `GH:api/_shared/provider-inbound-service.ts@191a19f`
- `GH:supabase/migrations/20260723122000_provider_inbound_idempotency.sql@191a19f`
- `GH:supabase/migrations/20260723103725_event_notification_outbox.sql@191a19f`
- `GH:api/_shared/provider-webhook.test.ts@191a19f`
- `GH:tests/api/meta/event-preview.test.ts@191a19f`
- `GH:vercel.json@191a19f`
- `RUNTIME:vercel:dpl_7haLKouA1gYqFd5xjQ8BmbC88VUe@191a19f`
- `N8N:qjeAEoLDnLcza2td` — inactive read-only Meta credential audit
- `N8N:6khfY6PmKkIVB9Qv` — active GO IRL VPS deploy workflow; not messaging hot path

## Status

**Partial** — audit and architecture are complete enough to define the next bounded implementation slice, but production migration, worker implementation and live provider canary evidence are intentionally absent.

## Next one bounded step

Implement **Patch A only**: provider-neutral normalization plus unit tests inside the existing shared webhook code, with **no behavior switch, no migration, no new Vercel function, no secret/config change and no deploy**. Run the full repository quality gate, then open a dedicated PR for review.
