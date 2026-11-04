import test from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityReadController} from '../packages/client/src/lifecycle/create-identity-read-controller';
import type {ClientCancellationSignal} from '../packages/client/src/ports';
import {ClientError} from '../packages/client/src/ports';
import {createProjectSessionRegistry} from '../packages/client/src/lifecycle/project-session';
import {replay,PROJECT_ID} from '../packages/core/src';

const deferred=<T>()=>{let resolve:(value:T)=>void=()=>{throw new Error('No read');};const promise=new Promise<T>(accept=>{resolve=accept;});return {promise,resolve};};
test('P12 reverse identity replies cannot restore the prelogout actor after a newer sign-in',async()=>{
 const controller=createIdentityReadController();controller.mount();const before=controller.begin();assert(before);const old=deferred<{actorId:string}>(),pending=before.run(()=>old.promise);
 const after=controller.begin();assert(after);const current=await after.run(async()=>({actorId:'new-actor'}));assert.equal(current.status,'accepted');old.resolve({actorId:'old-actor'});assert.equal((await pending).status,'superseded');controller.unmount();
});
test('P12 same-actor reauthentication gets a fresh access epoch and cancels the earlier identity read',async()=>{
 const controller=createIdentityReadController();controller.mount();const first=controller.begin();assert(first);let signal:ClientCancellationSignal|undefined;
 const old=deferred<{actorId:string}>(),pending=first.run(current=>{signal=current;return old.promise;});
 const next=controller.begin();assert(next);assert(next.accessEpoch>first.accessEpoch);assert.equal(signal?.aborted,true);
 const current=await next.run(async()=>({actorId:'same-actor'}));assert.equal(current.status,'accepted');old.resolve({actorId:'same-actor'});assert.equal((await pending).status,'superseded');controller.unmount();
});
test('P12 unmount discards identity completion and StrictMode remount can create a new active read',async()=>{
 const controller=createIdentityReadController();controller.mount();const first=controller.begin();assert(first);const old=deferred<string>(),pending=first.run(()=>old.promise);
 controller.unmount();old.resolve('obsolete');assert.equal((await pending).status,'superseded');assert.equal(controller.begin(),null);
 controller.mount();const next=controller.begin();assert(next);assert(next.accessEpoch>first.accessEpoch);assert.equal((await next.run(async()=>'current')).status,'accepted');controller.unmount();
});
test('P12 same-actor identity refresh acquires a fresh project owner after access revocation',async()=>{
 const identities=createIdentityReadController(),registry=createProjectSessionRegistry();identities.mount();const first=identities.begin();assert(first);
 const actor={id:'same-actor',kind:'human' as const,projectIds:[PROJECT_ID]};let denied=true;
 const ports=()=>({read:{readSnapshot:async()=>{if(denied)throw new ClientError('FORBIDDEN','Denied','access',403);return {status:'available' as const,value:{state:replay([]),cursor:0}};},readWorkspace:async()=>({status:'unsupported' as const,capability:'read-workspace' as const})},command:{execute:async()=>({status:'unknown' as const,reason:'transport' as const})},subscription:{subscribe:()=>({close:()=>{},reconnect:()=>{}})}});
 const old=registry.acquire({sourceId:'fixture',scope:{projectId:PROJECT_ID,actorId:actor.id,accessEpoch:first.accessEpoch},ports});
 await assert.rejects(old.session.refresh());assert.equal(old.session.getView().active,false);
 const next=identities.begin();assert(next);assert.equal((await next.run(async()=>actor)).status,'accepted');denied=false;
 const current=registry.acquire({sourceId:'fixture',scope:{projectId:PROJECT_ID,actorId:actor.id,accessEpoch:next.accessEpoch},ports});
 try{assert.notEqual(current.session,old.session);await current.session.refresh();assert.equal(current.session.getView().active,true);assert.equal(current.session.getSnapshot()?.cursor,0);}finally{old.release();current.release();identities.unmount();}
});
