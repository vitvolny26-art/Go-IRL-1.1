---
title: Roadmap Part 05 — Growth and Decision Gates
owner: Product Lead
status: Active
source_of_truth: true
canonical_index: ROADMAP.md
scope: Production growth, future Services and monetization tracks, decision gates, dependency chain, and historical sprint references
last_review: 2026-08-23
next_review: 2026-09-06
---

# Roadmap Part 05 — Growth and Decision Gates

Canonical index: [ROADMAP.md](../../ROADMAP.md).

## Phase 5 — Production Growth

**State:** Draft / Gated

**Goal:** Prepare for broader public usage after the core loop, release operations, and safety controls are stable.

Planned scope:

- Activation, join, share, and completed-activity analytics.
- Reporting and moderation.
- Abuse protection.
- Referral loop.
- Web parity with Telegram Mini App behavior.

Entry gate:

- Latest quality checks pass on the reviewed release commit.
- Real Telegram smoke verification passes.
- Supabase production tables and RLS behavior are verified.
- Share/join flow is verified from a second Telegram account.
- Production does not depend on demo-only identity.
- Support, monitoring, moderation, analytics, and public-safety review are complete.

Not authorized before review:

- referral incentives;
- public moderation tooling;
- analytics-driven growth loops;
- large-scale city expansion;
- paid growth experiments.

Source record: [`SPRINT_5.md`](SPRINT_5.md).

## Future Track A — Services and Beauty

**State:** Bounded Production Pilot Implemented / Gate F Reconciliation Active

**Product outcome:** Prove that GO IRL can reduce coordination friction for real-world service appointments without weakening the Activities product or displacing unresolved release blockers.

Beauty is the first and only approved Services vertical. Coaching, Lessons, Wellness, and Other Services remain strategic placeholders and require separate approval.

Sequence and current state:

1. `BEAUTY001` — product definition and boundaries.
2. `BEAUTY002` — UX and information architecture specification.
3. `BEAUTY003` — architecture, privacy, safety, retention, and data-boundary review.
4. `BEAUTY004` — local or mock-data prototype. Historical prototype phase completed and superseded by later production evidence.
5. `BEAUTY005` — bounded Olomouc production pilot. **Completed:** Issue #491 is closed; production professional/profile data boundaries, owner-scoped RLS/public projection, migrations, CI, VPS runtime and HTTP health evidence were recorded.
6. Later Beauty work added server-backed booking/RPC/RLS, reschedule, lifecycle timing guard, waitlist and delivery paths, notifications, professional specialization, public/share-card persistence, workspace presentation, and manual-only Google Calendar UI/integration foundations.
7. `GROOMING003` — current-state and Gate F reconciliation. **Completed:** canonical roadmap reconciliation merged via PR #958 from source Commit `d1fad50` to `main@c4861d2`; implementation evidence and the remaining Gate F governance/operations gaps are distinguished without declaring the gate fully green.
8. `GROOMING004` — Gate F Product Owner Approval Ledger. **Active:** the current Product Owner continuation approval is GREEN from the explicit 2026-08-23 owner statement; the missing original BEAUTY005 approval artifact remains a historical evidence gap; every protected production change remains separately approval-gated.

Current production evidence:

- root entry separates `/activities` and `/services`;
- Beauty has a bounded server-backed professional/profile and service model with owner-scoped private data and explicit public projection;
- Beauty booking foundations are server-backed and include later reschedule, lifecycle timing, waitlist and notification work;
- Beauty professional workspace and public/share-card foundations are present in production;
- Beauty Brand Studio remains a subsystem of the Beauty Master Workspace, not a separate product; its operational Drive mirror must be reconciled against fresh GitHub/runtime evidence before roadmap status is advanced;
- the current share-card implementation includes persisted/generated-card foundations, background/logo editing and service selection, while full Typography Studio, Theme Engine, generalized Card Designer, complete Brand Kit and AI Designer are not all proven complete;
- Google Calendar integration is manual-only in the current UI; provider OAuth secret configuration and real provider smoke remain a separate configuration gate;
- current production evidence supersedes the old local/mock-only description, but implementation existence alone does not make Gate F fully green.

Current Gate F reconciliation status:

- **GREEN — Product Owner continuation approval record:** on 2026-08-23 the Product Owner explicitly approved Gate F continuation for the current bounded Beauty pilot while keeping every protected production change separately approval-gated. The exact original BEAUTY005 approval artifact remains not located and is preserved as a historical evidence gap, not a current continuation blocker.
- **PARTIAL — pilot definition:** Olomouc and bounded Beauty scope are documented; provider-supply target and current measurable success criteria are not fully mapped in the reviewed evidence.
- **GREEN — Services domain separation:** `/activities` and `/services` remain separate domains and Beauty uses its own professional/booking model rather than reusing Activities participants/chat/capacity as the primary Services model.
- **PARTIAL — privacy/consent/retention/deletion/moderation/safety:** owner-scoped RLS, public allowlist projection and server-only integration boundaries are evidenced, but one current post-change Gate F matrix covering all required governance dimensions is not yet consolidated.
- **OPEN — support and operational ownership:** current canonical evidence does not yet identify a complete support/operations owner matrix for the bounded pilot.
- **PARTIAL — protected-change approval map:** production migrations/releases exist with release evidence, but the individual approvals still require consolidation into one traceable ledger instead of inferring blanket authorization.
- **GREEN — implementation evidence:** BEAUTY005 is completed and current `main` contains substantially newer production evidence than the historical prototype commit `70841bf`.

Entry/continuation gate:

- current release gate is green, or the Product Owner explicitly authorizes a non-displacing parallel documentation or bounded Services track;
- pilot segment, city, provider supply, and success measures are defined and current;
- legal, privacy, consent, retention, deletion, moderation, safety, support, and operational ownership are reviewed and assigned;
- Activities and Services domain boundaries remain documented and enforced;
- every SQL, migration, RLS, auth, secret, production configuration, production data, deployment, or destructive change retains separate explicit approval and evidence;
- no additional Services vertical, city expansion, public launch, or monetization scope is activated merely because the bounded Beauty production implementation already exists.

Pilot exit signals:

- completed Appointments;
- reduced manual coordination;
- no avoidable double booking;
- Professional repeat usage;
- Client completion, cancellation, and rescheduling behavior;
- privacy, safety, support, and operational incidents remain within explicitly accepted thresholds.

Not authorized by this track:

- broad production Services launch;
- additional Services verticals;
- reuse of Activity participants, public Activity Chat, capacity, or join-request logic as the primary Services model;
- public Services marketing before explicit launch approval;
- billing or payment processing.

### GROOMING003 evidence boundary — Completed

`GROOMING003` was a documentation/current-state reconciliation task, not a feature release. It preserved the following evidence hierarchy:

1. verified production runtime and Supabase evidence;
2. current GitHub `main` and exact PR/CI evidence;
3. task/release history;
4. Google Drive workspace mirrors.

The primary Grooming/Beauty Drive workspace and the Beauty Brand Studio Drive workspace are operational mirrors, not repository source of truth. Brand Studio evidence must be included when reconciling share-card, branding, presentation and common share-layer status, but stale phase labels must not override newer GitHub/runtime evidence.

GROOMING003 completed when the canonical roadmap distinguished implemented production foundations from remaining Gate F governance/operations gaps. Source Commit `d1fad50` merged through PR #958 to `main@c4861d2`. It did not auto-activate another implementation task.

### GROOMING004 approval-ledger boundary

`GROOMING004` resolves only the current Product Owner continuation approval record. The explicit 2026-08-23 owner statement authorizes Gate F continuation for the current bounded Beauty pilot and keeps all protected production changes separately approval-gated.

The exact original BEAUTY005 Product Owner approval artifact remains unavailable in the connected evidence and is retained as a historical evidence gap. That gap does not invalidate the new current continuation approval and does not retroactively authorize any protected production mutation.

GROOMING004 does not make Gate F fully green and does not change the status of pilot definition, privacy/consent/retention/deletion/moderation/safety, support/operations ownership, or the protected-change approval map.

## Future Track B — Offline Enabler Monetization

**State:** Draft / Gated

**Product outcome:** Verify whether professional or recurring Offline Enablers receive enough repeat measurable value to support a small transparent fee.

`Offline Enabler` means a person or organization whose work converts online intent into completed offline participation, such as a professional organizer, Beauty Professional, trainer, guide, tour operator, instructor, teacher, studio, club, or another separately approved role.

Entry gate:

- validated repeat usage by at least one bounded Offline Enabler segment;
- evidence of saved time, reduced coordination cost, increased completion, revenue support, or another measurable provider outcome;
- willingness-to-pay evidence from actual usage, not interview interest alone;
- legal, tax, invoicing, refund, consumer-protection, finance, security, and payment-provider review;
- explicit Product Owner approval of the commercial model and public price.

Candidate tests:

- low monthly subscription;
- free basic tier with a low-cost professional tier;
- usage-based threshold;
- optional paid operational modules;
- transaction fee only if GO IRL later processes payments directly.

Commercial guardrails:

- ordinary participants and Clients are not the primary payer merely for participating;
- casual community organizers retain a free path for occasional Activities;
- payment does not buy trust, ranking, reviews, moderation exceptions, safety exceptions, or paid placement;
- free community activity remains possible;
- fees must be transparent and tied to measurable operational value;
- Activities and Services may require different pricing mechanics.

Not authorized by this track:

- public prices or tariffs;
- billing implementation;
- subscriptions;
- payment processing;
- invoicing or tax configuration;
- paid ranking or placement;
- charging casual community organizers merely for creating an occasional Activity.

## Decision gates

### Gate A — Release readiness

Evidence required:

- latest `main` quality checks;
- real Telegram smoke verification;
- production Supabase verification;
- deployment and operational readiness.

### Gate B — Product-loop stability

Evidence required:

- reliable create, share, join, chat, participant, and attendance flow;
- no unresolved release blocker in the core loop;
- sufficient organizer and participant trust signals.

### Gate C — Trust approval

Evidence required:

- reviewed trust model;
- privacy, moderation, and abuse controls;
- explicit scope approval;
- safe attendance evidence model.

### Gate D — Expansion evidence

Evidence required:

- Olomouc retention and attendance signals;
- Sport Coach validation results;
- clear module or city owner;
- measurable expansion success criteria.

### Gate E — Public growth readiness

Evidence required:

- moderation and abuse protection;
- analytics and support readiness;
- public-safety review;
- stable operations under broader usage.

### Gate F — Services pilot approval

Evidence required:

- explicit Product Owner approval of the bounded Beauty pilot and its current continuation scope;
- defined pilot segment, city, provider supply, scope, and success criteria;
- reviewed Services domain model and separation from Activities;
- current privacy, consent, retention, deletion, moderation, and safety model;
- support and operational ownership;
- protected production changes approved individually and traceable to evidence;
- reviewed prototype and production-pilot evidence, with historical commit `70841bf` retained only as early prototype evidence rather than the current implementation baseline.

**Current status:** not fully green. The Product Owner continuation approval record is GREEN from the explicit 2026-08-23 owner statement; the remaining Gate F matrix retains the `PARTIAL / OPEN / GREEN` statuses above. `GROOMING004` records continuation approval without authorizing protected changes.

### Gate G — Monetization validation

Evidence required:

- repeat usage by a bounded Offline Enabler segment;
- measurable provider value;
- willingness to pay after real usage;
- selected commercial model and price explicitly approved by the Product Owner;
- legal, finance, tax, invoicing, refund, security, and payment-provider review;
- evidence that free community participation remains viable.

## Dependency chain

1. Preserve and verify Foundation and MVP Core.
2. Complete Release Preparation and Stabilization.
3. Add Telegram notifications without violating runtime boundaries.
4. Introduce trust features only after explicit approval and stable attendance evidence.
5. Expand Activities modules and cities only after release and product evidence.
6. Start production-growth mechanics only after operational and public-safety readiness.
7. Maintain the bounded Beauty production pilot as a separately governed track after the completed GROOMING003 reconciliation; GROOMING004 records the current Product Owner continuation approval while other Gate F gaps remain unresolved.
8. Do not expand Beauty to additional cities/verticals or broad public Services launch until unresolved Gate F items and all new protected-change approvals are green.
9. Validate Offline Enabler value and willingness to pay before selecting pricing.
10. Implement or publicly announce monetization only after Gate G and separate implementation approval.

## Historical sprint records

The following retained files preserve planning history and source traceability:

- [`SPRINT_0.md`](SPRINT_0.md) — Archived.
- [`SPRINT_1.md`](SPRINT_1.md) — Archived.
- [`SPRINT_2.md`](SPRINT_2.md) — Draft historical input.
- [`SPRINT_3.md`](SPRINT_3.md) — Draft historical input.
- [`SPRINT_4.md`](SPRINT_4.md) — Draft historical input.
- [`SPRINT_5.md`](SPRINT_5.md) — Draft historical input.

They remain available for audit and context, but this file controls current growth, future Services and monetization sequencing, decision gates, dependencies, and scope.

## GO IRL 2.0 repository reconciliation — 2026-08-07

**State:** Evidence-reconciled planning layer / implementation status mixed.

This section records repository evidence already present on main before GO IRL 2.0 execution. It does not authorize protected runtime changes and does not override the release gates above.

### Implemented / merged foundation

- trusted Telegram authentication foundation with server-side Telegram data verification;
- PWA install/offline foundation;
- public Activity/Services share-preview infrastructure and multi-channel share paths for Telegram, WhatsApp, Messenger, Facebook and Instagram;
- substantial notification/outbox/reminder infrastructure and event lifecycle notification contracts;
- UProfile 002–009 modular profile work;
- ADMIN005–009 admin foundation;
- significant Master/Beauty workspace, booking, calendar and availability foundation.

### Partial / release-gated

- Communication & Notifications still needs fresh deployment/runtime and Telegram chat-binding E2E evidence;
- WhatsApp Business remains gated by Meta business/number/template/permission verification and live-delivery smoke;
- Instagram transport remains permission/credential/release gated;
- PWA still needs Web Push, subscription lifecycle and physical-device verification;
- UProfile010 / Account & Security remains incomplete;
- SEO has dynamic share/OG foundations but still needs canonical-domain migration, robots/sitemap/indexing rules and structured event metadata;
- full wide desktop/web parity is not yet proven complete.

### Planned / not yet proven on main

- go-irl.fun as canonical runtime origin and admin.go-irl.fun as canonical admin origin;
- Google-primary web sign-in plus Apple, Meta, email and phone providers under one production identity model;
- explicit cross-provider account linking with Telegram continuity;
- end-to-end multi-role RBAC for user, organizer, master, moderator, admin and superadmin;
- Web Push;
- full GO IRL 2.0 SEO and acquisition/referral analytics;
- payments, which remain future scope.

### Execution order

1. DOM001 — establish go-irl.fun as canonical production origin while preserving old URLs.
2. WEB001 — verify and finish responsive desktop/mobile/PWA shell.
3. AUTH200 — web multi-provider auth while preserving trusted Telegram continuity.
4. AUTH201 — explicit identity linking and Account & Security.
5. PWA200 — Web Push and device verification.
6. SEO200 — canonical-domain SEO, robots/sitemap/indexing and structured event metadata.
7. DIST200 — consolidate Telegram/WhatsApp/Messenger/Meta distribution on canonical smart links and attribution.
8. MOD200 — complete GO IRL 2.0 moderation/RBAC/admin boundaries.

Protected areas remain separately approval-gated: auth, RLS, SQL/migrations, secrets, production configuration and deployments.
