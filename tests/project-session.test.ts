import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeedEvents,replay,PROJECT_ID} from '../packages/core/src';
import {createProjectSession} from '../packages/client/src/lifecycle/project-session';
import type {ProjectReadPort,ProjectSnapshotDTO,ProjectSnapshotObserver} from '../packages/client/src/ports';

const scope={projectId:PROJECT_ID,actorId:'local-human',accessEpoch:1};
const seed=createSeedEvents();
const snapshot=(cursor:number):ProjectSnapshotDTO=>({state:replay(seed.slice(0,cursor)),cursor});
const deferred=<T>()=>{let resolve:(value:T)=>void=()=>{throw new Error('Promise unavailable');};const promise=new Promise<T>(accept=>{resolve=accept;});return {promise,resolve};};
function fixture(read?:ProjectReadPort){
 let observer:ProjectSnapshotObserver|undefined,opened=0,closed=0;
 const session=createProjectSession({sourceId:'same-origin',scope,ports:()=>({
  read:read??{readSnapshot:async()=>({status:'available',value:snapshot(12)}),readWorkspace:async()=>({status:'unsupported',capability:'read-workspace'})},
  command:{execute:async()=>({status:'unknown',reason:'transport'})},
  subscription:{subscribe:(_scope,_cursor,next)=>{opened++;observer=next;return {close:()=>{closed++;},reconnect:()=>{}};}},
 })});
 return {session,get observer(){return observer;},get opened(){return opened;},get closed(){return closed;}};
}
test('P12 bootstrap and stream share one accepted snapshot; late reads cannot roll it back',async()=>{
 const pending=deferred<{status:'available';value:ProjectSnapshotDTO}>();
 const f=fixture({readSnapshot:()=>pending.promise,readWorkspace:async()=>({status:'unsupported',capability:'read-workspace'})});
 f.session.start();assert.equal(f.opened,1);
 const read=f.session.refresh();f.observer?.onSnapshot(snapshot(20));pending.resolve({status:'available',value:snapshot(12)});await read;
 assert.equal(f.session.getSnapshot()?.cursor,20);
 const current=f.session.getSnapshot();f.observer?.onSnapshot(snapshot(20));assert.equal(f.session.getSnapshot(),current);
 f.session.dispose();assert.equal(f.closed,1);
});
test('P12 disposed scope discards delayed reads and callbacks and cleanup is idempotent',async()=>{
 const pending=deferred<{status:'available';value:ProjectSnapshotDTO}>();
 const f=fixture({readSnapshot:()=>pending.promise,readWorkspace:async()=>({status:'unsupported',capability:'read-workspace'})});
 f.session.start();const read=f.session.refresh();f.session.dispose();f.session.dispose();
 pending.resolve({status:'available',value:snapshot(20)});await read;f.observer?.onSnapshot(snapshot(22));
 assert.equal(f.session.getSnapshot(),null);assert.equal(f.closed,1);
});
test('P12 simultaneous snapshot and metadata readers keep distinct single-flight operations under one owner',async()=>{
 const pending=deferred<{status:'available';value:ProjectSnapshotDTO}>();let snapshotReads=0,workspaceReads=0;
 const f=fixture({readSnapshot:()=>{snapshotReads++;return pending.promise;},readWorkspace:async()=>{workspaceReads++;return {status:'available',value:{...snapshot(20),project:{id:PROJECT_ID,name:'Project',rootPath:null,kind:'demo',createdAt:'2026-11-04',createdBy:null},agents:[],connection:{httpUrl:'http://localhost/api/mcp',stdioCommand:'node',stdioArgs:[],projectId:PROJECT_ID}}};}});
 try{const first=f.session.refresh(),same=f.session.refresh(),metadata=f.session.refresh(true);assert.equal(first,same);await metadata;assert.equal(snapshotReads,1);assert.equal(workspaceReads,1);assert.equal(f.session.getView().metadata?.project.id,PROJECT_ID);pending.resolve({status:'available',value:snapshot(12)});await first;assert.equal(f.session.getSnapshot()?.cursor,20);}finally{f.session.dispose();}
});
