# GROOMING018 A-I communication router report

## Fix

Implemented the source-complete GROOMING018 A-I communication-routing contract on GitHub baseline `bb377c1`. Commit: not created.

## Analysis

- A canonical application user remains the identity root; transport identities are routes and are never inferred from the authentication provider.
- Preference resolution is deterministic and accepts only an explicitly selected, consented, healthy, outbound-capable `ready` route.
- Candidate, disabled and revoked identities cannot receive an automatic fallback delivery.
- Existing VPS production behavior remains unchanged until the protected database/configuration gate sets `VITE_GO_IRL_COMMUNICATION_ROUTER=true`.
- The n8n MCP endpoint returned `401 Unauthorized`, so no live n8n workflow was changed or claimed as verified.

## Where

- Domain contracts, resolver, repository and provider-neutral send boundary: `src/communications/`
- Master claim and workspace Settings UX: `src/beauty/BeautyMasterClaimPage.tsx`, `src/beauty/BeautyWorkspaceSettingsDialog.tsx`
- Exact admin request deep-link handling: `src/admin/BeautyMasterOnboardingPanel.tsx`, `src/admin/beautyMasterRequests.ts`
- Supabase schema, RLS, RPCs and delivery audit: `supabase/migrations/20260829130000_grooming018_communication_router.sql`
- Operational Google Apps Script alert source: `google-apps-script/grooming018-master-operational-alert.gs`
- Architecture and activation contract: `docs/architecture/GROOMING018_COMMUNICATION_ROUTER.md`

## Run

The implementation provides explicit global communication preference, route readiness/capability/consent/health state, immutable preference/route history, auditable routing outcomes, service-role-only route promotion, notification and reminder claims without provider inference, and delivery-driven route degradation/recovery. The claim flow requires preference selection before opening the draft workspace after activation; the same preference is editable in Settings.

The Google Apps Script source creates an idempotent operational Telegram owner/admin alert with an exact `/admin?beauty_request=...` link. Token and chat destination are read only from Script Properties; the operational chat is explicitly not treated as the master's identity.

## Check

- Focused GROOMING018 suite: 34/34 pass
- Full Vitest suite: 285 files, 1363/1363 pass
- Staff OS contract suite: pass
- TypeScript typecheck: pass
- ESLint: pass with one pre-existing `no-console` warning in `api/_shared/admin-authorization.ts`
- Production build: pass, 459 modules
- Bundle budget: pass, 15 JavaScript chunks
- `git diff --check`: pass before this report; repeated in the release gate

## If green

Commit and push the exact reviewed head, open a PR against GitHub `main`, require exact-head CI, merge only while mergeable, and deploy the merged commit to the VPS. Keep the communication router disabled in production until a separate explicit approval covers the Supabase migration/RLS apply, provider configuration, and feature-flag activation.

## If red

Do not merge or deploy a failing head. If a post-merge VPS smoke fails, roll back to the last known-good VPS release. If routing activation fails later, disable `VITE_GO_IRL_COMMUNICATION_ROUTER`, preserve delivery audit evidence, and do not infer a fallback route.

No production SQL/RLS migration, provider/auth configuration, secret mutation, Google Apps Script installation, n8n change, or production-data write was performed by this implementation step.
