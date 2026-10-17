---
title: Agent Report — ShareM000A Messenger JPEG handoff
owner: AI Fixer / QA + UX Polish Agent
status: Draft
source_of_truth: false
last_review: 2026-10-17
next_review: 2026-10-24
---

# Agent Report

## Task

Continue ShareM000A after release `b117bc9`. Resolve the missing prepared JPEG path from the Android Telegram Mini App to Messenger without reporting a share as delivered unless the recipient delivery is verified.

## Files inspected

- `src/cardShare.ts`
- `src/cardShare.test.ts`
- `src/components/CardShareAction.tsx`
- `src/components/CardShareAction.messenger.ux.test.ts`
- `public/messenger-share.html`
- `src/messengerShareStatic.test.ts`
- `vite.config.ts`
- ShareM000A roadmap and Messenger technical scheme in Drive

## Findings

- Base: `main@b117bc9246603452998197be065c95d168e94c45` (`Commit: b117bc9`).
- Live `https://go-irl.fun/messenger-share.html` now responds `HTTP/2 200`, `Content-Type: text/html; charset=utf-8`, served by Caddy. It contains the old bridge: Android share unconditionally uses `intent://` with a link, with no JPEG file handling. This resolves the prior uncertainty about route status and confirms the missing JPEG behavior remains in the deployed bridge.
- Telegram `WebApp.openLink()` moves to an external HTTPS page; the in-memory prepared `File` in the Mini App does not cross that boundary.
- The existing event image API can produce the validated JPEG at `/api/meta/event-preview?...&format=download`. A browser bridge can fetch that same-origin endpoint, validate the response, then invoke Web Share from a fresh user gesture.
- Messenger may ignore one part of an Android share payload, and a successful Web Share call does not prove recipient delivery. Physical Android Telegram → Messenger QA remains required.

## Changes made

- `src/cardShare.ts`: include the exact event JPEG download URL in the bridge URL when one exists.
- `public/messenger-share.html`: fetch only the same-origin event-preview download route; require JPEG MIME and a non-empty payload no larger than 8 MiB; provide a file-and-link share-sheet action and explicit download, copy, and Messenger fallbacks.
- `src/cardShare.test.ts`: assert the bridge receives the matching event JPEG URL.
- `src/messengerShareStatic.test.ts`: guard the bridge's URL, MIME, size/file, share-sheet, and manual fallback contract.

No commit, push, PR, merge, Drive update, Vercel deployment, VPS deployment, or production configuration change was performed.

## Checks

- `pnpm install --frozen-lockfile`: PASS.
- Focused Messenger tests: PASS, 20 tests.
- `pnpm run repo:check`: PASS.
- `pnpm run lint`: PASS, three pre-existing `no-console` warnings and zero errors.
- `pnpm run typecheck`: PASS.
- `pnpm run build`: PASS; output contains `dist/messenger-share.html`.
- `pnpm run test`: PASS on final working tree; 2,250 passed, 3 skipped. The first run had one unrelated 5-second image-render timeout; that test passed alone and the repeated full suite passed.
- Local preview HTTP: `GET /messenger-share.html` returned `200` and `text/html; charset=utf-8` with the new share-sheet code.
- Live production HTTP: `GET https://go-irl.fun/messenger-share.html` returned `200` and `text/html; charset=utf-8`; body still matches the old link-only bridge.
- `git diff --check`: PASS.

## Risks

- Actual Messenger handling of a Web Share payload containing both JPEG and link is not proven by unit tests or HTTP checks.
- Manual fallback requires the user to attach the downloaded JPEG and paste the invitation link in Messenger.
- The local patch is not deployed; production still serves the old link-only bridge.

## Not touched

- Supabase, SQL, RLS, auth, secrets, Telegram app configuration, DNS, VPS, Vercel settings, production data.

## Next step

Owner review and explicit approval for the next code release action. After a reviewed PR and exact-SHA CI, test the new bridge on a physical Android device through Telegram → Messenger, including recipient receipt of both JPEG and link. Keep ShareM000A Partial until that evidence exists.
