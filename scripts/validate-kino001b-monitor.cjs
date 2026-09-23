'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n/workflows/kino001b-six-language-cinema-monitor.json')));
const preflight = JSON.parse(fs.readFileSync(path.join(root, 'evidence/source-preflight.json')));

if (workflow.active !== false) throw new Error('workflow_active');
const scheduleNodes = workflow.nodes.filter(n => /schedule/i.test(n.name) || /scheduleTrigger/i.test(n.type));
if (scheduleNodes.length !== 1) throw new Error('schedule_count');
if (scheduleNodes[0].type !== 'n8n-nodes-base.scheduleTrigger' || scheduleNodes[0].disabled === true) throw new Error('schedule_missing_or_disabled');
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
for (const sourceId of parserReady) {
  if (!fanOutCode.includes(`'${sourceId}'`)) throw new Error(`ready_source_missing:${sourceId}`);
}
for (const sourceId of failClosed) {
  if (fanOutCode.includes(`'${sourceId}'`)) throw new Error(`fail_closed_source_dispatched:${sourceId}`);
}

const scheduleConnections = workflow.connections?.['Daily Schedule']?.main?.[0] || [];
if (!scheduleConnections.some(c => c.node === 'Fan Out Parser-Ready Sources')) throw new Error('schedule_not_connected_to_fanout');
const fanOutConnections = workflow.connections?.['Fan Out Parser-Ready Sources']?.main?.[0] || [];
if (!fanOutConnections.some(c => c.node === 'Parser Dispatch Boundary')) throw new Error('fanout_not_connected_to_dispatch');

console.log('monitor: inactive; real daily schedule trigger; no webhook/credentials/write nodes; parser-ready fan-out 11/17; fail-closed 6/17');
