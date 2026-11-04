import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash, randomUUID} from 'node:crypto';
import {createStore, canonicalJSON} from '../lib/store';
import {commandReceiptHeader, commandReceiptResponse, persistedCommandCursor} from '../lib/http-command-receipt';
import {canonicalProjectJSON, commandReceiptProjection} from '../lib/project-snapshot';
import {canonicalCommandJSON} from '../lib/command-canonical-json';
import {verifyWorkspaceCommandReceipt} from '../packages/client/src/http/workspace-intent-proof';
import {sendWorkspaceIntent, getWorkspaceIntents, type WorkspaceIntent} from '../packages/client/src/http/workspace-intents';
import {createProjectHttpPorts} from '../packages/client/src/http/project-http';
import {createProjectSession} from '../packages/client/src/lifecycle/project-session';
import {freezeProjectCommandIntent} from '../packages/client/src/ports';
import {PROJECT_ID, type Actor} from '../packages/core/src';
import {fixture,report} from './verification-fixture';
import {createProjectRuntime} from '../components/project-session-provider';
import {projectSnapshotQueryKey} from '../packages/frontend/src/api/project-session';

const human:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
const content={title:'Durable proof',goal:'Prove the actual committed command.',dod:[{id:'receipt',text:'Exact successful receipt',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
const hash=(value:unknown)=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
const metadata=(header:string)=>JSON.parse(Buffer.from(header.slice(3),'base64url').toString('utf8')) as Record<string,unknown>;
const pack=(value:unknown)=>'v1.'+Buffer.from(canonicalJSON(value)).toString('base64url');

test('HRP15 shared command canonicalization preserves prior value handling and business ordering',()=>{
 assert.equal(canonicalCommandJSON({z:[2,1],a:{y:NaN,x:-0}}),canonicalJSON({a:{x:0,y:null},z:[2,1]}));
 assert.notEqual(canonicalCommandJSON([1,2]),canonicalCommandJSON([2,1]));
 for(const value of [undefined,()=>{},Symbol('fixture'),{nested:undefined}])assert.throws(()=>canonicalJSON(value),(error:unknown)=>(error as {code?:string}).code==='VALIDATION_ERROR');
});

/** Создаёт точное намерение, не меняя bytes при повторной отправке. */
function intentFor(command:{requestId:string;expectedVersion:number},actor=human):WorkspaceIntent{
 return {key:randomUUID(),projectId:PROJECT_ID,actorId:actor.id,url:'/api/commands',body:' '+JSON.stringify(command)+' ',requestId:command.requestId,expectedVersion:command.expectedVersion,label:'Receipt qualification',status:'sending',message:''};
}

test('HRP02 persisted cursor accepts actual bigint strings without accepting unsafe or noncanonical values',()=>{
 for(const value of [0,7,Number.MAX_SAFE_INTEGER,'0','7','9007199254740991'])assert.equal(persistedCommandCursor(value),Number(value));
 for(const value of [-1,1.5,Infinity,NaN,9007199254740992,'9007199254740992','01','+1','1.0',' 1','1 ','1e2','',null,undefined])assert.equal(persistedCommandCursor(value),null);
});

test('HRP03 actual INSERT and SELECT rows produce the same proof while old execute and JSON bodies remain unchanged',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const before=await store.getProject(),command={type:'createSpec',content,requestId:randomUUID(),expectedVersion:before.version};
  const first=await store.executeCommandWithReceipt(command,human),row=(await store.inspect('SELECT project_id,actor_id,request_id,payload_hash,response,cursor FROM ouro_command_receipts WHERE request_id=$1',[command.requestId])).rows[0];
  assert.equal(canonicalJSON(first.row),canonicalJSON(row));assert.equal(first.result.replayed,false);
  const replay=await store.executeCommandWithReceipt(command,human),old=await store.executeCommand(command,human);
  assert.equal(replay.result.replayed,true);assert.deepEqual(old,replay.result);assert.deepEqual(Object.keys(old).sort(),['cursor','events','replayed','state']);
  const firstHeader=commandReceiptHeader(first);assert(firstHeader);assert.equal(commandReceiptHeader(replay),firstHeader);
  assert.deepEqual(await commandReceiptResponse(first).json(),first.result);assert.deepEqual(await commandReceiptResponse(replay).json(),old);
  const proof=metadata(firstHeader);assert.equal(proof.payloadSha256,hash(command));assert.equal(proof.actorId,row.actor_id);assert.equal(proof.requestId,row.request_id);
  const raw=await commandReceiptResponse(replay).json();assert.equal(await verifyWorkspaceCommandReceipt(intentFor(command),commandReceiptResponse(replay),raw),true);
  first.result.state.specs[0].title='Modified after return';
  assert.equal(commandReceiptHeader(first),undefined,'A served view inconsistent with the actual immutable row has no proof.');
  assert.equal(canonicalJSON(first.row),canonicalJSON(row));
  assert.equal((await store.getProject()).version,first.result.cursor);
 }finally{await store.close();}
});

test('HRP13 missing nonempty derived verification facts are never normalized into a valid served digest',()=>{
 const f=fixture();f.current();f.importRun(report());assert(f.state.verificationRuns.length>0);
 const state:Record<string,unknown>={...f.state};delete state.verificationRuns;
 assert.equal(commandReceiptProjection({state,events:[],cursor:f.state.version},f.state.projectId),null);
});

test('HRP04 deferred COMMIT failure exposes neither proof nor a rolled-back candidate on retry',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const before=await store.getProject(),command={type:'createSpec',content,requestId:randomUUID(),expectedVersion:before.version};
  await store.inspect("CREATE FUNCTION hrp_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture commit failure'; END $$");
  await store.inspect('CREATE CONSTRAINT TRIGGER hrp_commit_failure AFTER INSERT ON ouro_command_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hrp_fail_commit()');
  await assert.rejects(store.executeCommandWithReceipt(command,human),/fixture commit failure/);
  assert.deepEqual(await store.getProject(),before);assert.equal((await store.inspect('SELECT * FROM ouro_command_receipts')).rows.length,0);
  await store.inspect('DROP TRIGGER hrp_commit_failure ON ouro_command_receipts');
  const accepted=await store.executeCommandWithReceipt(command,human);assert.equal(accepted.result.replayed,false);assert(commandReceiptHeader(accepted));
  assert.equal((await store.inspect('SELECT * FROM ouro_command_receipts')).rows.length,1);
 }finally{await store.close();}
});

test('HRP05 optional proof preserves strong nonempty receipts, but present invalid metadata always retains UNKNOWN',async t=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const command={type:'createSpec',content,requestId:randomUUID(),expectedVersion:0},execution=await store.executeCommandWithReceipt(command,human),proof=commandReceiptHeader(execution);assert(proof);
  assert.equal(await verifyWorkspaceCommandReceipt(intentFor(command),Response.json(execution.result),execution.result),true);
  const parsed=metadata(proof),variants:[string,string][]=[['empty',''],['unknown version',proof.replace('v1.','v2.')],['oversized','v1.'+'a'.repeat(4096)],['padding',proof+'='],['duplicate',proof+', '+proof],['bad UTF8','v1.'+Buffer.from([0xff]).toString('base64url')],['noncanonical','v1.'+Buffer.from(JSON.stringify(parsed,null,2)).toString('base64url')],['unknown field',pack({...parsed,signature:'none'})]];
  for(const field of ['projectId','actorId','requestId','payloadSha256','servedBodySha256','cursor'])variants.push([field,pack({...parsed,[field]:field==='cursor'?execution.result.cursor+1:field.includes('Sha256')?'0'.repeat(64):'foreign-receipt'})]);
  for(const [label,header]of variants)await t.test(label,async()=>{
   const intent=intentFor(command),response=Response.json(execution.result,{headers:{'X-Ouro-Command-Receipt':header}});let admissions=0;
   const result=await sendWorkspaceIntent(intent,()=>{admissions++;},async()=>response);
   assert.equal(result.ok,false);assert.equal(admissions,0);assert.equal(getWorkspaceIntents(intent.projectId,intent.actorId).find(item=>item.key===intent.key)?.status,'unknown');
  });
  await t.test('current admission throws safely',async()=>{
   const intent=intentFor(command),result=await sendWorkspaceIntent(intent,()=>{throw new Error('Fixture admission failed');},async()=>commandReceiptResponse(execution));assert.equal(result.ok,false);
   const saved=getWorkspaceIntents(intent.projectId,intent.actorId).find(value=>value.key===intent.key);assert.equal(saved?.status,'unknown');assert.equal(saved?.body,intent.body);
  });
  await t.test('a throwing old admission cannot rewrite a new exact dispatch',async()=>{
   const intent=intentFor(command);let release!:(response:Response)=>void,retry:ReturnType<typeof sendWorkspaceIntent>|undefined,current:WorkspaceIntent|undefined;
   const response=new Promise<Response>(resolve=>release=resolve);
   const old=await sendWorkspaceIntent(intent,()=>{retry=sendWorkspaceIntent(intent,()=> 'admitted',async()=>response);current=getWorkspaceIntents(intent.projectId,intent.actorId).find(value=>value.key===intent.key);throw new Error('Fixture old admission failed after a new dispatch');},async()=>commandReceiptResponse(execution));
   assert.equal(old.ok,false);assert.equal(getWorkspaceIntents(intent.projectId,intent.actorId).find(value=>value.key===intent.key),current);assert.equal(current?.status,'sending');assert.equal(current?.uncertain,true);
   release(commandReceiptResponse(execution));assert.equal((await retry)?.ok,true);assert.equal(getWorkspaceIntents(intent.projectId,intent.actorId).some(value=>value.key===intent.key),false);
  });
  for(const changed of [{replayed:undefined},{cursor:execution.result.cursor+1},{state:{...execution.result.state,projectId:'foreign-project'}}])assert.equal(await verifyWorkspaceCommandReceipt(intentFor(command),commandReceiptResponse(execution),{...execution.result,...changed}),false);
 }finally{await store.close();}
});

test('HRP06 actual persisted foreign or legacy nonempty events never bypass suffix proof through a valid header',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const foreign={type:'createSpec',content,requestId:randomUUID(),expectedVersion:0},committed=await store.executeCommand(foreign,human);
  for(const legacy of [false,true]){
   const command={...foreign,requestId:randomUUID()},response=structuredClone(committed);delete (response as {replayed?:boolean}).replayed;
   if(legacy){delete (response.events[0] as {requestId?:string}).requestId;delete (response.state.events[0] as {requestId?:string}).requestId;}
   await store.inspect('INSERT INTO ouro_command_receipts(actor_id,project_id,request_id,payload_hash,response,cursor) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[human.id,PROJECT_ID,command.requestId,hash(command),JSON.stringify(response),response.cursor]);
   const replay=await store.executeCommandWithReceipt(command,human),header=commandReceiptHeader(replay);assert(header,'The proof must come from the selected row, even when that historical row has foreign suffix provenance.');
   assert.equal(await verifyWorkspaceCommandReceipt(intentFor(command),commandReceiptResponse(replay),replay.result),false);
  }
 }finally{await store.close();}
});

test('HRP07 only contract-permitted empty projection padding shares a digest, and cursor must equal the frozen version',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const state=await store.getProject(),command={type:'createSpec',content,requestId:randomUUID(),expectedVersion:0},response={state,events:[],cursor:0};
  await store.inspect('INSERT INTO ouro_principals(id,kind) VALUES($1,$2)',[human.id,human.kind]);
  const legacy=structuredClone(response) as {state:Record<string,unknown>;events:unknown[];cursor:number};
  for(const key of ['verificationRuns','verificationReviews','verificationSlices','verificationPhases','verificationCycles','verificationRefactorAdmissions','verificationObservationConfigs','verificationObservations'])delete legacy.state[key];
  await store.inspect('INSERT INTO ouro_command_receipts(actor_id,project_id,request_id,payload_hash,response,cursor) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[human.id,PROJECT_ID,command.requestId,hash(command),JSON.stringify(legacy),0]);
  const replay=await store.executeCommandWithReceipt(command,human),intent=intentFor(command);
  assert.deepEqual(commandReceiptProjection(legacy,PROJECT_ID),commandReceiptProjection(response,PROJECT_ID));
  assert.equal(await verifyWorkspaceCommandReceipt(intent,commandReceiptResponse(replay),replay.result),true);
  assert.equal(await verifyWorkspaceCommandReceipt(intent,Response.json(replay.result),replay.result),false);
  assert.equal(await verifyWorkspaceCommandReceipt({...intent,expectedVersion:1},commandReceiptResponse(replay),replay.result),false);
  assert.equal(metadata(commandReceiptHeader(replay)!).servedBodySha256,createHash('sha256').update(canonicalProjectJSON(commandReceiptProjection(response,PROJECT_ID))).digest('hex'));
  assert.equal(commandReceiptProjection({...response,state:{...state,specs:undefined}},PROJECT_ID),null,'Missing nonempty/domain facts are not an empty verification collection.');
 }finally{await store.close();}
});

test('HRP08 delayed SHA cannot adopt into a disposed session or delete its UNKNOWN request',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 let session:ReturnType<typeof createProjectSession>|undefined;
 const descriptor=Object.getOwnPropertyDescriptor(crypto.subtle,'digest');
 const original=crypto.subtle.digest.bind(crypto.subtle);let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve),started=new Promise<void>(resolve=>entered=resolve);
 try{
  const command={type:'createSpec',content,requestId:randomUUID(),expectedVersion:0},execution=await store.executeCommandWithReceipt(command,human),scope={projectId:PROJECT_ID,actorId:human.id,accessEpoch:1};
  Object.defineProperty(crypto.subtle,'digest',{configurable:true,value:async(...args:Parameters<SubtleCrypto['digest']>)=>{entered();await gate;return original(...args);}});
  session=createProjectSession({sourceId:'hrp-delayed-proof',scope,ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,fetch:async()=>commandReceiptResponse(execution)})});
  const intent=freezeProjectCommandIntent({scope,operation:'execute-command',requestId:command.requestId,expectedVersion:0,body:JSON.stringify(command)}),pending=session.execute(intent);
  await started;session.dispose();release();assert.equal((await pending).status,'unknown');assert.equal(session.getSnapshot(),null);
  assert.equal(getWorkspaceIntents(PROJECT_ID,human.id).find(value=>value.requestId===command.requestId)?.status,'unknown');
 }finally{release?.();if(descriptor)Object.defineProperty(crypto.subtle,'digest',descriptor);else Reflect.deleteProperty(crypto.subtle,'digest');session?.dispose();await store.close();}
});

for(const scenario of ['reauthentication','A-B-A'] as const)test(`HRP14 ${scenario} during SHA cannot rewrite the new retry or publish into its Query owner`,async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]}),descriptor=Object.getOwnPropertyDescriptor(crypto.subtle,'digest'),originalDigest=crypto.subtle.digest.bind(crypto.subtle);
 let releaseSHA!:()=>void,enteredSHA!:()=>void,releaseRetry!:(response:Response)=>void,startedRetry!:()=>void,calls=0,digests=0;
 const shaGate=new Promise<void>(resolve=>releaseSHA=resolve),shaStarted=new Promise<void>(resolve=>enteredSHA=resolve),retryGate=new Promise<Response>(resolve=>releaseRetry=resolve),retryStarted=new Promise<void>(resolve=>startedRetry=resolve);
 let runtime:ReturnType<typeof createProjectRuntime>|undefined,oldLease:ReturnType<ReturnType<typeof createProjectRuntime>['acquire']>|undefined,newLease:typeof oldLease;
 try{
  const command={type:'createSpec',content,requestId:randomUUID(),expectedVersion:0},execution=await store.executeCommandWithReceipt(command,human),scope={projectId:PROJECT_ID,actorId:human.id,accessEpoch:10},body=JSON.stringify(command),oldIntent=freezeProjectCommandIntent({scope,operation:'execute-command',requestId:command.requestId,expectedVersion:0,body});
  Object.defineProperty(crypto.subtle,'digest',{configurable:true,value:async(...args:Parameters<SubtleCrypto['digest']>)=>{if(++digests<=2){enteredSHA();await shaGate;}return originalDigest(...args);}});
  runtime=createProjectRuntime({listenConnectivity:()=>()=>{},reporter:{report:()=>{}},ports:options=>createProjectHttpPorts({...options,fetch:async()=>{if(++calls===1)return commandReceiptResponse(execution);startedRetry();return retryGate;}})});
  oldLease=runtime.acquire(scope,'legacy');const oldKey=projectSnapshotQueryKey(oldLease.session),oldDone=oldLease.session.execute(oldIntent);await shaStarted;
  oldLease.release();if(scenario==='A-B-A'){const alternate=runtime.acquire({...scope,actorId:'other-context-author'},'legacy');alternate.release();}
  const currentScope={...scope,accessEpoch:scenario==='reauthentication'?11:10};newLease=runtime.acquire(currentScope,'legacy');const currentKey=projectSnapshotQueryKey(newLease.session);assert.notEqual(oldLease.session,newLease.session);if(scenario==='reauthentication')assert.notDeepEqual(oldKey,currentKey);else assert.deepEqual(oldKey,currentKey);
  const newIntent=freezeProjectCommandIntent({...oldIntent,scope:currentScope}),newDone=newLease.session.execute(newIntent);await retryStarted;
  const currentPending=getWorkspaceIntents(PROJECT_ID,human.id).find(value=>value.requestId===command.requestId);assert.equal(currentPending?.status,'sending');
  releaseSHA();assert.equal((await oldDone).status,'unknown');
  assert.equal(getWorkspaceIntents(PROJECT_ID,human.id).find(value=>value.requestId===command.requestId),currentPending,'The inactive old owner must not replace the exact record owned by the current retry.');
  assert.equal(currentPending?.status,'sending');assert.equal(runtime.queryClient.getQueryData(currentKey),undefined);assert.equal(runtime.queryClient.getQueryData(oldKey),undefined);assert.equal(newLease.session.getSnapshot(),null);
  releaseRetry(commandReceiptResponse(execution));assert.equal((await newDone).status,'confirmed');assert.equal(runtime.queryClient.getQueryData(currentKey),newLease.session.getSnapshot());assert.equal(newLease.session.getSnapshot()?.cursor,execution.result.cursor);assert.equal(getWorkspaceIntents(PROJECT_ID,human.id).some(value=>value.requestId===command.requestId),false);
 }finally{releaseSHA?.();releaseRetry?.(Response.json({}));if(descriptor)Object.defineProperty(crypto.subtle,'digest',descriptor);else Reflect.deleteProperty(crypto.subtle,'digest');oldLease?.release();newLease?.release();runtime?.queryClient.clear();await store.close();}
});
