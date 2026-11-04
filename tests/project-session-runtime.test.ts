import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectRuntime} from '../components/project-session-provider';
import {projectReadQueryKey,projectSnapshotQueryKey} from '../packages/frontend/src/api/project-session';
import {applyCommand,createSeedEvents,replay,PROJECT_ID} from '../packages/core/src';
import type {ProjectSnapshotDTO} from '../packages/client/src/ports';
import {freezeProjectCommandIntent} from '../packages/client/src/ports';
import {createProjectHttpPorts} from '../packages/client/src/http/project-http';
import {getWorkspaceIntents} from '../packages/client/src/http/workspace-intents';

test('P12 release then immediate same-scope acquire cannot clear or repopulate the new Query owner',async()=>{
 const scope={projectId:PROJECT_ID,actorId:'local-human',accessEpoch:4},seed=createSeedEvents();
 let resolveOld:(value:{status:'available';value:ProjectSnapshotDTO})=>void=()=>{throw new Error('No old read');},reads=0,connected=0,disconnected=0;
 const oldRead=new Promise<{status:'available';value:ProjectSnapshotDTO}>(resolve=>{resolveOld=resolve;});
 const runtime=createProjectRuntime({listenConnectivity:()=>{connected++;return()=>{disconnected++;};},reporter:{report:()=>{}},ports:()=>({
  read:{readSnapshot:async()=>{if(++reads===1)return oldRead;return {status:'available',value:{state:replay(seed.slice(0,20)),cursor:20}};},readWorkspace:async()=>({status:'unsupported',capability:'read-workspace'})},
  command:{execute:async()=>({status:'unknown',reason:'transport'})},subscription:{subscribe:()=>({close:()=>{},reconnect:()=>{}})},
 })});
 const first=runtime.acquire(scope,'legacy'),oldKey=projectReadQueryKey(first.session,'legacy');
 const oldDone=runtime.queryClient.fetchQuery({queryKey:oldKey,queryFn:async()=>{await first.session.refresh();return 'old';}}).catch(()=>null);
 first.release();const next=runtime.acquire(scope,'legacy'),newKey=projectReadQueryKey(next.session,'legacy');assert.notDeepEqual(oldKey,newKey);
 try{
  await runtime.queryClient.fetchQuery({queryKey:newKey,queryFn:async()=>{await next.session.refresh();return 'current';}});
  resolveOld({status:'available',value:{state:replay(seed.slice(0,12)),cursor:12}});await oldDone;await Promise.resolve();
  assert.equal(runtime.queryClient.getQueryData(newKey),'current');assert.equal(runtime.queryClient.getQueryData(oldKey),undefined);
  assert.equal(runtime.queryClient.getQueryData(projectSnapshotQueryKey(next.session)),next.session.getSnapshot());assert.equal(next.session.getSnapshot()?.cursor,20);
  assert.equal(connected,2);assert.equal(disconnected,1);
 }finally{next.release();runtime.queryClient.clear();assert.equal(disconnected,2);}
});
test('P12 UNKNOWN retains its original action label and occupied slot across owner disposal and exact retry',async()=>{
 const scope={projectId:'presentation-fixture',actorId:'presentation-owner',accessEpoch:2},requestId=crypto.randomUUID(),slot='create-spec',label='Создать новую спецификацию';
 const content={title:'Presentation fixture',goal:'Keep the original action',dod:[{id:'slot',text:'Same slot cannot send another intent',required:true}],constraints:'Original bytes',assumptions:'Local fixture',risks:'Lost response',inputs:'Frozen command',comment:'Regression fixture'};
 const command={type:'createSpec' as const,expectedVersion:0,requestId,content},original=freezeProjectCommandIntent({scope,operation:'execute-command',requestId,expectedVersion:0,body:' '+JSON.stringify(command)+' '});
 const nextId=crypto.randomUUID(),replacement=freezeProjectCommandIntent({...original,requestId:nextId,body:JSON.stringify({...command,requestId:nextId})});
 let calls=0;const sent:Array<{url:string;body:unknown;key:string|undefined;label:string|undefined}>=[];
 const runtime=createProjectRuntime({listenConnectivity:()=>()=>{},reporter:{report:()=>{}},ports:options=>createProjectHttpPorts({...options,fetch:async(_url,init)=>{
  calls++;const pending=getWorkspaceIntents(scope.projectId,scope.actorId).find(value=>value.requestId===requestId);sent.push({url:String(_url),body:init?.body,key:pending?.key,label:pending?.label});
  if(calls===1)throw new Error('lost response');const applied=applyCommand(replay([],scope.projectId),command,{id:scope.actorId,kind:'human',projectIds:[scope.projectId]});return Response.json({...applied,cursor:applied.state.version,replayed:true});
 }})});
 const first=runtime.acquire(scope,'workspace'),presentation={slot,label};
 try{
  assert.equal((await first.session.execute(original,presentation)).status,'unknown');presentation.label='Changed caller label';
  const saved=getWorkspaceIntents(scope.projectId,scope.actorId).find(value=>value.requestId===requestId);
  const blocked=await first.session.execute(replacement,{slot,label:'Другое действие'});assert.equal(blocked.status,'rejected');assert.equal(calls,1);assert.equal(getWorkspaceIntents(scope.projectId,scope.actorId).find(value=>value.requestId===requestId),saved);
  assert.equal(saved?.label,label);assert.equal(saved?.key,scope.actorId+':'+scope.projectId+':'+slot);
  first.release();const next=runtime.acquire(scope,'legacy');
  try{
   assert.notEqual(first.session,next.session);
   assert.equal((await next.session.execute(replacement,{slot,label:'Другое действие после перехода'})).status,'rejected');assert.equal(calls,1);
   assert.equal((await next.session.execute(original,{slot:'different-slot',label})).status,'rejected');assert.equal(calls,1);assert.equal(getWorkspaceIntents(scope.projectId,scope.actorId).find(value=>value.requestId===requestId),saved);
   assert.equal((await next.session.execute(original)).status,'confirmed');assert.equal(calls,2);const expected={url:'/api/projects/'+scope.projectId+'/commands',body:original.body,key:saved?.key,label};assert.deepEqual(sent,[expected,expected]);assert(!getWorkspaceIntents(scope.projectId,scope.actorId).some(value=>value.requestId===requestId));
  }finally{next.release();}
 }finally{first.release();runtime.queryClient.clear();}
});
