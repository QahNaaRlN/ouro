import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {applyCommand,replay} from '../packages/core/src';
import type {WorkspaceIntent} from '../components/workspace-client';
const load=createRequire(join(process.cwd(),'tests/workspace-intents.test.ts'));
// Intent transport does not depend on the accordion's CSS or select runtime.
const presentation=load.resolve('../components/workspace-ui'),savedPresentation=load.cache[presentation];
load.cache[presentation]={exports:{WorkspaceAccordion:()=>null}} as NodeJS.Module;
const {freezeWorkspaceIntent,sendWorkspaceIntent,useWorkspaceIntents,forgetRejectedWorkspaceIntent,reviewUnknownWorkspaceIntent,restoreUnknownWorkspaceIntent}=load('../components/workspace-client') as typeof import('../components/workspace-client');
if(savedPresentation)load.cache[presentation]=savedPresentation;else delete load.cache[presentation];

function readIntent(intent:WorkspaceIntent){
 let current:WorkspaceIntent|undefined;
 function Probe(){current=useWorkspaceIntents(intent.projectId,intent.actorId).find(item=>item.key===intent.key);return null;}
 renderToStaticMarkup(React.createElement(Probe));return current;
}
function fixture(){
 const intent=freezeWorkspaceIntent({projectId:'fixture-project',actorId:'original-author',url:'/api/projects/fixture-project/commands',slot:randomUUID(),label:'Назначить исходную работу',body:{type:'startExecution',requestId:randomUUID(),expectedVersion:7,specId:'fixture-spec',specRevisionId:'fixture-revision',agentId:'fixture-agent'}});
 const body=JSON.parse(intent.body),canonical=JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a],[b])=>a.localeCompare(b))));
 const proof={phase:'workspace-binding-guard',outcome:'rejected',receipt:'absent',projectId:intent.projectId,actorId:intent.actorId,requestId:intent.requestId,commandType:body.type,bodySha256:createHash('sha256').update(canonical).digest('hex')};
 return {intent,proof};
}
test('fresh exact workspace-binding guard proof is a rejected intent and preserves the original request',async()=>{
 const originalFetch=globalThis.fetch,{intent,proof}=fixture(),calls:RequestInit[]=[];
 try{
  globalThis.fetch=async(_url,init)=>{calls.push(init!);return Response.json({error:{code:'WORKSPACE_BINDING_CONFLICT',message:'Folder binding requires owner review',details:{commandRejection:proof}}},{status:409});};
  assert.deepEqual(await sendWorkspaceIntent(intent),{ok:false});
  const saved=readIntent(intent);assert.equal(saved?.status,'rejected');assert.equal(saved?.body,intent.body);assert.equal(saved?.requestId,intent.requestId);assert.equal(saved?.actorId,'original-author');
  assert.equal(calls[0].body,intent.body);assert.equal(new Headers(calls[0].headers).get('X-Ouro-Expected-Participant'),'original-author');
 }finally{globalThis.fetch=originalFetch;}
});
test('only an exact fresh guard proof can classify binding rejection; ambiguous responses retain the frozen intent',async(t)=>{
 const variants:[string,(proof:ReturnType<typeof fixture>['proof'])=>Response][]=[
  ['no proof',()=>Response.json({error:{code:'WORKSPACE_BINDING_CONFLICT'}},{status:409})],
  ['wrong status',proof=>Response.json({error:{code:'WORKSPACE_BINDING_CONFLICT',details:{commandRejection:proof}}},{status:500})],
  ['wrong code',proof=>Response.json({error:{code:'OTHER_CONFLICT',details:{commandRejection:proof}}},{status:409})],
  ...['actorId','projectId','requestId','commandType','bodySha256','phase','receipt'].map(field=>[field,(proof:ReturnType<typeof fixture>['proof'])=>Response.json({error:{code:'WORKSPACE_BINDING_CONFLICT',details:{commandRejection:{...proof,[field]:'different'}}}},{status:409})] as [string,(proof:ReturnType<typeof fixture>['proof'])=>Response]),
  ['malformed JSON',()=>new Response('not json',{status:409})],
  ['redirected',proof=>{const response=Response.json({error:{code:'WORKSPACE_BINDING_CONFLICT',details:{commandRejection:proof}}},{status:409});Object.defineProperty(response,'redirected',{value:true});return response;}],
  ['auth changed',()=>Response.json({error:{code:'PARTICIPANT_CHANGED'}},{status:401})],
  ['project changed',()=>Response.json({error:{code:'PROJECT_CHANGED'}},{status:409})],
 ];
 for(const [label,response] of variants)await t.test(label,async()=>{
  const originalFetch=globalThis.fetch,{intent,proof}=fixture();
  try{globalThis.fetch=async()=>response(proof);await sendWorkspaceIntent(intent);const saved=readIntent(intent);assert.equal(saved?.status,'unknown');assert.equal(saved?.body,intent.body);assert.equal(saved?.actorId,intent.actorId);assert.equal(saved?.projectId,intent.projectId);assert.equal(saved?.requestId,intent.requestId);}finally{globalThis.fetch=originalFetch;}
 });
});
test('negative retries never resolve a previously unknown outcome, even when a later guard proves this retry was rejected',async(t)=>{
 for(const code of ['WORKSPACE_BINDING_CONFLICT','VERSION_CONFLICT','VALIDATION_ERROR','PARTICIPANT_CHANGED'])await t.test(code,async()=>{
  const originalFetch=globalThis.fetch,{intent,proof}=fixture(),calls:RequestInit[]=[];let attempt=0;
  try{
   globalThis.fetch=async(_url,init)=>{calls.push(init!);if(attempt++===0)throw new Error('lost response');return Response.json({error:{code,details:{commandRejection:proof}}},{status:code==='PARTICIPANT_CHANGED'?401:409});};
   await sendWorkspaceIntent(intent);await sendWorkspaceIntent(readIntent(intent)!);const saved=readIntent(intent);assert.equal(saved?.status,'unknown');assert.equal(saved?.body,intent.body);assert.equal(saved?.actorId,intent.actorId);assert.equal(calls[0].body,calls[1].body);assert.deepEqual(calls[0].headers,calls[1].headers);
  }finally{globalThis.fetch=originalFetch;}
 });
});
test('only a positive command receipt releases an unknown intent; changing its identity or body never sends a replacement',async()=>{
 const originalFetch=globalThis.fetch,{intent}=fixture(),calls:RequestInit[]=[];let attempt=0;
 try{
  globalThis.fetch=async(_url,init)=>{calls.push(init!);if(attempt++===0)throw new Error('timeout');if(attempt===2)return Response.json({});return receiptFor(intent);};
  await sendWorkspaceIntent(intent);assert.equal(readIntent(intent)?.status,'unknown');
  for(const changed of [{body:'{}'},{actorId:'other'},{projectId:'other'},{url:'/other'},{requestId:'other'}])await assert.rejects(sendWorkspaceIntent({...intent,...changed}),/исходное действие/);
  assert.equal(calls.length,1);await sendWorkspaceIntent(readIntent(intent)!);assert.equal(readIntent(intent)?.status,'unknown');await sendWorkspaceIntent(readIntent(intent)!);assert.equal(readIntent(intent),undefined);assert.equal(calls.length,3);
  assert(calls.every(call=>call.body===intent.body));assert(calls.every(call=>new Headers(call.headers).get('X-Ouro-Expected-Participant')==='original-author'));
 }finally{globalThis.fetch=originalFetch;}
});
test('task proof hashes the server command type and nested canonical content without changing original wire bytes',async()=>{
 const originalFetch=globalThis.fetch,intent=freezeWorkspaceIntent({projectId:'fixture-project',actorId:'original-author',url:'/api/projects/fixture-project/tasks',slot:randomUUID(),label:'Task',body:{requestId:'task-proof-request',expectedVersion:7,content:{title:'Title',goal:'Goal'},agentId:'fixture-agent'}});
 const canonical='{"agentId":"fixture-agent","content":{"goal":"Goal","title":"Title"},"expectedVersion":7,"requestId":"task-proof-request","type":"startProjectWork"}',proof={phase:'workspace-binding-guard',outcome:'rejected',receipt:'absent',projectId:intent.projectId,actorId:intent.actorId,requestId:intent.requestId,commandType:'startProjectWork',bodySha256:createHash('sha256').update(canonical).digest('hex')};
 try{globalThis.fetch=async(_url,init)=>{assert.equal(init?.body,intent.body);return Response.json({error:{code:'WORKSPACE_BINDING_CONFLICT',details:{commandRejection:proof}}},{status:409});};await sendWorkspaceIntent(intent);assert.equal(readIntent(intent)?.status,'rejected');assert.equal(readIntent(intent)?.body,intent.body);}finally{globalThis.fetch=originalFetch;}
});
test('recovering an uncertain binding operation requires its own positive receipt and never releases the original uncertain assignment',async()=>{
 const originalFetch=globalThis.fetch,{intent:original}=fixture(),reason='Owner explicitly establishes current folder trust',recovery=freezeWorkspaceIntent({projectId:original.projectId,actorId:original.actorId,url:'/api/projects/fixture-project/binding-recovery',slot:'binding-recovery-'+randomUUID(),label:'Recover folder',body:{ticket:'fixture-ticket',reason,acknowledgeUnknownContinuity:true}});let attempt=0;
 try{
  globalThis.fetch=async()=>{throw new Error('lost assignment response');};await sendWorkspaceIntent(original);
  globalThis.fetch=async(_url,init)=>{assert.equal(init?.body,recovery.body);if(attempt++===0)throw new Error('lost recovery response');return Response.json({project:{id:recovery.projectId,bindingId:'new-binding',rootPath:'C:/isolated',rootIdentity:{dev:'42',ino:'100'}},recovery:{recoveryId:'audit-record',projectId:recovery.projectId,actorId:attempt===2?'wrong-author':recovery.actorId,reason,acknowledgeUnknownContinuity:true,origin:'unknown',runtime:{platform:'win32',node:'24',uv:'1',architecture:'x64'},issuedAt:'2026-11-03T00:00:00.000Z',expiresAt:'2026-11-03T00:05:00.000Z',createdAt:'2026-11-03T00:01:00.000Z',oldBinding:{id:'old-binding',canonicalPath:'C:/isolated',identity:{dev:'0',ino:'100'}},newBinding:{id:'new-binding',canonicalPath:'C:/isolated',identity:{dev:'42',ino:'100'}}},replayed:true});};
  await sendWorkspaceIntent(recovery);await sendWorkspaceIntent(readIntent(recovery)!);assert.equal(readIntent(recovery)?.status,'unknown');await sendWorkspaceIntent(readIntent(recovery)!);assert.equal(readIntent(recovery),undefined);assert.equal(readIntent(original)?.status,'unknown');assert.equal(readIntent(original)?.body,original.body);assert.equal(readIntent(original)?.actorId,original.actorId);
 }finally{globalThis.fetch=originalFetch;}
});
test('fresh expired or invalid recovery tickets are closable rejections, while prior uncertainty and unrelated routes stay unknown',async(t)=>{
 for(const code of ['BINDING_RECOVERY_TICKET_EXPIRED','BINDING_RECOVERY_TICKET_INVALID'])await t.test(code,async()=>{
  const originalFetch=globalThis.fetch,{intent:command}=fixture(),slot=randomUUID(),url='/api/projects/fixture-project/binding-recovery',make=(ticket:string)=>freezeWorkspaceIntent({projectId:command.projectId,actorId:command.actorId,url,slot,label:'Recover folder',body:{ticket,reason:'Owner establishes current trust',acknowledgeUnknownContinuity:true}}),fresh=make('expired-ticket'),calls:RequestInit[]=[];
  try{
   globalThis.fetch=async(_url,init)=>{calls.push(init!);return Response.json({error:{code,message:'Inspect again for a fresh ticket'}},{status:422});};
   await sendWorkspaceIntent(fresh);assert.equal(readIntent(fresh)?.status,'rejected');assert.equal(readIntent(fresh)?.body,fresh.body);forgetRejectedWorkspaceIntent(readIntent(fresh)!);assert.equal(readIntent(fresh),undefined);
   const next=make('new-ticket-after-explicit-inspection');await sendWorkspaceIntent(next);assert.equal(readIntent(next)?.status,'rejected');assert.notEqual(next.requestId,fresh.requestId);assert.notEqual(calls[0].body,calls[1].body);
   const uncertain=freezeWorkspaceIntent({...next,slot:randomUUID(),body:{ticket:'uncertain-ticket',reason:'Preserve original uncertain recovery',acknowledgeUnknownContinuity:true}});
   globalThis.fetch=async()=>{throw new Error('lost response');};await sendWorkspaceIntent(uncertain);globalThis.fetch=async()=>Response.json({error:{code}},{status:422});await sendWorkspaceIntent(readIntent(uncertain)!);assert.equal(readIntent(uncertain)?.status,'unknown');forgetRejectedWorkspaceIntent(readIntent(uncertain)!);assert.equal(readIntent(uncertain)?.status,'unknown');assert.equal(readIntent(uncertain)?.body,uncertain.body);
   await sendWorkspaceIntent(command);assert.equal(readIntent(command)?.status,'unknown','Ticket codes must not reject unrelated command routes');
  }finally{globalThis.fetch=originalFetch;}
 });
});
test('a recovery-shaped 200 without its complete binding audit cannot release the frozen request',async()=>{
 const originalFetch=globalThis.fetch,{intent:command}=fixture(),reason='Explicit owner reason',intent=freezeWorkspaceIntent({projectId:command.projectId,actorId:command.actorId,url:'/api/projects/fixture-project/binding-recovery',slot:randomUUID(),label:'Recover folder',body:{ticket:'ticket',reason,acknowledgeUnknownContinuity:true}});
 try{globalThis.fetch=async()=>Response.json({project:{id:intent.projectId},recovery:{projectId:intent.projectId,actorId:intent.actorId,reason,acknowledgeUnknownContinuity:true},replayed:true});await sendWorkspaceIntent(intent);assert.equal(readIntent(intent)?.status,'unknown');assert.equal(readIntent(intent)?.body,intent.body);}finally{globalThis.fetch=originalFetch;}
});
test('owner-reviewed copy registers the exact provided start request as UNKNOWN without any fetch or generated identity',()=>{
 const originalFetch=globalThis.fetch,{intent}=fixture(),request={...JSON.parse(intent.body),flowTracking:'enforced',retryOfExecutionId:'prior-attempt'},copy=JSON.stringify({observedDate:'unverified historical metadata',projectId:intent.projectId,actorId:intent.actorId,request,source:'copy only'}),input={copy,projectId:intent.projectId!,actorId:intent.actorId};let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;throw new Error('Copy registration must never use transport');};
  const reviewed=reviewUnknownWorkspaceIntent(input);assert.equal(readIntent(reviewed),undefined,'Review cannot register a request');assert.equal(reviewed.body,JSON.stringify(request));assert.equal(reviewed.requestId,request.requestId);assert.equal(reviewed.expectedVersion,request.expectedVersion);
  assert.throws(()=>restoreUnknownWorkspaceIntent({...input,acknowledgeUnverifiedCopy:false}),/рассмотрите копию/);
  const saved=restoreUnknownWorkspaceIntent({...input,acknowledgeUnverifiedCopy:true});assert.equal(saved.status,'unknown');assert.equal(saved.body,JSON.stringify(request));assert.equal(saved.requestId,request.requestId);assert.equal(saved.actorId,intent.actorId);assert.equal(saved.projectId,intent.projectId);assert.equal(saved.url,intent.url);assert.equal(saved.copyUnverified,true);assert.match(saved.key,/restored-start:/);assert.match(saved.message,/Точность исторических байтов не подтверждена/);assert.equal(readIntent(saved),saved);assert.equal(calls,0);
 }finally{globalThis.fetch=originalFetch;}
});
test('copy restore rejects foreign scope, unsupported command fields and missing original identity without transport',()=>{
 const {intent}=fixture(),request=JSON.parse(intent.body),input={projectId:intent.projectId!,actorId:intent.actorId},wrap=(change:Record<string,unknown>={},body:Record<string,unknown>=request)=>JSON.stringify({...input,...change,request:body});
 const invalid=[wrap({projectId:'another-project'}),wrap({actorId:'another-author'}),wrap({}, {...request,type:'createSpec'}),wrap({}, {...request,enforceFlow:true}),wrap({}, {...request,projectId:'another-project'}),wrap({}, {...request,requestId:undefined}),wrap({}, {...request,expectedVersion:'7'}),wrap({}, {...request,flowTracking:'disabled'}),wrap({}, {...request,retryOfExecutionId:null})];
 for(const copy of invalid)assert.throws(()=>restoreUnknownWorkspaceIntent({...input,copy,acknowledgeUnverifiedCopy:true}));
});
test('copy restore preserves an already pending raw body and key, rejecting even semantically equivalent bytes or changed scope and URL',async()=>{
 const originalFetch=globalThis.fetch,{intent}=fixture(),request=JSON.parse(intent.body),input={projectId:intent.projectId!,actorId:intent.actorId,copy:JSON.stringify({projectId:intent.projectId,actorId:intent.actorId,request}),acknowledgeUnverifiedCopy:true};
 try{
  globalThis.fetch=async()=>{throw new Error('original lost response');};await sendWorkspaceIntent(intent);const existing=readIntent(intent)!;assert.equal(restoreUnknownWorkspaceIntent(input),existing);assert.equal(readIntent(intent)?.key,intent.key);
  const reordered=Object.fromEntries(Object.entries(request).reverse());assert.throws(()=>restoreUnknownWorkspaceIntent({...input,copy:JSON.stringify({projectId:intent.projectId,actorId:intent.actorId,request:reordered})}),/Исходный запрос оставлен/);
  assert.throws(()=>restoreUnknownWorkspaceIntent({...input,actorId:'other',copy:JSON.stringify({projectId:intent.projectId,actorId:'other',request})}),/Исходный запрос оставлен/);
  assert.throws(()=>restoreUnknownWorkspaceIntent({...input,projectId:'other',copy:JSON.stringify({projectId:'other',actorId:intent.actorId,request})}),/Исходный запрос оставлен/);
  assert.equal(readIntent(intent),existing);assert.equal(readIntent(intent)?.body,intent.body);
  const another=fixture().intent,wrongUrl={...another,url:'/api/projects/fixture-project/tasks'};await sendWorkspaceIntent(wrongUrl);assert.throws(()=>restoreUnknownWorkspaceIntent({...input,copy:JSON.stringify({projectId:another.projectId,actorId:another.actorId,request:JSON.parse(another.body)})}),/Исходный запрос оставлен/);assert.equal(readIntent(wrongUrl)?.url,wrongUrl.url);
 }finally{globalThis.fetch=originalFetch;}
});
function deferredResponse(){let resolve!:(response:Response)=>void,reject!:(reason:Error)=>void;const promise=new Promise<Response>((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};}
function receiptFor(intent:WorkspaceIntent){
 const body:unknown=JSON.parse(intent.body);assert(body&&typeof body==='object'&&'specId' in body&&'specRevisionId' in body&&'agentId' in body);
 const {specId,specRevisionId,agentId}=body;assert.equal(typeof specId,'string');assert.equal(typeof specRevisionId,'string');assert.equal(typeof agentId,'string');
 if(typeof specId!=='string'||typeof specRevisionId!=='string'||typeof agentId!=='string'||!intent.projectId)throw new Error('Invalid command fixture');
 const actor={id:intent.actorId,kind:'human' as const,projectIds:[intent.projectId]},content={title:'Receipt fixture',goal:'Recover the original assignment',dod:[{id:'receipt',text:'Same command receipt',required:true}],constraints:'Original scope',assumptions:'Local fixture',risks:'Lost response',inputs:'Frozen command',comment:'Regression fixture'};
 let state=replay([],intent.projectId),ids=0;
 const id=()=>++ids===1?specId:ids===2?specRevisionId:'receipt-fixture-'+ids;
 for(let index=0;index<6;index++)state=applyCommand(state,{type:'createSpec',content,requestId:randomUUID(),expectedVersion:state.version},actor,{id}).state;
 state=applyCommand(state,{type:'activateRevision',specId,revisionId:specRevisionId,requestId:randomUUID(),expectedVersion:state.version},actor,{id}).state;
 assert.equal(state.version,intent.expectedVersion);
 const applied=applyCommand(state,{type:'startExecution',specId,specRevisionId,agentId,requestId:intent.requestId,expectedVersion:state.version},actor,{id});
 return Response.json({...applied,cursor:applied.state.version,replayed:true});
}
test('late duplicate failure cannot resurrect an exact request after another response positively resolved it',async(t)=>{
 for(const kind of ['binding-rejection','transport-failure'])await t.test(kind,async()=>{
  const originalFetch=globalThis.fetch,{intent,proof}=fixture(),responses=[deferredResponse(),deferredResponse()];let count=0;
  try{
   globalThis.fetch=async()=>responses[count++].promise;
   const first=sendWorkspaceIntent(intent),second=sendWorkspaceIntent(intent);responses[0].resolve(receiptFor(intent));assert.equal((await first).ok,true);assert.equal(readIntent(intent),undefined);
   if(kind==='binding-rejection')responses[1].resolve(Response.json({error:{code:'WORKSPACE_BINDING_CONFLICT',details:{commandRejection:proof}}},{status:409}));else responses[1].reject(new Error('late transport error'));
   await second;assert.equal(readIntent(intent),undefined,'A late duplicate failure must never resurrect the resolved request');
  }finally{globalThis.fetch=originalFetch;}
 });
});
test('concurrent uncertainty stays sticky when a later duplicate rejection began before the other call became unknown',async()=>{
 const originalFetch=globalThis.fetch,{intent,proof}=fixture(),responses=[deferredResponse(),deferredResponse()];let count=0;
 try{
  globalThis.fetch=async()=>responses[count++].promise;const first=sendWorkspaceIntent(intent),second=sendWorkspaceIntent(intent);responses[0].reject(new Error('lost response'));await first;assert.equal(readIntent(intent)?.status,'unknown');responses[1].resolve(Response.json({error:{code:'WORKSPACE_BINDING_CONFLICT',details:{commandRejection:proof}}},{status:409}));await second;assert.equal(readIntent(intent)?.status,'unknown');assert.equal(readIntent(intent)?.body,intent.body);
 }finally{globalThis.fetch=originalFetch;}
});
test('late duplicate success or failure cannot clear or overwrite a newer request occupying the same slot',async(t)=>{
 for(const kind of ['success','failure'])await t.test(kind,async()=>{
  const originalFetch=globalThis.fetch,{intent}=fixture(),responses=[deferredResponse(),deferredResponse(),deferredResponse()];let count=0;
  try{
   globalThis.fetch=async()=>responses[count++].promise;const first=sendWorkspaceIntent(intent),late=sendWorkspaceIntent(intent);responses[0].resolve(receiptFor(intent));await first;
   const next={...intent,requestId:randomUUID(),body:JSON.stringify({...JSON.parse(intent.body),requestId:randomUUID(),specId:'new-spec'})};next.body=JSON.stringify({...JSON.parse(next.body),requestId:next.requestId});const newer=sendWorkspaceIntent(next),saved=readIntent(next)!;
   if(kind==='success')responses[1].resolve(receiptFor(intent));else responses[1].reject(new Error('late failure'));await late;assert.equal(readIntent(next),saved);assert.equal(readIntent(next)?.body,next.body);
   responses[2].resolve(receiptFor(next));await newer;assert.equal(readIntent(next),undefined);
  }finally{globalThis.fetch=originalFetch;}
 });
});
