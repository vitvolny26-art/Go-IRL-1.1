/* global URL, console */
// Isolated Node behavior checks. This is NOT TypeScript typechecking or Vitest.
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'kino000sr-readback-'));
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
try {
  for (const file of await readdir(join(root, 'api/_shared'))) {
    if (!file.startsWith('cinema-sr-') || !file.endsWith('.ts')) continue;
    const ts = await readFile(join(root, 'api/_shared', file), 'utf8');
    const js = stripTypeScriptTypes(ts).replaceAll('.js"', '.mjs"');
    await writeFile(join(temp, file.replace(/\.ts$/, '.mjs')), js);
  }
  const registry = await import(pathToFileURL(join(temp, 'cinema-sr-venue-registry.mjs')));
  const { srOlomoucSourceBindings: bindings, selectSrSourceBindings } = await import(pathToFileURL(join(temp, 'cinema-sr-source-bindings.mjs')));
  const { readSrTop7SequenceReview: read, validateSrSequenceScope: validate } = await import(pathToFileURL(join(temp, 'cinema-sr-sequence-readback.mjs')));
  const required = bindings.map(b => b.sr_source_id);
  const sources = () => bindings.map(b => ({id:b.registry_row_id, source_id:b.registry_source_id, source_url:b.registry_source_url, venue_id:b.venue_id, timezone:'Europe/Prague', enabled:true}));
  const venues = () => bindings.map((b,i) => ({id:b.venue_id, source_id:b.registry_source_id, city_id:'olomouc', name:`Verified venue ${i}`, slug:`venue-${i}`, address:null, timezone:'Europe/Prague', active:true}));
  await test('four exact source-row/venue bindings preserve SR namespace', () => assert.deepEqual(registry.reconcileSrVerifiedVenueRegistry(required,sources(),venues()).map(v=>v.source_id),required));
  await test('unknown aliases fail closed', () => assert.throws(()=>selectSrSourceBindings(['unknown'])));
  for (const field of ['id','source_id','source_url','venue_id','enabled']) {
    await test(`registry rejects changed ${field}`, () => { const s=sources(); s[0][field]=field==='enabled'?false:'wrong'; assert.throws(()=>registry.reconcileSrVerifiedVenueRegistry(required,s,venues())); });
  }
  await test('missing registry rows fail closed', () => assert.throws(()=>registry.reconcileSrVerifiedVenueRegistry(required,sources().slice(1),venues())));
  await test('duplicate chain row cannot masquerade as exact venue', () => {const s=sources();s[0]={...s[1]};assert.throws(()=>registry.reconcileSrVerifiedVenueRegistry(required,s,venues()));});
  for (const [field,value] of [['city_id','praha'],['active',false],['timezone','UTC'],['source_id','other']]) {
    await test(`venue rejects changed ${field}`,()=>{const v=venues();v[0][field]=value;assert.throws(()=>registry.reconcileSrVerifiedVenueRegistry(required,sources(),v));});
  }
  const scope={week_key:'2026-10-22..2026-11-04',source_run_id:'verified-run'};
  const id=n=>`123e4567-e89b-42d3-a456-${String(n).padStart(12,'0')}`;
  const movies=()=>Array.from({length:7},(_,i)=>({id:id(i+1),city_id:'olomouc',selection_week_start:'2026-10-22',selection_week_end:'2026-11-04',rank:i+1,source_movie_key:`source:${i+1}`,readiness:{verified_source_run_id:scope.source_run_id},publication_state:'published',published_event_id:id(i+101)}));
  const events=()=>movies().map(m=>({id:m.published_event_id,city_id:'olomouc',status:'published',published_at:'2026-10-30T12:00:00Z',metadata:{cinemaCatalog:{catalogMovieId:m.id,sourceMovieKey:m.source_movie_key,cityId:m.city_id,selectionWeekStart:m.selection_week_start,selectionWeekEnd:m.selection_week_end,rank:m.rank}}}));
  const ledger=()=>events().map(e=>({event_id:e.id,city_id:'olomouc',telegram_chat_id:-1001234567890,telegram_message_id:100,deleted_at:null,last_error:null,published_at:'2026-10-30T12:00:00Z'}));
  const counted=data=>({data,count:data.length,error:null});
  const port=(m=movies(),e=events(),t=ledger())=>({attempts:async()=>({data:null,count:null,error:Error('journal table absent')}),catalog:async()=>counted(m),events:async()=>counted(e),telegram:async()=>counted(t)});
  const blocked=async(p,reason)=>{const r=await read(p,scope);assert(r.blockers.includes(reason));assert.equal(r.next_rank,null);assert.equal(r.publication_authorized,false);return r;};
  await test('seven published DB/ledger rows cannot invent exact-attempt proof',async()=>{const r=await blocked(port(),'top7_attempt_history_unavailable');assert.equal(r.readback_counts.telegram,7);assert.equal(r.telegram_delivery_readback_verified,false);assert(r.blockers.includes('top7_exact_telegram_attempt_proof_unavailable'));});
  await test('zero catalog rows are incomplete, not seven never-attempted films',async()=>blocked(port([]),'top7_exact_catalog_readback_incomplete'));
  await test('truncated catalog fails closed',async()=>{const p=port();p.catalog=async()=>({data:movies().slice(0,6),count:7,error:null});await blocked(p,'top7_exact_catalog_readback_incomplete');});
  await test('duplicate ranks fail closed',async()=>{const m=movies();m[1].rank=1;await blocked(port(m),'top7_catalog_identity_or_run_mismatch');});
  await test('changed snapshot fails closed',async()=>{const m=movies();m[0].readiness.verified_source_run_id='other';await blocked(port(m),'top7_catalog_identity_or_run_mismatch');});
  await test('event UUID replacement fails closed',async()=>{const e=events();e[0].id=id(999);await blocked(port(movies(),e),'top7_event_identity_or_state_unverified');});
  await test('orphan/changed event movie identity fails closed',async()=>{const e=events();e[0].metadata.cinemaCatalog.catalogMovieId=id(999);await blocked(port(movies(),e),'top7_event_identity_or_state_unverified');});
  await test('missing event fails closed',async()=>blocked(port(movies(),events().slice(1)),'top7_catalog_event_missing'));
  await test('missing ledger fails closed',async()=>blocked(port(movies(),events(),ledger().slice(1)),'top7_telegram_ledger_incomplete'));
  for(const [field,value] of [['deleted_at','2026-10-30'],['last_error','send failed'],['telegram_message_id',0],['telegram_chat_id',0],['event_id',id(999)]]) {
    await test(`ledger rejects changed ${field}`,async()=>{const t=ledger();t[0][field]=value;await blocked(port(movies(),events(),t),'top7_telegram_ledger_unverified');});
  }
  await test('read error never becomes empty history',async()=>{const p=port();p.catalog=async()=>{throw Error('offline')};await blocked(p,'top7_server_readback_unavailable');});
  await test('never-published catalog plus empty events is still unknown history',async()=>{const m=movies().map(x=>({...x,published_event_id:null,publication_state:'ready'}));await blocked(port(m,[],[]),'top7_attempt_history_unavailable');});
  for(const raw of [{...scope,attempts:[]},{...scope,publication_authorized:true},{...scope,week_key:'2026-02-30..2026-03-01'},{...scope,source_run_id:' '},[]]) {
    await test('untrusted scope cannot supply proof or malformed dates',()=>assert.throws(()=>validate(raw)));
  }
  console.log(`${passed}/${passed} isolated Node behavior checks PASS`);
} finally { await rm(temp,{recursive:true,force:true}); }
