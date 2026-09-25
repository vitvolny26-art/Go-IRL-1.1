'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate, extractMatrix } = require('./validate-kino001d-orchestration.cjs');

const root = path.resolve(__dirname, '..');
const load = name => JSON.parse(fs.readFileSync(path.join(root, name)));
const workflow = load('n8n/workflows/kino001d-17-source-orchestration.json');
const preflight = load('evidence/source-preflight.json');
const workerPreflight = load('evidence/worker-adapter-preflight.json');
const workerSource = fs.readFileSync(path.join(root, 'api/_shared/cinema-ingestion-worker.ts'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

test('validates the 17-source fail-closed orchestration contract', () => {
  assert.deepEqual(validate(workflow, preflight, workerPreflight, workerSource), {total:17,worker_ready:3,fail_closed:14});
  const matrix = extractMatrix(workflow);
  assert.equal(new Set(matrix.map(row => row[0])).size, 17);
});

test('keeps every unproven source fail-closed with its evidence reason', () => {
  const matrix = extractMatrix(workflow);
  const byId = new Map(matrix.map(row => [row[0], row]));
  for (const source of preflight.sources.filter(source => source.status === 'fail_closed')) {
    assert.equal(byId.get(source.source_id)[3], 'fail_closed');
    assert.equal(byId.get(source.source_id)[4], source.reason);
    assert.equal(byId.get(source.source_id)[5], null);
  }
});

test('rejects accidental dispatch of a fail-closed source', () => {
  const changed = clone(workflow);
  const node = changed.nodes.find(n => n.name === 'Create Run & 17 Source Matrix');
  node.parameters.jsCode = node.parameters.jsCode.replace(
    '["en_london_vue","EN","London","fail_closed","worker_adapter_missing",null]',
    '["en_london_vue","EN","London","worker_ready",null,"vue_uk"]'
  );
  assert.throws(() => validate(changed, preflight, workerPreflight), /worker_source_not_parser_ready:en_london_vue/);
});

test('rejects schedule activation and production write nodes', () => {
  const scheduled = clone(workflow);
  scheduled.nodes.find(n => n.name === 'Daily Schedule').disabled = false;
  assert.throws(() => validate(scheduled, preflight, workerPreflight), /schedule_not_disabled/);

  const writer = clone(workflow);
  writer.nodes.push({name:'Forbidden Writer',type:'n8n-nodes-base.googleSheets',parameters:{}});
  assert.throws(() => validate(writer, preflight, workerPreflight), /write_node/);
});

test('requires the aggregate completion contract to preserve all source outcomes', () => {
  const changed = clone(workflow);
  changed.nodes.find(n => n.name === 'Aggregate Run Summary').parameters.jsCode = 'return $input.all();';
  assert.throws(() => validate(changed, preflight, workerPreflight), /aggregate_completion_contract_missing/);
});


test('keeps orchestration worker-ready sources identical to the worker allowlist', () => {
  const changedWorker = workerSource.replace('  "cs_prague_premiere",\n', '  "cs_prague_premiere",\n  "sk_bratislava_cinemax",\n');
  assert.throws(() => validate(workflow, preflight, workerPreflight, changedWorker), /worker_allowlist_matrix_mismatch/);
});

test('requires an explicit non-live Snapshot Output contract', () => {
  const changed = clone(workflow);
  changed.nodes.find(n => n.name === 'Snapshot Output').parameters.jsCode = 'return $input.all();';
  assert.throws(() => validate(changed, preflight, workerPreflight, workerSource), /snapshot_output_contract_missing/);
});
