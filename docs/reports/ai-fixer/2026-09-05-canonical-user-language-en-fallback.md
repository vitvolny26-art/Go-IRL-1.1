---
title: Agent Report — Canonical User Language and English Fallback
owner: AI Fixer
status: Review
source_of_truth: false
last_review: 2026-09-05
next_review: 2026-09-12
---

# Agent Report

## Task

Complete the bounded canonical-language follow-up on detached implementation `dd284ad`: preserve the exact RU/UK/CS/EN/PL/SK user language, map PL/SK only at four-language content boundaries, and use English for unsupported or missing language input.

## Sources inspected

- Fresh GitHub `main` at `62c092058e27a7b94f2dd7c8e2bc7483a19c5964`.
- Active Drive AI Fixer, Bug Fix, GitHub code-gate, Release Engineer, and Production Gate contracts.
- Drive handoff `12oqc8cnfya8oeOAtia1XfAbypXoRJ3V0Hy4Kpzhf00U`.
- Detached implementation `dd284ad783b1d68cc56a1e8e9e284e0589435c20`.

## Files inspected

- `src/main.tsx`
- `src/i18n.ts`
- `src/userLanguage.ts`
- `src/userPreferences.ts`
- `src/components/AppHeader.tsx`
- `src/store.ts`
- `src/authSession.ts`
- `supabase/functions/verifyTelegramInitData/index.ts`
- `supabase/functions/telegramEventSupergroup/communicationVerification.ts`
- notification, reminder, post-event, and communication-verification tests and usages

## Findings

- First-launch bootstrap accepted only RU/UK/CS/EN and could not preserve PL/SK as the UI language.
- Manual header selection stored the mapped content language instead of the exact canonical user language.
- Trusted Telegram login overwrote an existing supported server language with Telegram `language_code`.
- Communication verification defaulted unsupported/missing values and early callback errors to Russian.
- Four existing tests still asserted pre-localization Russian/source behavior after the detached implementation introduced recipient-language rendering.

## Changes made

- Added six-language first-launch resolution with stored preference priority, Telegram/browser inference, and EN fallback.
- Preserved exact UI language separately from mapped four-language content state.
- Persisted explicit header choices as canonical user languages and reconciled supported server language after trusted auth when no explicit local choice exists.
- Preserved an existing supported server language during Telegram login.
- Made Telegram communication verification prefer stored supported language, then callback language, then EN; removed hard-coded RU early errors.
- Added focused runtime source-contract coverage and corrected stale localization assertions.

## Checks

- `pnpm install --frozen-lockfile`: PASS
- `pnpm run repo:check`: PASS
- `pnpm run lint`: PASS with one pre-existing non-failing `no-console` warning in `api/_shared/admin-authorization.ts`
- `pnpm run typecheck`: PASS
- `pnpm run build`: PASS
- `CI=true pnpm run test`: PASS, 315 files / 1518 tests plus Staff OS
- `pnpm run bundle:check`: PASS with the existing preferred-entry-size warning
- `git diff --check`: PASS

## Risks

- This is source and automated-test verification only; no production authentication or Telegram smoke was executed.
- Exact-head GitHub Actions remains required after a separately authorized push and before merge.

## Not touched

- No `.env`, secrets, auth-provider configuration, RLS, SQL, migrations, production data, webhook, DNS, deployment, or production configuration mutation.
- No push, PR, merge, or deployment.

## GitHub

- Base implementation: `dd284ad783b1d68cc56a1e8e9e284e0589435c20`
- Task branch target: `fix/chrem-canonical-language-fallback-en`
- Commit: created only after this report and the exact prepared tree pass all local gates; push remains separately gated.

## Next step

Create the already authorized single local commit after exact-tree checks are green, report its seven-character code, and stop before push.
