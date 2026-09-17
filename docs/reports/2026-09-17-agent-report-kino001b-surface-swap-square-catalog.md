---
title: Agent Report — Kino001B Surface Swap and Square Catalog
owner: AI Fixer
status: Draft
source_of_truth: false
last_review: 2026-09-17
next_review: 2026-09-24
---

# Agent Report

## Task

Move the current Catalog card contract to For You, move the current For You card contract to Catalog, make Catalog cards square, and request higher-quality poster assets.

## Changes

- Swapped the card components rendered by the For You and Catalog Cinema surfaces while retaining each surface's own movie selection.
- Added a square `1 / 1` Catalog card contract in both the canonical stylesheet and runtime fallback.
- Preserved the selected Catalog filter date when opening the moved For You card contract.
- Upgraded poster URL parameters to `width=1440` and `quality=95` when the source URL exposes those parameters.
- Kept Planned on the existing Beauty card contract.

## Not touched

- SQL, migrations, RLS, Auth, secrets, production data, production configuration, merge, and deployment.

## Required acceptance

- Verify Catalog square-card legibility and image quality in the real Telegram/WebView runtime.
