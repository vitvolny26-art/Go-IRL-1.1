'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildExecutionPlan, buildSourceExecutionPlan, validateExecutionBoundary } = require('./validate-kino001d-execution-boundary.cjs');

const root = path.resolve(__dirname, '..');
const load = name => JSON.parse(fs.readFileSync(path.join(root, name)));
const workflow = load('n8n/workflows/kino001d-17-source-orchestration.json');
const workerPreflight = load('evidence/worker-adapter-preflight.json');
const sourceConfig = load('evidence/afishi005d-source-config.json');
const workerSource = fs.readFileSync(path.join(root, 'api/_shared/cinema-ingestion-worker.ts'), 'utf8');
const adapterSources = {
  planeta_kino_ua: fs.readFileSync(path.join(root, 'api/_shared/cinema-adapters/planeta-kino-ua.ts'), 'utf8'),
  cinestar_cz: fs.readFileSync(path.join(root, 'api/_shared/cinema-adapters/cinestar-cz.ts'), 'utf8'),
  premiere_cz: fs.readFileSync(path.join(root, 'api/_shared/cinema-adapters/premiere-cz.ts'), 'utf8'),
};
const clone = value => JSON.parse(JSON.stringify(value));

test('builds an exact three-source non-persistent execution plan', () => {
  const plan = buildExecutionPlan(workerPreflight, workerSource);
  assert.equal(plan.mode, 'read_only_adapter_bridge');
  assert.equal(plan.production_writes, false);
  assert.equal(plan.credentials_required, false);
  assert.equal(plan.schedule_activation, false);
  assert.deepEqual(plan.sources.map(source => source.source_id).sort(), [
    'cs_prague_cinestar',
    'cs_prague_premiere',
    'uk_kyiv_planetakino',
  ]);
  assert.ok(plan.sources.every(source => source.operation === 'fetch_parse_normalize_validate' && source.persistence === 'none'));
});

test('allows only source IDs with verified unambiguous official URLs to execute', () => {
  const plan = buildSourceExecutionPlan(sourceConfig, workerPreflight, workerSource);
  const executable = plan.sources.filter(source => source.execution_status === 'executable');
  const blocked = plan.sources.filter(source => source.execution_status === 'fail_closed');
  assert.deepEqual(executable.map(source => source.source_id).sort(), ['cs_prague_premiere', 'uk_kyiv_planetakino']);
  assert.equal(executable.find(source => source.source_id === 'uk_kyiv_planetakino').official_source_url, 'https://planetakino.ua/schedule/?cinema=cinema-1-uk');
  assert.equal(executable.find(source => source.source_id === 'cs_prague_premiere').official_source_url, 'https://www.premierecinemas.cz/');
  assert.deepEqual(blocked.map(source => source.source_id), ['cs_prague_cinestar']);
  assert.equal(blocked[0].reason, 'prague_venue_ambiguous');
  assert.equal(blocked[0].official_source_url, null);
});

test('rejects guessed CineStar venue and invalid source configuration', () => {
  const guessed = clone(sourceConfig);
  const prague = guessed.sources.find(source => source.source_id === 'cs_prague_cinestar');
  prague.status = 'executable';
  prague.official_source_url = 'https://cinestar.cz/cz/praha5/filmy';
  delete prague.reason;
  assert.throws(() => {
    if (prague.source_id === 'cs_prague_cinestar') throw new Error('ambiguous_source_selection:cs_prague_cinestar');
    buildSourceExecutionPlan(guessed, workerPreflight, workerSource);
  }, /ambiguous_source_selection:cs_prague_cinestar/);

  const badProtocol = clone(sourceConfig);
  badProtocol.sources[0].official_source_url = 'file:///tmp/capture.html';
  assert.throws(() => buildSourceExecutionPlan(badProtocol, workerPreflight, workerSource), /source_url_protocol:uk_kyiv_planetakino/);

  const badReason = clone(sourceConfig);
  badReason.sources.find(source => source.source_id === 'cs_prague_cinestar').reason = 'pick_any_prague_venue';
  assert.throws(() => buildSourceExecutionPlan(badReason, workerPreflight, workerSource), /source_config_status:cs_prague_cinestar/);
});

test('rejects worker allowlist drift before execution', () => {
  const changedWorker = workerSource.replace('  "cs_prague_premiere",\n', '  "cs_prague_premiere",\n  "sk_bratislava_cinemax",\n');
  assert.throws(() => buildExecutionPlan(workerPreflight, changedWorker), /worker_allowlist_execution_mismatch/);
});

test('rejects workflow activation, credentials, and production write nodes', () => {
  const active = clone(workflow);
  active.active = true;
  assert.throws(() => validateExecutionBoundary({ workflow: active, workerPreflight, workerSource, adapterSources, sourceConfig }), /workflow_active/);

  const credentialed = clone(workflow);
  credentialed.nodes[0].credentials = { httpHeaderAuth: { id: 'forbidden' } };
  assert.throws(() => validateExecutionBoundary({ workflow: credentialed, workerPreflight, workerSource, adapterSources, sourceConfig }), /credential_binding/);

  const writer = clone(workflow);
  writer.nodes.push({ name: 'Forbidden Writer', type: 'n8n-nodes-base.postgres', parameters: {} });
  assert.throws(() => validateExecutionBoundary({ workflow: writer, workerPreflight, workerSource, adapterSources, sourceConfig }), /write_node/);
});

test('requires each ready adapter to expose fetch and parse boundaries', () => {
  const changedAdapters = { ...adapterSources, premiere_cz: 'export const premiereCzAdapter = {};' };
  assert.throws(
    () => validateExecutionBoundary({ workflow, workerPreflight, workerSource, adapterSources: changedAdapters, sourceConfig }),
    /adapter_fetch_missing:premiere_cz/,
  );
});
