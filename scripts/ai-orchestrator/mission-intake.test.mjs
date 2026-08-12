import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import core from './runtime/core.cjs';
import intake from './mission-intake.cjs';

const temporaryDirectories = [];

function createSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-irl-mission-intake-'));
  temporaryDirectories.push(root);
  return { root, stateDir: path.join(root, 'state') };
}

function mission(overrides = {}) {
  return {
    schema_version: '1.0',
    objective: 'Accept one approved low-risk Mission through the runtime intake boundary.',
    risk_level: 'low',
    allowed_paths: ['scripts/ai-orchestrator/mission-intake-output.json'],
    forbidden_paths: ['src/**', '.env*', 'supabase/**', 'vercel.json'],
    acceptance_criteria: ['Mission intake returns a stable accepted response.'],
    maximum_budget_usd: 0.5,
    requires_human_approval: true,
    source_of_truth_refs: ['scripts/ai-orchestrator/README.md'],
    expires_at: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function runCli(stateDir, args, input) {
  return spawnSync(process.execPath, [
    path.join(process.cwd(), 'scripts', 'ai-orchestrator', 'orchestrator.cjs'),
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: JSON.stringify(input),
    env: { ...process.env, GO_IRL_ORCHESTRATOR_STATE_DIR: stateDir },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('EGF-102 Mission Intake Runtime', () => {
  it('creates a deterministic Mission ID, records approval, saves state, and publishes MissionAccepted once', () => {
    const sandbox = createSandbox();
    const first = intake.intakeAcceptedMission({ mission: mission(), actor: 'human-owner', stateDir: sandbox.stateDir });
    expect(first).toEqual({
      success: true,
      mission_id: expect.stringMatching(/^MISSION-[0-9A-F]{20}$/),
      status: 'accepted',
      next_action: 'context_build',
    });
    const state = core.loadState(sandbox.stateDir);
    const record = state.missions[first.mission_id];
    expect(record.state).toBe('approved');
    expect(record.mission_approval).toMatchObject({ actor: 'human-owner', source: 'mission_intake' });
    expect(state.active_mission_id).toBe(first.mission_id);
    expect(state.events).toEqual([expect.objectContaining({
      event_id: `${first.mission_id}:MissionAccepted`,
      type: 'MissionAccepted',
      mission_id: first.mission_id,
      status: 'accepted',
    })]);

    const retry = intake.intakeAcceptedMission({ mission: mission(), actor: 'human-owner', stateDir: sandbox.stateDir });
    expect(retry).toEqual(first);
    expect(core.loadState(sandbox.stateDir).events).toHaveLength(1);

    const advancedState = core.loadState(sandbox.stateDir);
    core.transition(advancedState.missions[first.mission_id], 'context_ready');
    core.saveState(sandbox.stateDir, advancedState);
    expect(intake.intakeAcceptedMission({
      mission: mission(), actor: 'human-owner', stateDir: sandbox.stateDir,
    })).toEqual(first);
    expect(core.loadState(sandbox.stateDir).events).toHaveLength(1);
  });

  it('connects the actual mission intake CLI to bridge status using JSON only', () => {
    const sandbox = createSandbox();
    const accepted = runCli(sandbox.stateDir, ['mission', 'intake', '--actor', 'human-owner'], mission());
    expect(accepted.status).toBe(0);
    expect(accepted.stderr).toBe('');
    expect(accepted.stdout.trim().split(/\r?\n/)).toHaveLength(1);
    const response = JSON.parse(accepted.stdout);
    expect(response).toEqual({
      success: true,
      mission_id: expect.stringMatching(/^MISSION-[0-9A-F]{20}$/),
      status: 'accepted',
      next_action: 'context_build',
    });

    const status = runCli(sandbox.stateDir, ['bridge', 'mission', 'status'], { mission_id: response.mission_id });
    expect(status.status).toBe(0);
    expect(status.stderr).toBe('');
    expect(JSON.parse(status.stdout)).toEqual({
      success: true,
      mission_id: response.mission_id,
      status: 'approved',
      next_action: 'context build',
      artifacts: [],
      qa: {
        reviewed_diff: null,
        final: null,
      },
      transport: null,
      reliability: {
        timeout_ms: 30000,
        attempt: 1,
        max_attempts: 1,
        retryable: false,
        retry_after_ms: null,
        dead_lettered: false,
      },
    });
  });

  it('rejects invalid schema and Policy before creating runtime state', () => {
    const invalidSandbox = createSandbox();
    expect(() => intake.intakeAcceptedMission({
      mission: mission({ objective: '' }), actor: 'human-owner', stateDir: invalidSandbox.stateDir,
    })).toThrowError(expect.objectContaining({ code: 'MISSION_INVALID' }));
    expect(core.loadState(invalidSandbox.stateDir).missions).toEqual({});

    const policySandbox = createSandbox();
    expect(() => intake.intakeAcceptedMission({
      mission: mission({ allowed_paths: ['**'] }), actor: 'human-owner', stateDir: policySandbox.stateDir,
    })).toThrowError(expect.objectContaining({ code: 'MISSION_POLICY_REJECTED' }));
    expect(core.loadState(policySandbox.stateDir).missions).toEqual({});

    const sourceSandbox = createSandbox();
    expect(() => intake.intakeAcceptedMission({
      mission: mission({ allowed_paths: ['scripts/ai-orchestrator/**'] }),
      actor: 'human-owner',
      stateDir: sourceSandbox.stateDir,
    })).toThrowError(expect.objectContaining({ code: 'MISSION_POLICY_REJECTED' }));
  });

  it('rejects semantic duplicates under another supplied ID and a different active Mission', () => {
    const duplicateSandbox = createSandbox();
    intake.intakeAcceptedMission({ mission: mission(), actor: 'human-owner', stateDir: duplicateSandbox.stateDir });
    expect(() => intake.intakeAcceptedMission({
      mission: mission({ mission_id: 'MISSION-ALTERNATE-DUPLICATE' }),
      actor: 'human-owner',
      stateDir: duplicateSandbox.stateDir,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_MISSION' }));

    const activeSandbox = createSandbox();
    intake.intakeAcceptedMission({ mission: mission(), actor: 'human-owner', stateDir: activeSandbox.stateDir });
    expect(() => intake.intakeAcceptedMission({
      mission: mission({ objective: 'A distinct second active Mission.' }),
      actor: 'human-owner',
      stateDir: activeSandbox.stateDir,
    })).toThrowError(expect.objectContaining({ code: 'ACTIVE_MISSION_EXISTS' }));
  });

  it('requires an approval actor and emits a sanitized JSON rejection', () => {
    const sandbox = createSandbox();
    const result = runCli(sandbox.stateDir, ['mission', 'intake'], mission());
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      success: false,
      mission_id: expect.stringMatching(/^MISSION-[0-9A-F]{20}$/),
      status: 'rejected',
      next_action: 'fix_mission',
      error: {
        code: 'HUMAN_ACTOR_REQUIRED',
        message: 'An upstream human approval actor is required.',
      },
    });
    expect(result.stdout).not.toContain(sandbox.stateDir);
  });

  it('has no LLM, GitHub, or n8n execution dependency', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'scripts', 'ai-orchestrator', 'mission-intake.cjs'), 'utf8').toLowerCase();
    expect(source).not.toContain('codex-adapter');
    expect(source).not.toContain('publisher.cjs');
    expect(source).not.toContain('n8n');
    expect(source).not.toContain('child_process');
  });
});
