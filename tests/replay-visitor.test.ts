import test from 'node:test';
import assert from 'node:assert/strict';
import {AGENT_ID,HUMAN_ID,PROJECT_ID,applyCommand,createSeedEvents,emptyState,replay} from '../packages/core/src';
import type {Actor,Command,DomainEvent,ProjectState} from '../packages/core/src';
import {buildStateView} from '../packages/core/src/state-view';

const human:Actor={id:HUMAN_ID,kind:'human',projectIds:[PROJECT_ID]},agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const run=(state:ProjectState,input:Record<string,unknown>,actor=human)=>applyCommand(state,{...input,requestId:crypto.randomUUID(),expectedVersion:state.version} as Command,actor).state;
const entries=(state:ProjectState):Array<[string,string]>=>[[`roadmap:${state.roadmap.id}`,state.roadmap.state],...state.specs.map(s=>[`spec:${s.id}`,s.state] as [string,string]),...state.executions.map(e=>[`execution:${e.id}`,e.state] as [string,string]),...state.requests.map(r=>[`request:${r.id}`,r.state] as [string,string])];

test('single replay visitor is invoked exactly once after each complete authoritative projection',()=>{
  const events=createSeedEvents(),versions:number[]=[];
  const observedReplay=replay as (events:readonly DomainEvent[],projectId:string,visitor:(state:Readonly<ProjectState>,event:DomainEvent)=>void)=>ProjectState;
  const final=observedReplay(events,PROJECT_ID,(state,event)=>{
    versions.push(event.version);
    assert.equal(state.version,event.version);assert.equal(state.events.at(-1)!.id,event.id);
    assert.deepEqual(state,replay(events.slice(0,event.version)));
  });
  assert.deepEqual(versions,events.map(e=>e.version));assert.deepEqual(final,replay(events));
});

test('transition histories equal ordinary prefix replay including indirect prerequisite invalidation',()=>{
  let state=replay(createSeedEvents());const meridian=state.specs.find(s=>s.humanId==='OURO-S-000005')!;
  state=run(state,{type:'startExecution',specId:meridian.id,specRevisionId:meridian.activeRevisionId,agentId:AGENT_ID});
  const executionId=state.executions.at(-1)!.id;
  state=run(state,{type:'confirmResumed',executionId},agent);
  const prerequisite=state.specs[0],revision=state.revisions.find(r=>r.id===prerequisite.activeRevisionId)!;
  state=run(state,{type:'proposeRevision',specId:prerequisite.id,content:revision});
  state=run(state,{type:'activateRevision',specId:prerequisite.id,revisionId:state.revisions.at(-1)!.id});
  const expected=new Map<string,Array<{from:string|null;to:string;eventId:string;eventType:string;version:number;actor:Actor}>>();
  let previous=new Map(entries(emptyState()));
  for(const event of state.events){
    const current=new Map(entries(replay(state.events.slice(0,event.version))));
    for(const [key,to] of current){const from=previous.get(key)??null;if(from!==to){const history=expected.get(key)??[];history.push({from,to,eventId:event.id,eventType:event.type,version:event.version,actor:event.actor});expected.set(key,history);}}
    previous=current;
  }
  assert.deepEqual(buildStateView(state,{axis:'roadmap'}).history,expected.get(`roadmap:${state.roadmap.id}`)??[]);
  for(const spec of state.specs)assert.deepEqual(buildStateView(state,{axis:'spec',specId:spec.id}).history,expected.get(`spec:${spec.id}`)??[]);
  for(const execution of state.executions)assert.deepEqual(buildStateView(state,{axis:'execution',executionId:execution.id}).history,expected.get(`execution:${execution.id}`)??[]);
  for(const request of state.requests)assert.deepEqual(buildStateView(state,{axis:'request',requestId:request.id}).history,expected.get(`request:${request.id}`)??[]);
  const dependent=buildStateView(state,{axis:'spec',specId:meridian.id});
  assert.equal(dependent.history.at(-1)!.to,'blocked');assert.equal(dependent.history.at(-1)!.eventType,'RevisionActivated');
});
