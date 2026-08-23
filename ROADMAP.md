---
title: Roadmap Index
owner: Product Lead
status: Active
source_of_truth: true
last_review: 2026-08-23
next_review: 2026-09-06
---

# GO IRL Product Roadmap

This file is the canonical roadmap index and current-state summary. Detailed roadmap scope is delegated to the five canonical parts below. Historical sprint records remain supporting evidence and never override this index or the current lifecycle authority in `docs/release/CURRENT_PHASE.md`.

GO IRL is currently a Telegram-first local meetup layer that helps people leave the chat and meet in real life. The product is being built as a platform, not as a one-off Mini App, so new work must remain compatible with future web, Android, and iOS clients.

The approved long-term direction contains two separately governed domains:

1. `Activities` — the current proven product core and release priority.
2. `Services` — a separately governed domain, with Beauty as the first and only approved vertical; a bounded Beauty production pilot is implemented, while Gate F governance and operational reconciliation remains active.

The existing bounded Beauty production pilot does not authorize a broad Services launch, public Services positioning, additional Services verticals, pricing, billing, subscriptions, payments, or displacement of unresolved Activities release blockers. Further Services expansion remains separately gated.

## Current state

Closed Beta was completed on 2026-07-20. The active phase is **Release Preparation and Stabilization**. Broad public launch is not yet claimed.

Current proven baseline:

- Browser Mock Mode works for non-Telegram usage.
- Browser demo writes are local-only and must not touch production Supabase.
- Sport details include Coach and Event Chat.
- Event cards, time rendering, support flow, weather, and Telegram `startapp` sharing have working implementations.
- The core product loop is present: create event, share, join, chat, and meet in real life.
- The production shell exposes separate `/activities` and `/services` client domains from one root launch page.
- Services has a bounded server-backed Beauty production pilot with production professional/profile data boundaries and booking lifecycle foundations. Gate F is not fully green: governance, privacy/retention/moderation consolidation, support/operational ownership, provider-supply/success criteria, and protected-change approval mapping still require reconciliation.
- VPS serves the current production build; Vercel must be kept at verified release-artifact parity before it is treated as a production fallback.

Release remains gated by reviewed quality checks, real Telegram smoke verification, approved Supabase/RLS verification, deployment parity, support, monitoring, analytics, moderation, and incident readiness.

## Canonical roadmap parts

| Part | Scope | State | Load when |
|---|---|---|---|
| [Part 01 — Foundation and MVP](docs/roadmap/ROADMAP_PART_01_FOUNDATION_MVP.md) | Product thesis, guardrails, Foundation, MVP Core | Complete / Historical | Mission concerns product boundaries, MVP, or historical foundation |
| [Part 02 — Release Preparation](docs/roadmap/ROADMAP_PART_02_RELEASE_PREPARATION.md) | Current release and stabilization workstreams | Active | Mission concerns current state, release, infrastructure, UX stabilization, or operations |
| [Part 03 — Telegram and Notifications](docs/roadmap/ROADMAP_PART_03_TELEGRAM_NOTIFICATIONS.md) | Telegram-native coordination and notifications | Draft / Gated | Mission concerns Telegram runtime, reminders, or notifications |
| [Part 04 — Trust and Modules](docs/roadmap/ROADMAP_PART_04_TRUST_MODULES.md) | Trust, attendance, modules, discovery, Sport Coach | Draft / Gated | Mission concerns trust, attendance, Coach, modules, discovery, or expansion evidence |
| [Part 05 — Growth and Decision Gates](docs/roadmap/ROADMAP_PART_05_GROWTH_DECISION_GATES.md) | Production growth, future Services and monetization tracks, decision gates, dependencies, sprint references | Draft / Gated | Mission concerns growth, Services, Beauty, monetization, gates, sequencing, dependencies, or historical sprint traceability |

## Roadmap at a glance

| Phase or track | State | Primary gate |
|---|---|---|
| Phase 0 — Foundation | Complete / Historical | Historical record only |
| Phase 1 — MVP Core | Complete / Historical | Preserve and verify the core loop |
| Release Preparation and Stabilization | Active | Current `main` and runtime evidence |
| Phase 2 — Telegram and Notifications | Draft / Gated | Release gate green |
| Phase 3 — Trust and Real Attendance | Draft / Gated | Stable loop and explicit trust approval |
| Phase 4 — Modules and Discovery | Draft / Gated | Olomouc and Sport evidence |
| Phase 5 — Production Growth | Draft / Gated | Public-safety and operational readiness |
| Future Track A — Services and Beauty | Bounded Production Pilot Implemented / Gate F Reconciliation Active | Reconcile pilot governance evidence; no expansion until unresolved Gate F items are green |
| Future Track B — Offline Enabler Monetization | Draft / Gated | Repeat usage, measurable value, willingness to pay, and commercial approvals |

## Retrieval contract

- Always read this index first.
- Select only the part or parts required by the mission.
- Do not load all five parts by default.
- Record the exact GitHub commit SHA and every loaded part path.
- Fail closed if a required part is missing, stale, or exceeds 20,000 characters.
- `Completed` is forbidden when required roadmap context is incomplete.

Major product and architecture decisions must also follow:

- [Canonical Product Philosophy](docs/bible/01-foundation/01-product-philosophy.md)
- [GO IRL Constitution](docs/GO_IRL_CONSTITUTION.md)
- [Market Positioning](docs/MARKET_POSITIONING.md)
- [Competitor Watch](docs/COMPETITOR_WATCH.md)
- [Sport Coach MVP](docs/SPORT_COACH_MVP.md)
