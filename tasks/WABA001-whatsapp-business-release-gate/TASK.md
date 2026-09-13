# WABA001 — WhatsApp Business Cloud API release gate

- Task ID: WABA001
- ClickUp: https://app.clickup.com/t/869e81k1r
- Owner role: AI Fixer
- Status: In Progress — audit/preparation
- Branch: `task/waba001-whatsapp-business-release-gate-20260803`
- Base: `7068b37adeb8756315ce2f6e5fe49a3d2c744273`

## Problem

GO IRL already contains a WhatsApp Cloud API webhook, inbound parser, signature verification, provider identity/consent handling, idempotent join flow, interactive event invitation, transactional notification/reminder adapters and tests. Historical evidence shows the webhook subscription was verified and the two GO IRL templates became Active, but the last durable account audit still had only a Meta test number and no verified production-number lifecycle.

The owner has confirmed that WhatsApp Business should be handled first. The current Meta/WABA account state, production-number registration, permanent system-user access, server-only configuration and controlled end-to-end delivery therefore need fresh verification before the provider can be enabled.

## Scope

- audit the existing WhatsApp Cloud API implementation and all usages;
- verify the current deployment and safe runtime evidence without exposing secrets or provider identities;
- establish the current Meta Business portfolio, WABA, app, production-number and template readiness using redacted evidence;
- define the exact server-only configuration manifest and webhook subscription contract;
- verify that current templates match runtime parameter counts, languages and delivery use cases;
- prepare a controlled inbound/outbound lifecycle smoke plan;
- change code only if the audit finds a bounded reproducible gap;
- keep WhatsApp disabled until every release gate is verified;
- update GitHub, ClickUp and Drive with verified evidence.

## Out of scope

- Instagram or Messenger implementation/configuration;
- unsolicited broadcasts or importing contact lists;
- storing tokens, secrets, phone numbers, provider user IDs, WABA IDs, raw webhook payloads or private message text in GitHub, Drive or ClickUp;
- auth, Supabase RLS, SQL, migrations or production-data changes;
- enabling WhatsApp in production, changing Meta/Vercel production configuration, registering a production number, sending a live message, merge or deployment without separate explicit owner approval.

## Acceptance criteria

1. Existing WhatsApp Cloud API code and all related release gates are documented from webhook through outbound delivery.
2. Current Meta Business/WABA/app/number/template state is verified from fresh evidence, with sensitive values redacted.
3. Required server-only variables are inventoried by name and environment without exposing values.
4. Callback URL, GET verification, POST signature verification and `messages` subscription are verified for the intended production WABA.
5. A verified production number is registered for Cloud API with two-step verification, or the exact external blocker is recorded.
6. A permanent system-user token has the required WhatsApp permissions and is stored only server-side, or the exact external blocker is recorded.
7. `go_irl_event_reminder` and `go_irl_event_update` are Active and their language/component contracts match runtime payloads.
8. One consented test recipient completes inbound START, one interactive event card, Join/details, one approved-template delivery, retry/idempotency and STOP/opt-out without duplicates.
9. WhatsApp is added to `REMINDER_ENABLED_PROVIDERS` only after all preceding gates are green and explicit owner approval is recorded.
10. Required checks, evidence, task status, report, ClickUp update and Drive mirror are complete before review.

## Approval gates

Explicit owner approval is required before:

- changing Meta Business or WhatsApp Manager production configuration;
- adding/registering/migrating a production phone number;
- creating or rotating production tokens/secrets;
- changing Vercel production environment variables;
- enabling WhatsApp in the provider allowlist;
- sending any live WhatsApp message;
- auth/RLS/SQL/migration/production-data changes;
- merge or deployment.

## Dependencies

- verified current GitHub `main`;
- Meta Business portfolio and WhatsApp Business Account access;
- an eligible business phone number capable of receiving verification;
- access to Meta Developers and WhatsApp Manager;
- access to Vercel server-only environment configuration;
- one owner-controlled consented WhatsApp test recipient.

## Blockers

- This session has no direct authenticated Meta Business/WhatsApp Manager connector, so current account assets cannot be asserted from code or historical reports.
- The current production deployment produced no WhatsApp-matching runtime log entries in the last 24 hours; this does not prove that the webhook or credentials are absent.
- Live provider/configuration actions remain behind explicit approval.

## Related files

- `docs/architecture/WHATSAPP_MVP.md`
- `api/whatsapp/webhook.ts`
- `api/_shared/vercel-handler.ts`
- `api/_shared/provider-webhook.ts`
- `api/_shared/provider-messages.ts`
- `src/whatsapp/`
- `src/reminders/meta-dispatcher.ts`
- `api/reminders/run.ts`
- `.env.example`

## Related work

- SHARE003 / Draft PR #608 covers organic `wa.me` sharing only and remains separate.
- ClickUp `869e69n9n` covers Messenger/Instagram event-card work and remains out of scope.
