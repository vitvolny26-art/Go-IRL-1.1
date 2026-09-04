# WABA001 Roadmap

## Current phase

Phase 2 — external Meta Business/WABA asset verification.

## Verified completed

- owner confirmed AI Fixer role and WhatsApp-first scope;
- existing ClickUp task `869e81k1r` selected; no duplicate task created;
- task branch and required task folder created;
- existing Cloud API webhook, signature verification, consent/idempotency, join flow, interactive invitation, outbound messages and reminder/template adapters inspected;
- owner confirmed Meta/WhatsApp token or tokens were created;
- no token value or secret was provided or stored;
- one safe negative-path GET verification probe returned controlled `403 verification_failed`;
- scoped production runtime logs verified the exact controlled probe;
- `META_VERIFY_TOKEN` is verified present and resolvable in Production without reading its value;
- latest authenticated Vercel project read returned a READY production deployment;
- seven-day aggregated runtime errors returned no error cluster for `/api/whatsapp/webhook`;
- seven-day route log grouping returned only the single controlled HTTP 403 probe;
- historical durable Drive evidence records both GO IRL templates Active;
- historical durable Drive evidence still records only the Meta test number and no consented live WhatsApp recipient at the last phone checkpoint;
- Gmail evidence shows that an old deletion notice and a later active GO IRL Business Manager notification reference different assets, so the deletion notice is not attributed to the later active portfolio;
- scoped Gmail searches returned no current WhatsApp/business-verification/production-phone confirmation email; search absence is not treated as account-state proof;
- Draft PR #611 was read back open, Draft, unmerged and `mergeable=true` after branch head `301d63d…` was published;
- an earlier `mergeable=false` read was transient and preceded that branch update;
- latest observed repository `main` is `da18668a218ce75f4e832bd9d3ffa81dbdb2b71a`, advanced through unrelated work;
- ClickUp task comments could not be verified because the connector returned a rate-limit response;
- production configuration was not changed by WABA001;
- provider allowlist was not changed;
- no live WhatsApp message was sent;
- no WABA001 merge or deployment was performed;
- no auth, RLS, SQL, migration or production-data change was made.

## Next verified step

Obtain redacted current statuses from Meta Business / WhatsApp Manager for:

- current Business Portfolio verification;
- intended WABA ownership and Meta App linkage;
- token classification: temporary or permanent system-user token;
- `whatsapp_business_messaging` and `whatsapp_business_management` permissions;
- assigned App, WABA and production-phone assets;
- token expiry and rotation ownership;
- server-only `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and `META_APP_SECRET` Production presence by name/status only;
- positive callback verification for the intended Meta App;
- WABA app subscription and `messages` webhook field;
- production phone ownership, Cloud API registration and two-step verification;
- current template languages/component contracts;
- one consented owner-controlled test recipient.

## Pending checks

- current Meta Business portfolio verification;
- current WABA ownership and app association;
- production number eligibility, ownership verification and Cloud API registration;
- two-step verification state;
- created token type, permissions, assigned assets, expiry and storage location;
- `META_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and template variable presence by name/environment;
- positive callback GET verification from the intended Meta App;
- signed POST delivery from the intended WABA;
- controlled inbound/outbound lifecycle;
- retry/idempotency and STOP/opt-out;
- provider allowlist decision;
- synchronize the task branch with then-current `main` before final review/merge if required;
- full repository gates if application code changes are later required.

## Blockers

- no authenticated Meta Business/WhatsApp Manager connector in this session;
- token creation and production verify-token presence are confirmed, but full token/WABA/number readiness is not;
- ClickUp comments are temporarily unreadable because of connector rate limiting;
- protected production configuration and live messaging require separate explicit owner approval;
- no consented test recipient has been verified in this task.

## Completion conditions

All TASK.md acceptance criteria are verified, evidence and report are saved, ClickUp and Drive are current, the task branch is synchronized with then-current main before final review if needed, and any code/config/provider changes have the required explicit approvals. No automatic merge or deployment.
