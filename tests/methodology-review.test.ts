import test from 'node:test';
import assert from 'node:assert/strict';
import {AGENT_ID,HUMAN_ID,PROJECT_ID,applyCommand,createSeedEvents,emptyState,replay} from '../packages/core/src';
import type {Actor,Command,ProjectState} from '../packages/core/src';

const human:Actor={id:HUMAN_ID,kind:'human',projectIds:[PROJECT_ID]};
const agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const run=(state:ProjectState,input:Record<string,unknown>,actor=human)=>applyCommand(state,{...input,requestId:crypto.randomUUID(),expectedVersion:state.version} as Command,actor).state;
const code=(expected:string)=>(error:unknown)=>(error as {code?:string}).code===expected;

test('R01: a correction invalidates an older resume authorization and requires fresh human permission',()=>{
  let state=replay(createSeedEvents());const request=state.requests.find(r=>r.kind==='Fork')!;
  state=run(state,{type:'resolveDecision',decisionRequestId:request.id,specRevisionId:request.specRevisionId,outcome:{kind:'approve',chosenOptionId:request.options[0].id}});
  state=run(state,{type:'resumeExecution',executionId:request.executionId});
  assert.equal(state.executions.find(e=>e.id===request.executionId)!.resumeAuthorized,true);
  state=run(state,{type:'correctDecision',decisionRequestId:request.id,reason:'Выбранный путь пересмотрен до подтверждения продолжения.'});
  const corrected=state.requests.at(-1)!;
  state=run(state,{type:'resolveDecision',decisionRequestId:corrected.id,specRevisionId:corrected.specRevisionId,outcome:{kind:'approve',chosenOptionId:corrected.options[1].id}});
  assert.throws(()=>run(state,{type:'confirmResumed',executionId:request.executionId},agent),code('INVALID_TRANSITION'));
  state=run(state,{type:'resumeExecution',executionId:request.executionId});
  state=run(state,{type:'confirmResumed',executionId:request.executionId},agent);
  assert.equal(state.executions.find(e=>e.id===request.executionId)!.state,'running');
});

test('R02: historical blocker retirement cannot waive a later reactivation of its original contract',()=>{
  let state=replay(createSeedEvents());const blocker=state.requests.find(r=>r.kind==='Blocker')!;
  const original=state.revisions.find(r=>r.id===blocker.specRevisionId)!;
  state=run(state,{type:'proposeRevision',specId:blocker.specId,content:{...original,title:'Альтернативный контракт без прежней причины'}});
  state=run(state,{type:'activateRevision',specId:blocker.specId,revisionId:state.revisions.at(-1)!.id});
  state=run(state,{type:'confirmStopped',executionId:blocker.executionId},agent);
  state=run(state,{type:'cancelExecution',executionId:blocker.executionId,reason:'Старая попытка завершена после ACK.'});
  state=run(state,{type:'retireHistoricalBlocker',decisionRequestId:blocker.id,reason:'Препятствие не относится к альтернативному контракту.',evidence:'Человек сопоставил область обеих ревизий.'});
  state=run(state,{type:'activateRevision',specId:blocker.specId,revisionId:original.id});
  assert.equal(state.specs.find(s=>s.id===blocker.specId)!.state,'blocked');
  assert.throws(()=>run(state,{type:'startExecution',specId:blocker.specId,specRevisionId:original.id,agentId:AGENT_ID}),code('INVALID_TRANSITION'));
});

test('R03: an unknown physical stop also prevents declaring the entire roadmap archived',()=>{
  const identity:Actor={...agent,id:'revoked-review-agent'};
  let state=run(emptyState(),{type:'createSpec',content:{title:'Одна попытка',goal:'Проверить физическую остановку перед архивацией.',dod:[{id:'review-dod',text:'Работа остановлена.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
  const spec=state.specs[0];
  state=run(state,{type:'activateRevision',specId:spec.id,revisionId:spec.revisionIds[0]});
  state=run(state,{type:'startExecution',specId:spec.id,specRevisionId:spec.revisionIds[0],agentId:identity.id});
  const execution=state.executions[0];
  state=run(state,{type:'confirmResumed',executionId:execution.id},identity);
  state=applyCommand(state,{type:'forceCancelRevokedExecution',executionId:execution.id,reason:'Оператор отозвал ключ.',evidence:'Внешний процесс ещё проверяется.',requestId:crypto.randomUUID(),expectedVersion:state.version},human,{revokedAgent:{id:identity.id,revokedAt:new Date().toISOString(),revokedBy:human.id}}).state;
  assert.equal(state.executions[0].state,'cancelled');
  assert.throws(()=>run(state,{type:'changeRoadmapState',state:'archived'}),error=>['EXTERNAL_STOP_UNCONFIRMED','INVALID_TRANSITION'].includes((error as {code:string}).code));
});

test('R04: a reactivated uncleared Blocker has an executable new remediation path without reviving its terminal primary attempt',()=>{
  let state=replay(createSeedEvents());const blocker=state.requests.find(r=>r.kind==='Blocker')!,original=state.revisions.find(r=>r.id===blocker.specRevisionId)!;
  state=run(state,{type:'proposeRevision',specId:blocker.specId,content:{...original,title:'Другой контракт'}});
  state=run(state,{type:'activateRevision',specId:blocker.specId,revisionId:state.revisions.at(-1)!.id});
  state=run(state,{type:'confirmStopped',executionId:blocker.executionId},agent);
  state=run(state,{type:'cancelExecution',executionId:blocker.executionId,reason:'Предыдущая попытка подтверждённо остановлена.'});
  state=run(state,{type:'retireHistoricalBlocker',decisionRequestId:blocker.id,reason:'В альтернативном контракте препятствие не применяется.',evidence:'Область нового контракта проверена человеком.'});
  state=run(state,{type:'activateRevision',specId:blocker.specId,revisionId:original.id});
  state=run(state,{type:'reopenBlockerPlan',decisionRequestId:blocker.id,reason:'Возвращение старого контракта требует нового рассмотрения физического препятствия.'});
  const pending=state.requests.at(-1)!;
  assert.equal(state.executions.find(e=>e.id===blocker.executionId)!.state,'cancelled');
  assert.equal(pending.rootRequestId,blocker.id);
  state=run(state,{type:'resolveDecision',decisionRequestId:pending.id,specRevisionId:pending.specRevisionId,outcome:{kind:'approve',chosenOptionId:pending.options[0].id}});
  state=run(state,{type:'authorizeRemediation',decisionRequestId:pending.id,agentId:AGENT_ID});
  const remediation=state.executions.at(-1)!;
  state=run(state,{type:'confirmResumed',executionId:remediation.id},agent);
  state=run(state,{type:'completeExecution',executionId:remediation.id,result:'succeeded',evidence:'Физическое препятствие устранено после повторной проверки.'},agent);
  state=run(state,{type:'clearBlocker',decisionRequestId:pending.id,remediationExecutionId:remediation.id,evidence:'Повторное устранение подтверждено.'},agent);
  state=run(state,{type:'startExecution',specId:blocker.specId,specRevisionId:original.id,agentId:AGENT_ID});
  assert.equal(state.executions.at(-1)!.state,'queued');
});

test('R05: reopening a withdrawn plan respects the same per-agent pending request limit as correction and reporting',()=>{
  let state=replay(createSeedEvents());const blocker=state.requests.find(r=>r.kind==='Blocker')!;
  state=run(state,{type:'withdrawDecision',decisionRequestId:blocker.id,reason:'Отозванный план требует нового рассмотрения.'},agent);
  for(let i=0;i<10;i++)state=run(state,{type:'reportQuestion',executionId:blocker.executionId,specId:blocker.specId,specRevisionId:blocker.specRevisionId,title:`Отдельный вопрос ${i}`,context:'Десять ожидающих вопросов относятся к отдельным проверкам.',question:`Проверка ${i}?`,blockingScope:'none'},agent);
  assert.throws(()=>run(state,{type:'reopenBlockerPlan',decisionRequestId:blocker.id,reason:'Повторное рассмотрение увеличило бы лимит ожидающих запросов.'}),code('PENDING_LIMIT_EXCEEDED'));
});
