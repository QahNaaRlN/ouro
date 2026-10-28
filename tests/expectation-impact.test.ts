import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyCommand,emptyState,PROJECT_ID,AGENT_ID,replay,type Actor,type Command,type DomainEvent,type FlowDefinition,type RevisionContent,type SpecRevision } from '../packages/core/src';
import { createStore } from '../lib/store';
import { calculateExpectationImpact } from '../packages/core/src/expectation-impact';

const human:Actor={id:randomUUID(),kind:'human',name:'Человек',projectIds:[PROJECT_ID]},agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const content=(title:string):RevisionContent=>({title,goal:'Исходная цель\nвторая строка',dod:[{id:'first',text:'Первое условие',required:true},{id:'second',text:'Второе условие',required:false}],constraints:'Ограничения',assumptions:'Допущения',risks:'Риски',inputs:'Входы',comment:'Комментарий'});
const revisionContent=(revision:SpecRevision):RevisionContent=>({title:revision.title,goal:revision.goal,dod:structuredClone(revision.dod),constraints:revision.constraints,assumptions:revision.assumptions,risks:revision.risks,inputs:revision.inputs,comment:revision.comment,...(revision.flow?{flow:structuredClone(revision.flow)}:{})});
const simpleFlow=():FlowDefinition=>({entryNodeId:'act',nodes:[{id:'act',kind:'action',title:'Выполнить',description:'Описание',owner:'agent'},{id:'check',kind:'action',title:'Проверить',description:'Проверка',owner:'agent'},{id:'result',kind:'result',title:'Предъявить результат',description:'Проверить',owner:'agent'}],edges:[{id:'verify',source:'act',target:'check',label:'К проверке'},{id:'finish',source:'check',target:'result',label:'Готово'}]});
function fixture(withFlow=false){
  let state=emptyState();const run=(payload:Record<string,unknown>,actor=human)=>{state=applyCommand(state,{...payload,requestId:randomUUID(),expectedVersion:state.version} as Command,actor).state;return state;};
  const create=(title:string,activate=true)=>{run({type:'createSpec',content:{...content(title),...(withFlow?{flow:simpleFlow()}:{})}});const spec=state.specs.at(-1)!;if(activate)run({type:'activateRevision',specId:spec.id,revisionId:spec.revisionIds[0]});return spec.id;};
  const a=create('A'),b=create('B'),c=create('C'),c0=state.version;
  const original=()=>state.revisions.find(revision=>revision.id===state.specs.find(spec=>spec.id===a)!.revisionIds[0])!;
  const revise=(specId:string,body:RevisionContent,activate=true)=>{run({type:'proposeRevision',specId,content:body});const revision=state.revisions.at(-1)!;if(activate)run({type:'activateRevision',specId,revisionId:revision.id});return revision.id;};
  const report=(c1=state.version,specIds?:string[])=>calculateExpectationImpact(state.events,{projectId:PROJECT_ID,c0,c1,...(specIds!==undefined?{specIds}:{})});
  return {get state(){return state;},run,create,revise,original,a,b,c,c0,report};
}

test('M01/M02 fixed baseline counts unique changed specs, retains a reverted change and separates newly approved/draft goals',()=>{
  const f=fixture(),base=revisionContent(f.original());
  f.revise(f.a,{...base,goal:'Изменённая цель'});f.revise(f.a,base);f.run({type:'invalidateSpec',specId:f.b,reason:'Цель снята человеком'});
  const approved=f.create('Новая утверждённая'),draft=f.create('Новый черновик',false);const report=f.report();
  assert.equal(report.status,'available');assert.equal(report.N,3);assert.equal(report.K,2);assert.equal(report.percent,200/3);
  assert.deepEqual(new Set(report.baseline.map(item=>item.specId)),new Set([f.a,f.b,f.c]));
  assert.deepEqual(report.newApprovedSpecs.map(item=>item.specId),[approved]);assert.deepEqual(report.newDraftSpecs.map(item=>item.specId),[draft]);
  assert.equal(report.counts.revisionChanges,2);assert.equal(report.counts.invalidatedBaselineSpecs,1);
  const a=report.changedSpecs.find(item=>item.specId===f.a)!;assert.equal(a.changes.length,1);assert.deepEqual(a.changes[0].fields,['goal']);
  assert.equal(f.state.events.find(event=>event.id===a.changes[0].eventId)?.type,'RevisionActivated');assert.equal(a.baselineRevisionId,f.original().id);
});

test('M03 presentation edits, normalized text and reordered DoD/Flow sets do not change the approved contract',()=>{
  const f=fixture(true),base=revisionContent(f.original());
  f.revise(f.a,{...base,title:'Переименованная A',comment:'Иной комментарий',goal:'  Исходная цель\r\nвторая строка  ',dod:[...base.dod].reverse().map(item=>({...item,text:` ${item.text}\r\n`})),flow:{...base.flow!,nodes:[...base.flow!.nodes].reverse().map(node=>({...node,description:` ${node.description} `})),edges:[...base.flow!.edges].reverse()}});
  const report=f.report();assert.equal(report.status,'available');assert.equal(report.K,0);assert.equal(report.percent,0);assert.equal(report.counts.revisionChanges,1);
  const changedFlow=revisionContent(f.state.revisions.at(-1)!);changedFlow.flow!.nodes[0].title='Иной ожидаемый результат';
  f.revise(f.a,changedFlow);assert.equal(f.report().K,1);assert.deepEqual(f.report().changedSpecs[0].changes[0].fields,['flow']);
});

test('M03 an unactivated proposal cannot affect K; changed DoD and adding a Flow do',()=>{
  const f=fixture(),base=revisionContent(f.original());
  f.revise(f.a,{...base,goal:'Только предложение'},false);assert.equal(f.report().K,0);assert.equal(f.report().counts.revisionChanges,0);
  f.revise(f.a,{...base,dod:base.dod.map(item=>({...item,required:true})),flow:simpleFlow()});
  assert.equal(f.report().K,1);assert.deepEqual(f.report().changedSpecs[0].changes[0].fields,['dod','flow']);
});

test('M02 only changes to incoming mandatory prerequisites affect a baseline spec',()=>{
  const f=fixture();f.run({type:'addDependency',from:f.a,to:f.c,relationship:'relates_to'});assert.equal(f.report().K,0);
  f.run({type:'addDependency',from:f.b,to:f.c});const report=f.report();assert.equal(report.K,1);
  const changed=report.changedSpecs[0];assert.equal(changed.specId,f.c);assert.deepEqual(changed.changes[0].fields,['prerequisites']);
  assert.equal(changed.changes[0].type,'DependencyAdded');assert.equal(changed.changes[0].reason,'mandatory-prerequisites-changed');
  assert.deepEqual(report.baseline.find(item=>item.specId===f.c)?.mandatoryPrerequisiteIds,[]);
});

test('M04 questions, human choices and a failed execution are observed separately without inventing expectation drift',()=>{
  const f=fixture(true);const spec=f.state.specs.find(item=>item.id===f.a)!;
  f.run({type:'startExecution',specId:f.a,specRevisionId:spec.activeRevisionId,agentId:AGENT_ID});const execution=f.state.executions.at(-1)!;
  f.run({type:'confirmResumed',executionId:execution.id},agent);
  f.run({type:'reportQuestion',specId:f.a,specRevisionId:spec.activeRevisionId,executionId:execution.id,title:'Вопрос',context:'Нужно уточнение',question:'Как проверить?',blockingScope:'none'},agent);
  const question=f.state.requests.at(-1)!;f.run({type:'resolveDecision',decisionRequestId:question.id,specRevisionId:spec.activeRevisionId,outcome:{kind:'answer',answer:'Проверить по принятому критерию'}});
  f.run({type:'reportAction',specId:f.a,specRevisionId:spec.activeRevisionId,executionId:execution.id,actionId:randomUUID(),phase:'failed',title:'Проверка не прошла',context:'Отдельный факт',evidence:'test://failed-check'},agent);
  f.run({type:'completeExecution',executionId:execution.id,result:'failed',evidence:'test://failed-execution'},agent);
  const report=f.report();assert.equal(report.K,0);assert.equal(report.percent,0);assert.equal(report.counts.unlinkedFactsWithFlow,2);assert.equal(report.counts.pendingQuestions,0);
  assert.equal(report.sources.unlinkedFactsWithFlow.length,2);assert.equal(report.counts.historicalActions,0);
});

test('M05 scope distinguishes an explicit empty list from all and accepts newly created selected specs outside B',()=>{
  const f=fixture();f.revise(f.a,{...revisionContent(f.original()),goal:'Изменение A'});
  assert.equal(f.report().N,3);const empty=f.report(undefined,[]);assert.equal(empty.status,'no-baseline');assert.equal(empty.reason,'empty-scope');assert.equal(empty.percent,null);assert.equal(empty.N,0);
  const selected=f.report(undefined,[f.a,f.a]);assert.equal(selected.N,1);assert.equal(selected.K,1);assert.deepEqual(selected.scope.specIds,[f.a]);
  const newcomer=f.create('Активирована после исходной точки');const newOnly=f.report(undefined,[newcomer]);assert.equal(newOnly.status,'no-baseline');assert.equal(newOnly.N,0);assert.equal(newOnly.newApprovedSpecs.length,1);
  assert.equal(f.report(undefined,['unknown']).status,'unknown');assert.equal(f.report(undefined,['unknown']).percent,null);
});

test('M05 no approved baseline is unavailable instead of a fabricated 0 percent',()=>{
  const f=fixture();const report=calculateExpectationImpact(f.state.events,{projectId:PROJECT_ID,c0:0,c1:f.state.version});
  assert.equal(report.status,'no-baseline');assert.equal(report.K,0);assert.equal(report.N,0);assert.equal(report.percent,null);assert.equal(report.reason,'no-baseline');assert.equal(report.newApprovedSpecs.length,3);
});

test('M05 incomplete, contradictory, foreign/schema history and invalid cursor/scope fail closed',()=>{
  const f=fixture();const events=f.state.events;
  const invalid:Array<[readonly DomainEvent[],Record<string,unknown>]>=[
    [events.slice(1),{}],[events,{c1:events.length+1}],[events,{c0:-1}],[events,{c0:7,c1:6}],[events,{c1:1.5}],
    [events.map((event,index)=>index?event:{...event,schemaVersion:2}) as DomainEvent[],{}],
    [events.map((event,index)=>index?event:{...event,projectId:'foreign'}),{}],
    [events.map((event,index)=>index?event:{...event,id:events[1].id}),{}],
    [events,{specIds:['not-in-this-history']}],[events,{specIds:null}],
  ];
  const broken=structuredClone(events);(broken[1].payload as {revisionId:string}).revisionId='missing-revision';invalid.push([broken,{}]);
  for(const [input,parameters] of invalid){const report=calculateExpectationImpact(input,{projectId:PROJECT_ID,c0:f.c0,c1:f.state.version,...parameters} as never);assert.equal(report.status,'unknown');assert.equal(report.percent,null);assert.equal(report.N,null);assert.deepEqual(report.counts,{});}
});

test('M05 malformed actor provenance cannot produce a confirmed zero-percent report',()=>{
  const f=fixture();
  const malformedActors=[{}, {...human,id:''}, {...human,kind:'unknown'}, {...human,projectIds:[]}, {...human,projectIds:['foreign']}];
  for(const actor of malformedActors){
    const events=structuredClone(f.state.events);events[1].actor=actor as Actor;
    const report=calculateExpectationImpact(events,{projectId:PROJECT_ID,c0:f.c0,c1:events.length});
    assert.equal(report.status,'unknown');assert.equal(report.reason,'invalid-history');assert.equal(report.percent,null);assert.equal(report.K,null);assert.equal(report.N,null);
  }
});

test('M06 cursor window and baseline remain historical; future events do not leak into an earlier report',()=>{
  const f=fixture();const earlier=f.state.version;f.revise(f.a,{...revisionContent(f.original()),goal:'Будущее изменение'});
  const historical=f.report(earlier);assert.equal(historical.K,0);assert.equal(historical.c1,earlier);assert.equal(historical.counts.revisionChanges,0);
  assert.equal(f.report().K,1);const baselineAtLatest=calculateExpectationImpact(f.state.events,{projectId:PROJECT_ID,c0:f.state.version,c1:f.state.version});assert.equal(baselineAtLatest.K,0);assert.equal(baselineAtLatest.N,3);
});

test('M06 open requests are a c1 snapshot while traceability facts are counted only inside the window',()=>{
  const f=fixture(),spec=f.state.specs.find(item=>item.id===f.a)!;
  f.run({type:'startExecution',specId:f.a,specRevisionId:spec.activeRevisionId,agentId:AGENT_ID});const execution=f.state.executions.at(-1)!;f.run({type:'confirmResumed',executionId:execution.id},agent);
  f.run({type:'reportQuestion',specId:f.a,specRevisionId:spec.activeRevisionId,executionId:execution.id,title:'Открытый вопрос',context:'Нужен человек',question:'Как проверить?',blockingScope:'none'},agent);
  const report=calculateExpectationImpact(f.state.events,{projectId:PROJECT_ID,c0:f.state.version,c1:f.state.version});
  assert.equal(report.K,0);assert.equal(report.counts.pendingQuestions,1);assert.equal(report.counts.unlinkedFactsWithoutFlow,0);
  assert.equal(report.sources.pendingQuestions[0].version,f.state.version);assert.equal(report.sources.pendingQuestions[0].decisionRequestId,f.state.requests.at(-1)!.id);
});

test('M03 Flow view coordinates do not become a semantic change in the measurement',()=>{
  const f=fixture(true);f.revise(f.a,revisionContent(f.original()));
  const events=structuredClone(f.state.events);const proposed=events.findLast(event=>event.type==='RevisionProposed')!;
  const revision=proposed.payload.revision as SpecRevision;
  Object.assign(revision.flow!.nodes[0],{position:{x:320,y:140}});Object.assign(revision.flow!.edges[0],{selected:true});
  const report=calculateExpectationImpact(events,{projectId:PROJECT_ID,c0:f.c0,c1:events.length});
  assert.equal(report.status,'available');assert.equal(report.K,0);
});

test('M06 zero side effects and deterministic provenance survive SQL reopen and idempotent command delivery',async()=>{
  const f=fixture(),directory=await mkdtemp(path.join(os.tmpdir(),'ouro-impact-'));let store:Awaited<ReturnType<typeof createStore>>|undefined;
  try{
    store=await createStore({dataDir:directory,seedEvents:f.state.events});
    const proposal={type:'proposeRevision',specId:f.a,requestId:randomUUID(),expectedVersion:f.state.version,content:{...revisionContent(f.original()),goal:'Проверяемое изменение'}};
    const proposed=await store.executeCommand(proposal,human),revision=proposed.state.revisions.at(-1)!;
    const activation={type:'activateRevision',specId:f.a,revisionId:revision.id,requestId:randomUUID(),expectedVersion:proposed.cursor};
    const activated=await store.executeCommand(activation,human);await store.executeCommand(activation,human);
    const before=await store.getProject(),input=structuredClone(before.events),frozen=JSON.stringify(input);
    const report=calculateExpectationImpact(input,{projectId:PROJECT_ID,c0:f.c0,c1:activated.cursor});
    assert.equal(report.K,1);assert.equal(report.N,3);assert.equal(JSON.stringify(input),frozen);assert.deepEqual(await store.getProject(),before);
    assert.deepEqual(calculateExpectationImpact(input,{projectId:PROJECT_ID,c0:f.c0,c1:activated.cursor}),report);
    await store.close();store=await createStore({dataDir:directory});const after=await store.getProject();assert.equal(after.version,activated.cursor);
    assert.deepEqual(calculateExpectationImpact(after.events,{projectId:PROJECT_ID,c0:f.c0,c1:after.version}),report,'JSONB key order and reopen cannot change the measured report');
  }finally{await store?.close();await rm(directory,{recursive:true,force:true});}
});
