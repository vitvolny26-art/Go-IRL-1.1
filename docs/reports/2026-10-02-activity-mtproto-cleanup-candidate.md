# Exact Activity MTProto deletion candidate

Commit: not created. Production deletion: not executed.

Owner requested removal of Olomouc volleyball dated 2026-09-26. Production readback identifies activity e8203b66-4afe-4826-b552-8b50d63293d8, message 92, chat -1004451765209, Sport thread 5, ended at 2026-09-26T17:00:00Z. The second volleyball activity on that date has no tracked city publication and is excluded.

The existing GitHub Actions workflow is City Posters MTProto Delete, not n8n. Candidate adds an activity input and owner-only exact command `/activity-mtproto-delete <current-main-SHA> <activity-UUID> <message-ID>` to the existing control PR 1296. Default and old command retain City Posters behavior.

The new runner checks identity, city mapping and ended status before Telegram operations, verifies MTProto chat identity, deletes only the tracked message, reads it back, then reconciles metadata under an updated_at/message-ID compare-and-set guard. Other metadata and the recorded thread are preserved. No persistent session or secret logging. Errors are sanitized. No Edge/VPS deploy, schema change or scheduler activation is required.

Verification: five behavioral tests PASS; repository/typecheck/lint/build/bundle/diff checks PASS. Full suite: 1893 passed, 3 skipped using invocation-only maxWorkers=2 and testTimeout=30000. Workflow YAML and both command parser modes verified. Deno runner check could not complete locally because JSR manifest fetch failed. npm provides Deno 2.9.6 locally; existing workflow Deno v2.9.7 remains unchanged. Workflow has a mandatory Deno check before Activity mutation; real MTProto capability and message absence remain unverified until protected execution.

Next gate: explicit commit approval, followed by separately authorized push/PR/exact-head CI/merge. Owner's exact-post deletion authorization is already present. Production success must include physical absence plus reconciled metadata readback.
