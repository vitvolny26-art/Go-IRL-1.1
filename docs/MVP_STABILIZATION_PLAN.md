---
title: GO IRL MVP Stabilization Plan
owner: Tech Lead
status: Active
source_of_truth: true
last_review: 2026-07-11
next_review: 2026-07-18
---

# GO IRL MVP Stabilization Plan

Generated: 2026-07-07T14:00:40.297Z

## Goal

Stabilize the GO IRL MVP for closed beta without rewriting the existing architecture.

## Rules

- Preserve current React + TypeScript + Vite + Supabase + Telegram Mini App architecture.
- Fix one feature at a time.
- Before each commit, run: pnpm run lint, pnpm run build, pnpm run test.
- Do not touch .env, secrets, Supabase RLS, or destructive database logic without explicit approval.
- Prefer small patches over big rewrites.
- Read dependencies before changing shared components.

## Current beta priorities

1. Restore and stabilize Coach and Activity Chat with Weather enabled.
2. Add safe Browser Demo / Mock mode for UI testing outside Telegram.
3. Fix event card time rendering across all lists.
4. Fix profile save flow and avatar upload.
5. Replace bug report clipboard/alert with support Telegram link or proper feedback flow.
6. Integrate Open-Meteo weather safely.
7. Fix share links and prepare /join/:id Open Graph landing page.

## Activity Share contract — 2026-08-14

The user-facing WhatsApp Activity share contract is intentionally minimal and must remain stable:

- WhatsApp sends exactly one URL and no event title/date/time/address text.
- Public Activity short links use `https://go-irl.fun/Vol260816_a` shape: three-letter Activity code + `YYMMDD` + collision suffix.
- UUIDs and long title slugs are not user-facing WhatsApp share URLs.
- The Activity JPEG is generated before WhatsApp handoff and persisted in the existing `activity-share-cards` storage boundary.
- The exact persisted JPEG is the Open Graph image for the short link and remains the native `navigator.share({files})` file when the client supports file sharing.
- `wa.me` fallback sends the URL only; it never pretends to attach a JPEG.
- The short-link resolver remains inside the existing `api/meta/event-preview.ts` serverless function so the Vercel Hobby function count does not increase.
- Canonical VPS/Caddy must proxy only the bounded Activity-alias pattern to the existing Vercel share/meta transport before this contract is called production-complete.

This contract is a bounded Share stabilization item. It does not authorize Auth, RLS, schema, migration, DNS, or unrelated product changes.

## Weather Widget MVP boundary

Weather is a helper for real-life planning, not a core event dependency.

Current MVP boundary:

- Weather uses Open-Meteo and must not require API keys.
- Weather must not block opening an event detail screen.
- Weather failures should degrade gracefully into a short unavailable message.
- Weather is most relevant for outdoor sport/activity events.
- If an event is outside the available forecast range, show a safe message instead of fake data.
- Current product wording for events beyond forecast range:

```text
Прогноз будет за 7 дней
```

- If an event is inside the forecast range, show the nearest useful forecast for event start time.
- Summary should stay compact:
  - icon;
  - temperature;
  - condition.
- Expanded details may include:
  - temperature graph;
  - wind;
  - rain probability.

Implementation-sensitive notes:

- Verify behavior against `src/weather.ts` and `src/verticals/SportVertical.tsx` before changing public wording.
- Do not add paid weather APIs, keys, backend cron jobs, or persistence during MVP stabilization.
- Do not store precise user location for weather in production without a separate privacy review.

## Acceptance criteria for Beta 0.9.1

- Production Mini App opens in Telegram.
- Local browser/demo mode opens without Telegram initData.
- Event creation/edit/delete works in demo without Supabase writes.
- Sport event detail screen is readable and compact.
- Coach, chat, weather, share, profile, and bug report flows do not conflict.
- lint/build/test are green.
