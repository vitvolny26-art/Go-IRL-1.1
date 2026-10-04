'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validate,RELEASE_SHA}=require('./validate-kino000c-daily-monitor.cjs');

const workflow=JSON.parse(fs.readFileSync(path.join(__dirname,'..','n8n','workflows','kino000c-daily-cinema-monitor.json')));

test('Kino000C daily monitor repository contract validates',()=>{
  const result=validate(workflow);
  assert.equal(result.active,false);
  assert.equal(result.timezone,'Europe/Prague');
  assert.equal(result.cron,'0 6 * * *');
  assert.equal(result.releaseSha,RELEASE_SHA);
  assert.equal(result.publicationAuthorized,false);
  assert.equal(result.autoPublish,false);
});

test('Kino000C rejects a different worker release SHA',()=>{
  const clone=structuredClone(workflow);
  const dispatch=clone.nodes.find((node)=>node.name==='Dispatch Through Cinema Worker');
  dispatch.parameters.command=dispatch.parameters.command.replace(RELEASE_SHA,'0000000000000000000000000000000000000000');
  assert.throws(()=>validate(clone),/daily_dispatch_command_contract/);
});

test('Kino000C rejects publication paths',()=>{
  const clone=structuredClone(workflow);
  const dispatch=clone.nodes.find((node)=>node.name==='Dispatch Through Cinema Worker');
  dispatch.parameters.command+='\necho publish';
  assert.throws(()=>validate(clone),/protected_action_path_present/);
});
