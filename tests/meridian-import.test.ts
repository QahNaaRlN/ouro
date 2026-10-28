import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {applyCommand,emptyState,PROJECT_ID,AGENT_ID,type Actor,type Command,type RevisionContent} from '../packages/core/src';
import {createStore} from '../lib/store';
import {mapMeridianExpectation,parseMeridianScope} from '../packages/meridian/src/context';

const human:Actor={id:'meridian-human',kind:'human',projectIds:[PROJECT_ID]},agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const code=(expected:string)=>(e:unknown)=>(e as {code?:string}).code===expected;
const raw=readFileSync(new URL('./fixtures/meridian/scope.json',import.meta.url),'utf8');
const digest=createHash('sha256').update(raw,'utf8').digest('hex');
const content=():RevisionContent=>({...mapMeridianExpectation(parseMeridianScope(raw)),title:'Импортированное ожидание',goal:'Человек уточнил исходную цель.'});
const input=(expectedVersion=0)=>({requestId:randomUUID(),expectedVersion,rawDocument:raw,content:content()});
const command=(expectedVersion=0)=>({type:'importMeridianScope',...input(expectedVersion)});

test('M03 trusted Meridian import creates only a human draft with immutable pins and exact source bytes',()=>{
 const cmd=command(),proof={meridianImport:{rawDocument:raw,documentSha256:digest}};
 const result=applyCommand(emptyState(),cmd as Command,human,proof as any),spec=result.state.specs[0] as any;
 assert.equal(spec.state,'idea');assert.equal(spec.activeRevisionId,null);assert.equal(result.state.executions.length,0);assert.equal(spec.acceptance,undefined);
 assert.equal(result.state.revisions[0].goal,cmd.content.goal);
 assert.equal(spec.origin.kind,'meridian_import');assert.equal(spec.origin.documentSha256,digest);assert.equal(spec.origin.snapshotId,'owned-scope-1');
 assert.equal(spec.origin.transportVerification,'unverified_import');assert.equal(spec.origin.workspaceId,'synthetic-workspace');
 assert.deepEqual(spec.origin.taskSpecificationPin,parseMeridianScope(raw).facts.task_specification_pin);
 assert.deepEqual(spec.origin.criterionBindings,[{criterionId:'meridian:criterion-a',sourceCriterionId:'criterion-a'}]);
 assert.equal(result.events[0].payload.meridianSource && (result.events[0].payload.meridianSource as any).rawDocument,raw);
 assert(!('rawDocument' in spec.origin));
});

test('M03 claimed origin or digest is not a trusted adapter proof; agents and inconsistent source cannot import',()=>{
 const cmd=command();
 assert.throws(()=>applyCommand(emptyState(),cmd as Command,human),code('FORBIDDEN'));
 assert.throws(()=>applyCommand(emptyState(),{...cmd,documentSha256:digest} as Command,human),code('FORBIDDEN'));
 assert.throws(()=>applyCommand(emptyState(),cmd as Command,agent,{meridianImport:{rawDocument:raw,documentSha256:digest}} as any),code('FORBIDDEN'));
 assert.throws(()=>applyCommand(emptyState(),cmd as Command,human,{meridianImport:{rawDocument:raw+' ',documentSha256:digest}} as any),code('FORBIDDEN'));
 const invalid=JSON.parse(raw);invalid.facts.run_ref.workspace_id='foreign-workspace';const invalidRaw=JSON.stringify(invalid);
 assert.throws(()=>applyCommand(emptyState(),{...cmd,rawDocument:invalidRaw} as Command,human,{meridianImport:{rawDocument:invalidRaw,documentSha256:digest}} as any),code('VALIDATION_ERROR'));
});

test('M04 SQL import survives reopen and replays receipt before version without duplicating source or accepting DoD',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ouro-meridian-'));let store:any;
 try{
  store=await createStore({dataDir:dir,seedEvents:[]});const req=input();
  const first=await store.importMeridianScope(req,human);assert.equal(first.replayed,false);
  const saved=first.state.specs[0];assert.equal(saved.origin.documentSha256,digest);
  await store.executeCommand({type:'createSpec',requestId:randomUUID(),expectedVersion:first.cursor,content:{...content(),title:'Другая спека'}},human);
  const duplicate=await store.importMeridianScope(req,human);assert.equal(duplicate.replayed,true);assert.deepEqual(duplicate.events,first.events);
  const before=await store.getProject();assert.equal(before.specs.length,2);assert.equal(before.specs[0].state,'idea');
  const fromSql=await store.inspect('SELECT event FROM ouro_domain_events WHERE id=$1',[first.events[0].id]);
  const preserved=fromSql.rows[0].event.payload.meridianSource.rawDocument;assert.equal(preserved,raw);assert.equal(createHash('sha256').update(preserved,'utf8').digest('hex'),saved.origin.documentSha256);
  await assert.rejects(store.importMeridianScope({...req,content:{...req.content,title:'Подмена'}},human),code('IDEMPOTENCY_CONFLICT'));
  await store.close();store=await createStore({dataDir:dir,seedEvents:[]});assert.deepEqual(await store.getProject(),before);
  assert.deepEqual((await store.importMeridianScope(req,human)).events,first.events);
 }finally{await store?.close();await rm(dir,{recursive:true,force:true});}
});

test('M04 source, revision, event, outbox and receipt roll back together on SQL failure',async()=>{
 const store:any=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  await store.inspect("CREATE FUNCTION ouro_fail_meridian_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected meridian outbox failure'; END $$");
  await store.inspect('CREATE TRIGGER ouro_fail_meridian_outbox BEFORE INSERT ON ouro_outbox FOR EACH ROW EXECUTE FUNCTION ouro_fail_meridian_outbox()');
  const req=input();await assert.rejects(store.importMeridianScope(req,human),/injected meridian outbox failure/);
  assert.equal((await store.getProject()).version,0);
  for(const table of ['ouro_command_receipts','ouro_spec_revisions','ouro_specs','ouro_domain_events','ouro_outbox'])assert.equal(Number((await store.inspect(`SELECT count(*) FROM ${table}`)).rows[0].count),0);
  await store.inspect('DROP TRIGGER ouro_fail_meridian_outbox ON ouro_outbox');
  const result=await store.importMeridianScope(req,human);assert.equal(result.replayed,false);assert.equal(result.state.specs.length,1);
 }finally{await store.close();}
});

test('M03 generic commands cannot forge import origin/source; dedicated store rejects unknown metadata and agents',async()=>{
 const store:any=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  await assert.rejects(store.executeCommand(command(),human),code('FORBIDDEN'));
  for(const extra of [{origin:{kind:'meridian_import'}},{meridianSource:{rawDocument:raw}},{documentSha256:digest}])
   await assert.rejects(store.executeCommand({type:'createSpec',requestId:randomUUID(),expectedVersion:0,content:content(),...extra},human),code('FORBIDDEN'));
  await assert.rejects(store.importMeridianScope(input(),agent),code('FORBIDDEN'));
  await assert.rejects(store.importMeridianScope({...input(),documentSha256:digest},human),code('VALIDATION_ERROR'));
  await assert.rejects(store.importMeridianScope({...input(),content:{...content(),origin:{kind:'meridian_import'}}},human),code('VALIDATION_ERROR'));
  assert.equal((await store.getProject()).version,0);
 }finally{await store.close();}
});

test('M03 ordinary revision proposals cannot persist claimed adapter origin or source metadata',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const created=await store.executeCommand({type:'createSpec',requestId:randomUUID(),expectedVersion:0,content:content()},human),specId=created.state.specs[0].id;
  for(const key of ['origin','meridianSource','documentSha256']){
   const metadata=key==='documentSha256'?digest:{kind:'meridian_import'};
   await assert.rejects(store.executeCommand({type:'proposeRevision',requestId:randomUUID(),expectedVersion:created.cursor,specId,content:{...content(),[key]:metadata}},human),code('FORBIDDEN'));
  }
  assert.equal((await store.getProject()).version,created.cursor);
 }finally{await store.close();}
});

test('M04 a version conflict after receipt lookup explicitly proves the import has no receipt',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const req=input(1);
  await assert.rejects(store.importMeridianScope(req,human),e=>(e as {code?:string}).code==='VERSION_CONFLICT'&&(e as {details?:{meridianReceipt?:string}}).details?.meridianReceipt==='absent');
  assert.equal((await store.getProject()).version,0);
  assert.equal(Number((await store.inspect<{count:string}>('SELECT count(*) FROM ouro_command_receipts')).rows[0].count),0);
 }finally{await store.close();}
});
