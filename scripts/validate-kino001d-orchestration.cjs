'use strict';
const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_IDS = [
  'ru_moscow_karo','ru_moscow_cinemapark','ru_moscow_kinomax',
  'uk_kyiv_multiplex','uk_kyiv_planetakino','uk_kyiv_oskar',
  'cs_prague_cinemacity','cs_prague_cinestar','cs_prague_premiere',
  'en_london_odeon','en_london_vue','en_london_cineworld',
  'pl_warsaw_cinemacity','pl_warsaw_multikino','pl_warsaw_helios',
  'sk_bratislava_cinemacity','sk_bratislava_cinemax'
].sort();

function extractMatrix(workflow) {
  const node = workflow.nodes.find(n => n.name === 'Create Run & 17 Source Matrix');
  if (!node) throw new Error('matrix_node_missing');
  const code = node.parameters?.jsCode || '';
  const match = code.match(/const sources = (\[[\s\S]*?\]);\nreturn sources/);
  if (!match) throw new Error('matrix_literal_missing');
  return JSON.parse(match[1]);
}

function validate(workflow, preflight, workerPreflight, workerSource = '') {
  if (workflow.active !== false) throw new Error('workflow_active');
  const manual = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.manualTrigger');
  if (manual.length !== 1 || manual[0].disabled === true) throw new Error('manual_trigger_missing');
  const schedules = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.scheduleTrigger');
  if (schedules.length !== 1 || schedules[0].disabled !== true) throw new Error('schedule_not_disabled');
  if (workflow.nodes.some(n => /webhook/i.test(n.type))) throw new Error('webhook_present');
  if (workflow.nodes.some(n => n.credentials && Object.keys(n.credentials).length)) throw new Error('credential_binding');
  if (workflow.nodes.some(n => /googleSheets|postgres|supabase/i.test(n.type))) throw new Error('write_node');

  const matrix = extractMatrix(workflow);
  if (matrix.length !== 17) throw new Error('matrix_count');
  const ids = matrix.map(row => row[0]).sort();
  if (JSON.stringify(ids) !== JSON.stringify(EXPECTED_IDS)) throw new Error('source_id_matrix');
  if (new Set(ids).size !== 17) throw new Error('duplicate_source_id');

  const expectedById = new Map(preflight.sources.map(source => [source.source_id, source]));
  const workerById = new Map(workerPreflight.sources.map(source => [source.source_id, source]));
  let ready = 0;
  let closed = 0;
  for (const [sourceId, language, city, status, reason, adapterKey] of matrix) {
    const source = expectedById.get(sourceId);
    if (!source) throw new Error(`unknown_source:${sourceId}`);
    if (language !== source.language || city !== source.city) throw new Error(`source_identity_mismatch:${sourceId}`);
    if (status === 'worker_ready') {
      ready += 1;
      if (source.status !== 'parser_ready') throw new Error(`worker_source_not_parser_ready:${sourceId}`);
      const worker = workerById.get(sourceId);
      if (worker?.status !== 'worker_ready' || worker.adapter_key !== adapterKey || source.adapter_key !== adapterKey) throw new Error(`worker_contract_mismatch:${sourceId}`);
      if (reason !== null) throw new Error(`worker_reason_present:${sourceId}`);
    } else if (status === 'fail_closed') {
      closed += 1;
      if (source.status !== 'fail_closed' || source.reason !== reason) throw new Error(`fail_closed_reason_mismatch:${sourceId}`);
      if (adapterKey !== null) throw new Error(`fail_closed_adapter_present:${sourceId}`);
    } else {
      throw new Error(`invalid_status:${sourceId}`);
    }
  }
  if (ready !== 3 || closed !== 14) throw new Error(`coverage:${ready}/${closed}`);

  if (workerSource) {
    const allowlistMatch = workerSource.match(/export const kino001bWorkerReadySourceIds = \[([\s\S]*?)\] as const;/);
    if (!allowlistMatch) throw new Error('worker_allowlist_missing');
    const workerAllowlist = [...allowlistMatch[1].matchAll(/["']([^"']+)["']/g)].map(match => match[1]).sort();
    const matrixReady = matrix.filter(row => row[3] === 'worker_ready').map(row => row[0]).sort();
    if (JSON.stringify(workerAllowlist) !== JSON.stringify(matrixReady)) throw new Error('worker_allowlist_matrix_mismatch');
  }

  const outcome = workflow.nodes.find(n => n.name === 'Build Source Outcome');
  const aggregate = workflow.nodes.find(n => n.name === 'Aggregate Run Summary');
  const bridge = workflow.nodes.find(n => n.name === 'Read-only Adapter Bridge');
  const snapshot = workflow.nodes.find(n => n.name === 'Snapshot Output');
  if (!outcome || !aggregate || !bridge || !snapshot) throw new Error('orchestration_nodes_missing');
  if (bridge.type !== 'n8n-nodes-base.ssh') throw new Error('read_only_bridge_type');
  const bridgeCode = bridge.parameters?.command || '';
  for (const token of ["cd /opt/go-irl/cinema-worker", "planeta-kino-ua.js", "premiere-cz.js", "production_writes: false", "schedule_activation: false", "persistence: 'none'", "prague_venue_ambiguous"]) {
    if (!bridgeCode.includes(token)) throw new Error('read_only_bridge_contract_missing');
  }
  const outcomeCode = outcome.parameters?.jsCode || '';
  if (!outcomeCode.includes("operation:'fetch_parse_normalize_validate'")) throw new Error('dispatch_intent_contract_missing');
  if (!outcomeCode.includes("outcome:'fail_closed'")) throw new Error('fail_closed_outcome_missing');
  if (!outcomeCode.includes('dispatch_intent:null')) throw new Error('fail_closed_dispatch_not_blocked');
  const aggregateCode = aggregate.parameters?.jsCode || '';
  if (!aggregateCode.includes('rows.length === 17') || !aggregateCode.includes('worker_ready === 3') || !aggregateCode.includes('fail_closed === 14')) throw new Error('aggregate_completion_contract_missing');
  const snapshotCode = snapshot.parameters?.jsCode || '';
  for (const token of ["mode:'read_only_adapter_bridge'",'live_execution:true','adapter_execution:true','worker_execution:false','production_writes:false','schedule_activation:false',"persistence:'none'","allowed_sheets:['Daily_Movies','Daily_Screenings','Daily_Runs']",'run_date,','Daily_Screenings:screenings.sort']) {
    if (!snapshotCode.includes(token)) throw new Error('snapshot_output_contract_missing');
  }

  for (const trigger of ['Manual Trigger','Daily Schedule']) {
    const edges = workflow.connections?.[trigger]?.main?.[0] || [];
    if (!edges.some(edge => edge.node === 'Create Run & 17 Source Matrix')) throw new Error(`trigger_not_connected:${trigger}`);
  }
  const matrixEdges = workflow.connections?.['Create Run & 17 Source Matrix']?.main?.[0] || [];
  if (!matrixEdges.some(edge => edge.node === 'Build Source Outcome')) throw new Error('matrix_not_connected');
  const outcomeEdges = workflow.connections?.['Build Source Outcome']?.main?.[0] || [];
  if (!outcomeEdges.some(edge => edge.node === 'Aggregate Run Summary')) throw new Error('outcome_not_connected');
  const aggregateEdges = workflow.connections?.['Aggregate Run Summary']?.main?.[0] || [];
  if (!aggregateEdges.some(edge => edge.node === 'Read-only Adapter Bridge')) throw new Error('read_only_bridge_not_connected');
  const bridgeEdges = workflow.connections?.['Read-only Adapter Bridge']?.main?.[0] || [];
  if (!bridgeEdges.some(edge => edge.node === 'Snapshot Output')) throw new Error('snapshot_output_not_connected');

  return {total:matrix.length,worker_ready:ready,fail_closed:closed};
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n/workflows/kino001d-17-source-orchestration.json')));
  const preflight = JSON.parse(fs.readFileSync(path.join(root, 'evidence/source-preflight.json')));
  const workerPreflight = JSON.parse(fs.readFileSync(path.join(root, 'evidence/worker-adapter-preflight.json')));
  const workerSource = fs.readFileSync(path.join(root, 'api/_shared/cinema-ingestion-worker.ts'), 'utf8');
  const result = validate(workflow, preflight, workerPreflight, workerSource);
  console.log(`AFISHI005E orchestration source mirror valid: ${result.total} sources; ${result.worker_ready} worker-ready; ${result.fail_closed} fail-closed; read-only SSH bridge present; schedule disabled; Daily snapshot contract present; no stored credentials/write nodes`);
}

module.exports = { validate, extractMatrix };
