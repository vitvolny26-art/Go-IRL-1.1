#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { approveMission, closeMission, intakeMission, loadState, requireMission } = require('./runtime/core.cjs');
const {
  approveChange,
  buildMissionContext,
  generateReport,
  planMission,
  runQa,
  retryQa,
  submitImplementerResult,
  submitReviewerResult,
} = require('./runtime/workflow.cjs');
const { publishDraft } = require('./runtime/publisher.cjs');
const { runCodexImplementer, runCodexReviewer } = require('./runtime/codex-adapter.cjs');
const { defaultStateDirectory } = require('./runtime/locations.cjs');

const BRIDGE_VERSION = '0.2';
const COMMANDS = new Set([
  'health',
  'mission create',
  'mission status',
  'mission approve',
  'mission reject',
  'context build',
  'planner run',
  'implementer run',
  'review run',
  'qa run',
  'report create',
  'publish preview',
  'archive',
]);

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    const error = new Error(`${name} must be a non-empty string.`);
    error.code = 'INVALID_BRIDGE_REQUEST';
    throw error;
  }
  return value.trim();
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error(`${name} must be a JSON object.`);
    error.code = 'INVALID_BRIDGE_REQUEST';
    throw error;
  }
  return value;
}

function stringArray(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    const error = new Error(`${name} must be an array of strings.`);
    error.code = 'INVALID_BRIDGE_REQUEST';
    throw error;
  }
  return value;
}

function nextActionForState(state) {
  const actions = {
    awaiting_mission_approval: 'mission approve',
    approved: 'context build',
    context_ready: 'planner run',
    planned: 'implementer run',
    correction_requested: 'implementer run',
    reviewing: 'review run',
    checking: 'qa run',
    checks_failed: 'qa run',
    awaiting_change_approval: 'mission approve',
    report_ready: 'publish preview',
    draft_pr: 'archive',
  };
  return actions[state] || 'none';
}

function nextActionForRecord(record) {
  if (record.state === 'awaiting_change_approval' && record.change_approval) return 'report create';
  if (record.state === 'report_ready' && !record.checks?.final?.green) return 'qa run';
  return nextActionForState(record.state);
}

function publicArtifacts(record, extra = []) {
  const preview = record?.publish_preview ? ['publish_preview'] : [];
  const names = [...Object.keys(record?.artifacts || {}), ...preview, ...extra];
  return [...new Set(names)].sort();
}

function publicQaPhase(phase) {
  if (!phase) return null;

  return {
    green: phase.green === true,
    completed_at: typeof phase.completed_at === 'string'
      ? phase.completed_at
      : null,
    commands: Array.isArray(phase.results)
      ? phase.results.map((result) => ({
          command: String(result.command || ''),
          status: Number(result.status) === 0 ? 'PASS' : 'FAIL',
        }))
      : [],
    first_failed_command: phase.first_error
      ? String(phase.first_error.command || '')
      : null,
  };
}

function publicQa(record) {
  return {
    reviewed_diff: publicQaPhase(record?.checks?.reviewed_diff),
    final: publicQaPhase(record?.checks?.final),
  };
}

function healthEnvelope() {
  return {
    success: true,
    mission_id: null,
    status: 'healthy',
    next_action: 'none',
    artifacts: [],
    qa: publicQa(null),
    health: {
      bridge_version: BRIDGE_VERSION,
      runtime_status: 'reachable',
      mutation_performed: false,
    },
  };
}

function successEnvelope(record, extraArtifacts = []) {
  return {
    success: true,
    mission_id: record.mission.mission_id,
    status: record.state,
    next_action: nextActionForRecord(record),
    artifacts: publicArtifacts(record, extraArtifacts),
    qa: publicQa(record),
  };
}

function publicError(error) {
  const safeMessages = {
    BRIDGE_COMMAND_UNKNOWN: 'Unknown bridge command.',
    BRIDGE_INPUT_INVALID_JSON: 'Bridge input must be one valid JSON object.',
    INVALID_BRIDGE_REQUEST: 'Bridge request is missing a required field or contains an invalid value.',
  };
  return {
    code: error.code || 'BRIDGE_ERROR',
    message: safeMessages[error.code] || 'The runtime rejected the bridge command.',
  };
}

function failureEnvelope(error, missionId, stateDir) {
  let record;
  if (missionId) {
    try {
      record = requireMission(loadState(stateDir), missionId);
    } catch {
      record = null;
    }
  }
  return {
    success: false,
    mission_id: missionId || null,
    status: record?.state || 'error',
    next_action: record ? nextActionForRecord(record) : 'fix request',
    artifacts: publicArtifacts(record),
    qa: publicQa(record),
    error: publicError(error),
  };
}

function recordFromOutput(output, stateDir, missionId) {
  if (output?.record) return output.record;
  if (output?.mission && output?.state) return output;
  return requireMission(loadState(stateDir), missionId);
}

function executeBridgeCommand({ command, request, stateDir, repoRoot, dependencies = {} }) {
  if (!COMMANDS.has(command)) {
    const error = new Error('Unknown bridge command.');
    error.code = 'BRIDGE_COMMAND_UNKNOWN';
    throw error;
  }
  requireObject(request, 'request');
  if (command === 'health') return healthEnvelope();
  const missionId = command === 'mission create'
    ? requireObject(request.mission, 'mission').mission_id
    : requireString(request.mission_id, 'mission_id');
  let output;
  let extraArtifacts = [];

  if (command === 'mission create') {
    output = intakeMission({ mission: request.mission, stateDir });
  } else if (command === 'mission status') {
    output = requireMission(loadState(stateDir), missionId);
  } else if (command === 'mission approve') {
    const approvalType = request.approval_type || 'mission';
    if (!['mission', 'change'].includes(approvalType)) {
      const error = new Error('approval_type must be mission or change.');
      error.code = 'INVALID_BRIDGE_REQUEST';
      throw error;
    }
    output = approvalType === 'change'
      ? approveChange({ missionId, actor: requireString(request.actor, 'actor'), stateDir })
      : approveMission({ missionId, actor: requireString(request.actor, 'actor'), stateDir });
  } else if (command === 'mission reject') {
    const reason = request.reason === undefined ? 'Rejected by owner.' : requireString(request.reason, 'reason');
    if (reason.length > 500) {
      const error = new Error('reason must be at most 500 characters.');
      error.code = 'INVALID_BRIDGE_REQUEST';
      throw error;
    }
    output = closeMission({
      missionId,
      actor: requireString(request.actor, 'actor'),
      stateDir,
      action: 'reject',
      reason,
    });
  } else if (command === 'context build') {
    output = buildMissionContext({
      missionId,
      stateDir,
      repoRoot,
      includePatterns: stringArray(request.include_patterns, 'include_patterns'),
      grepQueries: stringArray(request.grep_queries, 'grep_queries'),
      maxBytes: request.max_bytes,
    });
  } else if (command === 'planner run') {
    output = planMission({ missionId, stateDir, repoRoot });
  } else if (command === 'implementer run') {
    if (request.mode !== undefined && !['external', 'codex'].includes(request.mode)) {
      const error = new Error('mode must be external or codex.');
      error.code = 'INVALID_BRIDGE_REQUEST';
      throw error;
    }
    if (request.mode === 'codex') {
      if (request.execute_agent !== true) {
        const error = new Error('execute_agent must be true for Codex mode.');
        error.code = 'INVALID_BRIDGE_REQUEST';
        throw error;
      }
      output = (dependencies.runCodexImplementer || runCodexImplementer)({
        missionId,
        stateDir,
        repoRoot,
        executionId: requireString(request.execution_id, 'execution_id'),
        estimatedCostUsd: request.cost_usd,
        runner: dependencies.codexRunner,
      });
    } else {
      output = submitImplementerResult({
        missionId,
        stateDir,
        repoRoot,
        result: requireObject(request.result, 'result'),
        executionId: requireString(request.execution_id, 'execution_id'),
        costUsd: request.cost_usd,
      });
    }
  } else if (command === 'review run') {
    if (request.mode !== undefined && !['external', 'codex'].includes(request.mode)) {
      const error = new Error('mode must be external or codex.');
      error.code = 'INVALID_BRIDGE_REQUEST';
      throw error;
    }
    if (request.mode === 'codex') {
      if (request.execute_agent !== true) {
        const error = new Error('execute_agent must be true for Codex mode.');
        error.code = 'INVALID_BRIDGE_REQUEST';
        throw error;
      }
      output = (dependencies.runCodexReviewer || runCodexReviewer)({
        missionId,
        stateDir,
        repoRoot,
        executionId: requireString(request.execution_id, 'execution_id'),
        estimatedCostUsd: request.cost_usd,
        runner: dependencies.codexRunner,
      });
    } else {
      output = submitReviewerResult({
        missionId,
        stateDir,
        result: requireObject(request.result, 'result'),
        executionId: requireString(request.execution_id, 'execution_id'),
        costUsd: request.cost_usd,
      });
    }
  } else if (command === 'qa run') {
    let final = request.final === true;
    const current = requireMission(loadState(stateDir), missionId);
    if (current.state === 'checks_failed') {
      const retried = retryQa({
        missionId,
        stateDir,
        actor: requireString(request.retry_actor, 'retry_actor'),
      });
      final = retried.state === 'report_ready';
    }
    output = runQa({
      missionId,
      stateDir,
      repoRoot,
      final,
      runner: dependencies.qaRunner,
    });
  } else if (command === 'report create') {
    output = generateReport({
      missionId,
      stateDir,
      repoRoot,
      reportPath: requireString(request.report_path, 'report_path'),
    });
  } else if (command === 'publish preview') {
    if (request.pr_body !== undefined && typeof request.pr_body !== 'string') {
      const error = new Error('pr_body must be a string.');
      error.code = 'INVALID_BRIDGE_REQUEST';
      throw error;
    }
    output = (dependencies.publishDraft || publishDraft)({
      missionId,
      stateDir,
      repoRoot,
      selectedFiles: stringArray(request.selected_files, 'selected_files'),
      commitMessage: requireString(request.commit_message, 'commit_message'),
      prTitle: requireString(request.pr_title, 'pr_title'),
      prBody: request.pr_body,
      execute: false,
      runner: dependencies.publisherRunner,
    });
    extraArtifacts = ['publish_preview'];
  } else if (command === 'archive') {
    output = closeMission({
      missionId,
      actor: requireString(request.actor, 'actor'),
      stateDir,
      action: 'archive',
    });
  }

  return successEnvelope(recordFromOutput(output, stateDir, missionId), extraArtifacts);
}

function parseInput(text) {
  try {
    return requireObject(JSON.parse(text || '{}'), 'request');
  } catch (error) {
    if (error.code === 'INVALID_BRIDGE_REQUEST') throw error;
    const wrapped = new Error('Bridge input must be valid JSON.');
    wrapped.code = 'BRIDGE_INPUT_INVALID_JSON';
    throw wrapped;
  }
}

function runBridgeCli(argv, options = {}) {
  const command = argv.slice(0, 2).join(' ');
  const stateDir = options.stateDir || defaultStateDirectory();
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const stdout = options.stdout || process.stdout;
  const input = options.input === undefined ? fs.readFileSync(0, 'utf8') : options.input;
  let request;
  let response;
  try {
    request = parseInput(input);
    response = executeBridgeCommand({ command, request, stateDir, repoRoot, dependencies: options.dependencies });
  } catch (error) {
    response = failureEnvelope(error, request?.mission_id || request?.mission?.mission_id, stateDir);
  }
  stdout.write(`${JSON.stringify(response)}\n`);
  return response.success ? 0 : 1;
}

if (require.main === module) process.exitCode = runBridgeCli(process.argv.slice(2));

module.exports = {
  BRIDGE_VERSION,
  COMMANDS,
  defaultStateDirectory,
  executeBridgeCommand,
  failureEnvelope,
  healthEnvelope,
  nextActionForState,
  nextActionForRecord,
  parseInput,
  publicArtifacts,
  publicQa,
  runBridgeCli,
  successEnvelope,
};
