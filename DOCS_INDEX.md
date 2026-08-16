---
title: GO IRL Documentation Status Registry
owner: Project Archivist
status: Active
source_of_truth: true
last_review: 2026-07-26
next_review: 2026-08-26
---

# GO IRL Documentation Status Registry

Single entry point for GO IRL documentation status, ownership, and conflict tracking.

Use this file before changing product logic, architecture, QA flow, beta scope, release wording, AI role behavior, or historical product philosophy.

## Absolute source-of-truth rules

- `docs/GO_IRL_CONSTITUTION.md` is the **absolute source of truth** for GO IRL philosophy and architecture principles.
- `docs/MARKET_POSITIONING.md` is the **source of truth for market positioning and MVP feature filtering**.
- `docs/COMPETITOR_WATCH.md` is the **source of truth for competitor signals**, but competitor signals must not automatically become MVP scope.
- `README.md` is the **source of truth for current code scope**: implemented features, stack, setup, and current runtime model.
- `docs/release/CURRENT_PHASE.md` is the source of truth for the current lifecycle phase.
- `RELEASE_NOTES.md` is the source of truth for release implementation status and must not contradict `README.md` or the current lifecycle phase.
- `DEPLOYMENT.md` is the source of truth for Vercel-first deployment flow.
- `docs/SPORT_COACH_MVP.md` is the source of truth for Sport Coach MVP 1.1 boundaries.
- `docs/MVP_DOC_AUDIT.md` is the source of truth for known documentation conflicts.
- `docs/MISSING_SECTIONS.md` is the source of truth for missing documentation boundaries.
- `docs/DATABASE_SCHEMA_AUDIT.md` is the source of truth for current schema-vs-future-schema documentation conflicts.
- `docs/audit/KNOWLEDGE_DEBT.md` is the source of truth for open documentation and knowledge debt.
- `docs/governance/KNOWLEDGE_PLATFORM.md` is the source of truth for knowledge status model, review cadence, knowledge debt, and Project Memory Bus.
- `docs/governance/ARCHIVIST_OPERATING_POLICY.md` is the source of truth for Archivist authority, human gates, report lifecycle, and automation boundaries.
- `docs/automation/DOCUMENTATION_GOVERNANCE_ARCHIVIST.md` is the source of truth for the deployed documentation-governance workflow IDs, schedule, destinations, deduplication, and error handling.
- `docs/onboarding/ARCHIVIST_CHARTER.md` is the source of truth for the Project Archivist role.
- `docs/onboarding/PROJECT_COORDINATOR_CHARTER.md` is the source of truth for the report-only Project Coordinator role and AI Staff OS mission boundaries.
- `docs/onboarding/AUTOMATION_ENGINEER_CHARTER.md` is the source of truth for the Automation Engineer role, automation boundaries, verification, and production approval gates.
- `docs/onboarding/AI_ROLES.md` is the working registry for reusable AI roles.
- `docs/onboarding/AI_FIXER_AGENT.md` is the source of truth for the AI Fixer / QA + UX Polish Agent.
- `docs/governance/AI_ORGANIZATION.md` is the working source for AI councils, escalation, and role interaction.
- `docs/reports/README.md` defines AI/task report naming and required report sections.
- `docs/THIRD_PARTY_NOTICES.md` records attribution and license notices for third-party visual assets used in generated product media.
- Historical snapshot files must not be used for code generation.
- Bible files are preserved product sources. New Bible boundary chapters can describe MVP scope, but Bible files must not override current code, Supabase schema, auth, or RLS.
- Do not change `.env`, secrets, Supabase RLS, auth, or destructive SQL without explicit approval.

## Knowledge Status Model

Strategic and operational documents should use this status model:

```text
Draft
Review
Approved
Active
Deprecated
Archived
```

Preferred metadata header:

```yaml
title:
owner:
status:
source_of_truth:
last_review:
next_review:
```

## Статусный реестр документации

| Документ | Тип | Статус | Source of Truth | Известные конфликты |
|---|---|---|---|---|
| `README.md` | Core / Code Scope | Active | Да | Must stay aligned with `RELEASE_NOTES.md` on Trusted Auth and release blockers. |
| `DOCS_INDEX.md` | Registry | Active | Да | Must be updated after every doc move/status change. |
| `ROADMAP.md` | Product Planning / Canonical Index | Active | Да | Short current-state index. Detailed scope is delegated to the five canonical roadmap parts and loaded selectively. |
| `docs/roadmap/ROADMAP_PART_01_FOUNDATION_MVP.md` | Product Planning / Roadmap Part | Active | Да | Foundation, MVP, thesis, and product guardrails. Canonical index: `ROADMAP.md`. |
| `docs/roadmap/ROADMAP_PART_02_RELEASE_PREPARATION.md` | Product Planning / Roadmap Part | Active | Да | Current Release Preparation and Stabilization scope. Canonical index: `ROADMAP.md`. |
| `docs/roadmap/ROADMAP_PART_03_TELEGRAM_NOTIFICATIONS.md` | Product Planning / Roadmap Part | Active | Да | Gated Telegram and notifications scope. Canonical index: `ROADMAP.md`. |
| `docs/roadmap/ROADMAP_PART_04_TRUST_MODULES.md` | Product Planning / Roadmap Part | Active | Да | Gated trust, attendance, modules, discovery, and Sport Coach scope. Canonical index: `ROADMAP.md`. |
| `docs/roadmap/ROADMAP_PART_05_GROWTH_DECISION_GATES.md` | Product Planning / Roadmap Part | Active | Да | Gated production growth, decision gates, dependencies, and sprint traceability. Canonical index: `ROADMAP.md`. |
| `docs/product-roadmap/PRODUCT_ROADMAP.md` | Drive Mirror / Selective Index | Active | Нет | Short index of the owner-designated Drive mirror. GitHub `ROADMAP.md` remains authoritative. |
| `docs/product-roadmap/PRODUCT_ROADMAP_PART_01_AUTHORITY_FOUNDATION.md` | Drive Mirror / Roadmap Part | Active | Нет | Authority, executive state, guardrails, overview, and historical foundation. |
| `docs/product-roadmap/PRODUCT_ROADMAP_PART_02_RELEASE_PREPARATION.md` | Drive Mirror / Roadmap Part | Active | Нет | Active Release Preparation and Stabilization mirror content. |
| `docs/product-roadmap/PRODUCT_ROADMAP_PART_03_FUTURE_PHASES_GATES.md` | Drive Mirror / Roadmap Part | Active | Нет | Future phases and decision gates. |
| `docs/product-roadmap/PRODUCT_ROADMAP_PART_04_REGISTERS_EVIDENCE.md` | Drive Mirror / Roadmap Part | Active | Нет | Registers, synchronization notes, conflicts, priorities, dependencies, evidence, and update rules. |
| `docs/product-roadmap/PRODUCT_ROADMAP_PART_05_RMAP_MAINTENANCE.md` | Drive Mirror / Roadmap Part | Active | Нет | RMap maintenance records through RMap115. |
| `BACKLOG.md` | Product Planning | Draft | Нет | Future items must remain tagged. |
| `CHANGELOG.md` | Release History | Draft | Нет | Needs quality-gate verification before release claims. |
| `docs/release/CURRENT_PHASE.md` | Release / Current Phase | Active | Да | Lifecycle-phase authority; must stay aligned with README, ROADMAP, and RELEASE_NOTES. |
| `RELEASE_NOTES.md` | Release Status | Active | Да | Trusted Auth is `[SHIPPED/PRODUCTION PATH]`; operational smoke checks remain. |
| `DEPLOYMENT.md` | Release / Deploy | Active | Да | Must remain Vercel-first; old Netlify references are historical only. |
| `BETA_CHECKLIST.md` | QA / Beta | Active | Да | Needs sync after deployment wording changes. |
| `BETA_TESTING.md` | QA / Beta | Active | Да | Browser Demo Mode should be documented. |
| `SPRINTS.md` | Roadmap / Sprint History | Draft | Нет | Root historical plan; canonical roadmap-folder copy exists in `docs/roadmap/SPRINTS.md`. |
| `SPRINT0_STATUS.md` | Historical Snapshot | Deprecated | Нет | Contains Sprint 0 / Netlify-era proof; not current Vercel release truth. |
| `CHECKLIST.md` | Historical Local Checklist | Deprecated | Нет | Old local branch/Docker/Prisma/Turbo assumptions; do not generate code from it. |
| `SETUP.md` | Legacy Setup | Deprecated | Нет | Old Windows paths and `.bat` / `.ps1` workflow. |
| `SETUP_RU.md` | Legacy Setup | Deprecated | Нет | Old Windows paths and `.bat` / `.ps1` workflow. |
| `PATCH_REPORT.md` | Historical Patch Report | Deprecated | Нет | Trusted Auth implementation history, not current release truth. |
| `GO_IRL_DOCUMENTATION.md` | Generated Snapshot | Deprecated | Нет | Old generated snapshot; may contain outdated README/Roadmap excerpts. |
| `docs/GO_IRL_CONSTITUTION.md` | Product / Architecture Constitution | Active | Да | Absolute philosophy and architecture source of truth. |
| `docs/MARKET_POSITIONING.md` | Market / Feature Filter | Active | Да | Must gate new feature categories before MVP expansion. |
| `docs/COMPETITOR_WATCH.md` | Market Watch | Active | Да | Competitor signals must not auto-create MVP scope. |
| `docs/MVP_DOC_AUDIT.md` | Audit / Conflict Registry | Active | Да | Registry for documentation conflicts and resolutions. |
| `docs/MISSING_SECTIONS.md` | Audit / Missing Boundaries | Active | Да | Registry for undocumented MVP boundaries. |
| `docs/DATABASE_SCHEMA_AUDIT.md` | Audit / Supabase Schema | Active | Да | Separates current Supabase schema/migrations from future database architecture. |
| `docs/audit/KNOWLEDGE_DEBT.md` | Audit / Knowledge Debt | Active | Да | Tracks missing, stale, conflicting, duplicated, or misleading project knowledge. |
| `docs/SPORT_COACH_MVP.md` | Product Scope / Coach | Active | Да | `CoachRequestPanel.tsx` is current UI basis; Role Choice and Review Flow are future. |
| `docs/MVP_STABILIZATION_PLAN.md` | MVP Plan | Active | Да | Stabilization plan and weather/share/join/profile/demo boundaries. |
| `docs/GO_IRL_1_1_STABILIZATION.md` | Stabilization Ledger | Draft | Нет | Task statuses may become historical. |
| `docs/DEVELOPMENT_PROTOCOL.md` | Engineering Protocol | Active | Да | pnpm, small patches, no unsafe changes. |
| `docs/onboarding/ARCHIVIST_CHARTER.md` | Onboarding / Role Charter | Active | Да | Source of truth for Project Archivist duties, reading order, market intelligence duty, and memory rules. |
| `docs/onboarding/PROJECT_COORDINATOR_CHARTER.md` | Onboarding / Role Charter | Active | Да | Source of truth for report-only Daily Mission routing, role activation, budgets, validation, and human gates. |
| `docs/onboarding/AUTOMATION_ENGINEER_CHARTER.md` | Onboarding / Role Charter | Review | Да | Canonical review-stage charter. Manual selection is supported; deterministic runtime activation remains pending merge, deployment, and verification. |
| `docs/onboarding/AI_ROLES.md` | Onboarding / Role Registry | Draft | Да | Working registry for AI roles; individual charters still need expansion. |
| `docs/onboarding/AI_FIXER_AGENT.md` | Onboarding / AI Agent Prompt | Active | Да | Source of truth for small bug, QA, and UX polish agent behavior and safety limits. |
| `docs/reports/README.md` | Reports / AI Work Logs | Active | Нет | Defines report location and format for AI Fixer task reports. |
| `docs/reports/2026-07-16-agent-report-archivist-finalization.md` | Reports / Agent Work Log | Draft | Нет | Durable record of the Archivist governance rollout; not runtime or governance authority. |
| `docs/reports/2026-07-29-agent-report-roadmap-selective-retrieval.md` | Reports / Agent Work Log | Draft | Нет | Bounded evidence record for roadmap chunking and the unpublished selective-retrieval n8n draft. |
| `docs/governance/AI_ORGANIZATION.md` | Governance / AI Councils | Draft | Да | Working source for AI councils, role assignment commands, escalation, and Coordinator interaction. |
| `docs/governance/KNOWLEDGE_PLATFORM.md` | Governance / Knowledge Platform | Active | Да | Source of truth for Knowledge Status Model, metadata, Knowledge Debt, KPIs, reviews, and Project Memory Bus. |
| `docs/governance/ARCHIVIST_OPERATING_POLICY.md` | Governance / Archivist Policy | Active | Да | Canonical authority, lifecycle, human-gate, and automation-boundary rules. |
| `docs/governance/TOOL_OPERATING_MODEL.md` | Governance / Tool Operating Model | Review | Нет | Proposed responsibility boundaries and routing rules; must not be treated as Active before review and merge. |
| `docs/automation/DOCUMENTATION_GOVERNANCE_ARCHIVIST.md` | Automation / Governance Workflow | Active | Да | Deployed n8n workflow IDs and operational boundaries; GitHub remains authority. |
| `docs/roadmap/SPRINTS.md` | Roadmap / Sprint Overview | Draft | Нет | Roadmap-folder copy of sprint plan; not current MVP scope by itself. |
| `docs/roadmap/SPRINT_0.md` | Roadmap / Sprint Record | Archived | Нет | Historical Sprint 0 record; Netlify references are historical only. |
| `docs/roadmap/SPRINT_1.md` | Roadmap / Sprint Record | Archived | Нет | Historical MVP Core record; current scope controlled by ROADMAP/BACKLOG/README. |
| `docs/roadmap/SPRINT_2.md` | Roadmap / Sprint Record | Draft | Нет | Telegram/notification direction; current runtime boundaries override old assumptions. |
| `docs/roadmap/SPRINT_3.md` | Roadmap / Sprint Record | Draft | Нет | Trust/RLI future layer; not current MVP scope. |
| `docs/roadmap/SPRINT_4.md` | Roadmap / Sprint Record | Draft | Нет | Modules/discovery future layer; Olomouc beta remains focused. |
| `docs/roadmap/SPRINT_5.md` | Roadmap / Sprint Record | Draft | Нет | Production growth future layer; blocked until beta/release gates are verified. |
| `docs/Database.md` | Architecture | Draft | Нет | Future database architecture; not current schema. |
| `docs/RLS.md` | Supabase / RLS | Draft | Нет | Do not edit policies without explicit approval. |
| `docs/Security.md` | Security | Draft | Нет | Must stay aligned with Trusted Auth production path. |
| `docs/EventLifecycle.md` | Architecture | Draft | Нет | Activity Chat boundary added; final chat expiry needs code/schema decision. |
| `docs/Notifications.md` | Architecture / Future | Draft | Нет | Advanced notification automation is future scope. |
| `docs/AI.md` | AI / Future | Draft | Нет | AI discovery is not current MVP. |
| `docs/reputation.md` | Reputation / Future | Draft | Нет | RLI/Trust future model, not current complete runtime. |
| `docs/vertical-experiences.md` | Product / Future Architecture | Draft | Нет | Current MVP is Olomouc-first with six beta categories. |
| `docs/bible/00-completion-audit.md` | Bible Audit | Active | Да | Bible expanded and structured, not final. |
| `docs/bible/00-bible-roadmap.md` | Bible Roadmap | Active | Да | How to finish Bible without rewriting from scratch. |
| `docs/bible/01-foundation/03-mvp-scope-and-market-positioning.md` | Bible / MVP Boundary | Active | Да | MVP 1.0 scope, market positioning, Olomouc beta, six categories, non-goals. |
| `docs/bible/04-modules-mvp-audit.md` | Bible / MVP Boundary | Active | Да | Six-category beta module boundary and future module containment. |
| `docs/bible/05-product-requirements-mvp-split.md` | Bible / MVP Boundary | Active | Да | PRD split: MVP 1.0, MVP 1.1 stabilization, future, blocked-before-beta. |
| `docs/bible/07-beta-readiness-and-operations.md` | Bible / Beta Ops | Active | Да | Beta operations, QA gates, release gates, Browser Demo Mode, MVP non-goals. |
| `docs/bible/08-runtime-boundaries.md` | Bible / Runtime Boundary | Active | Да | Runtime/auth/Supabase/demo/profile/chat/share/weather boundaries. |
| `docs/bible/09-governance-and-ai-organization.md` | Bible / Governance | Active | Да | AI roles, councils, Archivist, NotebookLM/Gemini boundaries, and source-of-truth governance. |
| `docs/bible/10-operations-and-release.md` | Bible / Release Ops | Active | Да | Beta gates, release gates, Vercel/Supabase/Telegram smoke checks, and readiness rules. |
| `supabase/README.md` | Supabase Setup | Active | Да | Must reflect Trusted Auth and migration reality. |
| `supabase/schema.sql` | Supabase Schema | Active | Да | Production-sensitive. Read-only during documentation cleanup. |
| `supabase/schema_next.sql` | Future Schema | Draft | Нет | Do not apply without review. |
| `supabase/migration_v*.sql` | Supabase Migration History | Active | Да | Read-only for docs cleanup. No destructive SQL. |

## Current documentation conflicts

| Conflict | Files | Resolution |
|---|---|---|
| Current lifecycle phase wording was split across active beta and release documents. | `docs/release/CURRENT_PHASE.md`, `README.md`, `ROADMAP.md`, `RELEASE_NOTES.md` | CURRENT_PHASE owns lifecycle phase; active documents must align, while beta records remain historical evidence. |
| Trusted Auth was both current production model and public blocker. | `README.md`, `RELEASE_NOTES.md`, `PATCH_REPORT.md` | `RELEASE_NOTES.md` marks Trusted Auth as `[SHIPPED/PRODUCTION PATH]`; operational checks remain. |
| Coach UI promise exceeded current implementation. | `docs/SPORT_COACH_MVP.md`, `src/components/CoachRequestPanel.tsx` | Role Choice and Review Flow moved to future scope. |
| Sprint 0 Netlify proof conflicted with current Vercel beta flow. | `SPRINT0_STATUS.md`, `DEPLOYMENT.md`, `BETA_CHECKLIST.md` | Sprint 0 docs are historical/deprecated. |
| Legacy setup docs could mislead AI/code generation. | `SETUP.md`, `SETUP_RU.md`, `CHECKLIST.md` | Historical/deprecated warning banners required. |
| Activity Chat, Browser Demo Mode, Weather, Telegram Mini App limits were scattered. | `docs/MISSING_SECTIONS.md`, `BETA_TESTING.md`, `docs/EventLifecycle.md`, `docs/MVP_STABILIZATION_PLAN.md` | Boundaries documented; chat expiry still needs product/schema decision. |
| Bible files could be mistaken for current MVP/schema/implementation plan. | `docs/bible/*`, `ROADMAP.md`, `BACKLOG.md` | Current MVP boundary chapters/audits added; Bible remains not final. |
| Future DB architecture conflicted with current Supabase migrations. | `docs/Database.md`, `docs/bible/03-database-design.md`, `supabase/migration_v8_activity_chat.sql` | `docs/DATABASE_SCHEMA_AUDIT.md` created; `docs/Database.md` should stay marked future architecture. |
| AI roles and Archivist rules existed only in chat. | Chat history, onboarding docs | Added `ARCHIVIST_CHARTER.md`, `AI_ROLES.md`, and `AI_ORGANIZATION.md`. |
| Project Coordinator authority existed only as draft governance language. | `docs/onboarding/PROJECT_COORDINATOR_CHARTER.md`, `docs/onboarding/AI_ROLES.md`, `docs/governance/AI_ORGANIZATION.md` | Added a report-only Coordinator charter and synchronized role/governance boundaries. |
| Automation Engineer authority and routing existed only in the instruction index and chat. | `docs/onboarding/AUTOMATION_ENGINEER_CHARTER.md`, `docs/onboarding/AI_ROLES.md`, `docs/governance/AI_ORGANIZATION.md`, `n8n/code/staff-00-role-selection.js` | Added a dedicated charter, synchronized governance, and deterministic automation routing before generic bug/fix routing. |
| AI Fixer reporting existed only in chat. | Chat history, onboarding docs, reports docs | Added `AI_FIXER_AGENT.md` and `docs/reports/README.md`. |
| Knowledge architecture existed only in discussion. | Chat history, governance docs | Added `KNOWLEDGE_PLATFORM.md` with status model, KPIs, review cadence, and Project Memory Bus. |
| Sprint structure existed as loose root-level docs. | `SPRINTS.md`, `SPRINT0_STATUS.md` | Added `docs/roadmap/SPRINTS.md` and `docs/roadmap/SPRINT_0.md` through `SPRINT_5.md`. |
| Knowledge debt was known only from audit discussion. | Deep Research audit, chat history | Added `docs/audit/KNOWLEDGE_DEBT.md` as active tracking source. |
| Production repository identity still pointed agents and Vercel setup to legacy `GO-IRL`. | `DEPLOYMENT.md`, `docs/onboarding/CHATGPT_PROJECT_SETUP.md`, `docs/GO_IRL_1_1_STABILIZATION.md` | Canonical production repository is `vitvolny26-art/GO-IRL-1.0`; legacy `GO-IRL` must not drive Vercel or BotFather. |

## Sprint documentation decision

Sprint docs should not stay as loose root-level artifacts long term.

Preferred Documentation 2.0 structure:

```text
docs/roadmap/
├── ROADMAP_PART_01_FOUNDATION_MVP.md
├── ROADMAP_PART_02_RELEASE_PREPARATION.md
├── ROADMAP_PART_03_TELEGRAM_NOTIFICATIONS.md
├── ROADMAP_PART_04_TRUST_MODULES.md
├── ROADMAP_PART_05_GROWTH_DECISION_GATES.md
├── SPRINTS.md
├── SPRINT_0.md
├── SPRINT_1.md
├── SPRINT_2.md
├── SPRINT_3.md
├── SPRINT_4.md
└── SPRINT_5.md
```

Rules:

- Root `ROADMAP.md` remains the living canonical index and current-state summary.
- The five `ROADMAP_PART_*` files hold canonical detailed scope and are loaded selectively by mission.
- `BACKLOG.md` remains the controlled work queue.
- Sprint 0-5 files become historical execution records and decision logs.
- Root `SPRINT0_STATUS.md` stays deprecated until links are checked and migration is complete.
- Root `SPRINTS.md` stays as legacy/transition until links are checked.
- Do not move or delete root files blindly; update links and `DOCS_INDEX.md` in the same documentation-only phase.

## Current tree target

```text
GO IRL Documentation
├── Core
│   ├── README.md
│   ├── DOCS_INDEX.md
│   ├── ROADMAP.md
│   ├── BACKLOG.md
│   ├── CHANGELOG.md
│   └── RELEASE_NOTES.md
├── Product / Market
│   └── docs/
│       ├── GO_IRL_CONSTITUTION.md
│       ├── MARKET_POSITIONING.md
│       ├── COMPETITOR_WATCH.md
│       ├── SPORT_COACH_MVP.md
│       └── MVP_STABILIZATION_PLAN.md
├── Architecture
│   └── docs/
│       ├── Database.md
│       ├── DATABASE_SCHEMA_AUDIT.md
│       ├── RLS.md
│       ├── Security.md
│       ├── EventLifecycle.md
│       └── vertical-experiences.md
├── Audit
│   ├── docs/MVP_DOC_AUDIT.md
│   ├── docs/MISSING_SECTIONS.md
│   ├── docs/DATABASE_SCHEMA_AUDIT.md
│   ├── docs/audit/KNOWLEDGE_DEBT.md
│   ├── docs/DOCUMENTATION_AUDIT.md
│   └── project-audit/
├── Bible
│   └── docs/bible/
│       ├── 09-governance-and-ai-organization.md
│       └── 10-operations-and-release.md
├── Governance
│   └── docs/governance/
│       ├── AI_ORGANIZATION.md
│       ├── KNOWLEDGE_PLATFORM.md
│       ├── ARCHIVIST_OPERATING_POLICY.md
│       └── TOOL_OPERATING_MODEL.md
├── Automation
│   └── docs/automation/
│       └── DOCUMENTATION_GOVERNANCE_ARCHIVIST.md
├── Onboarding
│   └── docs/onboarding/
│       ├── ARCHIVIST_CHARTER.md
│       ├── PROJECT_COORDINATOR_CHARTER.md
│       ├── AUTOMATION_ENGINEER_CHARTER.md
│       ├── AI_ROLES.md
│       └── AI_FIXER_AGENT.md
├── Reports
│   └── docs/reports/
│       ├── README.md
│       ├── 2026-07-16-agent-report-archivist-finalization.md
│       └── 2026-07-29-agent-report-roadmap-selective-retrieval.md
├── Roadmap / Sprints
│   ├── ROADMAP.md
│   ├── BACKLOG.md
│   ├── SPRINTS.md
│   └── docs/roadmap/
│       ├── ROADMAP_PART_01_FOUNDATION_MVP.md
│       ├── ROADMAP_PART_02_RELEASE_PREPARATION.md
│       ├── ROADMAP_PART_03_TELEGRAM_NOTIFICATIONS.md
│       ├── ROADMAP_PART_04_TRUST_MODULES.md
│       ├── ROADMAP_PART_05_GROWTH_DECISION_GATES.md
│       ├── SPRINTS.md
│       ├── SPRINT_0.md
│       ├── SPRINT_1.md
│       ├── SPRINT_2.md
│       ├── SPRINT_3.md
│       ├── SPRINT_4.md
│       └── SPRINT_5.md
│   └── docs/product-roadmap/
│       ├── PRODUCT_ROADMAP.md
│       ├── PRODUCT_ROADMAP_PART_01_AUTHORITY_FOUNDATION.md
│       ├── PRODUCT_ROADMAP_PART_02_RELEASE_PREPARATION.md
│       ├── PRODUCT_ROADMAP_PART_03_FUTURE_PHASES_GATES.md
│       ├── PRODUCT_ROADMAP_PART_04_REGISTERS_EVIDENCE.md
│       └── PRODUCT_ROADMAP_PART_05_RMAP_MAINTENANCE.md
└── Deprecated / Snapshot Candidates
    ├── SETUP.md
    ├── SETUP_RU.md
    ├── PATCH_REPORT.md
    ├── SPRINT0_STATUS.md
    └── GO_IRL_DOCUMENTATION.md
```

## Maintenance rule

Update this registry when:

- a document is added, moved, deprecated, or promoted to source of truth;
- release blockers change;
- future vision becomes MVP scope;
- code implementation contradicts docs;
- Bible files are audited or reclassified;
- Supabase migration/auth/RLS docs are audited;
- Sprint docs are moved into `docs/roadmap/`;
- AI roles, AI agents, councils, or reporting rules are added/changed;
- Knowledge Platform status model or governance rules change;
- Knowledge Debt items are opened or closed.
