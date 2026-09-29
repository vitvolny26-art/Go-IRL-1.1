'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validate}=require('./validate-afishi000-registry-daily.cjs');
const root=path.resolve(__dirname,'..');
const workflow=JSON.parse(fs.readFileSync(path.join(root,'n8n/workflows/afishi000-registry-driven-daily-cinema.json')));
const clone=value=>JSON.parse(JSON.stringify(value));

test('accepts inactive registry-driven daily coverage candidate',()=>{
  assert.deepEqual(validate(workflow),{active:false,cron:'0 23 * * *',writers:0});
});
test('rejects activation, stored credentials, writers and publication paths',()=>{
  const active=clone(workflow); active.active=true;
  assert.throws(()=>validate(active),/candidate_must_remain_inactive/);
  const cred=clone(workflow); cred.nodes.find(n=>n.name==='Registry-driven Daily Enqueue').credentials={sshPrivateKey:{id:'forbidden'}};
  assert.throws(()=>validate(cred),/credential_binding/);
  const writer=clone(workflow); writer.nodes.push({name:'DB',type:'n8n-nodes-base.postgres',parameters:{}});
  assert.throws(()=>validate(writer),/unapproved_io_node/);
  const publish=clone(workflow); publish.nodes.find(n=>n.name==='Registry-driven Daily Enqueue').parameters.command+=' --publish';
  assert.throws(()=>validate(publish),/publication_path_present/);
});
test('requires explicit terminal outcome validation and trigger wiring',()=>{
  const bad=clone(workflow);
  bad.nodes.find(n=>n.name==='Validate Daily Coverage Outcome').parameters.jsCode='return $input.all();';
  assert.throws(()=>validate(bad),/coverage_outcome_contract/);
  const disconnected=clone(workflow); disconnected.connections['Daily Schedule'].main=[[]];
  assert.throws(()=>validate(disconnected),/trigger_not_connected:Daily Schedule/);
});
