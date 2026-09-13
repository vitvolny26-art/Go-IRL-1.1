# WABA001 current external evidence audit

Date: 2026-08-03
Role: AI Fixer
Mode: read-only external-state audit

## Purpose

Refresh the WhatsApp Business release gate using currently accessible Vercel, Drive, Gmail, GitHub and official Meta-maintained documentation without reading secret values, changing production configuration, sending messages or inferring inaccessible account state.

## Vercel project evidence

Authenticated Vercel project readback:

- project: `go-irl-1-1`;
- latest deployment returned by the project read: `dpl_7zcYBRXV8MNxTrV1t79GmuW43XRV`;
- target: production;
- state: READY.

This deployment was created by unrelated current `main` work and is not attributed to WABA001.

## WhatsApp route evidence

Aggregated runtime errors for `/api/whatsapp/webhook` over the selected seven-day range returned no runtime error clusters.

A production runtime-log query for `/api/whatsapp/webhook`, grouped by status code over the same selected range, returned exactly:

- HTTP 403: count 1.

That event is the controlled negative-path verification already recorded in `2026-08-03-production-webhook-readonly-probe.md`.

The query returned no positive callback or signed POST event. This is recorded only as the connector query result; it is not treated as proof that Meta subscription settings are absent.

## Durable Drive evidence

The current messaging/reminders production-status document contains historical evidence that:

- `go_irl_event_reminder` became Active;
- `go_irl_event_update` became Active;
- the last durable WABA phone audit still exposed only the Meta test number;
- no active/consented WhatsApp identity was available for a controlled live recipient at that checkpoint;
- WhatsApp remained disabled pending production-number and live lifecycle verification.

This evidence is historical and does not prove the current Meta account state.

## Gmail evidence

A Meta notification from 2026-07-22 said that one GO IRL-named Business Manager had been scheduled for deletion.

A later Meta notification from 2026-07-24 recorded a participant joining a GO IRL Business Manager. The two notifications reference different Business Manager assets. Therefore the deletion notice is not attributed to the later active GO IRL portfolio.

No current WhatsApp/business-verification/production-phone confirmation email was found by the scoped searches. Search absence is not treated as proof that verification or phone registration did not occur in Meta UI.

No Business IDs, personal email addresses or names are stored in this evidence file.

## Official Meta contract rechecked

Current Meta-maintained WhatsApp Cloud API materials still require, as applicable:

- a system-user access token with `whatsapp_business_messaging` for messaging operations;
- WABA/system-user asset assignment;
- a registered business phone number;
- two-step verification during phone registration;
- the relevant management permission for management operations.

No token was supplied to or called by this audit.

## GitHub state

Before the external-audit commit, Draft PR #611 was read back as open, Draft, unmerged and temporarily `mergeable=false`.

After commit `301d63ded9ad0761f7c3f312bc2d5bb0f2140df3` updated the branch, GitHub recalculated the PR as:

- open;
- Draft;
- unmerged;
- `mergeable=true`.

Recent repository commit readback confirms that `main` advanced through unrelated Beauty work, with latest observed main commit `da18668a218ce75f4e832bd9d3ffa81dbdb2b71a`.

No merge was requested or performed.

## ClickUp evidence boundary

The ClickUp task itself had previously been read back as In Progress / High / WhatsApp-only.

The current attempt to read task comments returned an explicit connector rate-limit response. No conclusion about comment contents or absence of updates is made.

## Verified conclusion

Verified now:

- production project and latest deployment are reachable/READY;
- no WhatsApp webhook runtime error cluster was returned for the selected seven-day range;
- the only matching route log returned was the controlled 403 probe;
- historical templates Active state exists in durable evidence;
- the old Business Manager deletion notice does not identify the later active GO IRL portfolio;
- PR #611 remains Draft, mergeable and unmerged after the latest branch update;
- current `main` has advanced independently of WABA001.

Still unverified:

- current business verification state;
- intended WABA/app linkage;
- production phone ownership, Cloud API registration and two-step verification;
- permanent system-user token type;
- token permissions, assigned assets, expiry and rotation ownership;
- current `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and `META_APP_SECRET` Production presence;
- positive Meta callback verification, WABA subscription and `messages` field;
- current template languages/component contracts;
- one consented owner-controlled test recipient;
- live inbound/outbound lifecycle.

## Safety state

- no secret value read or stored;
- no Meta/Vercel production configuration change;
- no live WhatsApp message;
- no provider enablement;
- no WABA001 merge or deployment;
- no auth, RLS, SQL, migration or production-data change.
