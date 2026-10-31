---
title: Kino000(SR) exact-source runtime regression
owner: Automation Engineer
status: Draft
source_of_truth: false
last_review: 2026-10-31
next_review: 2026-11-01
---

# Kino000(SR) — exact-source runtime regression

## Task

Verify the exact `KinoAfishi` draft against a real manual no-write execution and preserve bounded evidence without modifying n8n, GitHub, Supabase, production data, credentials, or environment configuration.

Merge target: GitHub `main`. Deploy target: none. Commit and PR: explicitly authorized. Merge and deploy: not authorized.

## Files inspected

- External evidence workspace: `/workspace/Kino000SR-VSCode-workspace`
- Exact workflow export for `xljdmpJVAnxbSwUn`
- Full executions `52359` and `52380`
- Two read-only nine-row catalog exports
- `README.md`, `INPUT_EXPORT_CONTRACT.md`, and all workspace scripts
- Existing Kino000(SR) report dated 2026-10-30

Raw n8n and Supabase exports remain outside the repository and are not included in this patch.

## Findings

### Historical negative gate

Execution `52359` was produced by the older active workflow path `f985fea3-ba48-4446-8403-12bbdaa73b6d`. Its exact-source replay remained correctly blocked:

- original validator: `BLOCKED_MISSING_VERIFIED_FIELDS`, 1266 issues;
- patched validator: `BLOCKED_MISSING_VERIFIED_FIELDS`, 1268 issues;
- screening provenance issues: 1210;
- movie metadata issues: 54;
- identity issues: 4.

The two guard additions identified absent alternative-identity provenance for ranks 7 and 10. Synthetic reconstruction passed but was never treated as production evidence.

### Exact draft

The current draft was read back before and after the manual run:

- workflow: `xljdmpJVAnxbSwUn`;
- draft: `9be13395-1cbf-4b02-8786-8d6d2e9fe901`;
- active version remained `f985fea3-ba48-4446-8403-12bbdaa73b6d`.

The draft Assemble node already contains the required screening provenance and exact Top25 metadata/alternative-identity hydration. Its code differs from the active Assemble node.

### Real manual execution

[Execution 52380](https://n8n.realitka.pp.ua/workflow/xljdmpJVAnxbSwUn/executions/52380) ran from `Kino000(SR) — Manual Preflight (No Publish)`.

- mode: `manual`;
- status: `success`;
- started: `2026-10-31T07:37:39.399Z`;
- stopped: `2026-10-31T07:37:58.715Z`;
- last node: `Kino000(SR) — Build Wednesday RPC Payload (No Write)`;
- movies: 9;
- screenings: 242;
- Top25 rows: 25;
- catalog rows: 9;
- payload: `COMPLETE_NO_WRITE`;
- issues: 0;
- `rpc_callable=false`;
- `rpc_arguments=null`;
- `write_authorized=false`;
- `persisted=false`.

### Independent exact-source replay

The complete raw execution and fresh read-only catalog export were replayed in an ephemeral `node:24-alpine` container with networking disabled, all capabilities dropped, no new privileges, and no credentials.

- original validator: `COMPLETE_NO_WRITE`, 0 issues;
- patched validator: `COMPLETE_NO_WRITE`, 0 issues;
- negative cases: 10/10 fail closed;
- all replay commands: exit code 0.

This is a confirmed exact-source no-write PASS. It does not authorize workflow publication, activation, RPC, catalog persistence, Telegram delivery, repository release, merge, or deployment.

## Raw evidence hashes

The raw artifacts remain in the external evidence workspace.

| Artifact | SHA256 |
| --- | --- |
| Workflow draft export | `fd47d1f0a6daf40b4d53f9e5f3f94cac56680e7964a1a293ef48c668fe486720` |
| Execution `52380` export | `204bad447d4fff1852e4d2391ed0e6b63615c3027f067253c4eaf411c4779db1` |
| Fresh nine-row catalog export | `61b07d6f5ed08b6ed2b49d34ad95542ac7cccc3b7afebe8070ba00cb1cd8cee2` |

## Changes made

- Added this repository-local consolidation report.
- Preserved raw exports, fixtures, manifests, logs, and replay scripts in the separate evidence workspace.
- Did not copy production-derived raw JSON into Git.

## Checks

- Real n8n manual execution `52380`: PASS.
- Runtime payload: PASS — `COMPLETE_NO_WRITE`, 0 issues.
- Offline original-validator replay: PASS.
- Offline patched-validator replay: PASS.
- Negative regression cases: PASS — 10/10.
- SHA256 manifest verification: PASS.
- Repository `git diff --check`: recorded after the documentation patch.
- Repository lint/build/test/typecheck: NOT RUN — docs-only patch.

## Risks

- The exact draft is not the active version. Publishing or activating it is a separate runtime change and remains gated.
- No publication or Telegram delivery path was tested or authorized.
- Exact-source PASS is limited to the no-write payload contract and does not prove catalog persistence, atomic RPC behavior, publication attempt journaling, or Telegram receipt integrity.
- The earlier server-readback report remains a historical snapshot; this report updates only the exact-source regression state.

## Not touched

- No n8n edit, restore, publication, or activation.
- Repository mutation is limited to the separately authorized documentation commit and PR.
- No merge or deployment.
- No Supabase write, DDL, RPC, migration, RLS, policy, or configuration change.
- No production catalog mutation.
- No Telegram send.
- No credential or environment configuration change.

## Next step

After the authorized documentation PR is created, wait for exact-head CI and an explicit merge instruction. Publishing/activating exact n8n draft `9be13395-1cbf-4b02-8786-8d6d2e9fe901`, merging, and deployment remain separate gates.
