import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,buildFlowRuntimeView,emptyState,replay,PROJECT_ID,AGENT_ID,type Actor,type Command,type FlowDefinition} from '../packages/core/src';

const human:Actor={id:'flow-runtime-human',kind:'human',projectIds:[PROJECT_ID]};
const agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const linear:FlowDefinition={entryNodeId:'work',nodes:[
 {id:'work',kind:'action',title:'Выполнить работу',description:'Ограниченный шаг.',owner:'agent'},
 {id:'result',kind:'result',title:'Предъявить результат',description:'Приёмка отдельно.',owner:'agent'},
],edges:[{id:'next',source:'work',target:'result',label:'Результат предъявлен'}]};
function fixture(flow:FlowDefinition|undefined=linear,tracking=true){
 let state=emptyState(),lastEvents=state.events;
 const send=(body:Record<string,unknown>,actor=human)=>{
  const applied=applyCommand(state,{...body,requestId:crypto.randomUUID(),expectedVersion:state.version} as Command,actor);
  state=applied.state;lastEvents=applied.events;return applied;
 };
 send({type:'createSpec',content:{title:'Учёт проходов схемы',goal:'Проверить порядок и immutable историю проходов.',dod:[{id:'checked',text:'Человек проверил итог.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',...(flow?{flow}:{})}});
 const spec=state.specs[0],revision=state.revisions[0];
 send({type:'activateRevision',specId:spec.id,revisionId:revision.id});
 const assign=()=>send({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:AGENT_ID,...(tracking?{flowTracking:'enforced'}:{})});
 return {get state(){return state;},get events(){return lastEvents;},send,assign,spec,revision};
}
type Fixture=ReturnType<typeof fixture>;
function begin(f:Fixture){f.assign();const executionId=f.state.executions[0].id;f.send({type:'confirmResumed',executionId},agent);return executionId;}
function current(f:Fixture){const runtime=f.state.executions[0].flowRuntime!;return runtime.runs.find(run=>run.id===runtime.currentRunId)!;}
function phase(f:Fixture,executionId:string,phase:'start'|'complete'|'fail',extra:Record<string,unknown>={},actor=agent){return f.send({type:'reportFlowStep',executionId,runId:current(f).id,phase,...(phase!=='start'?{evidence:'Проверено независимым наблюдением.'}:{}),...extra},actor);}
const rejects=(fn:()=>unknown,code='INVALID_TRANSITION')=>assert.throws(fn,error=>(error as {code?:string}).code===code);

test('FR02 opt-in creates one ready entry run atomically and legacy execution gets no invented runtime',()=>{
 const f=fixture();f.assign();
 const execution=f.state.executions[0] as typeof f.state.executions[0]&{flowRuntime?:{version:number;state:string;currentRunId:string;runs:{id:string;nodeId:string;visit:number;state:string}[];traversals:unknown[]}};
 assert(execution.flowRuntime,'Enforced assignment must create a concrete runtime');
 assert.equal(execution.state,'queued');assert.equal(execution.flowRuntime.version,1);assert.equal(execution.flowRuntime.state,'active');
 assert.equal(execution.flowRuntime.runs.length,1);assert.equal(execution.flowRuntime.runs[0].nodeId,'work');assert.equal(execution.flowRuntime.runs[0].visit,1);assert.equal(execution.flowRuntime.runs[0].state,'ready');
 assert.equal(execution.flowRuntime.currentRunId,execution.flowRuntime.runs[0].id);assert.deepEqual(execution.flowRuntime.traversals,[]);
 const legacy=fixture(linear,false);legacy.assign();assert.equal((legacy.state.executions[0] as {flowRuntime?:unknown}).flowRuntime,undefined);
});

test('FR02 enforced profile rejects ambiguous action exits while preserving legacy Flow acceptance',()=>{
 const ambiguous:FlowDefinition={...linear,nodes:[...linear.nodes,{id:'other',kind:'result',title:'Другой результат',description:'',owner:'agent'}],edges:[...linear.edges,{id:'other-path',source:'work',target:'other',label:'Другой исход'}]};
 const enforced=fixture(ambiguous);assert.throws(()=>enforced.assign(),error=>(error as {code?:string}).code==='VALIDATION_ERROR');
 const legacy=fixture(ambiguous,false);legacy.assign();assert.equal(legacy.state.executions.length,1);
});

test('FR03 linear run records only explicit lifecycle facts, preserves replay and leaves acceptance separate',()=>{
 const f=fixture(),executionId=begin(f),entryId=current(f).id;
 rejects(()=>phase(f,executionId,'complete'));
 phase(f,executionId,'start');assert.equal(current(f).state,'running');
 const action={type:'reportAction',executionId,specId:f.spec.id,specRevisionId:f.revision.id,flowStepRunId:entryId,actionId:crypto.randomUUID(),phase:'completed',title:'Проверен один шаг',context:'Факт не означает переход.',evidence:'Зафиксирован результат.'};
 f.send(action,agent);assert.equal(current(f).id,entryId);assert.equal(f.state.executions[0].flowRuntime!.traversals.length,0);
 const before=f.state;phase(f,executionId,'complete');
 assert.equal(before.executions[0].flowRuntime!.runs[0].state,'running','command cannot mutate original state');
 const runtime=f.state.executions[0].flowRuntime!;assert.equal(runtime.runs[0].state,'succeeded');assert.equal(current(f).nodeId,'result');assert.equal(current(f).state,'ready');
 assert.equal(runtime.traversals.length,1);assert.equal(runtime.traversals[0].fromRunId,entryId);assert.equal(runtime.traversals[0].toRunId,current(f).id);
 assert.equal(f.events[0].type,'FlowStepCompleted');assert.equal(f.events[1].type,'FlowEdgeTraversed');assert.equal(f.events[1].causationId,f.events[0].id);
 rejects(()=>f.send({type:'completeExecution',executionId,result:'succeeded',evidence:'Схема ещё не завершена.'},agent));
 phase(f,executionId,'start');phase(f,executionId,'complete');
 assert.equal(f.state.executions[0].flowRuntime!.state,'completed');assert.equal(f.state.executions[0].flowRuntime!.currentRunId,null);assert.equal(f.state.executions[0].state,'running');
 f.send({type:'completeExecution',executionId,result:'succeeded',evidence:'Оба шага явно выполнены.'},agent);
 assert.equal(f.state.specs[0].state,'in_progress');assert.equal(f.state.specs[0].acceptance,undefined);assert.deepEqual(replay(f.state.events),f.state);
});

test('FR05 failure during pause is a fact; retry is human-authorized and creates a new visit',()=>{
 const f=fixture(),executionId=begin(f),original=current(f).id;phase(f,executionId,'start');
 f.send({type:'requestStop',executionId,reason:'Приостановить работу.'});f.send({type:'confirmStopped',executionId},agent);
 assert.equal(f.state.executions[0].state,'paused');rejects(()=>phase(f,executionId,'complete'));
 phase(f,executionId,'fail');assert.equal(current(f).state,'failed');assert.equal(f.state.executions[0].state,'paused');assert.equal(f.state.specs[0].state,'blocked');
 rejects(()=>f.send({type:'retryFlowStep',executionId,runId:original,reason:'Устранена причина.'},agent),'FORBIDDEN');
 rejects(()=>f.send({type:'retryFlowStep',executionId,runId:original,reason:'Устранена причина.'}));
 f.send({type:'resumeExecution',executionId});f.send({type:'confirmResumed',executionId},agent);
 f.send({type:'retryFlowStep',executionId,runId:original,reason:'Устранена причина.'});
 assert.equal(current(f).visit,2);assert.equal(current(f).retryOfRunId,original);assert.notEqual(current(f).id,original);assert.equal(current(f).state,'ready');assert.equal(f.state.executions[0].flowRuntime!.traversals.length,0);assert.equal(f.state.executions[0].flowRuntime!.runs[0].state,'failed');assert.notEqual(f.state.specs[0].state,'blocked');assert.deepEqual(replay(f.state.events),f.state);
});

test('FR07 ready action skip requires human evidence and does not claim local success',()=>{
 const f=fixture(),executionId=begin(f),runId=current(f).id;
 rejects(()=>f.send({type:'skipFlowStep',executionId,runId,reason:'Явный пропуск.',evidence:'Проверена допустимость.'},agent),'FORBIDDEN');
 rejects(()=>f.send({type:'skipFlowStep',executionId,runId,reason:'Явный пропуск.',evidence:''}),'VALIDATION_ERROR');
 f.send({type:'skipFlowStep',executionId,runId,reason:'Шаг уже сделан вне попытки.',evidence:'Человек сверил артефакт.'});
 assert.equal(f.state.executions[0].flowRuntime!.runs[0].state,'skipped');assert.equal(current(f).nodeId,'result');assert.equal(current(f).state,'ready');assert.equal(f.state.executions[0].flowRuntime!.state,'active');
 rejects(()=>f.send({type:'skipFlowStep',executionId,runId:current(f).id,reason:'Пропустить результат.',evidence:'Недопустимо.'}));
});

test('FR08 projection uses actual owner and strict guards without mutating authority state',()=>{
 const owned:FlowDefinition={...linear,nodes:linear.nodes.map(node=>({...node,owner:node.id==='work'?'system':node.owner}))};
 const f=fixture(owned),executionId=begin(f);const before=structuredClone(f.state),view=buildFlowRuntimeView(f.state,executionId);
 assert.equal(view.agentActions.start.allowed,false);assert.equal(view.humanActions.start.allowed,true);assert.equal(view.edges[0].state,'blocked');assert.deepEqual(f.state,before);
 rejects(()=>phase(f,executionId,'start'), 'FORBIDDEN');phase(f,executionId,'start',{},human);
 assert.equal(buildFlowRuntimeView(f.state,executionId).humanActions.complete.allowed,true);
 rejects(()=>phase(f,executionId,'complete',{},agent),'FORBIDDEN');phase(f,executionId,'complete',{},human);
 assert.equal(buildFlowRuntimeView(f.state,executionId,before.executions[0].flowRuntime!.currentRunId!).edges[0].state,'taken');
});

test('FR05 loop projection scopes selected edges to one visit and never invents skipped future nodes',()=>{
 const flow:FlowDefinition={entryNodeId:'gate',nodes:[...linear.nodes,{id:'gate',kind:'condition',title:'Повторить или предъявить?',description:'Текст не является исполняемым выражением.',owner:'agent'}],edges:[{id:'again',source:'gate',target:'work',label:'Ещё один проход'},{id:'finish',source:'gate',target:'result',label:'Предъявить'},{id:'back',source:'work',target:'gate',label:'Проверить снова'}]};
 const f=fixture(flow),executionId=begin(f),first=current(f).id;phase(f,executionId,'start');
 rejects(()=>phase(f,executionId,'complete'),'VALIDATION_ERROR');
 phase(f,executionId,'complete',{edgeId:'again'});assert.equal(current(f).nodeId,'work');
 assert.equal(f.state.executions[0].flowRuntime!.runs.some(run=>run.nodeId==='result'),false);
 phase(f,executionId,'start');phase(f,executionId,'complete');const second=current(f).id;
 assert.notEqual(second,first);assert.equal(current(f).visit,2);
 const old=buildFlowRuntimeView(f.state,executionId,first);assert.equal(old.run!.state,'succeeded');assert.equal(old.edges.find(edge=>edge.id==='again')!.state,'taken');assert.equal(old.edges.find(edge=>edge.id==='finish')!.state,'not_selected');
 assert.equal(buildFlowRuntimeView(f.state,executionId,second).edges.find(edge=>edge.id==='again')!.state,'blocked');
 phase(f,executionId,'start');const live=buildFlowRuntimeView(f.state,executionId,second);assert.equal(live.edges.find(edge=>edge.id==='again')!.state,'available');assert.equal(live.edges.find(edge=>edge.id==='finish')!.state,'available');
 phase(f,executionId,'complete',{edgeId:'finish'});assert.equal(current(f).nodeId,'result');assert.deepEqual(f.state.executions[0].flowRuntime!.runs.filter(run=>run.nodeId==='gate').map(run=>run.visit),[1,2]);assert.equal(f.state.executions[0].flowRuntime!.runs.some(run=>run.state==='skipped'),false);assert.deepEqual(replay(f.state.events),f.state);
});

test('FR06 waiting is a durable explicit step state; completion needs evidence and no fictitious request',()=>{
 const wait:FlowDefinition={...linear,nodes:linear.nodes.map(node=>node.id==='work'?{...node,kind:'wait'}:node)};
 const f=fixture(wait),executionId=begin(f);phase(f,executionId,'start');assert.equal(current(f).state,'waiting');assert.equal(f.state.requests.length,0);
 f.send({type:'reportAction',executionId,specId:f.spec.id,specRevisionId:f.revision.id,flowStepRunId:current(f).id,actionId:crypto.randomUUID(),phase:'completed',title:'Наблюдали ожидание',context:'Факт не завершает ожидание.',evidence:'Условие наблюдается.'},agent);
 assert.equal(current(f).state,'waiting');rejects(()=>phase(f,executionId,'complete',{evidence:''}),'VALIDATION_ERROR');phase(f,executionId,'complete');assert.equal(current(f).nodeId,'result');
});

test('FR08 failure after revision change records old-run evidence without reopening authorization',()=>{
 const f=fixture(),executionId=begin(f),runId=current(f).id;phase(f,executionId,'start');
 const {id:_id,specId:_specId,revision:_number,createdAt:_created,authorId:_author,...content}=f.revision;
 f.send({type:'proposeRevision',specId:f.spec.id,content:{...content,title:'Новый контракт'}});const next=f.state.revisions.at(-1)!;f.send({type:'activateRevision',specId:f.spec.id,revisionId:next.id});
 rejects(()=>phase(f,executionId,'complete'));
 phase(f,executionId,'fail',{evidence:'Поздняя проверка выявила неуспех исходного шага.'});
 const execution=f.state.executions[0];assert.equal(execution.state,'running');assert.equal(execution.stopRequested,true);assert.equal(execution.flowRuntime!.state,'failed');assert.equal(execution.flowRuntime!.currentRunId,runId);assert.equal(execution.flowRuntime!.traversals.length,0);assert.equal(current(f).state,'failed');assert.equal(f.state.specs[0].state,'specified');assert.deepEqual(replay(f.state.events),f.state);
});

test('FR09 cancellation closes an open run without asserting success or a physical stopping fact',()=>{
 const f=fixture(),executionId=begin(f),runId=current(f).id;phase(f,executionId,'start');
 f.send({type:'requestStop',executionId,reason:'Остановить перед закрытием.'});f.send({type:'confirmStopped',executionId},agent);
 f.send({type:'cancelExecution',executionId,reason:'Авторизация завершена человеком.'});
 const execution=f.state.executions[0];assert.equal(execution.flowRuntime!.state,'cancelled');assert.equal(execution.flowRuntime!.currentRunId,null);assert.equal(execution.flowRuntime!.runs.find(run=>run.id===runId)!.state,'cancelled');assert.equal(execution.flowRuntime!.traversals.length,0);assert.equal(execution.flowRuntime!.runs.find(run=>run.id===runId)!.evidence,undefined);assert.deepEqual(replay(f.state.events),f.state);
});
