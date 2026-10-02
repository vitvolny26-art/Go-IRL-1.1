# AFISHI017 — Olomouc Telegram photo repair

Status: Partial. Commit: not created (corrective candidate).

Production remains main@0fccc66, telegramEventSupergroup v98. The owner requested repairing existing Olomouc City Posters without photos.

Exact publisher run 36980996990 failed on message 94. Its ledger published_at is 2026-09-30 00:58:04.962 UTC, beyond Bot API's 48-hour deletion window. The ledger was restored to 94. The runtime attempts replacement cleanup twice; a single cleanup warning therefore does not prove an orphan remains. Physical absence of that attempted replacement is not independently verified.

Separate bounded publisher run 36981381229, job 110756458455, completed successfully for the seven newer events. Each result was replaced; publication_count=7. Production ledger readback confirmed:

| Event | Old message | New message |
| --- | --- | --- |
| Burger Street Festival | 95 | 106 |
| Festival Rostlin | 96 | 107 |
| Pavel Šporcl | 99 | 108 |
| Podzimní festival duchovní hudby | 100 | 109 |
| Klára Vytisková | 101 | 110 |
| Čarodějky z Lipníku | 102 | 111 |
| Kali & Peter Pann | 103 | 112 |

All rows remain in chat -1004451765209 with last_error=null and deleted_at=null. Photo identity and old-message deletion are required by the verified successful same-chat replacement branch. Poděbrady message 104 was excluded from both repairs.

Candidate: edit aged same-chat publications in place via multipart editMessageMedia, require matching message ID and Telegram photo identity, preserve existing thread and ledger identity, reject aged cross-chat moves before sending, and attempt replacement rollback cleanup only once. The owner must separately approve its corrective commit/release before production rollout.

Reference: https://core.telegram.org/bots/api#deletemessage and https://core.telegram.org/bots/api#editmessagemedia.

Candidate validation: five focused behavioral tests PASS; repo check, typecheck, lint (two pre-existing warnings), build, bundle and diff checks PASS. The default full run and two-worker run hit four unrelated image-render 5-second timeouts. Isolated image tests passed 24/24 with a 30-second invocation timeout. Full suite then passed with `vitest run --maxWorkers=2 --testTimeout=30000`: 1888 passed, 3 skipped. No test timeout configuration was changed in the repository.
