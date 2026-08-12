import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import core from './runtime/core.cjs';
import contextBuilder from './runtime/context-builder.cjs';
import workflow from './runtime/workflow.cjs';
import publisher from './runtime/publisher.cjs';
import codexAdapter from './runtime/codex-adapter.cjs';

const temporaryDirectories = [];

function createSandbox() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'go-irl-orchestrator-'));
  temporaryDirectories.push(repoRoot);
  const stateDir = path.join(repoRoot, '.runtime-state');
  fs.mkdirSync(path.join(repoRoot, 'scripts', 'ai-orchestrator'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'docs', 'reports'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'AI developer orchestrator runtime\napi_key = fake-placeholder-value\n', 'utf8');
  fs.writeFileSync(path.join(repoRoot, 'scripts', 'ai-orchestrator', 'runtime-target.cjs'), 'module.exports = { target: true };\n', 'utf8');
  return { repoRoot, stateDir };
}

function mission(overrides = {}) {
  return {
    schema_version: '1.0',
    mission_id: 'MISSION-RUNTIME-E2E',
    objective: 'Run one low-risk AI developer orchestration mission end to end.',
    risk_level: 'low',
    allowed_paths: ['scripts/ai-orchestrator/**', 'docs/reports/runtime-e2e.md'],
    forbidden_paths: ['src/**', '.env*', 'supabase/**', 'vercel.json'],
    acceptance_criteria: ['The deterministic runtime reaches a guarded Draft PR plan.'],
    maximum_budget_usd: 1,
    requires_human_approval: true,
    source_of_truth_refs: ['README.md'],
    expires_at: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function agentResult({ role, status = 'PASS', changedFiles = ['scripts/ai-orchestrator/runtime-target.cjs'], nextAction }) {
  return {
    schema_version: '1.0',
    mission_id: 'MISSION-RUNTIME-E2E',
    role,
    status,
    evidence: [{ path: 'README.md', line: 1, claim: 'The bounded runtime contract is available.' }],
    changed_files: changedFiles,
    risks: ['Runtime publication remains human-gated.'],
    validation_errors: status === 'CHANGES_REQUIRED'
      ? [{ code: 'review', path: 'scripts/ai-orchestrator/runtime-target.cjs', message: 'Apply one correction.' }]
      : [],
    next_action: nextAction || (status === 'PASS' ? 'Continue to the next guarded stage.' : 'Apply the single correction pass.'),
  };
}

function prepareApprovedMission(sandbox) {
  core.intakeMission({ mission: mission(), stateDir: sandbox.stateDir });
  core.approveMission({ missionId: 'MISSION-RUNTIME-E2E', actor: 'human-owner', stateDir: sandbox.stateDir });
  return workflow.prepareMission({
    missionId: 'MISSION-RUNTIME-E2E',
    stateDir: sandbox.stateDir,
    repoRoot: sandbox.repoRoot,
    includePatterns: ['README.md', 'scripts/ai-orchestrator/runtime-target.cjs'],
    grepQueries: ['orchestrator', 'target'],
  });
}

function submitGreenAgents(sandbox) {
  fs.writeFileSync(path.join(sandbox.repoRoot, 'scripts', 'ai-orchestrator', 'runtime-target.cjs'), 'module.exports = { target: "implemented" };\n', 'utf8');
  workflow.submitImplementerResult({
    missionId: 'MISSION-RUNTIME-E2E',
    stateDir: sandbox.stateDir,
    repoRoot: sandbox.repoRoot,
    executionId: 'impl-001',
    result: agentResult({ role: 'Codex Implementer' }),
  });
  return workflow.submitReviewerResult({
    missionId: 'MISSION-RUNTIME-E2E',
    stateDir: sandbox.stateDir,
    executionId: 'review-001',
    result: agentResult({ role: 'Independent Reviewer' }),
  });
}

function greenRunner() {
  return { status: 0, stdout: 'PASS', stderr: '' };
}

function preparePublishableMission(sandbox) {
  prepareApprovedMission(sandbox);
  submitGreenAgents(sandbox);
  workflow.runQa({
    missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot, runner: greenRunner,
  });
  workflow.approveChange({ missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, actor: 'human-owner' });
  workflow.generateReport({
    missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot,
    reportPath: 'docs/reports/runtime-e2e.md',
  });
  const evidenceManifest = core.readJson(path.join(
    sandbox.stateDir,
    'artifacts',
    'MISSION-RUNTIME-E2E',
    'evidence-manifest.json',
  ));
  expect(evidenceManifest.status).toBe('COMPLETED');
  expect(evidenceManifest.missing_claim_ids).toEqual([]);
  expect(evidenceManifest.entries).toHaveLength(5);
  expect(evidenceManifest.entries.every((entry) => !Object.hasOwn(entry, 'content'))).toBe(true);
  expect(fs.readFileSync(path.join(sandbox.repoRoot, 'docs/reports/runtime-e2e.md'), 'utf8'))
    .toContain('## Evidence ledger');
  workflow.runQa({
    missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot, runner: greenRunner, final: true,
  });
  return ['scripts/ai-orchestrator/runtime-target.cjs', 'docs/reports/runtime-e2e.md'];
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('Phase 1 Mission Intake', () => {
  it('is idempotent and rejects changed payloads, semantic duplicates, and a second active Mission', () => {
    const sandbox = createSandbox();
    const first = core.intakeMission({ mission: mission(), stateDir: sandbox.stateDir });
    expect(first.idempotent).toBe(false);
    expect(core.intakeMission({ mission: mission(), stateDir: sandbox.stateDir }).idempotent).toBe(true);

    expect(() => core.intakeMission({
      mission: mission({ objective: 'Changed payload.' }),
      stateDir: sandbox.stateDir,
    })).toThrowError(expect.objectContaining({ code: 'MISSION_CONFLICT' }));

    expect(() => core.intakeMission({
      mission: mission({ mission_id: 'MISSION-RUNTIME-DUPLICATE' }),
      stateDir: sandbox.stateDir,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_MISSION' }));

    expect(() => core.intakeMission({
      mission: mission({ mission_id: 'MISSION-RUNTIME-SECOND', objective: 'A distinct second Mission.' }),
      stateDir: sandbox.stateDir,
    })).toThrowError(expect.objectContaining({ code: 'ACTIVE_MISSION_EXISTS' }));
  });

  it('durably rejects an expired Mission and does not reserve the active slot', () => {
    const sandbox = createSandbox();
    expect(() => core.intakeMission({
      mission: mission({ expires_at: '2020-01-01T00:00:00.000Z' }),
      stateDir: sandbox.stateDir,
      now: new Date('2026-07-12T00:00:00.000Z'),
    })).toThrowError(expect.objectContaining({ code: 'MISSION_EXPIRED' }));
    const state = core.loadState(sandbox.stateDir);
    expect(state.active_mission_id).toBeNull();
    expect(state.missions['MISSION-RUNTIME-E2E'].state).toBe('expired');
  });

  it('requires an explicit human Mission Approval', () => {
    const sandbox = createSandbox();
    core.intakeMission({ mission: mission(), stateDir: sandbox.stateDir });
    expect(() => workflow.prepareMission({
      missionId: 'MISSION-RUNTIME-E2E',
      stateDir: sandbox.stateDir,
      repoRoot: sandbox.repoRoot,
      includePatterns: ['README.md'],
      grepQueries: ['orchestrator'],
    })).toThrowError(expect.objectContaining({ code: 'MISSION_NOT_APPROVED' }));
  });
});

describe('Phases 2 and 3 Context Builder and Codex handoff', () => {
  it('computes hashes and sizes, redacts secret-like evidence, and emits an exact-scope plan', () => {
    const sandbox = createSandbox();
    const prepared = prepareApprovedMission(sandbox);
    expect(prepared.contextPack.size_metadata.file_count).toBe(2);
    expect(prepared.contextPack.size_metadata.total_bytes).toBeGreaterThan(0);
    expect(prepared.contextPack.file_manifest.every((file) => /^[0-9a-f]{64}$/.test(file.sha256))).toBe(true);
    expect(prepared.contextPack.secret_redaction.status).toBe('redacted');
    expect(JSON.stringify(prepared.contextPack)).not.toContain('fake-placeholder-value');
    expect(prepared.plan.exact_write_scope).toEqual(mission().allowed_paths);
    expect(prepared.handoff.role).toBe('Codex Implementer');
    expect(core.loadState(sandbox.stateDir).missions['MISSION-RUNTIME-E2E'].state).toBe('planned');
  });

  it('rejects oversized context and every sensitive write path', () => {
    const sandbox = createSandbox();
    expect(() => contextBuilder.buildContextPack({
      mission: mission(),
      repoRoot: sandbox.repoRoot,
      includePatterns: ['README.md'],
      grepQueries: ['orchestrator'],
      maxBytes: 5,
    })).toThrowError(expect.objectContaining({ code: 'CONTEXT_SIZE_LIMIT' }));

    for (const sensitivePath of ['src/auth/login.ts', 'supabase/RLS/policy.ts', 'db/schema.sql', 'migrations/1.ts', 'vercel.json', 'production-data/users.json', 'config/credentials/key.txt']) {
      expect(() => core.assertPathsAllowed([sensitivePath], mission())).toThrowError(expect.objectContaining({ code: 'SCOPE_VIOLATION' }));
    }
  });
});

describe('Phases 4 and 5 Review, QA, approval, report, and Draft PR', () => {
  it('keeps the Agent Result schema compatible with strict structured output', () => {
    const schema = core.readJson(path.join(process.cwd(), 'scripts', 'ai-orchestrator', 'schemas', 'agent-result-output.schema.json'));
    const allowedKeywords = new Set(['$schema', 'title', 'type', 'additionalProperties', 'required', 'properties', 'items', 'enum']);
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (!Array.isArray(node)) {
        for (const key of Object.keys(node)) {
          if (key !== 'properties' || node.type !== 'object') expect(allowedKeywords.has(key) || !Object.hasOwn(node, 'type')).toBe(true);
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === 'properties') {
          for (const propertySchema of Object.values(value)) visit(propertySchema);
        } else if (key === 'items') {
          visit(value);
        }
      }
    };
    visit(schema);
  });

  it('invokes real-agent adapters with bounded Codex sandboxes and structured output', () => {
    const sandbox = createSandbox();
    prepareApprovedMission(sandbox);
    fs.writeFileSync(path.join(sandbox.repoRoot, 'scripts', 'ai-orchestrator', 'runtime-target.cjs'), 'module.exports = { target: "adapter" };\n', 'utf8');
    const calls = [];
    const runner = (executable, args, options) => {
      calls.push({ executable, args, input: options.input });
      const role = args.includes('workspace-write') ? 'Codex Implementer' : 'Independent Reviewer';
      fs.writeFileSync(options.outputFile, JSON.stringify(agentResult({ role })), 'utf8');
      return { status: 0, stdout: '', stderr: '' };
    };
    codexAdapter.runCodexImplementer({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot,
      executionId: 'codex-impl-001', estimatedCostUsd: 0.2, runner,
    });
    codexAdapter.runCodexReviewer({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot,
      executionId: 'codex-review-001', estimatedCostUsd: 0.2, runner,
    });
    expect(calls[0].args).toContain('workspace-write');
    expect(calls[1].args).toContain('read-only');
    expect(calls.flatMap((call) => call.args)).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(calls.every((call) => call.args.includes('--output-schema'))).toBe(true);
    expect(calls[0].input).toContain('Do not commit');
    expect(core.loadState(sandbox.stateDir).missions['MISSION-RUNTIME-E2E'].state).toBe('checking');
  });

  it('enforces reviewer independence and one correction pass', () => {
    const sandbox = createSandbox();
    prepareApprovedMission(sandbox);
    fs.writeFileSync(path.join(sandbox.repoRoot, 'scripts', 'ai-orchestrator', 'runtime-target.cjs'), 'module.exports = { target: "implemented" };\n', 'utf8');
    workflow.submitImplementerResult({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot, executionId: 'same-execution',
      result: agentResult({ role: 'Codex Implementer' }),
    });
    expect(() => workflow.submitReviewerResult({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, executionId: 'same-execution',
      result: agentResult({ role: 'Independent Reviewer' }),
    })).toThrowError(expect.objectContaining({ code: 'REVIEW_NOT_INDEPENDENT' }));

    workflow.submitReviewerResult({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, executionId: 'review-001',
      result: agentResult({ role: 'Independent Reviewer', status: 'CHANGES_REQUIRED' }),
    });
    expect(core.loadState(sandbox.stateDir).missions['MISSION-RUNTIME-E2E'].correction_passes).toBe(1);

    fs.writeFileSync(path.join(sandbox.repoRoot, 'scripts', 'ai-orchestrator', 'runtime-target.cjs'), 'module.exports = { target: "corrected" };\n', 'utf8');
    workflow.submitImplementerResult({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot, executionId: 'impl-002',
      result: agentResult({ role: 'Codex Implementer' }),
    });
    workflow.submitReviewerResult({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, executionId: 'review-002',
      result: agentResult({ role: 'Independent Reviewer', status: 'CHANGES_REQUIRED' }),
    });
    const record = core.loadState(sandbox.stateDir).missions['MISSION-RUNTIME-E2E'];
    expect(record.state).toBe('blocked');
    expect(record.block_reason).toBe('maximum_correction_passes_exceeded');
  });

  it('blocks a Mission when cumulative agent cost exceeds its budget', () => {
    const sandbox = createSandbox();
    prepareApprovedMission(sandbox);
    fs.writeFileSync(path.join(sandbox.repoRoot, 'scripts', 'ai-orchestrator', 'runtime-target.cjs'), 'module.exports = { target: "expensive" };\n', 'utf8');
    expect(() => workflow.submitImplementerResult({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot,
      executionId: 'impl-expensive', costUsd: 1.01,
      result: agentResult({ role: 'Codex Implementer' }),
    })).toThrowError(expect.objectContaining({ code: 'BUDGET_EXCEEDED' }));
    expect(core.loadState(sandbox.stateDir).missions['MISSION-RUNTIME-E2E'].state).toBe('budget_exceeded');
  });

  it('detects undeclared worktree writes instead of trusting Agent Result', () => {
    const sandbox = createSandbox();
    prepareApprovedMission(sandbox);
    fs.mkdirSync(path.join(sandbox.repoRoot, 'src', 'auth'), { recursive: true });
    fs.writeFileSync(path.join(sandbox.repoRoot, 'src', 'auth', 'escape.ts'), 'export const escaped = true;\n', 'utf8');
    expect(() => workflow.submitImplementerResult({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot,
      executionId: 'impl-escape',
      result: agentResult({ role: 'Codex Implementer', changedFiles: [] }),
    })).toThrowError(expect.objectContaining({ code: 'SCOPE_VIOLATION' }));
    expect(core.loadState(sandbox.stateDir).missions['MISSION-RUNTIME-E2E'].state).toBe('scope_violation');
  });

  it('captures only the first complete red QA block', () => {
    const sandbox = createSandbox();
    prepareApprovedMission(sandbox);
    submitGreenAgents(sandbox);
    const calls = [];
    const result = workflow.runQa({
      missionId: 'MISSION-RUNTIME-E2E',
      stateDir: sandbox.stateDir,
      repoRoot: sandbox.repoRoot,
      runner(command, args) {
        calls.push([command, ...args].join(' '));
        if (command === 'pnpm' && args[1] === 'lint') return { status: 1, stdout: 'lint output', stderr: 'exact lint error' };
        return greenRunner();
      },
    });
    expect(result.green).toBe(false);
    expect(result.first_error).toEqual({ command: 'pnpm run lint', error_block: 'lint output\nexact lint error' });
    expect(calls).toEqual(['pnpm run typecheck', 'pnpm run lint']);
  });

  it('blocks Agent Report creation when a required evidence row is missing', () => {
    const sandbox = createSandbox();
    prepareApprovedMission(sandbox);
    submitGreenAgents(sandbox);
    workflow.runQa({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot, runner: greenRunner,
    });
    workflow.approveChange({ missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, actor: 'human-owner' });
    const state = core.loadState(sandbox.stateDir);
    delete state.missions['MISSION-RUNTIME-E2E'].agent_executions.reviewer;
    core.saveState(sandbox.stateDir, state);

    expect(() => workflow.generateReport({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot,
      reportPath: 'docs/reports/runtime-e2e.md',
    })).toThrowError(expect.objectContaining({ code: 'EVIDENCE_LEDGER_INCOMPLETE' }));
    expect(fs.existsSync(path.join(sandbox.repoRoot, 'docs/reports/runtime-e2e.md'))).toBe(false);
  });

  it('runs the complete green path and executes only guarded Draft PR commands', () => {
    const sandbox = createSandbox();
    const selectedFiles = preparePublishableMission(sandbox);
    const preview = publisher.publishDraft({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot,
      selectedFiles, commitMessage: 'feat: run guarded pilot', prTitle: 'Guarded pilot',
      branch: 'agent/runtime-pilot', dirtyFiles: selectedFiles,
    });
    expect(preview.executed).toBe(false);
    expect(preview.plan.draft).toBe(true);
    expect(preview.plan.merge).toBe(false);
    expect(preview.plan.deploy).toBe(false);

    const calls = [];
    const staged = new Set();
    const executed = publisher.publishDraft({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot,
      selectedFiles, commitMessage: 'feat: run guarded pilot', prTitle: 'Guarded pilot',
      branch: 'agent/runtime-pilot', dirtyFiles: selectedFiles, execute: true,
      runner(command, args) {
        calls.push([command, ...args]);
        if (command === 'git' && args[0] === 'diff' && args.includes('--name-only')) return [...staged].join('\n');
        if (command === 'git' && args[0] === 'add') {
          for (const file of args.slice(args.indexOf('--') + 1)) staged.add(file);
        }
        return command === 'gh' ? 'https://github.test/pull/1' : '';
      },
    });
    expect(executed.url).toBe('https://github.test/pull/1');
    expect(core.loadState(sandbox.stateDir).missions['MISSION-RUNTIME-E2E'].state).toBe('draft_pr');
    expect(calls.some((call) => call.includes('merge') || call.includes('deploy'))).toBe(false);
    expect(calls.at(-1).slice(0, 3)).toEqual(['gh', 'pr', 'create']);
    expect(calls.at(-1)).toContain('--draft');
    const archived = core.closeMission({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, actor: 'human-owner', action: 'archive',
    });
    expect(archived.state).toBe('archived');
    expect(core.loadState(sandbox.stateDir).active_mission_id).toBeNull();
  });

  it('blocks unrelated pre-staged files before git add and never commits, pushes, or creates a PR', () => {
    const sandbox = createSandbox();
    const selectedFiles = preparePublishableMission(sandbox);
    const calls = [];
    expect(() => publisher.publishDraft({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot,
      selectedFiles, commitMessage: 'feat: run guarded pilot', prTitle: 'Guarded pilot',
      branch: 'agent/runtime-pilot', dirtyFiles: selectedFiles, execute: true,
      runner(command, args) {
        calls.push([command, ...args]);
        if (command === 'git' && args[0] === 'diff' && args.includes('--name-only')) return 'unrelated-pre-staged.txt';
        return '';
      },
    })).toThrowError(expect.objectContaining({ code: 'PREEXISTING_STAGED_FILES' }));
    expect(calls.some((call) => call[1] === 'add' || call[1] === 'commit' || call[1] === 'push' || call[0] === 'gh')).toBe(false);
  });

  it('blocks a post-add staged selection mismatch before commit, push, or PR creation', () => {
    const sandbox = createSandbox();
    const selectedFiles = preparePublishableMission(sandbox);
    const calls = [];
    let stagedReadCount = 0;
    expect(() => publisher.publishDraft({
      missionId: 'MISSION-RUNTIME-E2E', stateDir: sandbox.stateDir, repoRoot: sandbox.repoRoot,
      selectedFiles, commitMessage: 'feat: run guarded pilot', prTitle: 'Guarded pilot',
      branch: 'agent/runtime-pilot', dirtyFiles: selectedFiles, execute: true,
      runner(command, args) {
        calls.push([command, ...args]);
        if (command === 'git' && args[0] === 'diff' && args.includes('--name-only')) {
          stagedReadCount += 1;
          return stagedReadCount === 1 ? '' : [...selectedFiles, 'unrelated-after-add.txt'].join('\n');
        }
        return '';
      },
    })).toThrowError(expect.objectContaining({ code: 'STAGED_SELECTION_MISMATCH' }));
    expect(calls.some((call) => call[1] === 'commit' || call[1] === 'push' || call[0] === 'gh')).toBe(false);
  });
});
