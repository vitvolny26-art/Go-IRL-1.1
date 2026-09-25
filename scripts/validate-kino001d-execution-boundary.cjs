'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXECUTION_MODE = 'read_only_adapter_bridge';
const EXPECTED_READY = new Map([
  ['uk_kyiv_planetakino', 'planeta_kino_ua'],
  ['cs_prague_cinestar', 'cinestar_cz'],
  ['cs_prague_premiere', 'premiere_cz'],
]);

function buildExecutionPlan(workerPreflight, workerSource) {
  const allowlistMatch = workerSource.match(/export const kino001bWorkerReadySourceIds = \[([\s\S]*?)\] as const;/);
  if (!allowlistMatch) throw new Error('worker_allowlist_missing');
  const allowlist = [...allowlistMatch[1].matchAll(/["']([^"']+)["']/g)].map(match => match[1]).sort();
  const ready = workerPreflight.sources
    .filter(source => source.status === 'worker_ready')
    .map(source => ({ source_id: source.source_id, adapter_key: source.adapter_key }))
    .sort((a, b) => a.source_id.localeCompare(b.source_id));
  const expected = [...EXPECTED_READY].map(([source_id, adapter_key]) => ({ source_id, adapter_key }))
    .sort((a, b) => a.source_id.localeCompare(b.source_id));

  if (JSON.stringify(ready) !== JSON.stringify(expected)) throw new Error('worker_preflight_execution_mismatch');
  if (JSON.stringify(allowlist) !== JSON.stringify(expected.map(source => source.source_id).sort())) {
    throw new Error('worker_allowlist_execution_mismatch');
  }

  return {
    mode: EXECUTION_MODE,
    production_writes: false,
    credentials_required: false,
    schedule_activation: false,
    sources: ready.map(source => ({
      ...source,
      operation: 'fetch_parse_normalize_validate',
      persistence: 'none',
    })),
  };
}

function validateExecutionBoundary({ workflow, workerPreflight, workerSource, adapterSources }) {
  const plan = buildExecutionPlan(workerPreflight, workerSource);
  if (workflow.active !== false) throw new Error('workflow_active');
  const schedule = workflow.nodes.find(node => node.name === 'Daily Schedule');
  if (!schedule || schedule.disabled !== true) throw new Error('schedule_not_disabled');
  if (workflow.nodes.some(node => node.credentials && Object.keys(node.credentials).length)) throw new Error('credential_binding');
  if (workflow.nodes.some(node => /googleSheets|postgres|supabase/i.test(node.type))) throw new Error('write_node');

  for (const source of plan.sources) {
    const adapterSource = adapterSources[source.adapter_key] || '';
    if (!adapterSource.includes('async fetchSnapshot(source)')) throw new Error(`adapter_fetch_missing:${source.adapter_key}`);
    if (!adapterSource.includes('parseSnapshot(source, payload)')) throw new Error(`adapter_parse_missing:${source.adapter_key}`);
  }

  return plan;
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n/workflows/kino001d-17-source-orchestration.json')));
  const workerPreflight = JSON.parse(fs.readFileSync(path.join(root, 'evidence/worker-adapter-preflight.json')));
  const workerSource = fs.readFileSync(path.join(root, 'api/_shared/cinema-ingestion-worker.ts'), 'utf8');
  const adapterSources = {
    planeta_kino_ua: fs.readFileSync(path.join(root, 'api/_shared/cinema-adapters/planeta-kino-ua.ts'), 'utf8'),
    cinestar_cz: fs.readFileSync(path.join(root, 'api/_shared/cinema-adapters/cinestar-cz.ts'), 'utf8'),
    premiere_cz: fs.readFileSync(path.join(root, 'api/_shared/cinema-adapters/premiere-cz.ts'), 'utf8'),
  };
  const plan = validateExecutionBoundary({ workflow, workerPreflight, workerSource, adapterSources });
  console.log(`AFISHI005D execution boundary valid: ${plan.sources.length} read-only adapter sources; production writes disabled; credentials not required; schedule disabled`);
}

module.exports = { buildExecutionPlan, validateExecutionBoundary, EXECUTION_MODE };
