import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AGENT_ID, PROJECT_ID, applyCommand, emptyState, replay, type Actor, type Command, type ProjectState } from '../packages/core/src';
import { createStore } from '../lib/store';

const human:Actor={id:'flow-human',kind:'human',projectIds:[PROJECT_ID]};
const agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const hasCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;
const content=(flow?:unknown)=>({title:'Проверить процесс',goal:'Сопоставлять ожидание и явные факты.',dod:[{id:'checked',text:'Результат проверен человеком',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',...(flow===undefined?{}:{flow})});
const node=(id:string,kind='action',owner='agent')=>({id,kind,title:`Узел ${id}`,description:'Проверяемый шаг процесса.',owner});
const edge=(id:string,source:string,target:string,label:string,optionId?:string)=>({id,source,target,label,...(optionId?{optionId}:{})});
function flow(){return {entryNodeId:'action',nodes:[node('action'),node('check','condition','system'),node('question','question','human'),node('fork','fork','human'),node('blocker','blocker'),node('wait','wait','system'),node('result','result','human')],edges:[edge('a','action','check','Проверить'),edge('b','check','result','Проверка пройдена'),edge('c','check','question','Нужны уточнения'),edge('d','question','fork','Ответ получен'),edge('e','fork','blocker','Восстановить вход','repair'),edge('f','fork','wait','Подождать вход','wait'),edge('g','blocker','wait','Препятствие устранено'),edge('h','wait','action','Повторить проверку')]};}
function run(state:ProjectState,data:Record<string,unknown>,actor=human){return applyCommand(state,{...data,requestId:randomUUID(),expectedVersion:state.version} as Command,actor).state;}
function work(){let state=run(emptyState(),{type:'createSpec',content:content(flow())});const spec=state.specs[0],revision=state.revisions[0];state=run(state,{type:'activateRevision',specId:spec.id,revisionId:revision.id});state=run(state,{type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.id});const execution=state.executions[0];state=run(state,{type:'confirmResumed',executionId:execution.id},agent);return {state,spec,revision,execution};}
const report=(f:ReturnType<typeof work>,extra:Record<string,unknown>)=>({type:'reportAction',specId:f.spec.id,specRevisionId:f.revision.id,executionId:f.execution.id,title:'Факт процесса',context:'Исполнен назначенный шаг.',actionId:randomUUID(),phase:'completed',evidence:'test://flow/action',...extra});

test('F02/F04: a cyclic Flow with an exit is immutable revision content; activation remains separate',()=>{
  const original=flow();let state=run(emptyState(),{type:'createSpec',content:content(original)});
  const first=state.revisions[0];assert.deepEqual((first as any).flow,original);
  state=run(state,{type:'activateRevision',specId:first.specId,revisionId:first.id});
  const next=structuredClone(original);next.nodes[0].title='Другое проверяемое действие';
  state=run(state,{type:'proposeRevision',specId:first.specId,content:content(next)});
  assert.equal(state.specs[0].activeRevisionId,first.id);
  assert.deepEqual((state.revisions[0] as any).flow,original);assert.deepEqual((state.revisions[1] as any).flow,next);
  assert.deepEqual(replay(state.events),state);
  const second=state.revisions[1];state=run(state,{type:'activateRevision',specId:first.specId,revisionId:second.id});
  assert.equal(state.specs[0].activeRevisionId,second.id);assert.deepEqual((state.revisions[0] as any).flow,original);
});

test('F03: invalid Flow structures, hidden fields, ambiguous outcomes and unreachable/dead-end nodes are rejected',()=>{
  const variants:unknown[]=[null,{},[],{...flow(),extra:'authority'}, {...flow(),entryNodeId:'missing'}, {...flow(),entryNodeId:42}];
  const change=(alter:(value:ReturnType<typeof flow>)=>void)=>{const value=flow();alter(value);variants.push(value);};
  change(v=>v.nodes.push({...v.nodes[0]}));change(v=>v.edges.push({...v.edges[0],id:'duplicate-link'}));
  change(v=>v.nodes[0].kind='unknown');change(v=>v.nodes[0].owner='provider');change(v=>v.nodes[0].title='   ');
  change(v=>Object.assign(v.nodes[0],{coordinates:{x:1,y:2}}));change(v=>Object.assign(v.edges[0],{autoApprove:true}));
  change(v=>v.edges[0].target='missing');change(v=>v.edges[1].id=v.edges[0].id);
  change(v=>v.edges[1].label='');change(v=>v.edges[2].label=v.edges[1].label);change(v=>v.edges.splice(2,1));
  change(v=>v.nodes[2].owner='agent');change(v=>v.nodes[3].owner='system');
  change(v=>v.nodes.push(node('unreachable')));change(v=>v.edges=v.edges.filter(e=>e.source!=='wait'));
  change(v=>v.edges.push(edge('bad-result','result','action','Возврат')));
  change(v=>v.nodes.forEach(n=>{if(n.kind==='result')n.kind='action';}));
  change(v=>v.nodes[0].id='x'.repeat(201));change(v=>Object.assign(v.edges[0],{optionId:42}));
  for(const [i,value] of variants.entries()){
    const state=emptyState();assert.throws(()=>run(state,{type:'createSpec',content:content(value)}),hasCode('VALIDATION_ERROR'),`invalid Flow variant ${i}`);assert.equal(state.version,0);
  }
});

test('F03: Flow enforces 100-node/200-edge bounds while accepting the bounded chain',()=>{
  const nodes=Array.from({length:100},(_,i)=>node(`n${i}`,i===99?'result':'action'));
  const edges=nodes.slice(0,-1).map((n,i)=>edge(`e${i}`,n.id,nodes[i+1].id,'Продолжить'));
  const valid={entryNodeId:'n0',nodes,edges};assert.equal(run(emptyState(),{type:'createSpec',content:content(valid)}).revisions.length,1);
  assert.throws(()=>run(emptyState(),{type:'createSpec',content:content({...valid,nodes:[...nodes,node('overflow')]})}),hasCode('VALIDATION_ERROR'));
  assert.throws(()=>run(emptyState(),{type:'createSpec',content:content({...valid,edges:Array.from({length:201},(_,i)=>edge(`overflow-${i}`,'n0','n99',`Исход ${i}`))})}),hasCode('VALIDATION_ERROR'));
  assert.throws(()=>run(emptyState(),{type:'createSpec',content:content({entryNodeId:'none',nodes:[],edges:[]})}),hasCode('VALIDATION_ERROR'));
});

test('F03: a Fork option ID identifies one outgoing path even when labels and targets differ',()=>{
  const ambiguous=flow();ambiguous.edges.find(e=>e.id==='f')!.optionId='repair';
  assert.throws(()=>run(emptyState(),{type:'createSpec',content:content(ambiguous)}),hasCode('VALIDATION_ERROR'));
  const unbound=flow();delete unbound.edges.find(e=>e.id==='e')!.optionId;delete unbound.edges.find(e=>e.id==='f')!.optionId;
  assert.equal(run(emptyState(),{type:'createSpec',content:content(unbound)}).revisions.length,1);
});

test('F05: report links must exist in the assigned immutable Flow and match the report type',()=>{
  const f=work();
  for(const flowNodeId of ['missing','question','fork','blocker','',null,42,{},'x'.repeat(201)]){
    assert.throws(()=>run(f.state,report(f,{flowNodeId}),agent),hasCode('VALIDATION_ERROR'),`invalid action link ${String(flowNodeId)}`);
  }
  for(const id of ['action','check','wait','result']){const state=run(f.state,report(f,{flowNodeId:id}),agent);assert.equal(state.events.at(-1)!.payload.flowNodeId,id);assert.notEqual(state.specs[0].state,'done');}
  const base={specId:f.spec.id,specRevisionId:f.revision.id,executionId:f.execution.id,title:'Вопрос человеку',context:'Плановый человеческий шаг.',question:'Как продолжить?',blockingScope:'none'};
  assert.throws(()=>run(f.state,{...base,type:'reportQuestion',flowNodeId:'action'},agent),hasCode('VALIDATION_ERROR'));
  const state=run(f.state,{...base,type:'reportQuestion',flowNodeId:'question'},agent);assert.equal((state.requests[0] as any).flowNodeId,'question');
  const legacy=run(emptyState(),{type:'createSpec',content:content()});const r=legacy.revisions[0];let old=run(legacy,{type:'activateRevision',specId:r.specId,revisionId:r.id});old=run(old,{type:'startExecution',specId:r.specId,specRevisionId:r.id,agentId:agent.id});
  const execution=old.executions[0];assert.throws(()=>run(old,{...report(f,{flowNodeId:'action'}),specId:r.specId,specRevisionId:r.id,executionId:execution.id},agent),hasCode('VALIDATION_ERROR'));
});

test('F05: every phase of actionId keeps its original Flow binding, including no binding',()=>{
  for(const [startLink,endLink] of [['action','check'],['action',undefined],[undefined,'action']] as const){
    const f=work(),actionId=randomUUID();const state=run(f.state,report(f,{actionId,phase:'started',...(startLink?{flowNodeId:startLink}:{})}),agent);
    assert.throws(()=>run(state,report(f,{actionId,...(endLink?{flowNodeId:endLink}:{})}),agent),hasCode('VALIDATION_ERROR'));
  }
  for(const flowNodeId of ['action',undefined]){const f=work(),actionId=randomUUID(),link=flowNodeId?{flowNodeId}:{};let state=run(f.state,report(f,{actionId,phase:'started',...link}),agent);state=run(state,report(f,{actionId,...link}),agent);assert.equal(state.events.at(-1)!.payload.flowNodeId,flowNodeId);}
});

test('F05: Fork and Blocker links retain their typed node without choosing or clearing anything',()=>{
  for(const [type,flowNodeId] of [['reportFork','fork'],['reportBlocker','blocker']] as const){
    const f=work();const request={type,specId:f.spec.id,specRevisionId:f.revision.id,executionId:f.execution.id,title:'Требуется решение',context:'Явная связь с планом.',reason:'Продолжение зависит от решения человека: доступные варианты меняют проверяемый результат и требуют явного выбора.',options:[{id:'repair',title:'Восстановить',description:'Ограниченная попытка устранения.'},{id:'wait',title:'Подождать',description:'Не продолжать до появления входа.'}],expected:'Доступный вход',actual:'Вход недоступен',impact:'Результат нельзя проверить'};
    assert.throws(()=>run(f.state,{...request,flowNodeId:'question'},agent),hasCode('VALIDATION_ERROR'));
    const state=run(f.state,{...request,flowNodeId},agent),saved=state.requests[0];
    assert.equal(saved.flowNodeId,flowNodeId);assert.equal(saved.state,'pending');assert.equal(saved.decision,undefined);assert.equal(saved.clearedEvidence,undefined);assert.equal(state.executions[0].state,'waiting_for_human');
  }
});

test('F06: late Action stays attached to the old revision Flow without accepting DoD',()=>{
  const f=work(),actionId=randomUUID();let state=run(f.state,report(f,{actionId,phase:'started',flowNodeId:'action'}),agent);
  const changed=flow();changed.nodes[0].id='replacement-action';changed.entryNodeId='replacement-action';changed.edges=changed.edges.map(e=>({...e,source:e.source==='action'?'replacement-action':e.source,target:e.target==='action'?'replacement-action':e.target}));
  state=run(state,{type:'proposeRevision',specId:f.spec.id,content:content(changed)});state=run(state,{type:'activateRevision',specId:f.spec.id,revisionId:state.revisions.at(-1)!.id});
  assert.throws(()=>run(state,report(f,{flowNodeId:'replacement-action'}),agent),hasCode('VALIDATION_ERROR'));
  state=run(state,report(f,{actionId,flowNodeId:'action'}),agent);const fact=state.events.at(-1)!;
  assert.equal(fact.specRevisionId,f.revision.id);assert.equal(fact.payload.flowNodeId,'action');assert.equal(fact.payload.historicalContext,true);assert.notEqual(state.specs[0].state,'done');
});

test('F01/F02/F04: SQL reopen preserves legacy hashes and both immutable Flow snapshots; invalid Flow rolls back',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ouro-flow-'));let store:Awaited<ReturnType<typeof createStore>>|undefined;
  try{
    store=await createStore({dataDir:directory});
    const before=await store.inspect<{id:string;content_hash:string;content:Record<string,unknown>}>('SELECT id,content_hash,content FROM ouro_spec_revisions ORDER BY id');assert(before.rows.length>0);assert(before.rows.every(r=>!Object.hasOwn(r.content,'flow')));
    const cmd=async(data:Record<string,unknown>)=>(await store!.executeCommand({...data,requestId:randomUUID(),expectedVersion:(await store!.getProject()).version},human)).state;
    let state=await cmd({type:'createSpec',content:content(flow())});const first=state.revisions.at(-1)!;
    const firstHash=(await store.inspect<{content_hash:string}>('SELECT content_hash FROM ouro_spec_revisions WHERE id=$1',[first.id])).rows[0].content_hash;
    const changed=flow();changed.nodes[0].title='Уточнённый шаг';state=await cmd({type:'proposeRevision',specId:first.specId,content:content(changed)});const second=state.revisions.at(-1)!;
    const version=state.version,bad=flow();bad.edges[0].target='nonexistent';
    await assert.rejects(cmd({type:'proposeRevision',specId:first.specId,content:content(bad)}),hasCode('VALIDATION_ERROR'));assert.equal((await store.getProject()).version,version);
    await store.close();store=await createStore({dataDir:directory});state=await store.getProject();
    assert.deepEqual((state.revisions.find(r=>r.id===first.id) as any).flow,flow());assert.deepEqual((state.revisions.find(r=>r.id===second.id) as any).flow,changed);
    const after=await store.inspect<{id:string;content_hash:string;content:Record<string,unknown>}>('SELECT id,content_hash,content FROM ouro_spec_revisions ORDER BY id');
    assert.deepEqual(after.rows.filter(r=>before.rows.some(old=>old.id===r.id)),before.rows);assert.equal(after.rows.find(r=>r.id===first.id)!.content_hash,firstHash);
    assert.equal(state.specs.find(s=>s.id===first.specId)!.activeRevisionId,null);
  }finally{if(store)await store.close();await rm(directory,{recursive:true,force:true});}
});
