import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,emptyState} from '../packages/core/src/engine';
import type {Actor,Command,ProjectState,RevisionContent} from '../packages/core/src/types';
import {getAcceptanceAvailability,getSpecWorkPresentation,probeWorkAction} from '../packages/core/src/work-presentation';

const projectId='status-presentation-fixture';
const human:Actor={id:'status-human',kind:'human',projectIds:[projectId]};
const agent:Actor={id:'status-agent',kind:'agent',projectIds:[projectId]};
const content:RevisionContent={title:'Проверить результат',goal:'Отделить предъявленный результат от приёмки.',dod:[{id:'proof',text:'Человек проверил результат.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
function fixture(){
  let state=emptyState(projectId),step=0,nextId=0;
  const send=(body:Record<string,unknown>,actor:Actor=human,extra:Parameters<typeof applyCommand>[3]={})=>{
    const result=applyCommand(state,{...body,requestId:`status-test-request-${++step}`,expectedVersion:state.version} as Command,actor,{now:new Date(Date.UTC(2026,10,3,0,0,step)).toISOString(),id:()=>`status-test-entity-${++nextId}`,...extra});
    state=result.state;return result;
  };
  send({type:'startProjectWork',agentId:agent.id,content});
  return {get state(){return state;},get spec(){return state.specs[0];},get revision(){return state.revisions.find(revision=>revision.id===state.specs[0].activeRevisionId)!;},get execution(){return state.executions[0];},send};
}
function ack(f:ReturnType<typeof fixture>){f.send({type:'confirmResumed',executionId:f.execution.id,ackPhase:'start'},agent);}
function question(f:ReturnType<typeof fixture>){
  f.send({type:'reportQuestion',executionId:f.execution.id,specId:f.spec.id,specRevisionId:f.revision.id,title:'Уточнение',context:'Нужен выбор человека.',question:'Как подтвердить результат?',blockingScope:'execution'},agent);
  return f.state.requests.at(-1)!;
}

test('work presentation keeps queued assignment, confirmed execution and acceptance as three distinct axes',()=>{
  const f=fixture(),before=JSON.stringify(f.state);
  const queued=getSpecWorkPresentation(f.state,f.spec);
  assert.equal(queued.label,'Ожидает агента');assert.equal(queued.code,'QUEUED');
  assert.equal(queued.axes.spec.code,'SPECIFIED');assert.equal(queued.axes.attempt?.code,'QUEUED');assert.equal(queued.axes.acceptance.code,'NOT_ACCEPTED');
  assert.equal(queued.isRunning,false);assert.equal(JSON.stringify(f.state),before);
  ack(f);
  const running=getSpecWorkPresentation(f.state,f.spec);
  assert.equal(running.label,'Выполняется');assert.equal(running.axes.spec.code,'IN_PROGRESS');assert.equal(running.isRunning,true);
});

test('successful active primary result awaits acceptance; guard probes never create acceptance or change history',()=>{
  const f=fixture();ack(f);
  f.send({type:'completeExecution',executionId:f.execution.id,result:'succeeded',evidence:'test://presented-result'},agent);
  const snapshot=structuredClone(f.state),view=getSpecWorkPresentation(f.state,f.spec);
  assert.equal(view.label,'Ожидает приёмки');assert.equal(view.axes.spec.code,'IN_PROGRESS');assert.equal(view.axes.attempt?.code,'SUCCEEDED');assert.equal(view.axes.acceptance.code,'NOT_ACCEPTED');
  assert.equal(getAcceptanceAvailability(f.state,f.spec,f.revision.id,human).allowed,true);
  assert.equal(probeWorkAction(f.state,{type:'acceptSpec',specId:f.spec.id,specRevisionId:f.revision.id,evidence:{}},human).code,'VALIDATION_ERROR');
  assert.equal(getAcceptanceAvailability(f.state,f.spec,f.revision.id,agent).code,'FORBIDDEN');
  assert.deepEqual(f.state,snapshot);assert.equal(f.spec.acceptance,undefined);assert(!f.state.events.some(event=>event.type==='SpecAccepted'));
  f.send({type:'acceptSpec',specId:f.spec.id,specRevisionId:f.revision.id,evidence:{proof:'Человек независимо проверил результат.'}});
  const accepted=getSpecWorkPresentation(f.state,f.spec);
  assert.equal(accepted.code,'DONE');assert.equal(accepted.axes.acceptance.code,'ACCEPTED');
});

test('an old revision successful attempt cannot become the current work presentation of a newly activated revision',()=>{
  const f=fixture();ack(f);f.send({type:'completeExecution',executionId:f.execution.id,result:'succeeded',evidence:'test://r1-result'},agent);
  const oldExecutionId=f.execution.id;
  f.send({type:'proposeRevision',specId:f.spec.id,content:{...content,title:'Новое ожидание'}});
  const next=f.state.revisions.at(-1)!;
  const activation=f.send({type:'activateRevision',specId:f.spec.id,revisionId:next.id});
  const view=getSpecWorkPresentation(f.state,f.spec);
  assert.equal(view.code,'SPECIFIED');assert.equal(view.primaryExecution,undefined);assert.equal(view.axes.attempt,null);assert.equal(view.isRunning,false);
  assert.equal(view.lastUpdatedAt,activation.events[0].occurredAt);
  assert.equal(f.state.executions.find(execution=>execution.id===oldExecutionId)?.state,'succeeded');
});

test('a newer remediation does not replace the primary attempt or mark primary work running',()=>{
  const f=fixture();ack(f);
  f.send({type:'reportBlocker',specId:f.spec.id,specRevisionId:f.revision.id,executionId:f.execution.id,title:'Нет доступа',context:'Доступ нужен для проверки.',reason:'Источник недоступен, поэтому независимая проверка результата пока невозможна.',expected:'Источник читается.',actual:'Доступа нет.',impact:'Проверка остановлена.',options:[{id:'restore',title:'Восстановить доступ',description:'Отдельная remediation.'}]},agent);
  const blocker=f.state.requests.at(-1)!;
  f.send({type:'resolveDecision',decisionRequestId:blocker.id,specRevisionId:f.revision.id,outcome:{kind:'approve',chosenOptionId:'restore'}});
  f.send({type:'authorizeRemediation',decisionRequestId:blocker.id,agentId:agent.id});
  const remediation=f.state.executions.at(-1)!;
  f.send({type:'confirmResumed',executionId:remediation.id,ackPhase:'start'},agent);
  const view=getSpecWorkPresentation(f.state,f.spec);
  assert.equal(view.primaryExecution?.id,f.execution.id);assert.equal(view.axes.attempt?.code,'WAITING_FOR_HUMAN');assert.equal(view.isRunning,false);
  assert.equal(probeWorkAction(f.state,{type:'resumeExecution',executionId:f.execution.id},human).allowed,false);
});

test('positive unapplied decisions do not add a UI-only resume barrier; permission and ACK remain separate',()=>{
  const f=fixture();ack(f);const request=question(f);
  f.send({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:f.revision.id,outcome:{kind:'answer',answer:'Проверить исходный результат.'}});
  const before=structuredClone(f.state);
  const availability=probeWorkAction(f.state,{type:'resumeExecution',executionId:f.execution.id},human);
  assert.equal(availability.allowed,true);assert.deepEqual(f.state,before);assert.equal(f.execution.state,'waiting_for_human');assert.equal(f.state.requests[0].decision?.appliedAt,undefined);
  f.send({type:'resumeExecution',executionId:f.execution.id});assert.equal(f.execution.state,'waiting_for_human');
  f.send({type:'confirmResumed',executionId:f.execution.id,ackPhase:'resume'},agent);assert.equal(f.execution.state,'running');
  assert.equal(f.state.requests[0].decision?.appliedAt,undefined);
});

test('pending and rejected blocking requests are denied by the same domain guard used for actual resume',()=>{
  const f=fixture();ack(f);const request=question(f);
  assert.equal(probeWorkAction(f.state,{type:'resumeExecution',executionId:f.execution.id},human).code,'INVALID_TRANSITION');
  f.send({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:f.revision.id,outcome:{kind:'reject',reason:'Не продолжать по этому варианту.'}});
  const gate=probeWorkAction(f.state,{type:'resumeExecution',executionId:f.execution.id},human);
  assert.equal(gate.allowed,false);assert.match(gate.reason!,/блокиров/);
});

test('stop request never presents a stopped attempt before ACK and unknown operator stop remains explicit',()=>{
  const f=fixture();ack(f);f.send({type:'requestStop',executionId:f.execution.id,reason:'Проверить состояние процесса.'});
  const requested=getSpecWorkPresentation(f.state,f.spec);
  assert.equal(requested.code,'STOP_REQUESTED');assert.equal(requested.axes.attempt?.code,'RUNNING');assert.equal(requested.isRunning,false);
  f.send({type:'forceCancelRevokedExecution',executionId:f.execution.id,reason:'Ключ отозван.',evidence:'test://revocation-proof'},human,{revokedAgent:{id:agent.id,revokedAt:'2026-11-03T00:00:00.000Z',revokedBy:human.id}});
  const unknown=getSpecWorkPresentation(f.state,f.spec);
  assert.equal(unknown.code,'EXTERNAL_STOP_UNCONFIRMED');assert.equal(unknown.axes.attempt?.code,'CANCELLED');
  assert.equal(probeWorkAction(f.state,{type:'startExecution',specId:f.spec.id,specRevisionId:f.revision.id,agentId:agent.id},human).code,'EXTERNAL_STOP_UNCONFIRMED');
});

test('current request counts respect correction lineage; unrelated newer events do not update the spec timestamp',()=>{
  const f=fixture();ack(f);const request=question(f);
  f.send({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:f.revision.id,outcome:{kind:'answer',answer:'Первый ответ.'}});
  f.send({type:'correctDecision',decisionRequestId:request.id,reason:'Исправить до применения.'});
  const before=getSpecWorkPresentation(f.state,f.spec);
  assert.equal(before.currentRequestCount,1);assert.equal(before.pendingRequestCount,1);
  f.send({type:'createSpec',content:{...content,title:'Независимое ожидание'}});
  const after=getSpecWorkPresentation(f.state,f.spec);
  assert.equal(after.lastUpdatedAt,before.lastUpdatedAt);assert.equal(after.currentRequestCount,1);
});

test('foreign scope is rejected by action availability without modifying the source projection',()=>{
  const f=fixture(),before=structuredClone(f.state);
  const gate=probeWorkAction(f.state,{type:'startExecution',specId:f.spec.id,specRevisionId:f.revision.id,agentId:agent.id},{...human,projectIds:['other-project']});
  assert.equal(gate.code,'FORBIDDEN');assert.deepEqual(f.state,before);
});

test('an indirect prerequisite change uses its actual event timestamp, including repeated cached reads',()=>{
  const f=fixture();ack(f);f.send({type:'completeExecution',executionId:f.execution.id,result:'succeeded',evidence:'test://prerequisite-result'},agent);
  f.send({type:'acceptSpec',specId:f.spec.id,specRevisionId:f.revision.id,evidence:{proof:'Человек принял предпосылку.'}});
  f.send({type:'createSpec',content:{...content,title:'Зависимая работа'}});
  const dependentId=f.state.specs.at(-1)!.id,dependentRevision=f.state.revisions.at(-1)!;
  f.send({type:'addDependency',from:f.spec.id,to:dependentId});
  f.send({type:'activateRevision',specId:dependentId,revisionId:dependentRevision.id});
  f.send({type:'startExecution',specId:dependentId,specRevisionId:dependentRevision.id,agentId:agent.id});
  const dependentExecution=f.state.executions.at(-1)!;
  f.send({type:'confirmResumed',executionId:dependentExecution.id,ackPhase:'start'},agent);
  const before=getSpecWorkPresentation(f.state,f.state.specs.find(spec=>spec.id===dependentId)!);
  f.send({type:'proposeRevision',specId:f.spec.id,content:{...content,title:'Изменённая предпосылка'}});
  const changed=f.send({type:'activateRevision',specId:f.spec.id,revisionId:f.state.revisions.at(-1)!.id});
  const dependent=f.state.specs.find(spec=>spec.id===dependentId)!;
  for(let repeat=0;repeat<2;repeat++){
    const after=getSpecWorkPresentation(f.state,dependent);
    assert.equal(after.axes.spec.code,'BLOCKED');assert.equal(after.isRunning,false);
    assert.equal(after.lastUpdatedAt,changed.events[0].occurredAt);assert.notEqual(after.lastUpdatedAt,before.lastUpdatedAt);
    assert.notEqual(changed.events[0].specId,dependentId);
  }
});

test('acceptance availability rejects a stale revision and unfinished current work instead of granting a UI shortcut',()=>{
  const f=fixture();ack(f);
  assert.equal(getAcceptanceAvailability(f.state,f.spec,f.revision.id,human).allowed,false);
  f.send({type:'completeExecution',executionId:f.execution.id,result:'succeeded',evidence:'test://old-result'},agent);
  const oldRevision=f.revision.id;
  f.send({type:'proposeRevision',specId:f.spec.id,content:{...content,title:'Уточнённое ожидание'}});
  f.send({type:'activateRevision',specId:f.spec.id,revisionId:f.state.revisions.at(-1)!.id});
  assert.equal(getAcceptanceAvailability(f.state,f.spec,oldRevision,human).code,'REVISION_CONFLICT');
  assert.equal(getAcceptanceAvailability(f.state,f.spec,f.revision.id,human).allowed,false);
  assert.equal(f.spec.acceptance,undefined);
});
