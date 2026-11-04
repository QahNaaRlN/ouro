import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyCommand,createSeedEvents,replay,PROJECT_ID} from '../packages/core/src';
import {createProjectSession,createProjectSessionRegistry} from '../packages/client/src/lifecycle/project-session';
import {freezeProjectCommandIntent,type ProjectClientScope,type ProjectCommandReceiptDTO} from '../packages/client/src/ports';
import {createProjectHttpPorts} from '../packages/client/src/http/project-http';
import {getWorkspaceIntents} from '../packages/client/src/http/workspace-intents';
import {createProjectQueryClient,bindProjectSessionQuery,projectSnapshotQueryKey} from '../packages/frontend/src/api/project-session/project-session.query';
import type {ProjectEventSource} from '../packages/client/src/http/project-subscription';
import {createProjectSnapshotAdopter} from '../packages/client/src/lifecycle/project-snapshot';

const scope:ProjectClientScope={projectId:PROJECT_ID,actorId:'local-human',accessEpoch:7};
const seed=createSeedEvents();
const snapshot=(cursor:number)=>({state:replay(seed.slice(0,cursor)),cursor});
const content={title:'Receipt fixture',goal:'Prove the original command',dod:[{id:'receipt',text:'Original receipt is bound',required:true}],constraints:'Same project',assumptions:'Local fixture',risks:'Lost response',inputs:'Frozen command',comment:'Regression fixture'};
const intent=()=>{const requestId=randomUUID();return freezeProjectCommandIntent({operation:'execute-command',scope,requestId,expectedVersion:12,body:'{ "type":"createSpec", "requestId":'+JSON.stringify(requestId)+', "expectedVersion":12, "content":'+JSON.stringify(content)+' }'});};
const commandReceipt=(original:ReturnType<typeof intent>,actorId=scope.actorId,requestId=original.requestId)=>{
 const applied=applyCommand(snapshot(12).state,{type:'createSpec',requestId,expectedVersion:12,content},{id:actorId,kind:'human',projectIds:[scope.projectId]});
 return {...applied,cursor:applied.state.version,replayed:true};
};
class Source extends EventTarget implements ProjectEventSource{
 readyState=0;onopen:((event:Event)=>unknown)|null=null;onerror:((event:Event)=>unknown)|null=null;closed=false;
 close(){this.closed=true;this.readyState=2;}
 frame(cursor:number){this.dispatchEvent(new MessageEvent('snapshot',{data:JSON.stringify(snapshot(cursor)),lastEventId:String(cursor)}));}
}
test('P12 HTTP command loss and malformed success preserve exact original intent without automatic retries',async()=>{
 let calls=0;const original=intent(),bodies:unknown[]=[],headers:Headers[]=[];
 const session=createProjectSession({sourceId:'fixture',scope,reporter:{report:()=>{throw new Error('sink failed');}},ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,fetch:async(_url,init)=>{
  calls++;bodies.push(init?.body);headers.push(new Headers(init?.headers));
  if(calls===1)throw new Error('lost response');if(calls===2)return Response.json({});
  return Response.json(commandReceipt(original));
 }})});
 try{
  assert.equal((await session.execute(original)).status,'unknown');assert.equal(calls,1);
  assert.equal((await session.execute(original)).status,'unknown');assert.equal(calls,2);
  assert.equal(getWorkspaceIntents(scope.projectId,scope.actorId).find(value=>value.requestId===original.requestId)?.body,original.body);
  assert.equal((await session.execute(original)).status,'confirmed');assert.equal(calls,3);
  assert(bodies.every(body=>body===original.body));assert(headers.every(value=>value.get('X-Ouro-Expected-Participant')===scope.actorId&&value.get('X-Ouro-Project-Id')===scope.projectId));
  assert(!getWorkspaceIntents(scope.projectId,scope.actorId).some(value=>value.requestId===original.requestId));
 }finally{session.dispose();}
});

test('P12 an unrelated valid suffix, an empty batch or an unbound legacy receipt cannot confirm the frozen command',async(t)=>{
 const variants=[
  {name:'foreign seed suffix',receipt:()=>({...snapshot(12),events:[seed[11]],replayed:true})},
  {name:'same actor but another request',receipt:(original:ReturnType<typeof intent>)=>commandReceipt(original,scope.actorId,randomUUID())},
  {name:'same request but another actor',receipt:(original:ReturnType<typeof intent>)=>commandReceipt(original,'another-human')},
  {name:'empty no-op without request proof',receipt:()=>({...snapshot(12),events:[],replayed:true})},
  {name:'legacy events without requestId',receipt:(original:ReturnType<typeof intent>)=>{
   const bound=commandReceipt(original),events=bound.events.map(event=>{const {requestId,...legacy}=event;assert.equal(requestId,original.requestId);return legacy;});
   return {...bound,state:replay([...seed.slice(0,12),...events]),events};
  }},
 ];
 for(const variant of variants)await t.test(variant.name,async()=>{
  const original=intent(),receipt=variant.receipt(original);
  assert.notEqual(createProjectSnapshotAdopter(scope.projectId).adopt(receipt).status,'invalid','The response must be a valid snapshot, so receipt binding is the actual boundary');
  const session=createProjectSession({sourceId:'receipt-fixture',scope,ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,fetch:async()=>Response.json(receipt)})});
  try{
   assert.equal((await session.execute(original)).status,'unknown');
   const pending=getWorkspaceIntents(scope.projectId,scope.actorId).find(value=>value.requestId===original.requestId);
   assert.equal(pending?.status,'unknown');assert.equal(pending?.body,original.body);assert.equal(session.getSnapshot(),null);
  }finally{session.dispose();}
 });
});

test('P12 the complete bound task batch confirms exact bytes and does not mistake execution correlationId for requestId',async()=>{
 const requestId=randomUUID(),command={type:'startProjectWork' as const,requestId,expectedVersion:12,content,agentId:'task-fixture-agent'},body={requestId,expectedVersion:12,content,agentId:command.agentId};
 const original=freezeProjectCommandIntent({operation:'start-project-work',scope,requestId,expectedVersion:12,body:JSON.stringify(body)});
 const applied=applyCommand(snapshot(12).state,command,{id:scope.actorId,kind:'human',projectIds:[scope.projectId]}),receipt={...applied,cursor:applied.state.version,replayed:false};
 assert.equal(applied.events.length,3);assert.notEqual(applied.events.at(-1)?.correlationId,requestId);
 let calls=0;const session=createProjectSession({sourceId:'task-receipt-fixture',scope,ports:adopter=>createProjectHttpPorts({scope,mode:'workspace',adopter,fetch:async(url,init)=>{calls++;assert.equal(url,'/api/projects/'+scope.projectId+'/tasks');assert.equal(init?.body,original.body);return Response.json(receipt);}})});
 try{
  assert.equal((await session.execute(original)).status,'confirmed');assert.equal(calls,1);assert.equal(session.getSnapshot()?.cursor,15);
  assert(!getWorkspaceIntents(scope.projectId,scope.actorId).some(value=>value.requestId===requestId));
 }finally{session.dispose();}
});

test('P12 an immutable receipt missing old empty projections still confirms when its events prove the original request',async()=>{
 const original=intent(),receipt=commandReceipt(original),state:Record<string,unknown>={...receipt.state};
 for(const field of ['verificationRuns','verificationReviews','verificationSlices','verificationPhases','verificationCycles','verificationRefactorAdmissions','verificationObservationConfigs','verificationObservations'])delete state[field];
 const session=createProjectSession({sourceId:'legacy-receipt-fixture',scope,ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,fetch:async()=>Response.json({...receipt,state})})});
 try{assert.equal((await session.execute(original)).status,'confirmed');assert.equal(session.getSnapshot()?.cursor,13);assert(!getWorkspaceIntents(scope.projectId,scope.actorId).some(value=>value.requestId===original.requestId));}finally{session.dispose();}
});
test('P12 GET command and SSE publish one accepted Query reference and reject a late GET',async()=>{
 const source=new Source(),client=createProjectQueryClient();let resolveRead:(value:Response)=>void=()=>{throw new Error('No read');};
 const read=new Promise<Response>(resolve=>{resolveRead=resolve;});
 const session=createProjectSession({sourceId:'fixture',scope,ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,fetch:()=>read,createEventSource:url=>{assert.match(url,/after=0.*projectId=/);return source;}})});
 const close=bindProjectSessionQuery(client,session);
 try{
  const pending=session.refresh();session.start();source.frame(20);const accepted=session.getSnapshot();assert(accepted);
  assert.equal(client.getQueryData(projectSnapshotQueryKey(session)),accepted);
  resolveRead(Response.json(snapshot(12)));await pending;
  assert.equal(session.getSnapshot(),accepted);assert.equal(client.getQueryData(projectSnapshotQueryKey(session)),accepted);
  source.frame(20);assert.equal(client.getQueryData(projectSnapshotQueryKey(session)),accepted);
 }finally{session.dispose();assert.equal(client.getQueryData(projectSnapshotQueryKey(session)),undefined);close();client.clear();}
});
test('P12 runtime leases share one owner and only the last release closes its stream',()=>{
 const registry=createProjectSessionRegistry();let opens=0,closes=0;
 const options={sourceId:'fixture',scope,ports:()=>({
  read:{readSnapshot:async()=>({status:'available' as const,value:snapshot(12)}),readWorkspace:async()=>({status:'unsupported' as const,capability:'read-workspace' as const})},
  command:{execute:async()=>({status:'unknown' as const,reason:'transport' as const})},
  subscription:{subscribe:()=>{opens++;return {close:()=>{closes++;},reconnect:()=>{}};}},
 })};
 const first=registry.acquire(options),second=registry.acquire(options);assert.equal(first.session,second.session);first.session.start();second.session.start();assert.equal(opens,1);
 first.release();first.release();assert.equal(closes,0);second.release();assert.equal(closes,1);
 const next=registry.acquire({...options,scope:{...scope,accessEpoch:8}});assert.notEqual(next.session,first.session);next.release();
});
test('P12 incompatible positive receipt stays UNKNOWN and reporter rejection cannot resolve it',async()=>{
 const original=intent(),bound=commandReceipt(original),foreign=bound.state.events.map((event,index)=>index===0?{...event,correlationId:'different-valid-history'}:event),receipt:ProjectCommandReceiptDTO={...bound,state:replay(foreign)};
 assert.notEqual(foreign[0].correlationId,seed[0].correlationId);
 const session=createProjectSession({sourceId:'fixture',scope,reporter:{report:async()=>{throw new Error('sink rejected');}},ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,fetch:async()=>Response.json(receipt)})});
 session.admit(snapshot(12));const prior=session.getSnapshot();
 try{assert.equal((await session.execute(original)).status,'unknown');assert.equal(session.getSnapshot(),prior);assert.equal(getWorkspaceIntents(scope.projectId,scope.actorId).find(value=>value.requestId===original.requestId)?.status,'unknown');await Promise.resolve();}finally{session.dispose();}
});
test('P12 an access change after dispatch keeps UNKNOWN and immediately hides the old private snapshot',async()=>{
 const original=intent(),session=createProjectSession({sourceId:'fixture',scope,ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,fetch:async()=>Response.json({error:{code:'PARTICIPANT_CHANGED',message:'Changed actor'}},{status:401})})});
 session.admit(snapshot(12));
 try{assert.equal((await session.execute(original)).status,'unknown');assert.equal(session.getView().active,false);assert.equal(session.getView().snapshot,null);assert.equal(getWorkspaceIntents(scope.projectId,scope.actorId).find(value=>value.requestId===original.requestId)?.status,'unknown');}finally{session.dispose();}
});
test('P12 disposal aborts a pending HTTP read without adopting its late successful body',async()=>{
 let signal:AbortSignal|null|undefined,resolveRead:(value:Response)=>void=()=>{throw new Error('No read');};
 const read=new Promise<Response>(resolve=>{resolveRead=resolve;});
 const session=createProjectSession({sourceId:'fixture',scope,ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,fetch:(_url,init)=>{signal=init?.signal;return read;}})});
 const pending=session.refresh();session.dispose();assert.equal(signal?.aborted,true);resolveRead(Response.json(snapshot(20)));await pending;assert.equal(session.getView().snapshot,null);
});
test('P12 a frozen intent from an earlier access epoch is rejected before the command port or network',async()=>{
 const original=intent(),nextScope={...scope,accessEpoch:scope.accessEpoch+1};let portCalls=0,networkCalls=0;
 const session=createProjectSession({sourceId:'fixture',scope:nextScope,ports:()=>({read:{readSnapshot:async()=>({status:'available',value:snapshot(12)}),readWorkspace:async()=>({status:'unsupported',capability:'read-workspace'})},command:{execute:async()=>{portCalls++;return {status:'unknown',reason:'transport'};}},subscription:{subscribe:()=>({close:()=>{},reconnect:()=>{}})}})});
 const adapter=createProjectHttpPorts({scope:nextScope,mode:'legacy',adopter:createProjectSnapshotAdopter(scope.projectId),fetch:async()=>{networkCalls++;return Response.json({});}});
 try{await assert.rejects(session.execute(original),{code:'CONTEXT_CHANGED'});assert.equal(portCalls,0);await assert.rejects(adapter.command.execute(original),{code:'CONTEXT_CHANGED'});assert.equal(networkCalls,0);}finally{session.dispose();}
});
test('P12 closing a stream aborts its in-flight reconciliation GET',async()=>{
 const source=new Source();let signal:AbortSignal|null|undefined,resolveRead:(value:Response)=>void=()=>{throw new Error('No read');};
 const read=new Promise<Response>(resolve=>{resolveRead=resolve;});
 const session=createProjectSession({sourceId:'fixture',scope,ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,createEventSource:()=>source,fetch:(_url,init)=>{signal=init?.signal;return read;}})});
 session.start();source.readyState=2;source.onerror?.(new Event('error'));session.dispose();
 assert.equal(signal?.aborted,true);resolveRead(Response.json(snapshot(20)));await Promise.resolve();assert.equal(session.getView().snapshot,null);
});
test('P12 malformed error bodies stay UNKNOWN with a safe pending message and retain access-denial status',async()=>{
 for(const response of [new Response('{broken',{status:401}),Response.json({error:{code:'OUTPUT_CONTRACT_ERROR',message:{private:'invalid message'}}},{status:500})]){
  const original=intent(),session=createProjectSession({sourceId:'fixture',scope,ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,fetch:async()=>response})});session.admit(snapshot(12));
  try{assert.equal((await session.execute(original)).status,'unknown');const saved=getWorkspaceIntents(scope.projectId,scope.actorId).find(value=>value.requestId===original.requestId);assert.equal(typeof saved?.message,'string');if(response.status===401)assert.equal(session.getView().active,false);}finally{session.dispose();}
 }
});
