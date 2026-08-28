---
title: Activ010 Participant Identity Mismatch Report
owner: AI Fixer / QA + UX Polish Agent
status: Draft
source_of_truth: false
last_review: 2026-08-28
next_review: 2026-09-04
---

# Agent Report

## Task

Fix the Activities participant-count/list mismatch where duplicate or repeated Activities with the same visible label could show one Activity's count while opening another Activity's participant list.

## Files inspected

- `src/cardParticipantsDropdown.ts`
- `src/cardParticipantsDropdown.test.ts`
- `src/uxRegressionPack.ts`
- `src/uxRegressionPack.test.ts`
- `src/verticals/SportVertical.tsx`
- `src/components/CardReminderAction.tsx`
- `src/store.ts`
- PR #1023 review threads

## Findings

- `store.ts` derives participant counts from joined members scoped to the concrete `activity_id`; the database-to-store count contract was not the source of the mismatch.
- Runtime participant UI resolved duplicate-looking Activities by localized visible text even though the rendered card already exposed the concrete Activity id through `CardReminderAction`.
- `cardParticipantsDropdown` and `uxRegressionPack` could both write the participant chip count while resolving different duplicate Activities, creating a MutationObserver feedback-loop risk.
- The remembered Event Sheet Activity guard did not normalize leading emoji the same way as the rendered Sport sheet, allowing a correct exact-id match to fall back to the wrong duplicate.

## Changes made

- Participant card/popover resolution now prefers the exact Activity id from card DOM before legacy visible-text fallback.
- `uxRegressionPack` uses the same exact Activity id for participant chip state.
- Participant chip text/count has one runtime owner (`uxRegressionPack`); duplicate ID-based rewriting was removed from `cardParticipantsDropdown`.
- Event Sheet exact-id matching now uses the same leading-emoji normalization as the rendered Sport heading.
- Added regression coverage for exact-id duplicate resolution in both runtime paths and for emoji-prefixed sheet titles.

## Checks

Code head `f94cff0a4c3a893a91fb0251a384fcfcb4c06a2a` passed GitHub Actions CI run `33186261896` / run #2571:

- Repository check — PASS
- Diff check — PASS
- Test — PASS
- Typecheck — PASS
- Lint — PASS
- Build — PASS
- Bundle budget — PASS

A final exact-head CI remains mandatory after this report is added and after the task branch is reconciled with the latest `main` before merge.

## Risks

- This is runtime DOM enhancement code layered over React rendering; release acceptance still requires production UI verification after deployment.
- Legacy text matching remains only as a fallback for surfaces that do not expose a concrete Activity id.

## Not touched

- SQL, schema, RLS, migrations, Supabase production data
- `.env` or secrets
- Activity membership persistence semantics
- Telegram, reminder, chat, share, or lifecycle data contracts
- Vercel production deployment

## Next step

Reconcile the task branch with the latest `main`, run exact-head CI, merge PR #1023 under the explicit owner authorization, deploy the resulting `main` SHA to the VPS, and verify the real participant count/list behavior in production before marking Activ010 Completed.
