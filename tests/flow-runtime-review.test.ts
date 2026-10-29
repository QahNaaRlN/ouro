import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyCommand,emptyState,replay,PROJECT_ID,AGENT_ID,type Actor,type Command,type FlowDefinition,type ProjectState} from '../packages/core/src';

const human:Actor={id:'runtime-review-human',kind:'human',projectIds:[PROJECT_ID]};
const agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const intruder:Actor={id:'runtime-review-other-agent',kind:'agent',projectIds:[PROJECT_ID]};
type Run={id:string;nodeId:string;visit:number;state:string;retryOfRunId?:string;evidence?:string;reason?:string};
type Runtime={version:number;state:string;currentRunId:string|null;runs:Run[];traversals:{id:string;edgeId:string;fromRunId:string;toRunId:string}[]};
const node=(id:string,kind='action',owner='agent')=>({id,kind,title:`Шаг ${id}`,description:'Явно подтверждаемый шаг.',owner});
const edge=(id:string,source:string,target:string,optionId?:string)=>({id,source,target,label:id,...(optionId?{optionId}:{})});
const line=():FlowDefinition=>({entryNodeId:'a',nodes:[node('a'),node('end','result')],edges:[edge('to-end','a','end')]} as FlowDefinition);
const loop=():FlowDefinition=>({entryNodeId:'a',nodes:[node('a'),node('choice','fork','human'),node('end','result')],edges:[edge('to-choice','a','choice'),edge('again','choice','a','again'),edge('finish','choice','end','finish')]} as FlowDefinition);
const content=(flow:FlowDefinition,title='Независимая приемка проходов')=>({title,goal:'Подтверждать порядок и контекст проходов без переписывания истории.',dod:[{id:'verified',text:'Человек проверил итог.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',flow});
function fixture(flow=line(),tracking=true){
 let state=emptyState();
 const send=(body:Record<string,unknown>,actor=human)=>{
  const result=applyCommand(state,{...body,requestId:randomUUID(),expectedVersion:state.version} as Command,actor);state=result.state;return result;
 };
 send({type:'createSpec',content:content(flow)});const spec=state.specs[0],revision=state.revisions[0];
 send({type:'activateRevision',specId:spec.id,revisionId:revision.id});
 send({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.id,...(tracking?{flowTracking:'enforced'}:{})});
 const execution=state.executions[0];
 const runtime=()=>{
  const value=(state.executions.find(item=>item.id===execution.id) as unknown as {flowRuntime?:Runtime}).flowRuntime;
  assert(value,'Enforced execution must expose its event-backed runtime');return value;
 };
 const current=()=>{const value=runtime(),run=value.runs.find(run=>run.id===value.currentRunId);assert(run,'There must be a current run');return run;};
 const ack=()=>send({type:'confirmResumed',executionId:execution.id,ackPhase:'start'},agent);
 const step=(phase:string,extra:Record<string,unknown>={},actor=agent)=>send({type:'reportFlowStep',executionId:execution.id,runId:current().id,phase,...(phase==='start'?{}:{evidence:'test://runtime-review/step'}),...extra},actor);
 const denied=(body:Record<string,unknown>,actor=agent)=>{const before=structuredClone(state);assert.throws(()=>send(body,actor),error=>typeof(error as {code?:string}).code==='string'&&(error as {code:string}).code!=='UNKNOWN_COMMAND');assert.deepEqual(state,before);};
 return {get state(){return state;},spec,revision,execution,send,runtime,current,ack,step,denied};
}

test('FR-REVIEW01 opt-in runtime is a real assignment fact before ACK, not invented from Action evidence',()=>{
 const f=fixture();assert.equal(f.runtime().runs.length,1);assert.equal(f.current().nodeId,'a');assert.equal(f.current().state,'ready');
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:f.current().id,phase:'start'});
 const legacy=fixture(line(),false);
 assert.equal((legacy.state.executions[0] as unknown as {flowRuntime?:unknown}).flowRuntime,undefined);
});

test('FR-REVIEW02 scope, ordering and node owners are enforced, while finishing result never accepts DoD',()=>{
 const f=fixture();f.ack();const first=f.current().id;
 f.send({type:'createSpec',content:content(line(),'Другая спека с теми же node IDs')});
 const otherSpec=f.state.specs.at(-1)!,otherRevision=f.state.revisions.at(-1)!;
 f.send({type:'activateRevision',specId:otherSpec.id,revisionId:otherRevision.id});
 f.send({type:'startExecution',specId:otherSpec.id,specRevisionId:otherRevision.id,agentId:agent.id,flowTracking:'enforced'});
 const otherExecution=f.state.executions.at(-1)!,otherRun=(otherExecution as unknown as {flowRuntime:Runtime}).flowRuntime.currentRunId!;
 f.send({type:'confirmResumed',executionId:otherExecution.id,ackPhase:'start'},agent);
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:otherRun,phase:'start'});
 f.denied({type:'reportFlowStep',executionId:otherExecution.id,runId:first,phase:'start'});
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:first,phase:'start'},intruder);
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:first,phase:'start'},human);
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:first,phase:'complete',evidence:'test://not-started'});
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:'foreign-run',phase:'start'});
 f.step('start');
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:first,phase:'complete'});
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:first,phase:'complete',edgeId:'not-an-edge',evidence:'test://wrong-edge'});
 f.denied({type:'completeExecution',executionId:f.execution.id,result:'succeeded',evidence:'test://premature'});
 f.step('complete');assert.equal(f.current().nodeId,'end');assert.equal(f.runtime().traversals.length,1);
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:first,phase:'start'});
 f.step('start');f.step('complete');assert.equal(f.runtime().state,'completed');assert.equal(f.runtime().currentRunId,null);
 assert.equal(f.state.executions[0].state,'running');assert.notEqual(f.state.specs[0].state,'done');
 f.send({type:'completeExecution',executionId:f.execution.id,result:'succeeded',evidence:'test://runtime-review/result'},agent);
 assert.notEqual(f.state.specs[0].state,'done');
 f.send({type:'acceptSpec',specId:f.spec.id,specRevisionId:f.revision.id,evidence:{verified:'Проверен результат и все требуемые критерии.'}});
 assert.equal(f.state.specs[0].state,'done');

 for(const owner of ['human','system']){
  const flow=line();flow.nodes[0].owner=owner as 'human'|'system';
  if(owner==='system')flow.nodes[0].kind='wait';
  const owned=fixture(flow);owned.ack();
  owned.denied({type:'reportFlowStep',executionId:owned.execution.id,runId:owned.current().id,phase:'start'},agent);
  owned.step('start',{},human);
  if(owner==='system')assert.equal(owned.current().state,'waiting','A wait node enters waiting without inventing a human decision request');
  owned.step('complete',{evidence:'Человек подтвердил выполнение наблюдаемого шага.'},human);
  assert.equal(owned.current().nodeId,'end');
 }
});

function reportChoice(f:ReturnType<typeof fixture>){
 const run=f.current();assert.equal(run.nodeId,'choice');f.step('start');
 f.send({type:'reportFork',executionId:f.execution.id,specId:f.spec.id,specRevisionId:f.revision.id,flowStepRunId:run.id,title:'Продолжить или повторить?',context:'Выбор именно этого прохода.',reason:'Варианты меняют дальнейший ход процесса, поэтому решение должен принять человек отдельно от подтверждения применения.',options:[{id:'again',title:'Повторить',description:'Ещё раз изучить вход.'},{id:'finish',title:'Завершить',description:'Предъявить результат.'}]},agent);
 const request=f.state.requests.at(-1)! as typeof f.state.requests[number]&{flowStepRunId?:string};
 assert.equal(request.flowStepRunId,run.id);return request;
}
function decide(f:ReturnType<typeof fixture>,requestId:string,optionId:string){
 f.send({type:'resolveDecision',decisionRequestId:requestId,specRevisionId:f.revision.id,outcome:{kind:'approve',chosenOptionId:optionId}});
 f.send({type:'confirmDecisionApplied',decisionRequestId:requestId,evidence:'test://runtime-review/decision-applied'},agent);
 f.send({type:'resumeExecution',executionId:f.execution.id});f.send({type:'confirmResumed',executionId:f.execution.id,ackPhase:'resume'},agent);
}

test('FR-REVIEW03 loops keep distinct visits and late Actions cannot rebind or borrow a prior Fork decision',()=>{
 const f=fixture(loop());f.ack();const first=f.current().id;f.step('start');
 const actionId=randomUUID();
 f.send({type:'reportAction',executionId:f.execution.id,specId:f.spec.id,specRevisionId:f.revision.id,flowStepRunId:first,actionId,phase:'started',title:'Длительный факт первого прохода',context:'Позднее подтверждение останется здесь.'},agent);
 assert.equal(f.current().id,first);assert.equal(f.current().state,'running');
 f.step('complete');const request1=reportChoice(f),fork1=f.current().id;
 f.send({type:'resolveDecision',decisionRequestId:request1.id,specRevisionId:f.revision.id,outcome:{kind:'approve',chosenOptionId:'again'}});
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:fork1,phase:'complete',edgeId:'again',evidence:'test://choice-is-not-application'});
 f.send({type:'confirmDecisionApplied',decisionRequestId:request1.id,evidence:'test://applied'},agent);
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:fork1,phase:'complete',edgeId:'again',evidence:'test://application-is-not-resume'});
 f.send({type:'resumeExecution',executionId:f.execution.id});
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:fork1,phase:'complete',edgeId:'again',evidence:'test://authorization-is-not-ack'});
 f.send({type:'confirmResumed',executionId:f.execution.id,ackPhase:'resume'},agent);
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:fork1,phase:'complete',edgeId:'finish',evidence:'test://wrong-human-choice'});
 f.step('complete',{edgeId:'again'});const second=f.current();assert.equal(second.nodeId,'a');assert.equal(second.visit,2);assert.notEqual(second.id,first);
 assert(!f.runtime().runs.some(run=>run.state==='skipped'));assert(!f.runtime().runs.some(run=>run.nodeId==='end'));
 f.step('start');
 const completion={type:'reportAction',executionId:f.execution.id,specId:f.spec.id,specRevisionId:f.revision.id,flowStepRunId:first,actionId,phase:'completed',title:'Поздний факт первого прохода',context:'Старый run сохранён.',evidence:'test://late-action'};
 // Check binding while this action is still unfinished: after completion a
 // generic terminal-phase guard would hide a missing run-binding guard.
 f.denied({...completion,flowStepRunId:second.id},agent);
 f.send(completion,agent);
 const fact=f.state.events.at(-1)!;assert.equal(fact.payload.flowStepRunId,first);assert.equal(fact.payload.flowNodeId,'a');
 assert.equal(f.current().id,second.id);assert.equal(f.current().state,'running');
 f.denied({...completion,actionId:randomUUID(),phase:'started'},agent);
 f.denied({...completion,actionId:randomUUID()},agent);
 f.step('complete');const secondFork=f.current().id;f.step('start');
 // The first Fork selected "again" and was applied. That exact same edge must
 // still be forbidden for a new visit until a new human request is answered.
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:secondFork,phase:'complete',edgeId:'again',evidence:'test://old-decision-cannot-unlock-new-visit'});
 f.send({type:'reportFork',executionId:f.execution.id,specId:f.spec.id,specRevisionId:f.revision.id,flowStepRunId:secondFork,title:'Решение второго прохода',context:'Отдельный выбор.',reason:'Повторное посещение развилки требует нового решения человека: прошлый выбор относился только к первому проходу.',options:[{id:'again',title:'Ещё раз',description:'Повторить шаг.'},{id:'finish',title:'Предъявить',description:'Завершить процесс.'}]},agent);
 const request2=f.state.requests.at(-1)!;decide(f,request2.id,'finish');f.step('complete',{edgeId:'finish'});
 assert.equal(f.current().nodeId,'end');assert.equal(f.current().visit,1);
 assert.equal(f.runtime().runs.find(run=>run.id===first)!.state,'succeeded');
 assert.deepEqual(f.runtime().runs.filter(run=>run.nodeId==='choice').map(run=>run.visit),[1,2]);
 assert.deepEqual(replay(f.state.events),f.state);
});

test('FR-REVIEW04 corrected request lineage stays bound to its one run and withdrawal grants no path',()=>{
 const flow=loop();flow.entryNodeId='choice';const f=fixture(flow);f.ack();const request=reportChoice(f),runId=f.current().id;
 f.send({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:f.revision.id,outcome:{kind:'approve',chosenOptionId:'again'}});
 f.send({type:'correctDecision',decisionRequestId:request.id,reason:'После проверки нужен другой путь.'});
 const replacement=f.state.requests.at(-1)! as typeof f.state.requests[number]&{flowStepRunId?:string};
 assert.notEqual(replacement.id,request.id);assert.equal(replacement.flowStepRunId,runId);assert.equal(f.runtime().runs.length,1);
 f.denied({type:'confirmDecisionApplied',decisionRequestId:request.id,evidence:'test://obsolete-decision'});
 decide(f,replacement.id,'finish');f.step('complete',{edgeId:'finish'});assert.equal(f.current().nodeId,'end');

 const question:FlowDefinition={entryNodeId:'q',nodes:[node('q','question','human'),node('end','result')],edges:[edge('answered','q','end')]} as FlowDefinition;
 const q=fixture(question);q.ack();
 q.denied({type:'skipFlowStep',executionId:q.execution.id,runId:q.current().id,reason:'Нельзя обходить ответ.',evidence:'test://skip-question'},human);
 q.step('start');const report={type:'reportQuestion',executionId:q.execution.id,specId:q.spec.id,specRevisionId:q.revision.id,flowStepRunId:q.current().id,title:'Нужен ответ',context:'Связан с человеческим шагом.',question:'Как продолжить?'};
 q.send({...report,blockingScope:'none'},agent);
 const pending=q.state.requests.at(-1)!;assert.equal(pending.blockingScope,'execution');assert.equal(q.current().state,'waiting');
 q.denied({type:'reportFlowStep',executionId:q.execution.id,runId:q.current().id,phase:'complete',evidence:'test://nonblocking-input-is-still-human-gate'});
 q.send({type:'withdrawDecision',decisionRequestId:pending.id,reason:'Уточнение отзывается, разрешения нет.'},agent);
 q.send({type:'resumeExecution',executionId:q.execution.id});q.send({type:'confirmResumed',executionId:q.execution.id,ackPhase:'resume'},agent);
 q.denied({type:'reportFlowStep',executionId:q.execution.id,runId:q.current().id,phase:'complete',evidence:'test://withdrawal-is-not-answer'});
});

test('FR-REVIEW05 human retry and skip retain failed attempts and obey stop/freeze barriers',()=>{
 const f=fixture();f.ack();const failed=f.current().id;f.step('start');f.step('fail',{evidence:'test://actual-failure'});
 assert.equal(f.state.specs[0].state,'blocked');
 f.denied({type:'retryFlowStep',executionId:f.execution.id,runId:failed,reason:'Агент не выдаёт новое разрешение.'},agent);
 f.denied({type:'retryFlowStep',executionId:f.execution.id,runId:failed,reason:''},human);
 f.send({type:'retryFlowStep',executionId:f.execution.id,runId:failed,reason:'Человек разрешил повтор.'});
 const retry=f.current();assert.notEqual(retry.id,failed);assert.equal(retry.retryOfRunId,failed);assert.equal(retry.visit,2);assert.equal(retry.state,'ready');
 assert.equal(f.state.specs[0].state,'in_progress');
 assert.equal(f.runtime().runs.find(run=>run.id===failed)!.state,'failed');
 f.denied({type:'skipFlowStep',executionId:f.execution.id,runId:retry.id,reason:'Агент не пропускает.',evidence:'test://skip'},agent);
 f.send({type:'requestStop',executionId:f.execution.id,reason:'Перед продолжением нужна остановка.'});
 f.denied({type:'skipFlowStep',executionId:f.execution.id,runId:retry.id,reason:'Не обойти stop.',evidence:'test://skip'},human);
 f.send({type:'confirmStopped',executionId:f.execution.id},agent);f.send({type:'resumeExecution',executionId:f.execution.id});f.send({type:'confirmResumed',executionId:f.execution.id,ackPhase:'resume'},agent);
 f.denied({type:'skipFlowStep',executionId:f.execution.id,runId:retry.id,reason:'',evidence:'test://missing-reason'},human);
 f.send({type:'skipFlowStep',executionId:f.execution.id,runId:retry.id,reason:'Человек явно исключил этот повтор.',evidence:'test://human-exception'});
 assert.equal(f.runtime().runs.find(run=>run.id===retry.id)!.state,'skipped');assert.equal(f.current().nodeId,'end');
 f.denied({type:'skipFlowStep',executionId:f.execution.id,runId:f.current().id,reason:'Result нельзя пропустить.',evidence:'test://skip-result'},human);

 const frozen=fixture();frozen.ack();frozen.send({type:'changeRoadmapState',state:'frozen'});
 frozen.denied({type:'reportFlowStep',executionId:frozen.execution.id,runId:frozen.current().id,phase:'start'});
 frozen.denied({type:'skipFlowStep',executionId:frozen.execution.id,runId:frozen.current().id,reason:'Заморозка не обходится.',evidence:'test://frozen'},human);
});

test('FR-REVIEW06 revision change forbids runtime advancement while preserving late facts on the old run',()=>{
 const f=fixture();f.ack();const runId=f.current().id;f.step('start');const actionId=randomUUID();
 const report={type:'reportAction',executionId:f.execution.id,specId:f.spec.id,specRevisionId:f.revision.id,flowStepRunId:runId,actionId,title:'Факт старого контракта',context:'Закреплён за исходным проходом.'};
 f.send({...report,phase:'started'},agent);
 f.send({type:'requestStop',executionId:f.execution.id,reason:'Запрос остановки ещё не ACK.'});
 assert.equal(f.current().state,'running','StopRequested is not an actual stopping acknowledgment');
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId,phase:'complete',evidence:'test://stop-not-yet-ack'});
 f.send({type:'proposeRevision',specId:f.spec.id,content:content(line(),'Новая ревизия с теми же node IDs')});
 const next=f.state.revisions.at(-1)!;f.send({type:'activateRevision',specId:f.spec.id,revisionId:next.id});
 f.send({...report,phase:'completed',evidence:'test://late-old-revision'},agent);
 assert.equal(f.state.events.at(-1)!.payload.flowStepRunId,runId);assert.equal(f.current().id,runId);
 assert.equal(f.state.executions[0].specRevisionId,f.revision.id);
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId,phase:'complete',evidence:'test://obsolete-step'});
 assert.deepEqual(f.state.revisions.find(item=>item.id===f.revision.id),f.revision);
});

test('FR-REVIEW07 condition merge admits the chosen arrival without inventing skipped future nodes',async()=>{
 const flow:FlowDefinition={entryNodeId:'gate',nodes:[node('gate','condition','system'),node('a'),node('b'),node('end','result')],edges:[edge('via-a','gate','a'),edge('via-b','gate','b'),edge('a-b','a','b'),edge('b-end','b','end')]} as FlowDefinition;
 const f=fixture(flow);f.ack();const gate=f.current().id;
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:gate,phase:'start'},agent);
 f.step('start',{},human);
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:gate,phase:'complete',evidence:'test://condition-needs-an-edge'},human);
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:gate,phase:'complete',edgeId:'a-b',evidence:'test://foreign-source-edge'},human);
 f.step('complete',{edgeId:'via-a',evidence:'Человек подтвердил наблюдаемое условие.'},human);
 assert.equal(f.current().nodeId,'a');assert(!f.runtime().runs.some(run=>run.nodeId==='b'));
 f.step('start');f.step('complete');assert.equal(f.current().nodeId,'b','The unchosen direct edge to B cannot prevent a later actual visit via A');
 assert(!f.runtime().runs.some(run=>run.state==='skipped'));
 const core=await import('../packages/core/src') as unknown as {buildFlowRuntimeView:(state:ProjectState,executionId:string,runId?:string)=>{run:Run|null;edges:{id:string;state:string;reason:string}[];agentActions:{start:{allowed:boolean;reason:string}}}};
 assert.equal(typeof core.buildFlowRuntimeView,'function');
 const historical=core.buildFlowRuntimeView(f.state,f.execution.id,gate);
 assert.equal(historical.run?.id,gate);assert.equal(historical.edges.find(item=>item.id==='via-a')?.state,'taken');assert.equal(historical.edges.find(item=>item.id==='via-b')?.state,'not_selected');
 const current=core.buildFlowRuntimeView(f.state,f.execution.id);assert.equal(current.run?.id,f.current().id);assert.equal(current.agentActions.start.allowed,true);
});

test('FR-REVIEW08 Blocker approval cannot clear or skip a waiting run without successful remediation',()=>{
 const flow:FlowDefinition={entryNodeId:'blocked',nodes:[node('blocked','blocker'),node('end','result')],edges:[edge('after-clearance','blocked','end')]} as FlowDefinition;
 const f=fixture(flow);f.ack();const runId=f.current().id;
 f.denied({type:'skipFlowStep',executionId:f.execution.id,runId,reason:'Пропуск не устраняет препятствие.',evidence:'test://skip-blocker'},human);
 f.step('start');
 f.send({type:'reportBlocker',executionId:f.execution.id,specId:f.spec.id,specRevisionId:f.revision.id,flowStepRunId:runId,title:'Вход недоступен',context:'Физическое препятствие связано с проходом.',reason:'Отсутствует необходимый вход для проверки результата: продолжение без его восстановления не даёт доказательства выполнения.',expected:'Доступный вход',actual:'Вход отсутствует',impact:'Нельзя подтвердить результат',options:[{id:'repair',title:'Восстановить',description:'Разрешить ограниченное устранение.'}]},agent);
 let request=f.state.requests.at(-1)!;
 f.send({type:'withdrawDecision',decisionRequestId:request.id,reason:'Отзыв запроса не восстанавливает отсутствующий вход.'},agent);
 f.denied({type:'resumeExecution',executionId:f.execution.id},human);
 f.denied({type:'skipFlowStep',executionId:f.execution.id,runId,reason:'Нельзя пропустить физический барьер.',evidence:'test://withdrawn-blocker'},human);
 f.send({type:'reopenBlockerPlan',decisionRequestId:request.id,reason:'Нужен новый ограниченный план восстановления.'});request=f.state.requests.at(-1)!;
 assert.equal((request as typeof request&{flowStepRunId?:string}).flowStepRunId,runId);
 f.send({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:f.revision.id,outcome:{kind:'approve',chosenOptionId:'repair'}});
 f.send({type:'confirmDecisionApplied',decisionRequestId:request.id,evidence:'test://plan-applied-not-cleared'},agent);
 f.denied({type:'resumeExecution',executionId:f.execution.id},human);
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId,phase:'complete',evidence:'test://approval-is-not-clearance'});
 f.send({type:'authorizeRemediation',decisionRequestId:request.id,agentId:agent.id});const remediation=f.state.executions.at(-1)!;
 f.send({type:'confirmResumed',executionId:remediation.id,ackPhase:'start'},agent);
 f.send({type:'completeExecution',executionId:remediation.id,result:'succeeded',evidence:'test://repair-verified'},agent);
 f.send({type:'clearBlocker',decisionRequestId:request.id,remediationExecutionId:remediation.id,evidence:'test://input-restored'},agent);
 f.send({type:'resumeExecution',executionId:f.execution.id});f.send({type:'confirmResumed',executionId:f.execution.id,ackPhase:'resume'},agent);
 f.step('complete');assert.equal(f.current().nodeId,'end');assert.equal(f.runtime().runs.find(run=>run.id===runId)!.state,'succeeded');
});

test('FR-REVIEW09 a failed step blocks its active attempt but an older terminal failure cannot block a new execution',()=>{
 const f=fixture();f.ack();f.step('start');f.step('fail',{evidence:'test://failed-step'});
 assert.equal(f.state.specs[0].state,'blocked');
 f.send({type:'completeExecution',executionId:f.execution.id,result:'failed',evidence:'test://terminated-attempt'},agent);
 assert.equal(f.state.executions[0].state,'failed');
 f.send({type:'startExecution',specId:f.spec.id,specRevisionId:f.revision.id,agentId:agent.id,retryOfExecutionId:f.execution.id,flowTracking:'enforced'});
 const current=f.state.executions.at(-1)!;assert.notEqual(current.id,f.execution.id);
 const tracked=(current as unknown as {flowRuntime:Runtime}).flowRuntime;assert(tracked);
 assert.equal(tracked.runs.length,1);assert.equal(tracked.runs[0].state,'ready');assert.equal(tracked.runs[0].visit,1);
 assert.notEqual(f.state.specs[0].state,'blocked');
});

test('FR-REVIEW10 off-plan Question pauses its action and old applied interrupts cannot unlock a later visit',()=>{
 const f=fixture(loop());f.ack();f.step('start');
 const interrupt=(title:string)=>{
  const runId=f.current().id,body={type:'reportQuestion',executionId:f.execution.id,specId:f.spec.id,specRevisionId:f.revision.id,flowStepRunId:runId,title,context:'Внеплановое уточнение в текущем действии.',question:'Какой вход использовать?',blockingScope:'execution'};
  f.denied({...body,flowNodeId:'a'});
  f.send(body,agent);const request=f.state.requests.at(-1)! as typeof f.state.requests[number]&{flowStepRunId?:string;flowInterrupt?:boolean};
  assert.equal(request.flowStepRunId,runId);assert.equal(request.flowInterrupt,true);assert.equal(request.flowNodeId,undefined);assert.equal(f.current().state,'waiting');return request;
 };
 const resolveBeforeApply=(requestId:string)=>{
  f.send({type:'resolveDecision',decisionRequestId:requestId,specRevisionId:f.revision.id,outcome:{kind:'answer',answer:'Использовать подтверждённый вход.'}});
  // Existing execution semantics allow resume after an answer. The independent
  // run guard must still reject completion until this visit's answer is applied.
  f.send({type:'resumeExecution',executionId:f.execution.id});f.send({type:'confirmResumed',executionId:f.execution.id,ackPhase:'resume'},agent);
  f.denied({type:'reportFlowStep',executionId:f.execution.id,runId:f.current().id,phase:'complete',evidence:'test://answer-without-application'});
 };
 const firstRun=f.current().id,first=interrupt('Непредусмотренный вопрос первого прохода');resolveBeforeApply(first.id);
 f.send({type:'confirmDecisionApplied',decisionRequestId:first.id,evidence:'test://first-interrupt-applied'},agent);
 assert.equal(f.current().id,firstRun,'Applying an answer does not traverse the process');f.step('complete');
 const fork=reportChoice(f);decide(f,fork.id,'again');f.step('complete',{edgeId:'again'});f.step('start');
 const secondRun=f.current().id;assert.notEqual(secondRun,firstRun);assert.equal(f.current().visit,2);
 const second=interrupt('Непредусмотренный вопрос второго прохода');resolveBeforeApply(second.id);
 assert(f.state.requests.find(item=>item.id===first.id)!.decision!.appliedAt,'The old visit already has an applied interrupt');
 f.send({type:'confirmDecisionApplied',decisionRequestId:second.id,evidence:'test://second-interrupt-applied'},agent);
 assert.equal(f.current().id,secondRun);f.step('complete');assert.equal(f.current().nodeId,'choice');
});

test('FR-REVIEW11 withdrawing a nonphysical interrupt still needs human resume but does not fake failure or retry',()=>{
 const f=fixture();f.ack();f.step('start');const runId=f.current().id;
 f.send({type:'reportQuestion',executionId:f.execution.id,specId:f.spec.id,specRevisionId:f.revision.id,flowStepRunId:runId,title:'Отзываемое уточнение',context:'Непредусмотренный вопрос текущего действия.',question:'Нужен ли другой вход?',blockingScope:'execution'},agent);
 const request=f.state.requests.at(-1)!;f.send({type:'withdrawDecision',decisionRequestId:request.id,reason:'Новые факты сняли необходимость уточнения.'},agent);
 assert.equal(f.state.executions[0].state,'waiting_for_human');
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId,phase:'complete',evidence:'test://withdrawal-without-resume'});
 f.send({type:'resumeExecution',executionId:f.execution.id});f.send({type:'confirmResumed',executionId:f.execution.id,ackPhase:'resume'},agent);
 f.step('complete');assert.equal(f.current().nodeId,'end');assert.equal(f.runtime().runs.filter(run=>run.nodeId==='a').length,1);
 assert.equal(f.runtime().runs.find(run=>run.id===runId)!.state,'succeeded');
 assert(!f.runtime().runs.some(run=>run.retryOfRunId||run.state==='failed'));
});

test('FR-REVIEW12 every active interrupt lineage of a run needs application, not merely the latest question',()=>{
 const f=fixture();f.ack();f.step('start');const runId=f.current().id;
 const question=(title:string)=>{
  f.send({type:'reportQuestion',executionId:f.execution.id,specId:f.spec.id,specRevisionId:f.revision.id,flowStepRunId:runId,title,context:'Одно из независимых уточнений текущего действия.',question:'Как проверить вход?',blockingScope:'execution'},agent);
  return f.state.requests.at(-1)!;
 };
 const first=question('Первое уточнение'),second=question('Второе уточнение');
 for(const request of [first,second])f.send({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:f.revision.id,outcome:{kind:'answer',answer:'Есть проверенное основание.'}});
 f.send({type:'confirmDecisionApplied',decisionRequestId:second.id,evidence:'test://only-last-interrupt-applied'},agent);
 f.send({type:'resumeExecution',executionId:f.execution.id});f.send({type:'confirmResumed',executionId:f.execution.id,ackPhase:'resume'},agent);
 f.denied({type:'reportFlowStep',executionId:f.execution.id,runId,phase:'complete',evidence:'test://first-application-still-missing'});
 f.send({type:'confirmDecisionApplied',decisionRequestId:first.id,evidence:'test://first-interrupt-also-applied'},agent);
 f.step('complete');assert.equal(f.current().nodeId,'end');
});

test('FR-REVIEW13 late failure is evidence on the original run and cannot clear stop or open an obsolete successor',()=>{
 for(const obsolete of [false,true]){
  const f=fixture();f.ack();f.step('start');const runId=f.current().id;
  f.send({type:'requestStop',executionId:f.execution.id,reason:'Остановка ещё не подтверждена.'});
  if(obsolete){
   f.send({type:'proposeRevision',specId:f.spec.id,content:content(line(),'Новый контракт перед поздним failure')});
   f.send({type:'activateRevision',specId:f.spec.id,revisionId:f.state.revisions.at(-1)!.id});
  }
  f.send({type:'reportFlowStep',executionId:f.execution.id,runId,phase:'fail',evidence:'test://late-failure-observed'},agent);
  assert.equal(f.runtime().state,'failed');assert.equal(f.current().id,runId);assert.equal(f.current().state,'failed');
  assert.equal(f.runtime().runs.length,1);assert.equal(f.runtime().traversals.length,0);
  assert.equal(f.state.executions[0].stopRequested,true,'Failure evidence does not acknowledge physical stopping');
  assert.equal(f.state.executions[0].specRevisionId,f.revision.id);
  f.denied({type:'retryFlowStep',executionId:f.execution.id,runId,reason:'Не обойти непогашенный stop старого контекста.'},human);
  f.denied({type:'reportFlowStep',executionId:f.execution.id,runId,phase:'complete',evidence:'test://failed-is-not-success'});
 }
});
