/* global console */
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const temp=await mkdtemp(join(tmpdir(),'kino000sr-writer-'));
try {
  const journal=(await readFile('api/_shared/cinema-sr-publication-attempt-journal.ts','utf8')).replaceAll('.js"','.mjs"');
  const writer=(await readFile('api/_shared/cinema-sr-publication-attempt-writer.ts','utf8')).replaceAll('.js"','.mjs"');
  await writeFile(join(temp,'cinema-sr-publication-attempt-journal.mjs'),stripTypeScriptTypes(journal));
  await writeFile(join(temp,'cinema-sr-publication-attempt-writer.mjs'),stripTypeScriptTypes(writer));
  const {createSrAttemptJournalWriter}=await import(pathToFileURL(join(temp,'cinema-sr-publication-attempt-writer.mjs')));
  const movie='e896c63e-8fde-424c-b080-0484ebdf5693', attempt='029c7f36-4727-439c-a89f-459c3f84708f';
  let current={attempt_id:attempt,week_key:'2026-10-22..2026-11-04',source_run_id:'run',rank:1,catalog_movie_id:movie,candidate_key:'tt1',status:'started',catalog_event_id:null,telegram_chat_id:null,telegram_message_id:null,provider_outcome:null,independent_receipt:null,started_at:'2026-10-30T00:00:00Z',finished_at:null};
  const calls=[]; const db={from:()=>({insert:v=>{calls.push(v);return {select:()=>({single:async()=>({data:current,error:null})})}},update:v=>{calls.push(v);current={...current,...v};return {eq:()=>({select:()=>({single:async()=>({data:current,error:null})})})}}})};
  const w=createSrAttemptJournalWriter(db); await w.start({week_key:current.week_key,source_run_id:'run',rank:1,catalog_movie_id:movie,candidate_key:'tt1'}); assert.equal(calls[0].status,'started');
  await assert.rejects(()=>w.finish({attempt_id:attempt,status:'succeeded',catalog_event_id:movie,telegram_message_id:3,provider_outcome:'published'}),/success_receipt_missing/);
  await w.finish({attempt_id:attempt,status:'succeeded',catalog_event_id:movie,telegram_chat_id:-1001,telegram_message_id:3,provider_outcome:'published',independent_receipt:'receipt'}); assert.equal(calls[1].status,'succeeded');
  console.log('writer: 3/3 checks PASS');
} finally { await rm(temp,{recursive:true,force:true}); }
