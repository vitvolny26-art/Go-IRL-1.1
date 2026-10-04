'use strict';
const fs=require('node:fs');
const path=require('node:path');

const RELEASE_SHA='5999f333d41201171f42592f0c91253dc2ebd663';

function validate(workflow){
  if(workflow.active!==false) throw new Error('candidate_must_remain_inactive');
  if(workflow.settings?.timezone!=='Europe/Prague') throw new Error('workflow_timezone');
  if(workflow.settings?.executionOrder!=='v1') throw new Error('workflow_execution_order');

  const schedule=workflow.nodes.find(n=>n.name==='Daily Schedule');
  if(!schedule || schedule.disabled===true) throw new Error('daily_schedule_missing');
  if(schedule.parameters?.rule?.interval?.[0]?.expression!=='0 6 * * *') throw new Error('schedule_expression');

  if(workflow.nodes.some(n=>n.credentials&&Object.keys(n.credentials).length)) throw new Error('credential_binding');
  if(workflow.nodes.some(n=>/googleSheets|postgres|supabase|webhook|telegram/i.test(n.type))) throw new Error('unapproved_io_node');

  const ssh=workflow.nodes.find(n=>n.name==='Dispatch Through Cinema Worker');
  const check=workflow.nodes.find(n=>n.name==='Verify Bounded Dispatch');
  if(!ssh || ssh.type!=='n8n-nodes-base.ssh') throw new Error('daily_dispatch_bridge_missing');
  if(!check || check.type!=='n8n-nodes-base.code') throw new Error('daily_dispatch_validator_missing');

  const command=ssh.parameters?.command||'';
  for(const token of [
    'sudo -n /usr/local/sbin/go-irl-cinema-workerctl enqueue-connected-daily',
    RELEASE_SHA,
  ]){
    if(!command.includes(token)) throw new Error('daily_dispatch_command_contract');
  }
  if(/cinema-ingestion-worker\\.js|SUPABASE_|GO_IRL_CINEMA_WORKER_ENABLED=/.test(command)) throw new Error('worker_environment_bypass');
  if(/publish|approve|telegram|schema|migration/i.test(command)) throw new Error('protected_action_path_present');

  const code=check.parameters?.jsCode||'';
  for(const token of [
    'registry_driven_daily_enqueue',
    "['enqueued','duplicate','fail_closed']",
    'publication_authorized:false',
    'auto_publish:false',
    'telegram_auto_publish:false',
    'weekly_approval:false',
  ]){
    if(!code.includes(token)) throw new Error('daily_outcome_contract');
  }

  for(const trigger of ['Manual Dry Run','Daily Schedule']){
    const edges=workflow.connections?.[trigger]?.main?.[0]||[];
    if(edges.length!==1 || edges[0].node!=='Dispatch Through Cinema Worker') {
      throw new Error('trigger_not_bounded:'+trigger);
    }
  }
  const edges=workflow.connections?.['Dispatch Through Cinema Worker']?.main?.[0]||[];
  if(edges.length!==1 || edges[0].node!=='Verify Bounded Dispatch') throw new Error('validator_not_connected');

  return {
    active: workflow.active,
    timezone: workflow.settings.timezone,
    cron: '0 6 * * *',
    releaseSha: RELEASE_SHA,
    publicationAuthorized: false,
    autoPublish: false,
  };
}

if(require.main===module){
  const root=path.resolve(__dirname,'..');
  const workflow=JSON.parse(fs.readFileSync(path.join(root,'n8n/workflows/kino000c-daily-cinema-monitor.json')));
  console.log(JSON.stringify(validate(workflow)));
}

module.exports={validate,RELEASE_SHA};
