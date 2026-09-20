'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n/workflows/kino001b-six-language-cinema-monitor.json')));
const preflight = JSON.parse(fs.readFileSync(path.join(root, 'evidence/source-preflight.json')));
if (workflow.active !== false) throw new Error('workflow_active');
const scheduleNodes = workflow.nodes.filter(n => /schedule/i.test(n.name) || /scheduleTrigger/i.test(n.type));
if (scheduleNodes.some(n => n.disabled !== true)) throw new Error('schedule_enabled');
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
if (preflight.sources.filter(s => s.status === 'parser_ready').length !== 11) throw new Error('ready_count');
console.log('monitor: inactive; no schedule trigger; no credentials/write nodes; matrix RU3/UK3/CS3/EN3/PL3/SK2; ready 11/17');
