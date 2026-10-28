import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedEvents, PROJECT_ID, replay, type SpecRevision } from '../packages/core/src';
import { createProjectSnapshotAdopter } from '../lib/project-snapshot';
import { startProjectSubscription, type ProjectEventSource, type ProjectSubscriptionStatus } from '../lib/project-subscription';

test('review: a newer snapshot cannot rewrite an already accepted immutable event while keeping its ID',()=>{
  const original=createSeedEvents();
  const adopter=createProjectSnapshotAdopter(PROJECT_ID);
  adopter.adopt({state:replay(original.slice(0,12)),cursor:12});
  const rewritten=structuredClone(original);
  (rewritten[0].payload.revision as SpecRevision).goal='Переписанное прошлое ожидание под прежним event ID.';
  const response=adopter.adopt({state:replay(rewritten.slice(0,20)),cursor:20});
  assert.equal(response.status,'invalid','an event ID does not permit changing its immutable contents');
  assert.equal(adopter.getSnapshot()?.cursor,12);
});

test('review: JSON object key order alone does not create a different history',()=>{
  const original=createSeedEvents();
  const adopter=createProjectSnapshotAdopter(PROJECT_ID);
  adopter.adopt({state:replay(original.slice(0,12)),cursor:12});
  const reordered=original.slice(0,20).map(event=>Object.fromEntries(Object.entries(event).reverse()) as typeof event);
  assert.equal(adopter.adopt({state:replay(reordered),cursor:20}).status,'applied');
  assert.equal(adopter.getSnapshot()?.cursor,20);
});

test('review: a failed old recovery GET cannot mark a successfully recovered native SSE stream offline',async()=>{
  class Source extends EventTarget implements ProjectEventSource {
    readyState=1;onopen:((event:Event)=>unknown)|null=null;onerror:((event:Event)=>unknown)|null=null;
    close(){this.readyState=2;}
    error(){this.readyState=0;this.onerror?.(new Event('error'));}
    frame(state:ReturnType<typeof replay>){this.readyState=1;this.dispatchEvent(new MessageEvent('snapshot',{data:JSON.stringify({state,cursor:state.version}),lastEventId:String(state.version)}));}
  }
  const seed=createSeedEvents(),adopter=createProjectSnapshotAdopter(PROJECT_ID),source=new Source();
  adopter.adopt({state:replay(seed.slice(0,12)),cursor:12});
  let failRead!:(error:Error)=>void;
  const statuses:ProjectSubscriptionStatus[]=[];
  const subscription=startProjectSubscription({adopter,createEventSource:()=>source,onSnapshot:()=>{},onStatus:value=>statuses.push(value),reconcile:()=>new Promise((_,reject)=>{failRead=reject;})});
  try{
    source.error();
    source.frame(replay(seed.slice(0,20)));
    assert.equal(statuses.at(-1),'connected');
    failRead(new Error('An older HTTP recovery request failed after SSE already recovered'));
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    assert.equal(adopter.getSnapshot()?.cursor,20);
    assert.equal(statuses.at(-1),'connected');
  }finally{subscription.close();}
});
