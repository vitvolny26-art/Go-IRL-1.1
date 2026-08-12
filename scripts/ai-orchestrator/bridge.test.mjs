import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import bridge from './bridge.cjs';
import core from './runtime/core.cjs';

const temporaryDirectories = [];

function createSandbox() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'go-irl-bridge-'));
  temporaryDirectories.push(repoRoot);
  const stateDir = path.join(repoRoot, '.runtime-state');
  fs.mkdirSync(path.join(repoRoot, 'scripts', 'ai-orchestrator'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'docs', 'reports'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'Orchestrator bridge source of truth.\n', 'utf8');
  fs.writeFileSync(path.join(repoRoot, 'scripts', 'ai-orchestrator', 'bridge-target.cjs'), 'module.exports = false;\n', 'utf8');
  return { repoRoot, stateDir };
}

function mission() {
  return {
    schema_version: '1.0',
    mission_id: 'MISSION-BRIDGE-E2E',
    objective: 'Exercise the stable external orchestrator JSON bridge.',
    risk_level: 'low',
    allowed_paths: ['scripts/ai-orchestrator/**', 'docs/reports/bridge-e2e.md'],
    forbidden_paths: ['src/**', '.env*', 'supabase/**', 'vercel.json'],
    acceptance_criteria: ['Every bridge response uses the stable public envelope.'],
    maximum_budget_usd: 1,
    requires_human_approval: true,
    source_of_truth_refs: ['README.md'],
    expires_at: '2099-01-01T00:00:00.000Z',
  };
}

function result(role) {
  return {
    schema_version: '1.0',
    mission_id: 'MISSION-BRIDGE-E2E',
    role,
    status: 'PASS',
    evidence: [{ path: 'README.md', line: 1, claim: 'The bridge source of truth is present.' }],
    changed_files: ['scripts/ai-orchestrator/bridge-target.cjs'],
    risks: ['Publication remains human-gated.'],
    validation_errors: [],
    next_action: 'Continue to the next guarded stage.',
  };
}

function run(sandbox, command, request, dependencies = {}) {
  return bridge.executeBridgeCommand({
    command,
    request,
    stateDir: sandbox.stateDir,
    repoRoot: sandbox.repoRoot,
    dependencies,
  });
}

function expectEnvelope(response, status, nextAction) {
  expect(response).toEqual({
    success: true,
    mission_id: 'MISSION-BRIDGE-E2E',
    status,
    next_action: nextAction,
    artifacts: expect.any(Array),
    qa: expect.any(Object),
  });
  const serialized = JSON.stringify(response);
  expect(serialized).not.toContain('.runtime-state');
  expect(serialized).not.toContain('state.json');
  expect(serialized).not.toContain('sha256');
  expect(serialized).not.toContain(path.resolve(sandboxPathForAssertion));
}

let sandboxPathForAssertion = '.';

afterEach(() => {
  sandboxPathForAssertion = '.';
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('Orchestrator bridge v0.2', () => {
  it('returns a sanitized health envelope without creating or reading Mission state', () => {
    const sandbox = createSandbox();
    expect(fs.existsSync(sandbox.stateDir)).toBe(false);

    expect(run(sandbox, 'health', {})).toEqual({
      success: true,
      mission_id: null,
      status: 'healthy',
      next_action: 'none',
      artifacts: [],
      qa: { reviewed_diff: null, final: null },
      health: {
        bridge_version: '0.2',
        runtime_status: 'reachable',
        mutation_performed: false,
      },
    });

    expect(fs.existsSync(sandbox.stateDir)).toBe(false);
  });

  it('runs create, status, approval, context, and planner as separate JSON stages', () => {
    const sandbox = createSandbox();
    sandboxPathForAssertion = sandbox.repoRoot;
    expectEnvelope(run(sandbox, 'mission create', { mission: mission() }), 'awaiting_mission_approval', 'mission approve');
    expectEnvelope(run(sandbox, 'mission status', { mission_id: 'MISSION-BRIDGE-E2E' }), 'awaiting_mission_approval', 'mission approve');
    expectEnvelope(run(sandbox, 'mission approve', {
      mission_id: 'MISSION-BRIDGE-E2E', actor: 'human-owner',
    }), 'approved', 'context build');
    const context = run(sandbox, 'context build', {
      mission_id: 'MISSION-BRIDGE-E2E',
      include_patterns: ['README.md', 'scripts/ai-orchestrator/bridge-target.cjs'],
      grep_queries: ['bridge'],
    });
    expectEnvelope(context, 'context_ready', 'planner run');
    expect(context.artifacts).toEqual(['context_pack']);
    const planned = run(sandbox, 'planner run', { mission_id: 'MISSION-BRIDGE-E2E' });
    expectEnvelope(planned, 'planned', 'implementer run');
    expect(planned.artifacts).toEqual(['codex_handoff', 'context_pack', 'plan']);
  });

  it('rejects an active Mission, releases its slot, and keeps repeated rejection idempotent', () => {
    const sandbox = createSandbox();
    sandboxPathForAssertion = sandbox.repoRoot;
    run(sandbox, 'mission create', { mission: mission() });
    run(sandbox, 'mission approve', { mission_id: 'MISSION-BRIDGE-E2E', actor: 'human-owner' });

    const rejected = run(sandbox, 'mission reject', {
      mission_id: 'MISSION-BRIDGE-E2E',
      actor: 'telegram:509799028',
      reason: 'Rejected through the Telegram owner gate.',
    });

    expectEnvelope(rejected, 'rejected', 'none');
    const state = core.loadState(sandbox.stateDir);
    expect(state.active_mission_id).toBeNull();
    expect(state.missions['MISSION-BRIDGE-E2E'].closed_by).toEqual(expect.objectContaining({
      actor: 'telegram:509799028',
      action: 'reject',
      reason: 'Rejected through the Telegram owner gate.',
    }));
    expect(state.missions['MISSION-BRIDGE-E2E'].history.at(-1)).toEqual(expect.objectContaining({
      state: 'rejected',
      actor: 'telegram:509799028',
      action: 'reject',
      reason: 'Rejected through the Telegram owner gate.',
    }));

    expectEnvelope(run(sandbox, 'mission reject', {
      mission_id: 'MISSION-BRIDGE-E2E',
      actor: 'telegram:509799028',
    }), 'rejected', 'none');
  });

  it('runs external implementer, reviewer, QA, approval, report, and publication preview', () => {
    const sandbox = createSandbox();
    sandboxPathForAssertion = sandbox.repoRoot;
    run(sandbox, 'mission create', { mission: mission() });
    run(sandbox, 'mission approve', { mission_id: 'MISSION-BRIDGE-E2E', actor: 'human-owner' });
    run(sandbox, 'context build', {
      mission_id: 'MISSION-BRIDGE-E2E', include_patterns: ['README.md'], grep_queries: ['bridge'],
    });
    run(sandbox, 'planner run', { mission_id: 'MISSION-BRIDGE-E2E' });
    fs.writeFileSync(path.join(sandbox.repoRoot, 'scripts', 'ai-orchestrator', 'bridge-target.cjs'), 'module.exports = true;\n', 'utf8');

    expectEnvelope(run(sandbox, 'implementer run', {
      mission_id: 'MISSION-BRIDGE-E2E', execution_id: 'impl-external', result: result('Codex Implementer'),
    }), 'reviewing', 'review run');
    expectEnvelope(run(sandbox, 'review run', {
      mission_id: 'MISSION-BRIDGE-E2E', execution_id: 'review-external', result: result('Independent Reviewer'),
    }), 'checking', 'qa run');
    const failedQa = run(sandbox, 'qa run', { mission_id: 'MISSION-BRIDGE-E2E' }, {
      qaRunner: () => ({
        status: 1,
        stdout: '',
        stderr: 'private runner output',
      }),
    });

    expectEnvelope(failedQa, 'checks_failed', 'qa run');
    expect(failedQa.qa.reviewed_diff).toMatchObject({
      green: false,
      commands: [{
        command: 'pnpm run typecheck',
        status: 'FAIL',
      }],
      first_failed_command: 'pnpm run typecheck',
    });
    expect(JSON.stringify(failedQa)).not.toContain('private runner output');
    const expectedQaCommands = [
      'pnpm run typecheck',
      'pnpm run lint',
      'pnpm run build',
      'pnpm run test',
      'git diff --check',
    ].map((command) => ({ command, status: 'PASS' }));

    const retryQa = run(sandbox, 'qa run', {
      mission_id: 'MISSION-BRIDGE-E2E', retry_actor: 'human-owner',
    }, {
      qaRunner: () => ({ status: 0, stdout: 'PASS', stderr: '' }),
    });

    expectEnvelope(retryQa, 'awaiting_change_approval', 'mission approve');
    expect(retryQa.qa.reviewed_diff).toMatchObject({
      green: true,
      completed_at: expect.any(String),
      commands: expectedQaCommands,
      first_failed_command: null,
    });
    expectEnvelope(run(sandbox, 'mission approve', {
      mission_id: 'MISSION-BRIDGE-E2E', actor: 'human-owner', approval_type: 'change',
    }), 'awaiting_change_approval', 'report create');
    expectEnvelope(run(sandbox, 'report create', {
      mission_id: 'MISSION-BRIDGE-E2E', report_path: 'docs/reports/bridge-e2e.md',
    }), 'report_ready', 'qa run');
    const finalQa = run(sandbox, 'qa run', {
      mission_id: 'MISSION-BRIDGE-E2E', final: true,
    }, {
      qaRunner: () => ({ status: 0, stdout: 'PASS', stderr: '' }),
    });

    expectEnvelope(finalQa, 'report_ready', 'publish preview');
    expect(finalQa.qa.final).toMatchObject({
      green: true,
      completed_at: expect.any(String),
      commands: expectedQaCommands,
      first_failed_command: null,
    });

    const selected = ['scripts/ai-orchestrator/bridge-target.cjs', 'docs/reports/bridge-e2e.md'];
    const preview = run(sandbox, 'publish preview', {
      mission_id: 'MISSION-BRIDGE-E2E',
      selected_files: selected,
      commit_message: 'feat: bridge e2e',
      pr_title: 'Bridge e2e',
    }, {
      publisherRunner(command, args) {
        if (command === 'git' && args[0] === 'branch') return 'agent/bridge-e2e';
        if (command === 'git' && args[0] === 'diff') return selected.join('\n');
        return '';
      },
    });
    expectEnvelope(preview, 'report_ready', 'publish preview');
    expect(preview.artifacts).toContain('publish_preview');
    const previewedRecord = core.loadState(sandbox.stateDir).missions['MISSION-BRIDGE-E2E'];
    expect(previewedRecord.state).toBe('report_ready');
    expect(previewedRecord.publish_preview).toMatchObject({
      branch: 'agent/bridge-e2e',
      selected_files: selected.sort(),
      draft: true,
      merge: false,
      deploy: false,
    });

    const archived = run(sandbox, 'archive', {
      mission_id: 'MISSION-BRIDGE-E2E', actor: 'human-owner',
    });
    expectEnvelope(archived, 'archived', 'none');
    expect(archived.artifacts).toContain('publish_preview');
    expect(core.loadState(sandbox.stateDir).active_mission_id).toBeNull();
  });

  it('refuses to archive a report-ready Mission before publication preview', () => {
    const sandbox = createSandbox();
    run(sandbox, 'mission create', { mission: mission() });
    const state = core.loadState(sandbox.stateDir);
    const record = state.missions['MISSION-BRIDGE-E2E'];
    core.transition(record, 'approved');
    core.transition(record, 'context_ready');
    core.transition(record, 'planned');
    core.transition(record, 'implementing');
    core.transition(record, 'reviewing');
    core.transition(record, 'checking');
    core.transition(record, 'awaiting_change_approval');
    core.transition(record, 'report_ready');
    core.saveState(sandbox.stateDir, state);

    expect(() => run(sandbox, 'archive', {
      mission_id: 'MISSION-BRIDGE-E2E', actor: 'human-owner',
    })).toThrowError(expect.objectContaining({ code: 'PUBLISH_PREVIEW_REQUIRED' }));
    expect(core.loadState(sandbox.stateDir).active_mission_id).toBe('MISSION-BRIDGE-E2E');
  });

  it('refuses to plan from a modified internal Context Pack', () => {
    const sandbox = createSandbox();
    run(sandbox, 'mission create', { mission: mission() });
    run(sandbox, 'mission approve', { mission_id: 'MISSION-BRIDGE-E2E', actor: 'human-owner' });
    run(sandbox, 'context build', {
      mission_id: 'MISSION-BRIDGE-E2E', include_patterns: ['README.md'], grep_queries: ['bridge'],
    });
    const state = core.loadState(sandbox.stateDir);
    const contextPath = state.missions['MISSION-BRIDGE-E2E'].artifacts.context_pack.path;
    fs.writeFileSync(contextPath, '{}\n', 'utf8');
    expect(() => run(sandbox, 'planner run', {
      mission_id: 'MISSION-BRIDGE-E2E',
    })).toThrowError(expect.objectContaining({ code: 'CONTEXT_ARTIFACT_CHANGED' }));
  });

  it('archives a completed externally published Mission without exposing its state storage', () => {
    const sandbox = createSandbox();
    sandboxPathForAssertion = sandbox.repoRoot;
    run(sandbox, 'mission create', { mission: mission() });
    const state = core.loadState(sandbox.stateDir);
    const record = state.missions['MISSION-BRIDGE-E2E'];
    core.transition(record, 'approved');
    core.transition(record, 'context_ready');
    core.transition(record, 'planned');
    core.transition(record, 'implementing');
    core.transition(record, 'reviewing');
    core.transition(record, 'checking');
    core.transition(record, 'awaiting_change_approval');
    core.transition(record, 'report_ready');
    core.transition(record, 'committed');
    core.transition(record, 'pushed');
    core.transition(record, 'draft_pr');
    core.saveState(sandbox.stateDir, state);
    expectEnvelope(run(sandbox, 'archive', {
      mission_id: 'MISSION-BRIDGE-E2E', actor: 'human-owner',
    }), 'archived', 'none');
    expect(core.loadState(sandbox.stateDir).active_mission_id).toBeNull();
  });

  it('emits exactly one JSON error response and sanitizes internal error details', () => {
    const sandbox = createSandbox();
    const chunks = [];
    const exitCode = bridge.runBridgeCli(['mission', 'status'], {
      input: '{invalid',
      stateDir: sandbox.stateDir,
      repoRoot: sandbox.repoRoot,
      stdout: { write: (chunk) => chunks.push(chunk) },
    });
    expect(exitCode).toBe(1);
    expect(chunks).toHaveLength(1);
    const response = JSON.parse(chunks[0]);
    expect(response).toEqual({
      success: false,
      mission_id: null,
      status: 'error',
      next_action: 'fix request',
      artifacts: [],
      qa: { reviewed_diff: null, final: null },
      error: { code: 'BRIDGE_INPUT_INVALID_JSON', message: 'Bridge input must be one valid JSON object.' },
    });
    expect(chunks[0]).not.toContain(sandbox.stateDir);
  });

  it('never permits publish preview to execute commit, push, PR creation, merge, or deploy', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'scripts', 'ai-orchestrator', 'bridge.cjs'), 'utf8');
    expect(source).toContain('execute: false');
    expect(source).not.toContain('execute: request.execute');
  });
});

