import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedEvents, PROJECT_ID, replay } from '../packages/core/src';
import { createProjectSnapshotAdopter, type ProjectSnapshot } from '../lib/project-snapshot';
import { startProjectSubscription, type ProjectEventSource, type ProjectSubscriptionStatus } from '../lib/project-subscription';

const seed=createSeedEvents();
const snapshot=(version:number):ProjectSnapshot=>({state:replay(seed.slice(0,version)),cursor:version,storage:'embedded-postgres'});

test('R03 one adopter applies the full snapshot once and rejects late reads without rolling back',()=>{
  const adopter=createProjectSnapshotAdopter(PROJECT_ID);
  const first=snapshot(12);assert.equal(adopter.adopt(first).status,'applied');
  assert.equal(adopter.getSnapshot()?.state,first.state);
  assert.equal(adopter.adopt(snapshot(12)).status,'unchanged');
  assert.equal(adopter.getSnapshot()?.state,first.state,'same cursor preserves the adopted state reference');
  assert.equal(adopter.adopt(snapshot(20)).status,'applied');
  assert.equal(adopter.adopt(snapshot(13)).status,'stale');
  assert.equal(adopter.getSnapshot()?.cursor,20);assert.equal(adopter.getSnapshot()?.state.events.length,20);
});

test('R03 malformed, foreign, mismatched cursor or incomplete history never replaces the current snapshot',()=>{
  const adopter=createProjectSnapshotAdopter(PROJECT_ID);adopter.adopt(snapshot(12));
  const invalid=[null,{}, {...snapshot(14),cursor:13},{...snapshot(14),cursor:-1},{...snapshot(14),cursor:Number.MAX_SAFE_INTEGER+1},
    {...snapshot(14),state:{...snapshot(14).state,projectId:'another-project'}},
    {...snapshot(14),state:{...snapshot(14).state,events:seed.slice(0,13)}},
    {...snapshot(14),state:{...snapshot(14).state,requests:null}},
    {...snapshot(14),state:{...snapshot(14).state,events:seed.slice(0,14).map((event,index)=>index===0?{...event,version:2}:event)}},
  ];
  for(const value of invalid)assert.equal(adopter.adopt(value).status,'invalid');
  assert.equal(adopter.getSnapshot()?.cursor,12);
});

test('R03 a claimed projection cannot change expectations or statuses without corresponding immutable events',()=>{
  const adopter=createProjectSnapshotAdopter(PROJECT_ID);adopter.adopt(snapshot(12));
  const changedExpectation=snapshot(20);changedExpectation.state.revisions[0].goal='Изменённое ожидание без нового события.';
  assert.equal(adopter.adopt(changedExpectation).status,'invalid');
  const changedStatus=snapshot(20);changedStatus.state.specs[0].state='invalidated';
  assert.equal(adopter.adopt(changedStatus).status,'invalid');assert.equal(adopter.getSnapshot()?.cursor,12);
});

test('R03 nested JSON key order and omitted optional values remain compatible with core replay',()=>{
  const adopter=createProjectSnapshotAdopter(PROJECT_ID);adopter.adopt(snapshot(12));
  const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,child])=>[key,reorder(child)])):value;
  const body=JSON.parse(JSON.stringify(reorder(snapshot(20))));
  assert.equal(adopter.adopt(body).status,'applied');assert.equal(adopter.getSnapshot()?.cursor,20);
});

class FakeSource extends EventTarget implements ProjectEventSource {
  readyState=0;onopen:((event:Event)=>unknown)|null=null;onerror:((event:Event)=>unknown)|null=null;closed=false;
  close(){this.closed=true;this.readyState=2;}
  open(){this.readyState=1;this.onopen?.(new Event('open'));}
  error(closed=false){this.readyState=closed?2:0;this.onerror?.(new Event('error'));}
  frame(value:unknown,id=String((value as {cursor?:number})?.cursor)){this.dispatchEvent(new MessageEvent('snapshot',{data:JSON.stringify(value),lastEventId:id}));}
  malformed(){this.dispatchEvent(new MessageEvent('snapshot',{data:'{broken',lastEventId:'999'}));}
}
function subscriptionFixture(reconcile?:()=>Promise<unknown>) {
  const adopter=createProjectSnapshotAdopter(PROJECT_ID);adopter.adopt(snapshot(12));
  const sources:FakeSource[]=[],urls:string[]=[],statuses:Array<[ProjectSubscriptionStatus,string?]>=[],applied:number[]=[],timers=new Map<number,()=>void>();let nextTimer=0;
  const controller=startProjectSubscription({adopter,reconcile,
    createEventSource:url=>{urls.push(url);const source=new FakeSource();sources.push(source);return source;},
    onSnapshot:value=>{assert.equal(adopter.getSnapshot()?.cursor,value.cursor,'adoption is synchronous before the callback');applied.push(value.cursor);},
    onStatus:(status,reason)=>statuses.push([status,reason]),
    schedule:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},cancelSchedule:token=>{timers.delete(token as number);},
  });
  const runTimer=()=>{const entry=timers.entries().next().value;assert(entry);timers.delete(entry[0]);entry[1]();};
  return {adopter,controller,sources,urls,statuses,applied,timers,runTimer};
}

test('R03/R05 stream is connected only after a synchronous valid snapshot, equal IDs do not duplicate state',()=>{
  const f=subscriptionFixture();try{
    assert.deepEqual(f.urls,['/api/stream?after=12']);assert.equal(f.statuses.at(-1)?.[0],'connecting');
    f.sources[0].open();assert.notEqual(f.statuses.at(-1)?.[0],'connected');
    const prior=f.adopter.getSnapshot()?.state;f.sources[0].frame(snapshot(12));
    assert.equal(f.statuses.at(-1)?.[0],'connected');assert.equal(f.adopter.getSnapshot()?.state,prior);
    f.sources[0].frame(snapshot(20));f.sources[0].frame(snapshot(20));f.sources[0].frame(snapshot(14));
    assert.equal(f.adopter.getSnapshot()?.cursor,20);assert.equal(f.adopter.getSnapshot()?.state.events.length,20);
    f.sources[0].error();assert.equal(f.statuses.at(-1)?.[0],'reconnecting');assert.equal(f.sources.length,1,'normal native reconnect retains Last-Event-ID on the same source');
  }finally{f.controller.close();}
});

test('R03 malformed frame and mismatched SSE id recover from the applied cursor, not the delivered id',()=>{
  const f=subscriptionFixture();try{
    f.sources[0].frame(snapshot(20));f.sources[0].malformed();
    assert(f.sources[0].closed);assert.equal(f.adopter.getSnapshot()?.cursor,20);assert.equal(f.statuses.at(-1)?.[0],'reconnecting');
    f.runTimer();assert.equal(f.urls.at(-1),'/api/stream?after=20');
    f.sources[1].frame(snapshot(22),'999');assert(f.sources[1].closed);assert.equal(f.adopter.getSnapshot()?.cursor,20);
    f.runTimer();assert.equal(f.urls.at(-1),'/api/stream?after=20');
    f.sources[2].frame(snapshot(22));assert.equal(f.adopter.getSnapshot()?.cursor,22);assert.equal(f.statuses.at(-1)?.[0],'connected');
  }finally{f.controller.close();}
});

test('R04 close cancels recovery and discards old-source callbacks',()=>{
  const f=subscriptionFixture();f.sources[0].malformed();assert.equal(f.timers.size,1);f.controller.close();
  assert.equal(f.timers.size,0);f.sources[0].frame(snapshot(22));assert.equal(f.adopter.getSnapshot()?.cursor,12);
  const statuses=f.statuses.length;f.sources[0].error();f.controller.reconnect();assert.equal(f.sources.length,1);assert.equal(f.statuses.length,statuses);
});

test('R05 error reconciliation is single-flight; a genuinely older server snapshot requires explicit reload',async()=>{
  let resolve!:(value:unknown)=>void,calls=0;
  const f=subscriptionFixture(()=>{calls++;return new Promise(value=>{resolve=value;});});
  try{
    f.sources[0].error();f.sources[0].error();assert.equal(calls,1);resolve(snapshot(8));await Promise.resolve();await Promise.resolve();
    assert.equal(f.statuses.at(-1)?.[0],'reload-required');assert(f.sources[0].closed);assert.equal(f.adopter.getSnapshot()?.cursor,12);assert.equal(f.timers.size,0);
    f.controller.reconnect();assert.equal(f.sources.length,1,'a reset cannot silently resume against a different history');
  }finally{f.controller.close();}
});

test('R03 a late reconciliation GET cannot misclassify a newer SSE as a database reset',async()=>{
  let resolve!:(value:unknown)=>void;
  const f=subscriptionFixture(()=>new Promise(value=>{resolve=value;}));try{
    f.sources[0].error();f.sources[0].frame(snapshot(20));resolve(snapshot(14));await Promise.resolve();await Promise.resolve();
    assert.equal(f.adopter.getSnapshot()?.cursor,20);assert.equal(f.statuses.at(-1)?.[0],'connected');assert(!f.sources[0].closed);
  }finally{f.controller.close();}
});

test('R05 concurrent terminal HTTP errors await the same reconciliation before retrying',async()=>{
  let resolve!:(value:unknown)=>void,calls=0;
  const f=subscriptionFixture(()=>{calls++;return new Promise(value=>{resolve=value;});});try{
    f.sources[0].error(true);f.sources[0].error(true);await Promise.resolve();await Promise.resolve();
    assert.equal(calls,1);assert.equal(f.timers.size,0,'cannot discard the only GET that can detect a server reset');
    resolve(snapshot(8));await Promise.resolve();await Promise.resolve();await Promise.resolve();
    assert.equal(f.statuses.at(-1)?.[0],'reload-required');assert.equal(f.adopter.getSnapshot()?.cursor,12);assert.equal(f.timers.size,0);
  }finally{f.controller.close();}
});

test('R04 repeated corrupt snapshots have bounded recovery instead of an infinite retry loop',()=>{
  const f=subscriptionFixture();try{
    for(let i=0;i<8&&f.statuses.at(-1)?.[0]!=='reload-required';i++){f.sources.at(-1)!.malformed();if(f.timers.size)f.runTimer();}
    assert.equal(f.statuses.at(-1)?.[0],'reload-required');assert.equal(f.timers.size,0);assert(f.sources.at(-1)?.closed);
  }finally{f.controller.close();}
});
