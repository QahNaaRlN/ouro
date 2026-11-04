import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectRuntime,type ProjectRuntimeOptions,type ProjectRuntimePortFactory} from '../packages/frontend/src/app/project-runtime';
import {projectSnapshotQueryKey} from '../packages/frontend/src/api/project-session';
import {ClientError,type ClientErrorOccurrence,type ProjectSnapshotObserver} from '../packages/client/src/ports';
import {createSeedEvents,replay,PROJECT_ID} from '../packages/core/src';
import type {ProjectSnapshotAdopter} from '../packages/client/src/lifecycle/project-snapshot';

const scope={projectId:PROJECT_ID,actorId:'environment-owner',accessEpoch:7,hostEpoch:1};

/** Создаёт семантические fixture ports без browser/HTTP транспорта. */
function portsAt(cursor:number):ProjectRuntimePortFactory{
 return()=>({read:{readSnapshot:async()=>({status:'available',value:{state:replay(createSeedEvents().slice(0,cursor)),cursor}}),readWorkspace:async()=>({status:'unsupported',capability:'read-workspace'})},command:{execute:async()=>({status:'unknown',reason:'transport'})},subscription:{subscribe:()=>({close:()=>{},reconnect:()=>{}})}});
}

test('PRE01 missing environment dependencies fail before any implicit transport or listener',()=>{
 let calls=0;
 const options:ProjectRuntimeOptions={sourceId:'host-A',ports:()=>{calls++;throw new Error('Unexpected port construction');},reporter:{report:()=>{calls++;}},listenConnectivity:()=>{calls++;return()=>{};}};
 for(const value of [undefined,{}, {...options,sourceId:''},{...options,ports:undefined},{...options,reporter:undefined},{...options,listenConnectivity:undefined}]){
  assert.throws(()=>createProjectRuntime(value as unknown as ProjectRuntimeOptions),TypeError);
 }
 assert.equal(calls,0);
});

test('PRE02 explicit semantic environments isolate source and host generations without ambient browser access',async()=>{
 const original=new Map(['fetch','EventSource','window'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const runtimes:Array<ReturnType<typeof createProjectRuntime>>=[],leases:Array<ReturnType<ReturnType<typeof createProjectRuntime>['acquire']>>=[];
 let connections=0,disconnections=0;
 try{
  for(const key of original.keys())Object.defineProperty(globalThis,key,{configurable:true,get(){throw new Error('Ambient access: '+key);}});
  const make=(sourceId:string,cursor:number)=>createProjectRuntime({sourceId,ports:portsAt(cursor),reporter:{report:()=>{}},listenConnectivity:()=>{connections++;return()=>{disconnections++;};}});
  const first=make('host-A',20),second=make('host-B',12);runtimes.push(first,second);
  const a=first.acquire(scope,'legacy'),same=first.acquire(scope,'workspace'),b=second.acquire(scope,'legacy'),next=first.acquire({...scope,hostEpoch:2},'legacy');leases.push(a,same,b,next);
  assert.equal(a.session,same.session);assert.notEqual(a.session,b.session);assert.notEqual(a.session,next.session);
  assert.equal(a.session.sourceId,'host-A');assert.equal(b.session.sourceId,'host-B');assert.equal(next.session.scope.hostEpoch,2);
  assert.notDeepEqual(projectSnapshotQueryKey(a.session),projectSnapshotQueryKey(b.session));assert.notDeepEqual(projectSnapshotQueryKey(a.session),projectSnapshotQueryKey(next.session));
  await a.session.refresh();await b.session.refresh();
  assert.equal(first.queryClient.getQueryData(projectSnapshotQueryKey(a.session)),a.session.getSnapshot());
  assert.equal(second.queryClient.getQueryData(projectSnapshotQueryKey(b.session)),b.session.getSnapshot());
  assert.equal(a.session.getSnapshot()?.cursor,20);assert.equal(b.session.getSnapshot()?.cursor,12);assert.equal(connections,3);
  a.release();assert.equal(disconnections,0);same.release();assert.equal(disconnections,1);assert.equal(a.session.getView().active,false);assert.equal(b.session.getView().active,true);
 }finally{
  leases.forEach(lease=>lease.release());runtimes.forEach(runtime=>runtime.queryClient.clear());
  for(const [key,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
 }
 assert.equal(disconnections,3);
});

test('PRE03 later mutation of configuration cannot redirect source, ports, reporter or connectivity',async()=>{
 const reported:ClientErrorOccurrence[]=[];
 let originalConnections=0,replacementCalls=0;
 const options={sourceId:'host-original',ports:(()=>({read:{readSnapshot:async()=>{throw new ClientError('PROBE_ERROR','Fixture failure','network');},readWorkspace:async()=>({status:'unsupported',capability:'read-workspace'})},command:{execute:async()=>({status:'unknown',reason:'transport'})},subscription:{subscribe:()=>({close:()=>{},reconnect:()=>{}})}})) as ProjectRuntimePortFactory,reporter:{report:(occurrence:ClientErrorOccurrence)=>{reported.push(occurrence);}},listenConnectivity:()=>{originalConnections++;return()=>{};}};
 const runtime=createProjectRuntime(options);
 options.sourceId='host-replacement';options.ports=()=>{replacementCalls++;throw new Error('Replacement port');};options.reporter={report:()=>{replacementCalls++;}};options.listenConnectivity=()=>{replacementCalls++;return()=>{};};
 const lease=runtime.acquire(scope,'legacy');
 try{
  await assert.rejects(lease.session.refresh(),{code:'PROBE_ERROR'});
  assert.equal(lease.session.sourceId,'host-original');assert.equal(reported.length,1);assert.equal(reported[0]?.sourceId,'host-original');assert.equal(originalConnections,1);assert.equal(replacementCalls,0);
 }finally{lease.release();runtime.queryClient.clear();}
});

test('PRE04 failed connectivity admission releases the session instead of retaining a hidden owner',()=>{
 const failure=new Error('Host connectivity unavailable'),adopters:ProjectSnapshotAdopter[]=[];
 let attempts=0;
 const runtime=createProjectRuntime({sourceId:'host-admission',reporter:{report:()=>{}},ports:input=>{adopters.push(input.adopter);return portsAt(20)(input);},listenConnectivity:()=>{if(++attempts===1)throw failure;return()=>{};}});
 try{
  assert.throws(()=>runtime.acquire(scope,'legacy'),error=>error===failure);
  const result=adopters[0]?.adopt({state:replay(createSeedEvents().slice(0,20)),cursor:20});
  assert.equal(result?.status,'invalid');if(result?.status==='invalid')assert.equal(result.reason,'disposed-scope');
  const next=runtime.acquire(scope,'legacy');
  try{assert.equal(adopters.length,2);assert.equal(next.session.getView().active,true);}finally{next.release();}
 }finally{runtime.queryClient.clear();}
});

test('PRE05 failed connectivity cleanup still disposes its final session lease',()=>{
 const failure=new Error('Host connectivity cleanup failed');let cleanupCalls=0,portOwners=0;
 const runtime=createProjectRuntime({sourceId:'host-cleanup',reporter:{report:()=>{}},ports:input=>{portOwners++;return portsAt(20)(input);},listenConnectivity:()=>()=>{cleanupCalls++;throw failure;}});
 const first=runtime.acquire(scope,'legacy');
 try{
  assert.throws(()=>first.release(),error=>error===failure);assert.equal(first.session.getView().active,false);first.release();assert.equal(cleanupCalls,1);
  const next=runtime.acquire(scope,'legacy');assert.notEqual(first.session,next.session);assert.equal(portOwners,2);
  assert.throws(()=>next.release(),error=>error===failure);assert.equal(next.session.getView().active,false);assert.equal(cleanupCalls,2);
 }finally{runtime.queryClient.clear();}
});

test('PRE06 a started port subscription that fails to close cannot retain an active registry owner',async()=>{
 const failure=new Error('Host subscription cleanup failed');let owners=0,closes=0;
 let firstObserver:ProjectSnapshotObserver|undefined;
 const runtime=createProjectRuntime({sourceId:'host-subscription',reporter:{report:()=>{}},listenConnectivity:()=>()=>{},ports:input=>{
  owners++;return {...portsAt(20)(input),subscription:{subscribe:(_scope,_cursor,observer)=>{firstObserver??=observer;return {reconnect:()=>{},close:()=>{if(++closes===1)throw failure;}};}}};
 }});
 const first=runtime.acquire(scope,'legacy');let next:ReturnType<typeof runtime.acquire>|undefined;
 try{
  first.session.start();await first.session.refresh();assert.equal(first.session.getSnapshot()?.cursor,20);
  assert.throws(()=>first.release(),error=>error===failure);
  assert.equal(first.session.getView().active,false);assert.equal(first.session.getSnapshot(),null);
  firstObserver?.onSnapshot({state:replay(createSeedEvents().slice(0,22)),cursor:22});assert.equal(first.session.getSnapshot(),null);
  assert.equal(first.session.admit({state:replay(createSeedEvents().slice(0,20)),cursor:20}).status,'invalid');
  next=runtime.acquire(scope,'legacy');assert.notEqual(next.session,first.session);assert.equal(owners,2);next.session.start();
 }finally{first.release();next?.release();runtime.queryClient.clear();}
 assert.equal(closes,2);
});

test('PRE07 access revocation clears the public projection even when the host subscription fails to close',async()=>{
 const failure=new Error('Revoked subscription cleanup failed');let observer:ProjectSnapshotObserver|undefined,reads=0,closes=0;
 const runtime=createProjectRuntime({sourceId:'host-revocation',reporter:{report:()=>{}},listenConnectivity:()=>()=>{},ports:input=>{
  const ports=portsAt(20)(input);return {...ports,read:{...ports.read,readSnapshot:async(...args)=>{reads++;return ports.read.readSnapshot(...args);}},subscription:{subscribe:(_scope,_cursor,current)=>{observer=current;return {reconnect:()=>{},close:()=>{closes++;throw failure;}};}}};
 }});
 const lease=runtime.acquire(scope,'legacy');
 try{
  lease.session.start();await lease.session.refresh();assert.equal(lease.session.getSnapshot()?.cursor,20);
  assert.throws(()=>observer?.onStatus('reload-required','access-denied'),error=>error===failure);
  assert.equal(lease.session.getView().active,false);assert.equal(lease.session.getSnapshot(),null);assert.equal(runtime.queryClient.getQueryData(projectSnapshotQueryKey(lease.session)),undefined);
  assert.doesNotThrow(()=>observer?.onSnapshot({state:replay(createSeedEvents().slice(0,22)),cursor:22}));
  assert.equal(await lease.session.refresh(),null);assert.equal(reads,1);
 }finally{try{lease.release();}catch(error){assert.equal(error,failure);}runtime.queryClient.clear();}
 assert.equal(closes,1);
});

test('PRE08 a failing state observer cannot interrupt access revocation',async()=>{
 const secret='synthetic-observer-secret',reported:ClientErrorOccurrence[]=[];let observer:ProjectSnapshotObserver|undefined,closes=0;
 const runtime=createProjectRuntime({sourceId:'host-observer',reporter:{report:value=>{reported.push(value);}},listenConnectivity:()=>()=>{},ports:input=>({...portsAt(20)(input),subscription:{subscribe:(_scope,_cursor,current)=>{observer=current;return {reconnect:()=>{},close:()=>{closes++;}};}}})});
 const lease=runtime.acquire(scope,'legacy');let unsubscribe=()=>{};
 try{
  lease.session.start();await lease.session.refresh();unsubscribe=lease.session.subscribe(()=>{throw new Error(secret);});
  assert.doesNotThrow(()=>observer?.onStatus('reload-required','access-denied'));
  assert.equal(lease.session.getView().active,false);assert.equal(lease.session.getSnapshot(),null);assert.equal(closes,1);
  assert.equal(runtime.queryClient.getQueryData(projectSnapshotQueryKey(lease.session)),undefined);
  assert(reported.some(value=>value.operation==='async-operation'&&value.kind==='unexpected'));assert(!JSON.stringify(reported).includes(secret));
 }finally{unsubscribe();lease.release();runtime.queryClient.clear();}
});

test('PRE09 a failing state observer cannot turn an accepted read into an operation failure',async()=>{
 const reported:ClientErrorOccurrence[]=[];
 const runtime=createProjectRuntime({sourceId:'host-read-observer',ports:portsAt(20),reporter:{report:value=>{reported.push(value);}},listenConnectivity:()=>()=>{}});
 const lease=runtime.acquire(scope,'legacy'),unsubscribe=lease.session.subscribe(()=>{throw new Error('Observer failure');});
 try{
  await assert.doesNotReject(lease.session.refresh());assert.equal(lease.session.getSnapshot()?.cursor,20);assert.equal(lease.session.getView().error,null);
  assert.equal(runtime.queryClient.getQueryData(projectSnapshotQueryKey(lease.session)),lease.session.getSnapshot());
  assert(reported.some(value=>value.operation==='async-operation'&&value.kind==='unexpected'));assert(!reported.some(value=>value.operation==='read-project'));
 }finally{unsubscribe();lease.release();runtime.queryClient.clear();}
});
