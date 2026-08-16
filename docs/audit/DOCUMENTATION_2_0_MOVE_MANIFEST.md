---
title: Documentation 2.0 Move Manifest
owner: Project Archivist
status: Review
source_of_truth: false
last_review: 2026-07-12
next_review: 2026-07-19
---

# Documentation 2.0 Move Manifest

## Purpose

Inventory and proposed placement plan for the GO IRL Documentation 2.0 reorganization.

This is an inventory-only document. No file may be moved, renamed, deleted, merged, promoted, or deprecated solely because it appears in this manifest.

## Inventory state

Status: **Review — incomplete recursive-tree confirmation**.

Evidence used:

1. `DOCS_INDEX.md`.
2. `README.md` project-document registry.
3. `docs/onboarding/LIBRARIAN_DOCUMENTATION_2_0_MISSION.md`.
4. Existing role, Bible, roadmap, audit, market, governance, report, automation, export, Supabase, and script-adjacent documentation discovered through GitHub search.

Current limitation: the connected GitHub interface can read and search repository files but does not expose a recursive directory listing. Therefore the paths below are the confirmed inventory set, but completeness must be checked against a recursive `git ls-files` result before Phase 2 or any `git mv` operation.

## Safety decision

- No files moved.
- No files deleted.
- No statuses changed in source documents.
- No source-of-truth flags changed.
- No runtime, application code, Auth, RLS, SQL, migration, secret, deployment, or automation behavior changed.
- Folder-wide entries marked `INVENTORY REQUIRED` must be expanded to one row per file before relocation.

## Placement legend

| Decision | Meaning |
|---|---|
| Retain | Current path is intentional. |
| Move | Proposed Documentation 2.0 destination is sufficiently clear, pending full link audit. |
| Review | Destination or lifecycle status needs evidence or human decision. |
| Protected | Keep in place because moving may affect tooling, runtime, deployment, generated exports, or operational conventions. |

## A. Canonical root control files

| Current path | Proposed path | Type | Current status | Proposed status | Owner | Source of truth | Decision | Reason / conflicts / inbound links |
|---|---|---|---|---|---|---|---|---|
| `README.md` | `README.md` | Core entry point | Active | Active | Tech Lead | true | Retain | Current implementation and setup authority; high inbound-link count. |
| `DOCS_INDEX.md` | `DOCS_INDEX.md` | Documentation registry | Active | Active | Project Archivist | true | Retain | Canonical documentation registry. |
| `ROADMAP.md` | `ROADMAP.md` | Product planning | Active | Active | Product Lead | true | Retain | Canonical roadmap. |
| `BACKLOG.md` | `BACKLOG.md` | Product planning | Draft | Draft | Product Lead | false | Retain | Canonical work queue despite non-authoritative status. |
| `CHANGELOG.md` | `CHANGELOG.md` | Release history | Draft | Review | Release Manager | false | Retain | Root operational control file; status needs evidence review. |
| `RELEASE_NOTES.md` | `RELEASE_NOTES.md` | Release state | Active | Active | Release Manager | true | Retain | Current release authority. |
| `DEPLOYMENT.md` | `DEPLOYMENT.md` | Deployment runbook | Active | Active | Release Manager | true | Retain | Vercel-first deployment authority. |
| `BETA_CHECKLIST.md` | `BETA_CHECKLIST.md` | Beta gate | Active | Active | QA Lead | true | Retain | Current beta checklist. |
| `BETA_TESTING.md` | `BETA_TESTING.md` | QA plan | Active | Active | QA Lead | true | Retain | Current beta testing authority. |

## B. Root files requiring classification

| Current path | Proposed path | Type | Current status | Proposed status | Owner | Source of truth | Decision | Reason / conflicts / inbound links |
|---|---|---|---|---|---|---|---|---|
| `AGENTS.md` | `AGENTS.md` | Tooling instruction | Unknown | Review | Technical Lead | false | Protected | Root location may be consumed by coding agents; do not move until tooling behavior is verified. |
| `SPRINTS.md` | `docs/archive/roadmap/SPRINTS.md` | Historical roadmap | Draft | Archived | Product Lead | false | Move | Canonical supporting copy exists under `docs/roadmap/`; verify inbound links. |
| `SPRINT0_STATUS.md` | `docs/archive/roadmap/SPRINT0_STATUS.md` | Historical snapshot | Deprecated | Archived | Release Manager | false | Move | Netlify-era evidence; must not look current. |
| `CHECKLIST.md` | `docs/archive/setup/CHECKLIST.md` | Legacy local checklist | Deprecated | Archived | Technical Lead | false | Move | Obsolete local workflow assumptions. |
| `SETUP.md` | `docs/archive/setup/SETUP.md` | Legacy setup | Deprecated | Archived | Technical Lead | false | Move | Replaced by `README.md`. |
| `SETUP_RU.md` | `docs/archive/setup/SETUP_RU.md` | Legacy setup | Deprecated | Archived | Technical Lead | false | Move | Replaced by `README.md`. |
| `PATCH_REPORT.md` | `docs/archive/reports/PATCH_REPORT.md` | Historical patch report | Deprecated | Archived | Technical Lead | false | Move | Historical Trusted Auth implementation record. |
| `GO_IRL_DOCUMENTATION.md` | `docs/archive/snapshots/GO_IRL_DOCUMENTATION.md` | Generated snapshot | Deprecated | Archived | Project Archivist | false | Move | Generated snapshot with potentially stale excerpts; provenance must be retained. |

## C. Product and philosophy documents

| Current path | Proposed path | Type | Current status | Proposed status | Owner | Source of truth | Decision | Reason / conflicts / inbound links |
|---|---|---|---|---|---|---|---|---|
| `docs/PRODUCT_PHILOSOPHY.md` | `docs/product/PRODUCT_PHILOSOPHY.md` | Product philosophy | Current/unknown metadata | Active | Product Lead | true | Move | Product mission and anti-feed philosophy; update Constitution and README links. |
| `docs/SPORT_COACH_MVP.md` | `docs/product/SPORT_COACH_MVP.md` | Product specification | Active | Active | Product Lead | true | Move | Sport Coach MVP boundary authority. |
| `docs/COACH_CHAT_TRUST_LAYER.md` | `docs/product/COACH_CHAT_TRUST_LAYER.md` | Product specification | Active/Review | Review | Product Lead | false | Move | Trust-layer concept; verify current implementation claims. |
| `docs/MVP_STABILIZATION_PLAN.md` | `docs/product/MVP_STABILIZATION_PLAN.md` | Stabilization plan | Active | Active | Product Lead / QA Lead | true | Review | Could also belong in operations; ownership and destination need one decision. |
| `docs/GO_IRL_1_1_STABILIZATION.md` | `docs/product/GO_IRL_1_1_STABILIZATION.md` | Stabilization ledger | Draft | Review | Product Lead | false | Move | Keep distinct from canonical MVP stabilization plan. |
| `docs/EventLifecycle.md` | `docs/product/EventLifecycle.md` | Product lifecycle | Draft | Review | Product Lead | false | Move | Chat expiry conflicts with migration v8 remain unresolved. |
| `docs/UserLifecycle.md` | `docs/product/UserLifecycle.md` | Product lifecycle | Draft | Review | Product Lead | false | Move | Verify current implementation versus future model. |
| `docs/reputation.md` | `docs/product/reputation.md` | Future product model | Draft | Draft | Product Lead | false | Move | RLI/Trust remains future scope. |

## D. Market documents

| Current path | Proposed path | Type | Current status | Proposed status | Owner | Source of truth | Decision | Reason / conflicts / inbound links |
|---|---|---|---|---|---|---|---|---|
| `docs/MARKET_POSITIONING.md` | `docs/market/MARKET_POSITIONING.md` | Market authority | Active | Active | Product Lead | true | Move | Canonical MVP market filter; many links require repair. |
| `docs/COMPETITOR_WATCH.md` | `docs/market/COMPETITOR_WATCH.md` | Competitor authority | Active | Active | Market Analyst | true | Move | Canonical competitor signal register. |
| `docs/market/README.md` | `docs/market/README.md` | Folder index | Active | Active | Market Analyst | true/Review | Retain | Verify source-of-truth flag against `DOCS_INDEX.md`. |
| `docs/market/COMPETITOR_ANALYSIS.md` | `docs/market/COMPETITOR_ANALYSIS.md` | Market evidence | Review/unknown | Review | Market Analyst | false | Retain | Evidence document, not automatic product scope. |
| `docs/market/MARKET_RULES.md` | `docs/market/MARKET_RULES.md` | Market rules | Review/unknown | Review | Market Analyst | false | Retain | Must remain subordinate to Market Positioning. |
| `docs/market/CONTINUOUS_COMPETITOR_INTELLIGENCE.md` | `docs/market/CONTINUOUS_COMPETITOR_INTELLIGENCE.md` | Market process | Active/Review | Review | Market Analyst | false | Retain | Cadence/process document. |
| `docs/market/COMPETITOR_ANALYSIS_TEMPLATE.md` | `docs/market/COMPETITOR_ANALYSIS_TEMPLATE.md` | Template | Draft | Draft | Market Analyst | false | Retain | Non-authoritative reusable template. |

## E. Architecture and technical-boundary documents

| Current path | Proposed path | Type | Current status | Proposed status | Owner | Source of truth | Decision | Reason / conflicts / inbound links |
|---|---|---|---|---|---|---|---|---|
| `docs/GO_IRL_CONSTITUTION.md` | `docs/governance/GO_IRL_CONSTITUTION.md` | Constitution | Active | Active | Product Architect | true | Review | Dual product/architecture authority; governance destination is proposed but requires human confirmation. |
| `docs/Database.md` | `docs/architecture/Database.md` | Future architecture | Draft | Review | Supabase Steward | false | Move | Must link to schema audit and remain explicitly non-current. |
| `docs/RLS.md` | `docs/architecture/RLS.md` | Future/current boundary | Draft | Review | Security Lead | false | Move | No policy changes; reconcile with migrations. |
| `docs/Security.md` | `docs/architecture/Security.md` | Security architecture | Draft | Review | Security Lead | false | Move | Trusted Auth wording must match current code and release state. |
| `docs/Admin.md` | `docs/architecture/Admin.md` | Admin architecture | Draft | Review | Security Lead | false | Move | Future admin surfaces must not imply shipped features. |
| `docs/Moderation.md` | `docs/architecture/Moderation.md` | Moderation architecture | Draft | Review | Security Lead | false | Move | Future scope; safety boundary only. |
| `docs/Notifications.md` | `docs/architecture/Notifications.md` | Notification architecture | Draft | Review | Tech Lead | false | Move | n8n/background-work boundaries apply. |
| `docs/AI.md` | `docs/architecture/AI.md` | AI architecture | Draft | Review | Tech Lead | false | Move | AI discovery is future scope. |
| `docs/ai-event-discovery.md` | `docs/architecture/ai-event-discovery.md` | Future architecture | Draft | Draft | Tech Lead | false | Move | Non-current AI pipeline. |
| `docs/RecommendationEngine.md` | `docs/architecture/RecommendationEngine.md` | Future architecture | Draft | Review | Tech Lead | false | Move | Must not imply current AI recommendations. |
| `docs/vertical-experiences.md` | `docs/architecture/vertical-experiences.md` | Vertical architecture | Draft | Review | Tech Lead | false | Move | Current beta remains six categories; broad verticals are future. |
| `docs/performance.md` | `docs/architecture/performance.md` | Performance architecture | Draft/unknown | Review | Tech Lead | false | Move | Verify implemented versus proposed optimizations. |
| `docs/privacy.md` | `docs/architecture/privacy.md` | Privacy architecture | Draft/unknown | Review | Security Lead | false | Move | Privacy principles versus implemented controls must be separated. |

## F. Audits and documentation control

| Current path | Proposed path | Type | Current status | Proposed status | Owner | Source of truth | Decision | Reason / conflicts / inbound links |
|---|---|---|---|---|---|---|---|---|
| `docs/MVP_DOC_AUDIT.md` | `docs/audit/MVP_DOC_AUDIT.md` | Conflict registry | Active | Active | Project Archivist | true | Move | Canonical documentation conflict registry. |
| `docs/MISSING_SECTIONS.md` | `docs/audit/MISSING_SECTIONS.md` | Gap registry | Active | Active | Project Archivist | true | Move | Canonical missing-boundaries register. |
| `docs/DATABASE_SCHEMA_AUDIT.md` | `docs/audit/DATABASE_SCHEMA_AUDIT.md` | Schema/doc audit | Active | Active | Supabase Steward | true | Move | Canonical current-schema versus future-doc boundary. |
| `docs/audit/KNOWLEDGE_DEBT.md` | `docs/audit/KNOWLEDGE_DEBT.md` | Knowledge debt | Active | Active | Project Archivist | true | Retain | Canonical debt register. |
| `docs/audit/DOCUMENTATION_2_0_MOVE_MANIFEST.md` | `docs/audit/DOCUMENTATION_2_0_MOVE_MANIFEST.md` | Move manifest | Review | Review | Project Archivist | false | Retain | This document. |

## G. Governance and onboarding

| Current path | Proposed path | Type | Current status | Proposed status | Owner | Source of truth | Decision | Reason / conflicts / inbound links |
|---|---|---|---|---|---|---|---|---|
| `docs/governance/KNOWLEDGE_PLATFORM.md` | same | Knowledge governance | Active | Active | Project Archivist | true | Retain | Knowledge status and review authority. |
| `docs/governance/AI_ORGANIZATION.md` | same | AI governance | Draft | Review | Project Archivist | true/Review | Retain | Source-of-truth flag requires conflict review while status is Draft. |
| `docs/onboarding/ARCHIVIST_CHARTER.md` | same | Role charter | Active | Active | Project Archivist | true | Retain | Archivist authority. |
| `docs/onboarding/PROJECT_COORDINATOR_CHARTER.md` | same | Role charter | Active | Active | Project Coordinator | true | Retain | Coordinator authority. |
| `docs/onboarding/AI_ROLES.md` | same | Role registry | Draft | Review | Project Archivist | true/Review | Retain | Draft plus source-of-truth flag requires review. |
| `docs/onboarding/AI_FIXER_AGENT.md` | same | Agent charter | Active | Active | Tech Lead | true | Retain | Small-patch agent authority. |
| `docs/onboarding/CHATGPT_PROJECT_SETUP.md` | same | Workspace setup | Active/unknown | Review | Project Archivist | false | Retain | Verify against current Project instructions. |
| `docs/onboarding/REPORTING_RULES.md` | same | Reporting rules | Active/unknown | Review | Project Archivist | false | Retain | Verify overlap with `docs/reports/README.md`. |
| `docs/onboarding/WEB_DESIGNER_AGENT.md` | same | Agent charter | Active/unknown | Review | UX Lead | false | Retain | Verify registration in `AI_ROLES.md`. |
| `docs/onboarding/LIBRARIAN_DOCUMENTATION_2_0_MISSION.md` | same | Mission prompt | Draft | Draft | Project Archivist | false | Retain | Current task specification; not authority after mission completion. |

## H. Bible corpus

These confirmed files remain under `docs/bible/`:

| Current path | Proposed path | Decision | Status note |
|---|---|---|---|
| `docs/bible/00-completion-audit.md` | same | Retain | Active source of truth for Bible completeness. |
| `docs/bible/00-bible-roadmap.md` | same | Retain | Active maintenance roadmap. |
| `docs/bible/01-foundation/00-foundation-overview.md` | same | Retain | Active. |
| `docs/bible/01-foundation/01-product-philosophy.md` | same | Retain | Active; possible overlap with root product philosophy requires review, not merge. |
| `docs/bible/01-foundation/01-why-we-exist.md` | same | Retain | Active. |
| `docs/bible/01-foundation/02-core-principles.md` | same | Retain | Active. |
| `docs/bible/01-foundation/03-mvp-scope-and-market-positioning.md` | same | Retain | Active MVP boundary. |
| `docs/bible/02-platform-architecture.md` | same | Retain | Active with current/future separation required. |
| `docs/bible/03-database-and-supabase-boundaries.md` | same | Retain | Active schema boundary. |
| `docs/bible/04-modules-architecture.md` | same | Retain | Active with future guards. |
| `docs/bible/04-modules-mvp-audit.md` | same | Retain | Active six-category boundary. |
| `docs/bible/05-product-requirements.md` | same | Retain | Active PRD. |
| `docs/bible/05-product-requirements-mvp-split.md` | same | Retain | Active scope classifier. |
| `docs/bible/06-ux-interaction-guidelines.md` | same | Retain | Active UX boundary. |
| `docs/bible/07-beta-readiness-and-operations.md` | same | Retain | Active beta operations boundary. |
| `docs/bible/08-runtime-boundaries.md` | same | Retain | Active runtime boundary. |
| `docs/bible/09-governance-and-ai-organization.md` | same | Retain | Active governance chapter. |
| `docs/bible/10-operations-and-release.md` | same | Retain | Active release chapter. |

## I. Roadmap corpus

| Current path | Proposed path | Decision | Status note |
|---|---|---|---|
| `docs/roadmap/SPRINTS.md` | same | Retain | Supporting roadmap overview; root Roadmap remains canonical. |
| `docs/roadmap/SPRINT_0.md` | same | Retain | Archived historical sprint. |
| `docs/roadmap/SPRINT_1.md` | same | Retain | Archived historical sprint. |
| `docs/roadmap/SPRINT_2.md` | same | Retain | Draft/future direction. |
| `docs/roadmap/SPRINT_3.md` | same | Retain | Draft/future direction. |
| `docs/roadmap/SPRINT_4.md` | same | Retain | Draft/future direction. |
| `docs/roadmap/SPRINT_5.md` | same | Retain | Draft/future direction. |

## J. Reports, automation, exports, and code-adjacent documentation

| Current path / scope | Proposed path | Decision | Required follow-up |
|---|---|---|---|
| `docs/reports/README.md` | same | Retain | Reconcile overlap with onboarding reporting rules. |
| `docs/reports/*.md` | same | INVENTORY REQUIRED | Expand to one row per report using recursive `git ls-files`; reports remain durable evidence and must not be silently merged. |
| `docs/automation/GITHUB_PR_CLICKUP_DRIVE_SYNC.md` | `docs/playbooks/GITHUB_PR_CLICKUP_DRIVE_SYNC.md` | Review | Could be architecture or playbook; verify whether it describes repeatable operation or design. |
| `docs/automation/go-irl-ai-report-bus-v1.template.json` | `docs/playbooks/go-irl-ai-report-bus-v1.template.json` | Review | Supporting template; check all script/n8n references before moving. |
| `docs/exports/*` | same | Protected | Generated exports must not be moved during Documentation 2.0. Expand inventory per file. |
| `supabase/README.md` | same | Protected | Operational source beside Supabase assets; moving would harm locality and runbook use. |
| `scripts/ai-orchestrator/README.md` | same | Protected | Code-adjacent documentation; moving may break developer workflow and relative links. |
| `.github/pull_request_template.md` | same | Protected | GitHub operational template; not part of docs relocation. |

## Confirmed conflicts and uncertainties

1. `docs/GO_IRL_CONSTITUTION.md` fits both product and governance; destination requires human confirmation.
2. `docs/MVP_STABILIZATION_PLAN.md` fits product, QA, and operations; destination and ownership require one decision.
3. Several documents have `status: Draft` together with `source_of_truth: true`; lifecycle rules require review.
4. Product Philosophy exists both as a root docs file and Bible foundation chapter; preserve both and define authority instead of merging.
5. Activity Chat expiry wording conflicts with migration v8 and must remain unresolved until an explicit schema/product decision.
6. `docs/automation/` is not an approved Documentation 2.0 category; each file needs architecture-versus-playbook classification.
7. Reports and generated exports are not yet recursively enumerated.
8. `AGENTS.md` may be a root tooling contract and must not be moved without verifying agent discovery behavior.

## Inbound-link repair priorities

The highest-risk moves are expected to affect links in:

- `README.md`;
- `DOCS_INDEX.md`;
- `ROADMAP.md`;
- `BACKLOG.md`;
- `RELEASE_NOTES.md`;
- `DEPLOYMENT.md`;
- onboarding role charters;
- Bible chapters;
- reports containing historical paths;
- scripts that build NotebookLM or Google Drive exports;
- n8n workflow documentation and templates.

No link repair begins until the recursive inventory is complete and the move list is approved.

## Completion gate for Phase 1

Phase 1 remains open until all checks below pass:

- [ ] Capture `git ls-files '*.md' '*.txt' '*.json'` with documentation-only filtering.
- [ ] Add one manifest row for every documentation file.
- [ ] Confirm no repository documentation exists outside the registered paths above.
- [ ] Record every inbound Markdown link for every proposed move.
- [ ] Verify generated files and code-adjacent README files are intentionally retained.
- [ ] Human-review all `Review` placement decisions.

Until then, **Phase 2 and all relocations are blocked**.
