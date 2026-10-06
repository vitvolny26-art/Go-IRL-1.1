'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validate,extractMatrix}=require('./validate-kino001d-orchestration.cjs');
const root=path.resolve(__dirname,'..');
const load=name=>JSON.parse(fs.readFileSync(path.join(root,name)));
const workflow=load('n8n/workflows/kino001d-17-source-orchestration.json');
const preflight=load('evidence/source-preflight.json');
const workerPreflight=load('evidence/worker-adapter-preflight.json');
const workerSource=fs.readFileSync(path.join(root,'api/_shared/cinema-ingestion-worker.ts'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));

test('validates active 17-source runtime mirror and exact Daily persistence contour',()=>{
  assert.deepEqual(validate(workflow,preflight,workerPreflight,workerSource),{total:17,worker_ready:7,fail_closed:10,writers:3});
  assert.equal(new Set(extractMatrix(workflow).map(row=>row[0])).size,17);
});

test('requires 23:00 Europe/Prague schedule',()=>{
  const badTz=clone(workflow); badTz.settings.timezone='UTC';
  assert.throws(()=>validate(badTz,preflight,workerPreflight,workerSource),/workflow_timezone/);
  const badCron=clone(workflow); badCron.nodes.find(n=>n.name==='Daily Schedule').parameters.rule.interval[0].expression='0 6 * * *';
  assert.throws(()=>validate(badCron,preflight,workerPreflight,workerSource),/schedule_expression/);
  const disabled=clone(workflow); disabled.nodes.find(n=>n.name==='Daily Schedule').disabled=true;
  assert.throws(()=>validate(disabled,preflight,workerPreflight,workerSource),/schedule_not_enabled/);
});

test('rejects stored credential bindings and unauthorized writers',()=>{
  const credentialed=clone(workflow); credentialed.nodes.find(n=>n.name==='Append Daily_Movies').credentials={googleSheetsOAuth2Api:{id:'secret-id',name:'Google Sheets account'}};
  assert.throws(()=>validate(credentialed,preflight,workerPreflight,workerSource),/credential_binding/);
  const db=clone(workflow); db.nodes.push({name:'Forbidden DB',type:'n8n-nodes-base.postgres',parameters:{}});
  assert.throws(()=>validate(db,preflight,workerPreflight,workerSource),/database_writer_present/);
  const extra=clone(workflow); extra.nodes.push({name:'Append Other',type:'n8n-nodes-base.googleSheets',parameters:{resource:'sheet',operation:'append'}});
  assert.throws(()=>validate(extra,preflight,workerPreflight,workerSource),/google_sheets_writer_count/);
});

test('rejects wrong Daily target',()=>{
  const changed=clone(workflow); changed.nodes.find(n=>n.name==='Append Daily_Runs').parameters.sheetName.value='999';
  assert.throws(()=>validate(changed,preflight,workerPreflight,workerSource),/writer_sheet:Append Daily_Runs/);
});

test('keeps every unproven source fail-closed with its evidence reason',()=>{
  const byId=new Map(extractMatrix(workflow).map(row=>[row[0],row]));
  for(const source of preflight.sources.filter(source=>source.status==='fail_closed')){
    assert.equal(byId.get(source.source_id)[3],'fail_closed');
    assert.equal(byId.get(source.source_id)[4],source.reason);
    assert.equal(byId.get(source.source_id)[5],null);
  }
});

test('rejects accidental dispatch of a fail-closed source',()=>{
  const changed=clone(workflow); const node=changed.nodes.find(n=>n.name==='Create Run & 17 Source Matrix');
  node.parameters.jsCode=node.parameters.jsCode.replace('["en_london_vue","EN","London","fail_closed","worker_adapter_missing",null]','["en_london_vue","EN","London","worker_ready",null,"vue_uk"]');
  assert.throws(()=>validate(changed,preflight,workerPreflight),/worker_source_not_parser_ready:en_london_vue/);
});

test('requires aggregate, bridge, snapshot and persistence connections',()=>{
  const agg=clone(workflow); agg.nodes.find(n=>n.name==='Aggregate Run Summary').parameters.jsCode='return $input.all();';
  assert.throws(()=>validate(agg,preflight,workerPreflight,workerSource),/aggregate_completion_contract_missing/);
  const bridge=clone(workflow); bridge.nodes.find(n=>n.name==='Read-only Adapter Bridge').parameters.command='echo unsafe';
  assert.throws(()=>validate(bridge,preflight,workerPreflight,workerSource),/read_only_bridge_contract_missing/);
  const snapshot=clone(workflow); snapshot.connections['Snapshot Output'].main[0]=snapshot.connections['Snapshot Output'].main[0].filter(edge=>edge.node!=='Prepare Daily_Runs');
  assert.throws(()=>validate(snapshot,preflight,workerPreflight,workerSource),/snapshot_persistence_not_connected:Prepare Daily_Runs/);
});
