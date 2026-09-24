'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n/workflows/kino001b-six-language-cinema-monitor.json')));
const preflight = JSON.parse(fs.readFileSync(path.join(root, 'evidence/source-preflight.json')));
const workerPreflight = JSON.parse(fs.readFileSync(path.join(root, 'evidence/worker-adapter-preflight.json')));
const liveFetchContract = JSON.parse(fs.readFileSync(path.join(root, 'evidence/live-fetch-contract.json')));

if (workflow.active !== false) throw new Error('workflow_active');
const scheduleNodes = workflow.nodes.filter(n => /schedule/i.test(n.name) || /scheduleTrigger/i.test(n.type));
if (scheduleNodes.length !== 1) throw new Error('schedule_count');
if (scheduleNodes[0].type !== 'n8n-nodes-base.scheduleTrigger' || scheduleNodes[0].disabled !== true) throw new Error('schedule_not_disabled');
if (workflow.nodes.some(n => /webhook/i.test(n.type))) throw new Error('webhook_present');
if (workflow.nodes.some(n => n.credentials && Object.keys(n.credentials).length)) throw new Error('credential_binding');
if (workflow.nodes.some(n => /googleSheets|postgres|supabase/i.test(n.type))) throw new Error('write_node');

if (preflight.sources.length !== 17) throw new Error('source_count');
const expectedIds = [
  'ru_moscow_karo','ru_moscow_cinemapark','ru_moscow_kinomax',
  'uk_kyiv_multiplex','uk_kyiv_planetakino','uk_kyiv_oskar',
  'cs_prague_cinemacity','cs_prague_cinestar','cs_prague_premiere',
  'en_london_odeon','en_london_vue','en_london_cineworld',
  'pl_warsaw_cinemacity','pl_warsaw_multikino','pl_warsaw_helios',
  'sk_bratislava_cinemacity','sk_bratislava_cinemax'
].sort();
const actualIds = preflight.sources.map(s => s.source_id).sort();
if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) throw new Error('source_id_matrix');

const expected = {RU:3,UK:3,CS:3,EN:3,PL:3,SK:2};
const actual = {};
for (const source of preflight.sources) actual[source.language] = (actual[source.language] || 0) + 1;
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`coverage_matrix:${JSON.stringify(actual)}`);
if (preflight.sources.some(s => /lumi[eè]re/i.test(s.source_id))) throw new Error('kino_lumiere_present');

const parserReady = preflight.sources.filter(s => s.status === 'parser_ready').map(s => s.source_id).sort();
const failClosed = preflight.sources.filter(s => s.status === 'fail_closed').map(s => s.source_id).sort();
if (parserReady.length !== 11) throw new Error('ready_count');
if (failClosed.length !== 6) throw new Error('fail_closed_count');

const fanOut = workflow.nodes.find(n => n.name === 'Fan Out Parser-Ready Sources');
if (!fanOut || fanOut.type !== 'n8n-nodes-base.code') throw new Error('fanout_node_missing');
const fanOutCode = fanOut.parameters?.jsCode || '';
const workerReady = workerPreflight.sources.filter(s => s.status === 'worker_ready').map(s => s.source_id).sort();
const workerBlocked = workerPreflight.sources.filter(s => s.status === 'fail_closed').map(s => s.source_id).sort();
if (workerReady.length !== 3) throw new Error('worker_ready_count');
if (workerBlocked.length !== 8) throw new Error('worker_fail_closed_count');
if (JSON.stringify(workerPreflight.sources.map(s => s.source_id).sort()) !== JSON.stringify(parserReady)) throw new Error('worker_preflight_parser_ready_mismatch');
for (const source of workerPreflight.sources.filter(s => s.status === 'worker_ready')) {
  if (!source.adapter_key) throw new Error(`worker_adapter_key_missing:${source.source_id}`);
  if (!fanOutCode.includes(`'${source.source_id}'`)) throw new Error(`worker_ready_source_missing:${source.source_id}`);
}
for (const sourceId of [...failClosed, ...workerBlocked]) {
  if (fanOutCode.includes(`'${sourceId}'`)) throw new Error(`fail_closed_source_dispatched:${sourceId}`);
}

const bratislava = workerPreflight.sources.find(s => s.source_id === 'sk_bratislava_cinemax');
if (bratislava?.status !== 'fail_closed' || bratislava?.reason !== 'worker_adapter_city_contract_mismatch') throw new Error('bratislava_worker_contract_not_fail_closed');
const bratislavaFetch = liveFetchContract.sources.find(s => s.source_id === 'sk_bratislava_cinemax');
if (bratislavaFetch?.status !== 'fail_closed' || bratislavaFetch?.reason !== 'dedicated_sk_adapter_required') throw new Error('bratislava_live_fetch_contract_not_fail_closed');
if (bratislavaFetch?.rejected_adapter_key !== 'cinemax_cz') throw new Error('bratislava_rejected_adapter_missing');

const scheduleConnections = workflow.connections?.['Daily Schedule']?.main?.[0] || [];
if (!scheduleConnections.some(c => c.node === 'Fan Out Parser-Ready Sources')) throw new Error('schedule_not_connected_to_fanout');
const fanOutConnections = workflow.connections?.['Fan Out Parser-Ready Sources']?.main?.[0] || [];
if (!fanOutConnections.some(c => c.node === 'Worker Readiness Boundary')) throw new Error('fanout_not_connected_to_readiness_boundary');

const readinessBoundary = workflow.nodes.find(n => n.name === 'Worker Readiness Boundary');
if (!readinessBoundary || readinessBoundary.type !== 'n8n-nodes-base.code') throw new Error('readiness_boundary_missing');
if (workflow.nodes.some(n => /dispatch|enqueue|worker/i.test(n.name) && n.name !== 'Worker Readiness Boundary')) {
  throw new Error('unverified_dispatch_node_present');
}
if (!/candidate only/i.test(workflow.description || '')) throw new Error('candidate_only_description_missing');

console.log('monitor candidate: inactive; Daily Schedule disabled; no dispatch bridge/credentials/write nodes; parser-ready 11/17; worker-ready selection 3/17; worker-blocked 8/11; Bratislava Cinemax fail-closed pending dedicated SK adapter');
