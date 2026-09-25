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

function buildSourceExecutionPlan(sourceConfig, workerPreflight, workerSource) {
  const basePlan = buildExecutionPlan(workerPreflight, workerSource);
  if (sourceConfig?.mode !== 'read_only_source_config' || sourceConfig?.production_writes !== false) {
    throw new Error('source_config_mode');
  }
  const configured = new Map((sourceConfig.sources || []).map(source => [source.source_id, source]));
  if (configured.size !== EXPECTED_READY.size) throw new Error('source_config_count');

  return {
    ...basePlan,
    sources: basePlan.sources.map(source => {
      const config = configured.get(source.source_id);
      if (!config || config.adapter_key !== source.adapter_key) throw new Error(`source_config_identity:${source.source_id}`);
      if (config.status === 'executable') {
        if (typeof config.official_source_url !== 'string') throw new Error(`source_url_missing:${source.source_id}`);
        let url;
        try { url = new URL(config.official_source_url); } catch { throw new Error(`source_url_invalid:${source.source_id}`); }
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`source_url_protocol:${source.source_id}`);
        return { ...source, execution_status: 'executable', official_source_url: config.official_source_url };
      }
      if (config.status === 'fail_closed' && config.official_source_url === null && config.reason === 'official_source_url_unverified') {
        return { ...source, execution_status: 'fail_closed', official_source_url: null, reason: config.reason };
      }
      throw new Error(`source_config_status:${source.source_id}`);
    }),
  };
}

function validateExecutionBoundary({ workflow, workerPreflight, workerSource, adapterSources, sourceConfig }) {
  const plan = sourceConfig
    ? buildSourceExecutionPlan(sourceConfig, workerPreflight, workerSource)
    : buildExecutionPlan(workerPreflight, workerSource);
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
  const sourceConfig = JSON.parse(fs.readFileSync(path.join(root, 'evidence/afishi005d-source-config.json')));
  const workerSource = fs.readFileSync(path.join(root, 'api/_shared/cinema-ingestion-worker.ts'), 'utf8');
  const adapterSources = {
    planeta_kino_ua: fs.readFileSync(path.join(root, 'api/_shared/cinema-adapters/planeta-kino-ua.ts'), 'utf8'),
    cinestar_cz: fs.readFileSync(path.join(root, 'api/_shared/cinema-adapters/cinestar-cz.ts'), 'utf8'),
    premiere_cz: fs.readFileSync(path.join(root, 'api/_shared/cinema-adapters/premiere-cz.ts'), 'utf8'),
  };
  const plan = validateExecutionBoundary({ workflow, workerPreflight, workerSource, adapterSources, sourceConfig });
  const executable = plan.sources.filter(source => source.execution_status === 'executable').length;
  const failClosed = plan.sources.filter(source => source.execution_status === 'fail_closed').length;
  console.log(`AFISHI005D execution boundary valid: ${executable} source executable; ${failClosed} source URLs fail-closed; production writes disabled; schedule disabled`);
}

module.exports = { buildExecutionPlan, buildSourceExecutionPlan, validateExecutionBoundary, EXECUTION_MODE };
