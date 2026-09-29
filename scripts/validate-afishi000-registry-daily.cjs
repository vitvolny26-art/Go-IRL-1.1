'use strict';
const fs=require('node:fs');
const path=require('node:path');

function validate(workflow){
  if(workflow.active!==false) throw new Error('candidate_must_remain_inactive');
  if(workflow.settings?.timezone!=='Europe/Prague') throw new Error('workflow_timezone');
  const schedule=workflow.nodes.find(n=>n.name==='Daily Schedule');
  if(!schedule || schedule.disabled===true) throw new Error('daily_schedule_missing');
  if(schedule.parameters?.rule?.interval?.[0]?.expression!=='0 23 * * *') throw new Error('schedule_expression');
  if(workflow.nodes.some(n=>n.credentials&&Object.keys(n.credentials).length)) throw new Error('credential_binding');
  if(workflow.nodes.some(n=>/googleSheets|postgres|supabase|webhook/i.test(n.type))) throw new Error('unapproved_io_node');

  const ssh=workflow.nodes.find(n=>n.name==='Registry-driven Daily Enqueue');
  const check=workflow.nodes.find(n=>n.name==='Validate Daily Coverage Outcome');
  if(!ssh || ssh.type!=='n8n-nodes-base.ssh') throw new Error('registry_enqueue_bridge_missing');
  if(!check || check.type!=='n8n-nodes-base.code') throw new Error('coverage_validator_missing');
  const command=ssh.parameters?.command||'';
  for(const token of ['sudo -n /usr/local/sbin/go-irl-cinema-workerctl enqueue-connected-daily','5739777bacdb4f9c50f31a0eb8218d98df3c5c2c']){
    if(!command.includes(token)) throw new Error('registry_enqueue_command_contract');
  }
  if(/cinema-ingestion-worker\\.js|SUPABASE_|GO_IRL_CINEMA_WORKER_ENABLED=/.test(command)) throw new Error('worker_environment_bypass');
  if(/publish|approval|sync/i.test(ssh.name+command)) throw new Error('publication_path_present');

  const code=check.parameters?.jsCode||'';
  for(const token of ["registry_driven_daily_enqueue","['enqueued','duplicate','fail_closed']","publication_authorized:false","auto_publish:false"]){
    if(!code.includes(token)) throw new Error('coverage_outcome_contract');
  }

  for(const trigger of ['Manual Trigger','Daily Schedule']){
    const edges=workflow.connections?.[trigger]?.main?.[0]||[];
    if(!edges.some(edge=>edge.node==='Registry-driven Daily Enqueue')) throw new Error(`trigger_not_connected:${trigger}`);
  }
  const edges=workflow.connections?.['Registry-driven Daily Enqueue']?.main?.[0]||[];
  if(!edges.some(edge=>edge.node==='Validate Daily Coverage Outcome')) throw new Error('validator_not_connected');
  return {active:workflow.active,cron:'0 23 * * *',writers:0,bridge:'go-irl-cinema-workerctl'};
}

if(require.main===module){
  const root=path.resolve(__dirname,'..');
  const workflow=JSON.parse(fs.readFileSync(path.join(root,'n8n/workflows/afishi000-registry-driven-daily-cinema.json')));
  console.log(JSON.stringify(validate(workflow)));
}
module.exports={validate};
