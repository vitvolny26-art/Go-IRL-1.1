---
title: Knowledge Debt
owner: Project Archivist
status: Active
source_of_truth: true
last_review: 2026-08-13
next_review: 2026-08-20
---

# Knowledge Debt

## Purpose

This document tracks missing, stale, conflicting, duplicated, or misleading project knowledge in GO IRL 1.0.

It exists to prevent AI agents, contributors, and future maintainers from treating outdated or missing documentation as current project truth.

## Rules

- Every debt item must have an owner, severity, status, and due date.
- Critical items must be reviewed weekly until closed.
- Closed items move to the history section.
- This file tracks documentation and knowledge debt only.
- Code, `.env`, secrets, Supabase RLS, auth, and destructive SQL are out of scope unless explicitly approved elsewhere.
- Assistant reports from NotebookLM, Gemini, or other AI tools are inputs for review, not source-of-truth documents.
- AI audit claims must be verified against GitHub source-of-truth files before changing source-of-truth docs, roadmap status, implementation scope, or code.

## AI audit verification discipline

Before accepting NotebookLM, Gemini, ChatGPT, or other AI-generated audit findings:

1. Check the claimed file/path directly in GitHub.
2. Confirm whether the finding is still current on `main`.
3. Prefer canonical docs in `DOCS_INDEX.md` over exported mirrors, chat history, or generated reports.
4. Mark unverified claims as `Review`, not `Closed` or source-of-truth.
5. Do not patch code from audit claims unless the affected source file confirms the issue.

## Severity model

| Severity | Meaning |
|---|---|
| Critical | Misleads implementation, onboarding, release, security, or source-of-truth hierarchy. |
| High | Blocks clean documentation automation or creates repeated confusion. |
| Medium | Important cleanup, but not blocking beta-readiness decisions. |
| Low | Naming, formatting, archival, or later structural improvement. |

## Status model

| Status | Meaning |
|---|---|
| Open | Known debt, not fixed. |
| In Progress | Fix is being worked on. |
| Review | Fix exists and needs validation. |
| Closed | Resolved and moved to history. |
| Deferred | Accepted debt with explicit reason. |

## Open items

| ID | Debt item | Type | Severity | Owner | Status | Due date | Notes |
|---|---|---|---|---|---|---|---|
| KD-006 | `docs/GO_IRL_PRODUCT.md` is not registered in the source-of-truth hierarchy | Orphaned document | High | Product Lead | Open | 2026-07-31 | Validated against `main@ff72241` on 2026-08-13: the file exists, but code search finds no `DOCS_INDEX.md` registration; references are limited to debt/audit/history context. Keep Open pending register-or-archive decision. |
| KD-007 | Security/release wording drifts across release and security docs | Consistency conflict | High | Security Lead | Open | 2026-07-16 | Confirmed on `main@ff72241`: `docs/Security.md` still frames public release as blocked on Trusted Telegram deployment/migration/smoke, while `RELEASE_NOTES.md` labels Trusted Telegram auth `[SHIPPED/PRODUCTION PATH]`. Keep Open until release/security/Supabase wording is reconciled. |
| KD-009 | ADR registry does not exist | Missing governance package | High | Executive Council | Open | 2026-08-15 | Validated against `main@ff72241` on 2026-08-13: `docs/adr/` is absent and `ADR-001` appears only in planning/debt references, not as an ADR file. Keep Open; due date remains 2026-08-15. |
| KD-011 | Root legacy docs are referenced in `DOCS_INDEX.md` although some are absent | Registry conflict | Medium | Project Archivist | Open | 2026-07-31 | Confirmed on `main@ff72241`: `DOCS_INDEX.md` still registers `SPRINT0_STATUS.md`, while direct repository fetch returns 404. Keep Open until the registry is corrected or the historical snapshot is intentionally restored. |
| KD-012 | `docs/governance/KNOWLEDGE_PLATFORM_2_0.md` and `docs/audit/KNOWLEDGE_PLATFORM_EPIC.md` overlap | Duplication | Medium | Project Archivist | Open | 2026-08-09 | Confirmed on `main@ff72241`: both files remain parallel planning documents with substantially overlapping migration, Bible/ADR, market, governance, and review phases. Keep Open until one canonical successor or distinct scopes are recorded. |
| KD-014 | Chat lifecycle wording may conflict with SQL/migration behavior | Docs/schema mismatch | High | Supabase Steward | Open | 2026-07-18 | Confirmed on `main@ff72241`: `supabase/migration_v8_activity_chat.sql` computes expiry as `now() + interval '24 hours'` when chat is created; `docs/EventLifecycle.md` explicitly treats event-end timing as unverified product intent. Keep Open; no SQL/RLS/auth change is authorized by this debt item. |
| KD-015 | Legacy/demo identity fallback can confuse Trusted Auth documentation | Security documentation drift | Medium | Security Lead | Open | 2026-07-24 | Confirmed on `main@ff72241`: `src/auth/providerTrustedSession.ts` defines trusted `telegram`, `google`, and `facebook` providers, while parts of security/onboarding/runtime wording still describe production identity as Telegram-only. Keep Open; reconcile documentation without auth/RLS/secret changes. |

## Immediate correction order

1. Add YAML frontmatter to P0/P1 source-of-truth documents.
2. Review chat lifecycle documentation versus current Supabase migration behavior without changing SQL yet.
3. Align security/release/Supabase wording.
4. Create ADR registry.
5. Add docs audit automation.

## Closed history

| ID | Closed on | Resolution |
|---|---|---|
| KD-001 | 2026-07-09 | `DOCS_INDEX.md` status registry normalized from `Current` to `Active` under Knowledge Status Model. |
| KD-002 | 2026-07-09 | `README.md` root sprint references replaced with `docs/roadmap/SPRINTS.md` and `docs/roadmap/SPRINT_0.md`; Knowledge Debt link added. |
| KD-003 | 2026-07-11 | Bible target chapters were completed and the audit/roadmap were rewritten to actual state. `docs/bible/09-governance-and-ai-organization.md` and `docs/bible/10-operations-and-release.md` now exist and are registered in `DOCS_INDEX.md`. |
| KD-004 | 2026-07-09 | Created `docs/market/README.md`, `docs/market/CONTINUOUS_COMPETITOR_INTELLIGENCE.md`, and `docs/market/COMPETITOR_ANALYSIS_TEMPLATE.md`. |
| KD-005 | 2026-08-13 | Added canonical YAML metadata to `docs/GO_IRL_PRODUCT.md`, `docs/Security.md`, and `supabase/README.md`, preserving their current authority/status classifications. |
| KD-008 | 2026-08-13 | Added Knowledge Status YAML to `supabase/README.md` with `owner: Supabase Steward`, `status: Active`, and `source_of_truth: true`; no schema, RLS, auth, runtime, or production-data change. |
| KD-010 | 2026-08-13 | Validated against `main@ff72241`: current onboarding references resolve to existing market and Bible sources, including `docs/market/README.md`, `docs/bible/09-governance-and-ai-organization.md`, and `docs/bible/10-operations-and-release.md`. The original missing-reference condition no longer applies. |
| KD-013 | 2026-07-11 | Category scope conflict moved from docs-only ambiguity to implemented closed-beta taxonomy guard: `CHANGELOG.md` labels extras as taxonomy/test candidates; `ROADMAP.md` and `BACKLOG.md` keep six-category guardrail; create-event UI now uses closed beta categories/options while broader taxonomy remains hidden/experimental data. |
| KD-016 | 2026-07-11 | Added AI audit verification discipline: audit claims must be checked against GitHub source-of-truth files before source-of-truth docs, scope, or code changes. |
