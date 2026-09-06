---
title: ChRem002A Remove City Topic Management
owner: AI Fixer
status: Draft
source_of_truth: false
last_review: 2026-09-06
next_review: 2026-09-13
---

# Agent Report

## Task

Recreate the bounded ChRem002A city-card patch on fresh `main@d42c28e`: publish and update the shared city Activity card without reopening or closing the Telegram General forum topic, while preserving physical pin suppression.

## Files inspected

- `api/_shared/telegram-city-publication.ts`
- `api/_shared/telegram-city-publication-base.ts`
- `api/_shared/telegram-city-publication-source.test.ts`
- `api/_shared/telegram-city-publication-core.test.ts`
- `api/telegram/city-event-publication.ts`
- `src/telegramShareJoinContract.test.ts`
- `src/telegramShareSixLanguageContract.test.ts`
- `supabase/functions/telegramEventSupergroup/index.ts`
- all repository usages of `telegram-city-publication`, `publishCanonicalCityActivity`, `reopenGeneralForumTopic`, and `closeGeneralForumTopic`

## Findings

- The wrapper reopened and closed the Telegram General forum topic around `sendPhoto` and retried `editMessageCaption` by changing topic state.
- The city-card contract requires an independent shared card message without physical pinning or General-topic state management.
- The canonical `create_city_topic` flow remains separate in `api/telegram/city-event-publication.ts` and is unchanged.

## Changes made

- Removed General-topic reopen/close calls and topic-state error helpers from the city publication wrapper.
- Kept the existing `pinChatMessage` and `unpinChatMessage` suppression boundary.
- Kept tracked-card updates on `editMessageCaption` without replacing media.
- Added direct regression coverage proving new publication reaches `sendPhoto` without topic management.
- Updated source-contract assertions to reject General-topic management in the wrapper.

## Checks

```text
pnpm install --frozen-lockfile                                      PASS
targeted Vitest: 5 files / 20 tests                                PASS
pnpm run repo:check                                                 PASS
pnpm run lint                                                       PASS (one pre-existing warning)
pnpm run typecheck                                                  PASS
pnpm run build                                                      PASS
pnpm run test                                                       PASS (319 files / 1547 tests + Staff OS)
pnpm run bundle:check                                               PASS
git diff --check                                                    PASS
PC smoke                                                            NOT APPLICABLE — server-side Telegram wrapper
Android smoke                                                       NOT APPLICABLE
```

The first full test attempt hit a transient 5-second JPEG rendering timeout; the isolated file then passed 14/14. A second attempt passed all Vitest tests but exposed a pnpm-version mismatch in the non-TTY shell. The final mandatory sequence used a pnpm `9.15.4` shim matching `packageManager` and passed completely.

## Risks

- Telegram runtime behavior is not proven by local tests; production smoke remains a later, separately approved release/runtime step.
- If Telegram rejects caption edits in a closed topic, the error now surfaces instead of mutating topic state, which is intentional for this bounded contract.

## Not touched

- Supabase SQL, migrations, schema, RLS, Auth, secrets, credentials, production data, and production configuration.
- The separate `create_city_topic` copy/pin flow.
- Push, PR state, merge, deployment, and Telegram production runtime.

## Next step

Read back the single local commit and, only after separate owner authorization, push or reconcile it with the existing remote PR #1133.