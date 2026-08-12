const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateAgentResult } = require('../validate-agent-result.cjs');
const { buildContextPack } = require('./context-builder.cjs');
const {
  buildRuntimeMissionEvidenceManifest,
  formatEvidenceLedger,
} = require('./evidence-ledger.cjs');
const { captureWorktreeSnapshot, diffWorktreeSnapshots } = require('./worktree.cjs');
const {
  OrchestratorError,
  artifactFile,
  assertPathsAllowed,
  loadState,
  normalizeRepoPath,
  requireMission,
  saveState,
  sha256,
  stableStringify,
  transition,
  writeJsonAtomic,
} = require('./core.cjs');

const QUALITY_COMMANDS = [
  ['pnpm', ['run', 'typecheck']],
  ['pnpm', ['run', 'lint']],
  ['pnpm', ['run', 'build']],
  ['pnpm', ['run', 'test']],
  ['git', ['diff', '--check']],
];

function createPlan(mission, contextPack) {
  return {
    schema_version: '1.0',
    mission_id: mission.mission_id,
    objective: mission.objective,
    exact_write_scope: mission.allowed_paths,
    forbidden_scope: mission.forbidden_paths,
    acceptance_criteria: mission.acceptance_criteria,
    context_manifest_sha256: sha256(stableStringify(contextPack.file_manifest)),
    steps: [
      'Inspect only the evidence and source-of-truth files in the Context Pack.',
      'Apply the smallest change inside exact_write_scope.',
      'Return an Agent Result without committing, pushing, merging, or deploying.',
    ],
    checks: QUALITY_COMMANDS.map(([command, args]) => [command, ...args].join(' ')),
    rollback: 'Discard only the Mission-selected changed files; preserve unrelated worktree changes.',
    constraints: {
      dependency_addition_allowed: false,
      architecture_rewrite_allowed: false,
      proposal_specification_read_only: true,
      external_writes_allowed: false,
    },
  };
}

function createCodexHandoff(mission, contextPack, plan) {
  return {
    schema_version: '1.0',
    mission_id: mission.mission_id,
    role: 'Codex Implementer',
    mission,
    context_pack: contextPack,
    plan,
    instructions: [
      'Do not write outside plan.exact_write_scope.',
      'Do not touch plan.forbidden_scope or any sensitive path.',
      'Do not add dependencies or rewrite architecture.',
      'Do not commit, push, create a PR, merge, deploy, or self-approve.',
      'Return one Agent Result matching schemas/agent-result.schema.json.',
    ],
  };
}

function storeWorktreeBaseline(stateDir, missionId, snapshot) {
  const baselineFile = artifactFile(stateDir, missionId, 'worktree-baseline.json');
  writeJsonAtomic(baselineFile, snapshot);
  return { path: baselineFile, sha256: sha256(stableStringify(snapshot)), file_count: Object.keys(snapshot).length };
}

function readWorktreeBaseline(record) {
  if (record.worktree_baseline?.path) return JSON.parse(fs.readFileSync(record.worktree_baseline.path, 'utf8'));
  return record.worktree_baseline || {};
}

function buildMissionContext({ missionId, stateDir, repoRoot, includePatterns, grepQueries, maxBytes, now = new Date() }) {
  const state = loadState(stateDir);
  const record = requireMission(state, missionId);
  if (record.state !== 'approved') {
    throw new OrchestratorError('MISSION_NOT_APPROVED', 'Context collection requires Mission Approval.', { state: record.state });
  }
  const contextPack = buildContextPack({
    mission: record.mission,
    repoRoot,
    includePatterns,
    grepQueries,
    maxBytes,
  });
  const contextFile = artifactFile(stateDir, missionId, 'context-pack.json');
  writeJsonAtomic(contextFile, contextPack);
  record.artifacts.context_pack = { path: contextFile, sha256: sha256(stableStringify(contextPack)) };
  transition(record, 'context_ready', now);
  saveState(stateDir, state);
  return { contextPack, record };
}

function planMission({ missionId, stateDir, repoRoot, now = new Date() }) {
  const state = loadState(stateDir);
  const record = requireMission(state, missionId);
  if (record.state !== 'context_ready' || !record.artifacts.context_pack?.path) {
    throw new OrchestratorError('CONTEXT_NOT_READY', 'Planning requires a completed Context Pack.', { state: record.state });
  }
  const contextPack = JSON.parse(fs.readFileSync(record.artifacts.context_pack.path, 'utf8'));
  if (sha256(stableStringify(contextPack)) !== record.artifacts.context_pack.sha256) {
    throw new OrchestratorError('CONTEXT_ARTIFACT_CHANGED', 'Context Pack changed after it was recorded.');
  }

  const plan = createPlan(record.mission, contextPack);
  const planFile = artifactFile(stateDir, missionId, 'plan.json');
  writeJsonAtomic(planFile, plan);
  record.artifacts.plan = { path: planFile, sha256: sha256(stableStringify(plan)) };

  const handoff = createCodexHandoff(record.mission, contextPack, plan);
  const handoffFile = artifactFile(stateDir, missionId, 'codex-handoff.json');
  writeJsonAtomic(handoffFile, handoff);
  record.artifacts.codex_handoff = { path: handoffFile, sha256: sha256(stableStringify(handoff)) };
  record.worktree_baseline = storeWorktreeBaseline(stateDir, missionId, captureWorktreeSnapshot(repoRoot, stateDir));
  transition(record, 'planned', now);
  saveState(stateDir, state);
  return { contextPack, plan, handoff, record };
}

function prepareMission(options) {
  buildMissionContext(options);
  return planMission(options);
}

function refreshBaseline({ missionId, stateDir, repoRoot, actor, now = new Date() }) {
  if (!actor || actor.trim() === '') throw new OrchestratorError('HUMAN_ACTOR_REQUIRED', 'Refreshing a worktree baseline requires a human actor.');
  const state = loadState(stateDir);
  const record = requireMission(state, missionId);
  if (record.state !== 'planned' || Object.keys(record.agent_executions).length > 0) {
    throw new OrchestratorError('BASELINE_REFRESH_FORBIDDEN', 'Baseline can be refreshed only before the first agent result.', { state: record.state });
  }
  record.worktree_baseline = storeWorktreeBaseline(stateDir, missionId, captureWorktreeSnapshot(repoRoot, stateDir));
  record.baseline_refreshes = [...(record.baseline_refreshes || []), { actor: actor.trim(), at: now.toISOString() }];
  record.updated_at = now.toISOString();
  saveState(stateDir, state);
  return record;
}

function validateResult(result) {
  const errors = validateAgentResult(result);
  if (errors.length > 0) {
    throw new OrchestratorError('AGENT_RESULT_INVALID', 'Agent Result contract validation failed.', { errors });
  }
}

function consumeBudget(record, amount, now) {
  const cost = amount === undefined ? 0 : Number(amount);
  if (!Number.isFinite(cost) || cost < 0) throw new OrchestratorError('BUDGET_VALUE_INVALID', 'Agent cost must be a non-negative number.');
  record.budget_spent_usd = Number(((record.budget_spent_usd || 0) + cost).toFixed(6));
  if (record.budget_spent_usd > record.mission.maximum_budget_usd) {
    transition(record, 'budget_exceeded', now);
    return false;
  }
  return true;
}

function submitImplementerResult({ missionId, stateDir, repoRoot, result, executionId, costUsd = 0, now = new Date() }) {
  if (!executionId || executionId.trim() === '') throw new OrchestratorError('EXECUTION_ID_REQUIRED', 'Agent execution ID is required.');
  validateResult(result);
  const state = loadState(stateDir);
  const record = requireMission(state, missionId);
  if (!['planned', 'correction_requested'].includes(record.state)) {
    throw new OrchestratorError('IMPLEMENTER_NOT_EXPECTED', 'Mission is not awaiting an implementer result.', { state: record.state });
  }
  if (result.mission_id !== missionId || result.role !== 'Codex Implementer') {
    throw new OrchestratorError('IMPLEMENTER_IDENTITY_INVALID', 'Implementer result has the wrong Mission or role.');
  }
  transition(record, 'implementing', now);
  if (!consumeBudget(record, costUsd, now)) {
    saveState(stateDir, state);
    throw new OrchestratorError('BUDGET_EXCEEDED', 'Mission maximum budget was exceeded.', {
      maximum_budget_usd: record.mission.maximum_budget_usd,
      budget_spent_usd: record.budget_spent_usd,
    });
  }
  const actualChangedFiles = diffWorktreeSnapshots(
    readWorktreeBaseline(record),
    captureWorktreeSnapshot(repoRoot, stateDir),
  );
  try {
    assertPathsAllowed(actualChangedFiles, record.mission);
  } catch (error) {
    transition(record, 'scope_violation', now);
    record.scope_violation = error.details;
    saveState(stateDir, state);
    throw error;
  }
  const reportedChangedFiles = [...new Set(result.changed_files.map(normalizeRepoPath))].sort();
  if (JSON.stringify(actualChangedFiles) !== JSON.stringify(reportedChangedFiles)) {
    transition(record, 'blocked', now);
    record.block_reason = 'agent_result_diff_mismatch';
    record.diff_mismatch = { actual: actualChangedFiles, reported: reportedChangedFiles };
    saveState(stateDir, state);
    throw new OrchestratorError('AGENT_RESULT_DIFF_MISMATCH', 'Agent Result changed_files does not match the isolated worktree diff.', record.diff_mismatch);
  }
  record.agent_executions.implementer = {
    execution_id: executionId.trim(),
    result,
    received_at: now.toISOString(),
  };
  const resultFile = artifactFile(stateDir, missionId, `implementer-result-${record.correction_passes}.json`);
  writeJsonAtomic(resultFile, result);
  if (result.status === 'BLOCKED') {
    transition(record, 'blocked', now);
  } else if (result.status !== 'PASS') {
    throw new OrchestratorError('IMPLEMENTER_STATUS_INVALID', 'Implementer must return PASS or BLOCKED.');
  } else {
    transition(record, 'reviewing', now);
  }
  saveState(stateDir, state);
  return record;
}

function submitReviewerResult({ missionId, stateDir, result, executionId, costUsd = 0, now = new Date() }) {
  if (!executionId || executionId.trim() === '') throw new OrchestratorError('EXECUTION_ID_REQUIRED', 'Reviewer execution ID is required.');
  validateResult(result);
  const state = loadState(stateDir);
  const record = requireMission(state, missionId);
  if (record.state !== 'reviewing') {
    throw new OrchestratorError('REVIEWER_NOT_EXPECTED', 'Mission is not awaiting independent review.', { state: record.state });
  }
  const implementer = record.agent_executions.implementer;
  if (!implementer || executionId.trim() === implementer.execution_id || result.role === implementer.result.role) {
    throw new OrchestratorError('REVIEW_NOT_INDEPENDENT', 'Reviewer must be an independent execution and role.');
  }
  if (result.mission_id !== missionId || result.role !== 'Independent Reviewer') {
    throw new OrchestratorError('REVIEWER_IDENTITY_INVALID', 'Reviewer result has the wrong Mission or role.');
  }
  if (!consumeBudget(record, costUsd, now)) {
    saveState(stateDir, state);
    throw new OrchestratorError('BUDGET_EXCEEDED', 'Mission maximum budget was exceeded.', {
      maximum_budget_usd: record.mission.maximum_budget_usd,
      budget_spent_usd: record.budget_spent_usd,
    });
  }
  assertPathsAllowed(result.changed_files, record.mission);
  record.agent_executions.reviewer = {
    execution_id: executionId.trim(),
    result,
    received_at: now.toISOString(),
  };
  const resultFile = artifactFile(stateDir, missionId, `reviewer-result-${record.correction_passes}.json`);
  writeJsonAtomic(resultFile, result);

  if (result.status === 'PASS') {
    transition(record, 'checking', now);
  } else if (result.status === 'BLOCKED') {
    transition(record, 'blocked', now);
  } else if (record.correction_passes >= 1) {
    transition(record, 'blocked', now);
    record.block_reason = 'maximum_correction_passes_exceeded';
  } else {
    record.correction_passes += 1;
    transition(record, 'correction_requested', now);
  }
  saveState(stateDir, state);
  return record;
}

function defaultCommandRunner(command, args, cwd) {
  let executable = command;
  let resolvedArgs = args;
  if (process.platform === 'win32' && command === 'pnpm') {
    const pnpmScript = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs');
    if (fs.existsSync(pnpmScript)) {
      executable = process.execPath;
      resolvedArgs = [pnpmScript, ...args];
    } else {
      executable = 'pnpm.cmd';
    }
  }
  const result = spawnSync(executable, resolvedArgs, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && executable === 'pnpm.cmd',
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
}

function runQualityCommands({ repoRoot, runner = defaultCommandRunner }) {
  const results = [];
  for (const [command, args] of QUALITY_COMMANDS) {
    const result = runner(command, args, repoRoot);
    const entry = { command: [command, ...args].join(' '), ...result };
    results.push(entry);
    if (result.status !== 0) {
      const errorBlock = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      return { green: false, results, first_error: { command: entry.command, error_block: errorBlock } };
    }
  }
  return { green: true, results };
}

function runQa({ missionId, stateDir, repoRoot, runner, final = false, now = new Date() }) {
  const state = loadState(stateDir);
  const record = requireMission(state, missionId);
  const expectedState = final ? 'report_ready' : 'checking';
  if (record.state !== expectedState) {
    throw new OrchestratorError('QA_NOT_EXPECTED', `QA requires Mission state ${expectedState}.`, { state: record.state });
  }
  const result = runQualityCommands({ repoRoot, runner });
  record.checks[final ? 'final' : 'reviewed_diff'] = { ...result, completed_at: now.toISOString() };
  if (!result.green) {
    transition(record, 'checks_failed', now);
  } else if (!final) {
    transition(record, 'awaiting_change_approval', now);
  }
  saveState(stateDir, state);
  return result;
}

function retryQa({ missionId, stateDir, actor, now = new Date() }) {
  if (!actor || actor.trim() === '') throw new OrchestratorError('HUMAN_ACTOR_REQUIRED', 'QA retry requires a human actor.');
  const state = loadState(stateDir);
  const record = requireMission(state, missionId);
  if (record.state !== 'checks_failed') {
    throw new OrchestratorError('QA_RETRY_NOT_EXPECTED', 'Mission has no failed QA gate to retry.', { state: record.state });
  }
  if ((record.qa_retries || []).length >= 1) {
    throw new OrchestratorError('QA_RETRY_LIMIT', 'Only one audited QA retry is allowed.');
  }
  const retryTarget = record.checks.final?.green === false ? 'report_ready' : 'checking';
  record.qa_retries = [{
    actor: actor.trim(),
    at: now.toISOString(),
    target: retryTarget === 'report_ready' ? 'final' : 'reviewed_diff',
    first_error: record.checks.final?.first_error || record.checks.reviewed_diff?.first_error,
  }];
  transition(record, retryTarget, now);
  saveState(stateDir, state);
  return record;
}

function approveChange({ missionId, stateDir, actor, now = new Date() }) {
  if (!actor || actor.trim() === '') throw new OrchestratorError('HUMAN_ACTOR_REQUIRED', 'Change Approval requires a human actor.');
  const state = loadState(stateDir);
  const record = requireMission(state, missionId);
  if (record.state !== 'awaiting_change_approval') {
    throw new OrchestratorError('CHANGE_APPROVAL_NOT_EXPECTED', 'Mission is not awaiting Change Approval.', { state: record.state });
  }
  record.change_approval = { actor: actor.trim(), approved_at: now.toISOString() };
  saveState(stateDir, state);
  return record;
}

function reportMarkdown(record, reportPath, now, evidenceManifest) {
  const reviewed = record.checks.reviewed_diff;
  const fileList = record.agent_executions.implementer?.result.changed_files || [];
  return `---\ntitle: Agent Report — ${record.mission.mission_id}\nowner: AI Developer Orchestrator\nstatus: Draft\nsource_of_truth: false\nlast_review: ${now.toISOString().slice(0, 10)}\nnext_review: ${new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)}\n---\n\n# Agent Report\n\n## Task\n\n${record.mission.objective}\n\n## Files inspected\n\n${record.mission.source_of_truth_refs.map((item) => `- \`${item}\``).join('\n')}\n\n## Findings\n\n- Mission validation, approval, bounded context, planning, implementation handoff, independent review, and QA completed.\n- Correction passes used: ${record.correction_passes}.\n\n## Changes made\n\n${fileList.length > 0 ? fileList.map((item) => `- \`${item}\``).join('\n') : '- No changed files reported.'}\n- Report: \`${reportPath}\`\n\n## Checks\n\n${reviewed?.green ? reviewed.results.map((item) => `${item.command}  PASS`).join('\n') : 'Quality gate evidence unavailable.'}\n\n## Risks\n\n${record.agent_executions.reviewer?.result.risks.map((item) => `- ${item}`).join('\n') || '- No reviewer risks reported.'}\n\n${formatEvidenceLedger(evidenceManifest)}\n\n## Not touched\n\n- secrets, Auth, RLS, SQL, migrations, deployment, production data, merge, and deploy.\n\n## Next step\n\nRerun the complete quality gate including this report, then publish only after the recorded Change Approval.\n`;
}

function generateReport({ missionId, stateDir, repoRoot, reportPath, now = new Date() }) {
  const state = loadState(stateDir);
  const record = requireMission(state, missionId);
  if (record.state !== 'awaiting_change_approval' || !record.change_approval) {
    throw new OrchestratorError('CHANGE_APPROVAL_REQUIRED', 'Agent Report generation requires recorded Change Approval.');
  }
  const normalizedReport = normalizeRepoPath(reportPath);
  assertPathsAllowed([normalizedReport], record.mission);
  const evidenceManifest = buildRuntimeMissionEvidenceManifest(record, now.toISOString());
  if (evidenceManifest.status !== 'COMPLETED') {
    throw new OrchestratorError('EVIDENCE_LEDGER_INCOMPLETE', 'Agent Report requires a complete Evidence Ledger.', {
      status: evidenceManifest.status,
      missing_claim_ids: evidenceManifest.missing_claim_ids,
    });
  }
  const evidenceFile = artifactFile(stateDir, missionId, 'evidence-manifest.json');
  writeJsonAtomic(evidenceFile, evidenceManifest);
  record.artifacts.evidence_manifest = {
    path: evidenceFile,
    sha256: sha256(stableStringify(evidenceManifest)),
    evidence_count: evidenceManifest.entries.length,
    status: evidenceManifest.status,
  };
  const absolute = path.resolve(repoRoot, ...normalizedReport.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, reportMarkdown(record, normalizedReport, now, evidenceManifest), 'utf8');
  record.artifacts.agent_report = { path: normalizedReport, sha256: sha256(fs.readFileSync(absolute)) };
  transition(record, 'report_ready', now);
  saveState(stateDir, state);
  return { path: normalizedReport, absolute, record };
}

module.exports = {
  QUALITY_COMMANDS,
  approveChange,
  buildMissionContext,
  createCodexHandoff,
  createPlan,
  consumeBudget,
  defaultCommandRunner,
  generateReport,
  planMission,
  prepareMission,
  refreshBaseline,
  runQa,
  runQualityCommands,
  retryQa,
  readWorktreeBaseline,
  storeWorktreeBaseline,
  submitImplementerResult,
  submitReviewerResult,
};
