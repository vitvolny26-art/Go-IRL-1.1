# WABA001 initial inspection evidence

Date: 2026-08-03
Role: AI Fixer
Mode: read-only audit before protected changes

## GitHub source of truth

Current `main`: `7068b37adeb8756315ce2f6e5fe49a3d2c744273`.

Inspected:

- `docs/architecture/WHATSAPP_MVP.md`;
- `docs/reports/2026-07-23-whatsapp-number-readiness.md`;
- `docs/reports/2026-07-23-whatsapp-review-recheck.md`;
- `api/whatsapp/webhook.ts`;
- `api/_shared/vercel-handler.ts`;
- `api/_shared/provider-webhook.ts`;
- `api/_shared/provider-messages.ts`;
- `src/whatsapp/payload-builders.ts`;
- `src/reminders/meta-dispatcher.ts`;
- `api/reminders/run.ts`;
- `.env.example`;
- current open pull requests, including SHARE003 Draft PR #608.

## Verified implementation findings

- `/api/whatsapp/webhook` delegates to the shared provider webhook handler.
- GET subscription verification checks `META_VERIFY_TOKEN` and returns the Meta challenge only on an exact match.
- POST delivery verifies `x-hub-signature-256` with `META_APP_SECRET` before parsing JSON.
- Inbound WhatsApp text and reply-button actions are parsed without persisting raw payloads.
- Consent commands START/СТАРТ and STOP/СТОП are handled.
- Inbound event IDs are claimed idempotently before processing.
- Trusted provider identities and join state are shared with the provider-neutral join service.
- Interactive invitation payloads support an image header plus native Join/Details reply buttons.
- Outbound active-window messages use `/{WHATSAPP_PHONE_NUMBER_ID}/messages` with `WHATSAPP_ACCESS_TOKEN`.
- Reminder and lifecycle delivery use approved templates and localized language codes.
- WhatsApp is enabled for workers only when explicitly included in `REMINDER_ENABLED_PROVIDERS`.

## Historical provider evidence

Latest relevant Drive checkpoint records:

- WhatsApp webhook configured and `messages` subscribed;
- `go_irl_event_reminder` Active;
- `go_irl_event_update` Active;
- only the Meta test number was available at the last account audit;
- no production-number lifecycle or consented production recipient was verified;
- WhatsApp remained disabled.

Historical evidence is not treated as proof of the current account state.

## Current Vercel evidence

- Team: `team_BuP2F4XGjFGussJqmQrISrbj`.
- Project: `prj_MtabJvddKyFSr98iC18Ztf7rlZjF` (`go-irl-1-1`).
- Latest production deployment: `dpl_775uXa5ws7nnUvHugTRm5c2PgzAW` — READY.
- A broad 30-day WhatsApp log query timed out and produced no verifiable result.
- A scoped query on the latest production deployment for the last 24 hours returned no WhatsApp-matching log entries.
- No conclusion about credential or webhook presence is drawn from the absence of matching logs.

## Expected server-only configuration names

Values were not read or stored.

- `META_GRAPH_VERSION`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_REMINDER_TEMPLATE_NAME`
- `WHATSAPP_LIFECYCLE_TEMPLATE_NAME`
- `REMINDER_ENABLED_PROVIDERS`

## Current official platform contract checked

The current Meta-maintained Cloud API materials require:

- a Meta business portfolio, WABA and business phone number;
- a Cloud API access token, preferably a permanent system-user token for production;
- phone-number registration through the Phone Number ID registration endpoint with two-step verification;
- the WhatsApp messaging/management permissions appropriate to the performed actions;
- webhook callback verification and WABA subscription so phone-number events reach the callback;
- approved templates for template-initiated delivery.

## Safety result

- No secrets or provider identities were read or written.
- No Meta/Vercel production configuration was changed.
- No live WhatsApp message was sent.
- No auth, RLS, SQL, migration or production-data change was made.
- No merge or deployment occurred.
