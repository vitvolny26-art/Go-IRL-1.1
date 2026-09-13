# WABA001 production webhook read-only probe

Date: 2026-08-03
Role: AI Fixer
Mode: read-only negative-path verification

## Purpose

Verify the deployed WhatsApp webhook boundary and the presence of the server-side `META_VERIFY_TOKEN` variable without reading or exposing its value and without changing production configuration.

## Code contract inspected

At GitHub base `7068b37adeb8756315ce2f6e5fe49a3d2c744273`, the WhatsApp GET webhook:

- reads `META_VERIFY_TOKEN` through `requireEnv`;
- returns the supplied challenge only when `hub.mode=subscribe`, the verify token matches exactly and a challenge exists;
- returns `403 {"error":"verification_failed"}` for a non-matching token;
- would not reach that controlled mismatch response if the required variable could not be resolved.

## Probe

A single GET was issued through the authenticated Vercel connector with:

- route: `/api/whatsapp/webhook`;
- `hub.mode=subscribe`;
- an intentionally invalid non-secret test token;
- a non-sensitive test challenge.

No real verify token was used or requested.

## Response received and verified

- HTTP status: `403 Forbidden`;
- body: `{"error":"verification_failed"}`;
- server: Vercel;
- response time header date: `2026-08-03T20:02:59Z`.

## Runtime readback

Current production deployment at verification time:

- deployment: `dpl_BjDaCwagW1hvwhB9SUigj25fc18b`;
- state: READY;
- target: production;
- deployed main commit: `db9421f8234107f4cf5ae45ee3e2fdad6e9796d2`.

Scoped runtime logs verified:

- `2026-08-03T20:02:58Z GET /api/whatsapp/webhook 403`;
- source: serverless;
- cache: MISS;
- deployment: `dpl_BjDaCwagW1hvwhB9SUigj25fc18b`.

## Verified conclusion

- the production WhatsApp webhook route is deployed and reachable;
- the negative verification path behaves as implemented;
- `META_VERIFY_TOKEN` is present and resolvable in the active production runtime;
- no secret value was read, returned or stored.

## Not verified by this probe

- the actual verify-token value;
- positive callback verification from the intended Meta App;
- WABA subscription or `messages` field state;
- `META_APP_SECRET` presence or validity;
- WhatsApp access-token type, permissions, assigned assets, expiry or validity;
- `WHATSAPP_PHONE_NUMBER_ID` presence or number readiness;
- outbound or inbound live-message delivery.

## Release state

- no WABA001 code/config change;
- no provider allowlist change;
- no live WhatsApp message;
- no WABA001 merge;
- no WABA001 deployment.

Unrelated main deployments were observed and are not attributed to WABA001.
