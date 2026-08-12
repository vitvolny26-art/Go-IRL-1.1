# AI Developer Orchestrator Runtime

This directory contains the local, dependency-free execution engine for the proposed AI Developer Orchestration Roadmap.

It implements:

- Phase 1: durable Mission Intake, idempotency, duplicate/conflict detection, one active Mission, expiry, sensitive-scope rejection, Mission Approval, and budget accounting;
- Phase 2: explicit Context Pack allowlists, filesystem-computed SHA-256 and byte totals, grep evidence, size/file limits, and secret redaction;
- Phase 3: exact-scope plan, Codex handoff, isolated-worktree snapshot, and reported-vs-actual diff enforcement;
- Phase 4: separate Codex implementer/reviewer executions, read-only review, one correction pass, first-red QA capture, and no self-approval;
- Phase 5: Change Approval, durable Agent Report, final QA, selected-file commit, `agent/*` push, and Draft PR creation.

The runtime never merges or deploys. Real Codex and GitHub mutations require explicit execution flags.

## Chief Archivist evidence boundary

`runtime/chief-archivist-evidence.cjs` is the repository-side deterministic boundary for Chief Archivist evidence. It:

- loads the three versioned prompt contracts from `scripts/ai-orchestrator/prompts/` and fails closed when any is missing or empty;
- orders selected sources by authority rank and evidence ID;
- enforces explicit source-count and character limits;
- exposes only the evidence IDs selected for the current execution;
- rejects report ledgers that use unselected evidence, global scope, fewer than three substantive rows for `COMPLETED`, or strong claims without a matching ledger claim.

The module does not call an LLM, read Google Drive or ClickUp itself, or replace the orchestration state machine. External orchestration supplies current evidence content; this boundary selects and validates it before and after model execution.

## EGF-102 approved Mission Intake

The no-LLM Mission Intake boundary connects an upstream human-approved Mission to the runtime and JSON bridge:

```powershell
Get-Content -Raw approved-mission.json | node scripts/ai-orchestrator/orchestrator.cjs mission intake --actor "human-owner"
```

The input is the Mission JSON object itself. When `mission_id` is omitted, the runtime creates a deterministic `MISSION-<20 hex>` identifier from the canonical Mission payload, making transport retries idempotent. A supplied valid Mission ID is retained for compatibility.

`--actor` is mandatory. It records the human who approved the Mission upstream; the CLI does not infer or bypass approval. Intake performs, in order:

1. Mission Schema validation;
2. runtime Policy validation, including root-wide write-scope and source-of-truth write rejection;
3. semantic duplicate, changed-payload conflict, expiry, and one-active-Mission checks;
4. atomic runtime persistence in the existing OS user-state directory;
5. one durable, idempotent `MissionAccepted` outbox event.

The successful stdout response is exactly one JSON line:

```json
{
  "success": true,
  "mission_id": "MISSION-0123456789ABCDEF0123",
  "status": "accepted",
  "next_action": "context_build"
}
```

Internally, the Mission is stored as `approved`, so the existing bridge can immediately report it and Context Builder can run. The event outbox is internal runtime state; state files and event storage paths are never returned to callers. Intake contains no Codex/LLM invocation, GitHub operation, or n8n mutation.

## JSON bridge v0.3

Any external orchestrator, including n8n, can drive the runtime through one JSON-only entrypoint:

```powershell
Get-Content -Raw request.json | node scripts/ai-orchestrator/orchestrator.cjs bridge mission create
```

The command name is carried by the CLI arguments and its request is one JSON object on standard input. The process writes exactly one JSON object to standard output and uses exit code `0` for success or `1` for a rejected request/runtime operation. It does not write progress text to standard output.

New transport clients should include `_meta` on every call:

```json
{
  "_meta": {
    "correlation_id": "corr-ao210-001",
    "execution_id": "n8n-11737",
    "mode": "test",
    "attempt": 1,
    "max_attempts": 3
  }
}
```

`mode` is exactly `test` or `production`. Attempts are bounded to three. Calls without `_meta` remain accepted for backward compatibility, but return `transport: null` and a single-attempt reliability envelope.

Supported commands:

| Command | Required request fields | Resulting purpose |
| --- | --- | --- |
| `health` | none; request body is `{}` | Verify bridge/runtime reachability without reading or mutating Mission state. |
| `mission create` | `mission` | Validate and durably intake a Mission. |
| `mission status` | `mission_id` | Return only the public Mission state. |
| `mission resume` | `mission_id` | Read the durable Mission state after a transport or n8n restart without replaying a mutating command. |
| `mission approve` | `mission_id`, `actor`; optional `approval_type: "change"` | Record Mission Approval or Change Approval. |
| `mission reject` | `mission_id`, `actor`; optional `reason` | Idempotently reject an active Mission, record the owner audit trail, and release its runtime slot. |
| `context build` | `mission_id`; optional `include_patterns`, `grep_queries`, `max_bytes` | Build the bounded Context Pack. |
| `planner run` | `mission_id` | Create the exact-scope plan and Codex handoff. |
| `implementer run` | `mission_id`, `execution_id`, and inline `result`; or `mode: "codex"`, `execute_agent: true`, `cost_usd` | Submit an external implementer result or explicitly run Codex. |
| `review run` | `mission_id`, `execution_id`, and inline `result`; or `mode: "codex"`, `execute_agent: true`, `cost_usd` | Submit an independent review or explicitly run Codex. |
| `qa run` | `mission_id`; optional `final: true`; after a failed gate, `retry_actor` | Run the first-red quality gate or its single audited retry. |
| `report create` | `mission_id`, `report_path` | Create the required Agent Report after Change Approval. |
| `publish preview` | `mission_id`, `selected_files`, `commit_message`, `pr_title`; optional `pr_body` | Validate and return a guarded publication preview without executing Git or GitHub writes. |
| `archive` | `mission_id`, `actor` | Release a Mission after a recorded publication preview or Draft PR. |

Every successful response has exactly this public envelope:

```json
{
  "success": true,
  "mission_id": "MISSION-EXAMPLE",
  "status": "approved",
  "next_action": "context build",
  "artifacts": [],
  "qa": { "reviewed_diff": null, "final": null },
  "transport": {
    "correlation_id": "corr-ao210-001",
    "execution_id": "n8n-11737",
    "mode": "test"
  },
  "reliability": {
    "timeout_ms": 30000,
    "attempt": 1,
    "max_attempts": 3,
    "retryable": false,
    "retry_after_ms": null,
    "dead_lettered": false
  }
}
```

Rejected calls use the same public fields plus a sanitized `error` object. `reliability` classifies the result without exposing paths or credentials. Only `BRIDGE_SSH_UNAVAILABLE`, `BRIDGE_TIMEOUT`, `RUNTIME_BUSY`, and `BRIDGE_PARTIAL_RESPONSE` are retryable, and only while `attempt < max_attempts`. Backoff is 500 ms, then 1000 ms, capped at 2000 ms. Terminal or exhausted failures set `dead_lettered: true`. Malformed JSON, duplicate Mission, invalid request, policy, approval, and scope failures are terminal.

`artifacts` contains logical artifact names only. Responses never contain state-file paths, artifact paths, SHA-256 metadata, command plans, absolute local paths, credentials, or private runtime data. The machine-readable response contract is `schemas/bridge-response.schema.json`; deterministic transport cases are in `fixtures/bridge-chaos-cases.json`.

The bridge intentionally supports publication preview only. It cannot commit, push, create a PR, merge, deploy, publish/activate n8n, or bypass Mission Approval, Change Approval, scope, budget, review, or QA gates.

The `health` command does not load or create runtime state, execute agents, inspect Missions, or call external services. Its response reports the bridge contract version, runtime reachability, and `mutation_performed: false`. `mission resume` reads the existing durable record and must be used after an n8n restart instead of replaying the last mutating stage.

A successful `publish preview` is recorded in runtime state without executing any command from the returned plan. The Mission may then be archived through the bridge to release the active slot. A `report_ready` Mission without that recorded preview cannot be archived.

## Working directory

```powershell
Set-Location "<path-to-GO-IRL-1.0>"
```

Runtime state is stored outside the repository by default:

- Windows: `%LOCALAPPDATA%\GO-IRL\ai-orchestrator`;
- Linux/macOS with `XDG_STATE_HOME`: `$XDG_STATE_HOME/go-irl/ai-orchestrator`;
- fallback: `~/.local/state/go-irl/ai-orchestrator`.

Use `--state-dir <path>` only when an isolated custom state location is required.

## End-to-end run

```powershell
node scripts/ai-orchestrator/orchestrator.cjs intake scripts/ai-orchestrator/fixtures/runtime/mission-docs-pilot.json
node scripts/ai-orchestrator/orchestrator.cjs approve-mission MISSION-RUNTIME-DOCS-PILOT --actor "human-owner"
node scripts/ai-orchestrator/orchestrator.cjs prepare MISSION-RUNTIME-DOCS-PILOT --include "scripts/ai-orchestrator/README.md" --grep "Phase 5,Draft PR"
```

The prepare command writes a bounded Context Pack, plan, and Codex handoff under:

```text
<state-dir>/artifacts/MISSION-RUNTIME-DOCS-PILOT/
```

If the orchestration infrastructure itself is repaired after `prepare` but before the first agent result, a human may refresh the worktree baseline once the repair is inspected:

```powershell
node scripts/ai-orchestrator/orchestrator.cjs refresh-baseline MISSION-RUNTIME-DOCS-PILOT --actor "human-owner"
```

Baseline refresh is rejected after any agent result exists.

Run a real implementer only after Mission Approval:

```powershell
node scripts/ai-orchestrator/orchestrator.cjs run-implementer MISSION-RUNTIME-DOCS-PILOT --execution impl-001 --cost-usd 0.40 --execute-agent
```

Run a separate read-only reviewer execution:

```powershell
node scripts/ai-orchestrator/orchestrator.cjs run-reviewer MISSION-RUNTIME-DOCS-PILOT --execution review-001 --cost-usd 0.20 --execute-agent
```

If review returns `CHANGES_REQUIRED`, run the implementer once more with a new execution ID. A second correction request blocks the Mission.

Continue only after reviewer `PASS`:

```powershell
node scripts/ai-orchestrator/orchestrator.cjs qa MISSION-RUNTIME-DOCS-PILOT
node scripts/ai-orchestrator/orchestrator.cjs approve-change MISSION-RUNTIME-DOCS-PILOT --actor "human-owner"
node scripts/ai-orchestrator/orchestrator.cjs report MISSION-RUNTIME-DOCS-PILOT --report "docs/reports/2026-07-12-agent-report-runtime-docs-pilot.md"
node scripts/ai-orchestrator/orchestrator.cjs final-qa MISSION-RUNTIME-DOCS-PILOT
```

If QA records a first-red block and the defect is corrected, one human-audited retry is available:

```powershell
node scripts/ai-orchestrator/orchestrator.cjs retry-qa MISSION-RUNTIME-DOCS-PILOT --actor "human-owner"
node scripts/ai-orchestrator/orchestrator.cjs qa MISSION-RUNTIME-DOCS-PILOT
```

Preview the guarded publish plan without changing GitHub:

```powershell
node scripts/ai-orchestrator/orchestrator.cjs publish MISSION-RUNTIME-DOCS-PILOT --selected "docs/reports/2026-07-12-agent-report-runtime-docs-pilot.md" --commit-message "docs: complete orchestrator pilot" --pr-title "AI orchestrator docs pilot"
```

Add `--execute` only after explicit Change Approval. The publisher stages exactly the implementer-reported files plus the Agent Report, pushes only the current `agent/*` branch, and creates a Draft PR.

After a human merge decision, release the active Mission slot:

```powershell
node scripts/ai-orchestrator/orchestrator.cjs archive MISSION-RUNTIME-DOCS-PILOT --actor "human-owner"
```

## Manual adapter path

External agents may return a schema-valid Agent Result instead of using the built-in Codex adapter:

```powershell
node scripts/ai-orchestrator/orchestrator.cjs submit-implementer MISSION-RUNTIME-DOCS-PILOT result.json --execution impl-external --cost-usd 0.40
node scripts/ai-orchestrator/orchestrator.cjs submit-review MISSION-RUNTIME-DOCS-PILOT review.json --execution review-external --cost-usd 0.20
```

The runtime compares implementer `changed_files` with its filesystem snapshot. Undeclared, out-of-scope, or sensitive writes block the Mission even if Agent Result claims success.

## Operational limits

- `--cost-usd` is a required reservation estimate for real Codex executions; automatic provider billing reconciliation is not available.
- The runtime requires an isolated branch/worktree because filesystem changes after `prepare` are attributed to the active Mission.
- Context content is not persisted; only bounded evidence, redacted excerpts, hashes, and computed size metadata are stored.
- GitHub publication requires authenticated `git` and `gh` CLIs.
- n8n may call this CLI or exchange contract artifacts later, but it is not allowed to bypass the runtime approval and scope guards.
