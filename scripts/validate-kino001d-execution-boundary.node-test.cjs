'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildExecutionPlan,buildSourceExecutionPlan,validateExecutionBoundary}=require('./validate-kino001d-execution-boundary.cjs');
const root=path.resolve(__dirname,'..');
const load=name=>JSON.parse(fs.readFileSync(path.join(root,name)));
const workflow=load('n8n/workflows/kino001d-17-source-orchestration.json');
const workerPreflight=load('evidence/worker-adapter-preflight.json');
const sourceConfig=load('evidence/afishi005d-source-config.json');
const workerSource=fs.readFileSync(path.join(root,'api/_shared/cinema-ingestion-worker.ts'),'utf8');
const adapterSources={
  planeta_kino_ua:fs.readFileSync(path.join(root,'api/_shared/cinema-adapters/planeta-kino-ua.ts'),'utf8'),
  cinestar_cz:fs.readFileSync(path.join(root,'api/_shared/cinema-adapters/cinestar-cz.ts'),'utf8'),
  premiere_cz:fs.readFileSync(path.join(root,'api/_shared/cinema-adapters/premiere-cz.ts'),'utf8'),
  cinemacity_global:fs.readFileSync(path.join(root,'api/_shared/cinema-adapters/cinemacity-global.ts'),'utf8'),
  picturehouse_uk:fs.readFileSync(path.join(root,'api/_shared/cinema-adapters/picturehouse-uk.ts'),'utf8'),
};
const clone=value=>JSON.parse(JSON.stringify(value));

test('builds exact seven-source non-persistent adapter execution plan',()=>{
  const plan=buildExecutionPlan(workerPreflight,workerSource);
  assert.equal(plan.mode,'read_only_adapter_bridge');
  assert.equal(plan.production_writes,false);
  assert.deepEqual(plan.sources.map(x=>x.source_id).sort(),['cs_prague_cinemacity','cs_prague_cinestar','cs_prague_premiere','en_london_picturehouse_ritzy','pl_warsaw_cinemacity','sk_bratislava_cinemacity','uk_kyiv_planetakino']);
});

test('allows only verified official URLs and keeps CineStar fail-closed',()=>{
  const plan=buildSourceExecutionPlan(sourceConfig,workerPreflight,workerSource);
  assert.deepEqual(plan.sources.filter(x=>x.execution_status==='executable').map(x=>x.source_id).sort(),['cs_prague_cinemacity','cs_prague_premiere','en_london_picturehouse_ritzy','pl_warsaw_cinemacity','sk_bratislava_cinemacity','uk_kyiv_planetakino']);
  assert.deepEqual(plan.sources.filter(x=>x.execution_status==='fail_closed').map(x=>x.source_id),['cs_prague_cinestar']);
});

test('accepts active schedule plus only the bounded Daily persistence contour',()=>{
  const plan=validateExecutionBoundary({workflow,workerPreflight,workerSource,adapterSources,sourceConfig});
  assert.equal(plan.sources.length,7);
});

test('rejects inactive mirror, bad schedule, credentials, and unapproved persistence',()=>{
  const inactive=clone(workflow); inactive.active=false;
  assert.throws(()=>validateExecutionBoundary({workflow:inactive,workerPreflight,workerSource,adapterSources,sourceConfig}),/workflow_not_active_contract/);
  const wrong=clone(workflow); wrong.nodes.find(n=>n.name==='Daily Schedule').parameters.rule.interval[0].expression='0 6 * * *';
  assert.throws(()=>validateExecutionBoundary({workflow:wrong,workerPreflight,workerSource,adapterSources,sourceConfig}),/schedule_expression/);
  const cred=clone(workflow); cred.nodes[0].credentials={httpHeaderAuth:{id:'forbidden'}};
  assert.throws(()=>validateExecutionBoundary({workflow:cred,workerPreflight,workerSource,adapterSources,sourceConfig}),/credential_binding/);
  const writer=clone(workflow); writer.nodes.push({name:'Forbidden Writer',type:'n8n-nodes-base.googleSheets',parameters:{}});
  assert.throws(()=>validateExecutionBoundary({workflow:writer,workerPreflight,workerSource,adapterSources,sourceConfig}),/google_sheets_writer_count/);
});

test('rejects worker allowlist or adapter boundary drift',()=>{
  const changedWorker=workerSource.replace('  "cs_prague_premiere",\n','  "cs_prague_premiere",\n  "sk_bratislava_cinemax",\n');
  assert.throws(()=>buildExecutionPlan(workerPreflight,changedWorker),/worker_allowlist_execution_mismatch/);
  const badAdapters={...adapterSources,premiere_cz:'export const premiereCzAdapter = {};'};
  assert.throws(()=>validateExecutionBoundary({workflow,workerPreflight,workerSource,adapterSources:badAdapters,sourceConfig}),/adapter_fetch_missing:premiere_cz/);
});
