import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AGENT_ID,HUMAN_ID,PROJECT_ID,applyCommand,createSeedEvents,replay } from '../packages/core/src';
import type { Actor,Command,ProjectState } from '../packages/core/src';
import { createStore } from '../lib/store';

const human:Actor={id:HUMAN_ID,kind:'human',projectIds:[PROJECT_ID]};
const agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const seed=()=>replay(createSeedEvents());
const code=(expected:string)=>(error:unknown)=>(error as {code?:string}).code===expected;
const command=(state:ProjectState,input:Record<string,unknown>,actor=human)=>applyCommand(state,{...input,requestId:crypto.randomUUID(),expectedVersion:state.version} as Command,actor).state;

test('M01: author withdrawal preserves pending execution barrier and never clears a physical Blocker',()=>{
  const initial=seed(),fork=initial.requests.find(r=>r.kind==='Fork')!,blocker=initial.requests.find(r=>r.kind==='Blocker')!;
  const input={type:'withdrawDecision',decisionRequestId:fork.id,reason:'Этот вариант вопроса перестал быть актуальным.'};
  assert.throws(()=>command(initial,input,human),code('FORBIDDEN'));
  assert.throws(()=>command(initial,input,{...agent,id:'foreign-agent'}),code('FORBIDDEN'));
  let state=command(initial,input,agent);
  assert.equal(state.requests.find(r=>r.id===fork.id)!.state,'withdrawn');
  assert.equal(state.executions.find(e=>e.id===fork.executionId)!.state,'waiting_for_human');
  assert.equal(state.requests.find(r=>r.id===fork.id)!.decision,undefined);
  assert.throws(()=>command(state,input,agent),code('INVALID_TRANSITION'));
  state=command(state,{type:'withdrawDecision',decisionRequestId:blocker.id,reason:'Запрос неактуален, физическое препятствие требует отдельного устранения.'},agent);
  assert.equal(state.requests.find(r=>r.id===blocker.id)!.clearedEvidence,undefined);
  assert.throws(()=>command(state,{type:'resumeExecution',executionId:blocker.executionId}),code('INVALID_TRANSITION'));
  assert.deepEqual(replay(state.events),state);assert.equal(initial.requests.find(r=>r.id===fork.id)!.state,'pending');
});

test('M02: clarification is source-linked, pending-only, author-scoped and never grants execution permission',()=>{
  let state=seed();const request=state.requests.find(r=>r.kind==='Fork')!,original=structuredClone(request);
  assert.throws(()=>command(state,{type:'requestDecisionClarification',decisionRequestId:request.id,question:'Как проверен второй вариант?'},agent),code('FORBIDDEN'));
  state=command(state,{type:'requestDecisionClarification',decisionRequestId:request.id,question:'Как проверен второй вариант?'});
  const source=state.events.at(-1)!;
  const reply={type:'submitDecisionClarification',decisionRequestId:request.id,clarificationEventId:source.id,response:'Выполнен отдельный эксперимент, его результат приложен к контексту.'};
  assert.throws(()=>command(state,{...reply,clarificationEventId:'invented'},agent),code('VALIDATION_ERROR'));
  assert.throws(()=>command(state,reply,{...agent,id:'foreign'}),code('FORBIDDEN'));
  state=command(state,reply,agent);
  assert.equal(state.events.at(-1)!.causationId,source.id);
  const current=state.requests.find(r=>r.id===request.id)!;
  assert.equal(current.state,'pending');assert.equal(current.context,original.context);assert.deepEqual(current.options,original.options);
  assert.equal(state.executions.find(e=>e.id===request.executionId)!.resumeAuthorized,false);
  assert.throws(()=>command(state,reply,agent),code('INVALID_TRANSITION'));
  assert.throws(()=>command(state,{type:'resumeExecution',executionId:request.executionId}),code('INVALID_TRANSITION'));
});

test('M03: correction creates a linked request, keeps original resolved outcome and retires old permissions',()=>{
  let state=seed();const fork=state.requests.find(r=>r.kind==='Fork')!;
  state=command(state,{type:'resolveDecision',decisionRequestId:fork.id,specRevisionId:fork.specRevisionId,outcome:{kind:'approve',chosenOptionId:fork.options[0].id}});
  const original=structuredClone(state.requests.find(r=>r.id===fork.id)!);
  state=command(state,{type:'correctDecision',decisionRequestId:fork.id,reason:'Повторная проверка показала, что нужно выбрать другой предложенный путь.'});
  const correction=state.requests.at(-1)!;
  assert.notEqual(correction.id,fork.id);assert.equal(correction.supersedesDecisionId,original.decision!.id);assert.equal(correction.rootRequestId,fork.id);
  assert.deepEqual(state.requests.find(r=>r.id===fork.id),original);assert.equal(correction.state,'pending');
  assert.throws(()=>command(state,{type:'confirmDecisionApplied',decisionRequestId:fork.id,evidence:'Попытка применить устаревшее решение.'},agent),code('INVALID_TRANSITION'));
  assert.throws(()=>command(state,{type:'correctDecision',decisionRequestId:fork.id,reason:'Повторная коррекция старого решения.'}),code('INVALID_TRANSITION'));
  assert.throws(()=>command(state,{type:'resumeExecution',executionId:fork.executionId}),code('INVALID_TRANSITION'));
  state=command(state,{type:'resolveDecision',decisionRequestId:correction.id,specRevisionId:correction.specRevisionId,outcome:{kind:'approve',chosenOptionId:fork.options[1].id}});
  state=command(state,{type:'confirmDecisionApplied',decisionRequestId:correction.id,evidence:'Применён исправленный вариант.'},agent);
  assert.equal(state.requests.find(r=>r.id===fork.id)!.decision!.appliedAt,undefined);
  assert.deepEqual(replay(state.events),state);
});

test('M04: applied/result/accepted/remediation contexts reject destructive correction with new-revision guidance',()=>{
  let state=seed();const fork=state.requests.find(r=>r.kind==='Fork')!;
  state=command(state,{type:'resolveDecision',decisionRequestId:fork.id,specRevisionId:fork.specRevisionId,outcome:{kind:'approve',chosenOptionId:fork.options[0].id}});
  const applied=command(state,{type:'confirmDecisionApplied',decisionRequestId:fork.id,evidence:'Выбор уже применён в работе.'},agent);
  assert.throws(()=>command(applied,{type:'correctDecision',decisionRequestId:fork.id,reason:'Нужно изменить уже применённое решение.'}),code('CORRECTION_REQUIRES_REVISION'));
  const failed=command(state,{type:'completeExecution',executionId:fork.executionId,result:'failed',evidence:'Выполнение остановлено с ошибкой.'},agent);
  assert.throws(()=>command(failed,{type:'correctDecision',decisionRequestId:fork.id,reason:'Нельзя переписать результат попытки.'}),code('CORRECTION_REQUIRES_REVISION'));
  const blocker=state.requests.find(r=>r.kind==='Blocker')!;
  state=command(state,{type:'resolveDecision',decisionRequestId:blocker.id,specRevisionId:blocker.specRevisionId,outcome:{kind:'approve',chosenOptionId:blocker.options[0].id}});
  state=command(state,{type:'authorizeRemediation',decisionRequestId:blocker.id,agentId:AGENT_ID});
  assert.throws(()=>command(state,{type:'correctDecision',decisionRequestId:blocker.id,reason:'Уже выдано отдельное разрешение на физическое устранение.'}),code('CORRECTION_REQUIRES_REVISION'));
});

test('M05: corrected Blocker retains one physical root and only current approved remediation clears it',()=>{
  let state=seed();const blocker=state.requests.find(r=>r.kind==='Blocker')!;
  state=command(state,{type:'resolveDecision',decisionRequestId:blocker.id,specRevisionId:blocker.specRevisionId,outcome:{kind:'approve',chosenOptionId:blocker.options[0].id}});
  state=command(state,{type:'correctDecision',decisionRequestId:blocker.id,reason:'Нужно повторно проверить предложенный план до его применения.'});
  const current=state.requests.at(-1)!;
  assert.throws(()=>command(state,{type:'authorizeRemediation',decisionRequestId:blocker.id,agentId:AGENT_ID}),code('INVALID_TRANSITION'));
  assert.throws(()=>command(state,{type:'resumeExecution',executionId:blocker.executionId}),code('INVALID_TRANSITION'));
  state=command(state,{type:'resolveDecision',decisionRequestId:current.id,specRevisionId:current.specRevisionId,outcome:{kind:'approve',chosenOptionId:current.options[0].id}});
  state=command(state,{type:'authorizeRemediation',decisionRequestId:current.id,agentId:AGENT_ID});
  const execution=state.executions.at(-1)!;
  state=command(state,{type:'confirmResumed',executionId:execution.id},agent);
  state=command(state,{type:'completeExecution',executionId:execution.id,result:'succeeded',evidence:'Устранение по исправленному плану проверено.'},agent);
  state=command(state,{type:'clearBlocker',decisionRequestId:current.id,remediationExecutionId:execution.id,evidence:'Физическая причина блокировки устранена.'},agent);
  assert.equal(state.requests.find(r=>r.id===blocker.id)!.clearedEvidence,'Физическая причина блокировки устранена.');
  state=command(state,{type:'resumeExecution',executionId:blocker.executionId});
  state=command(state,{type:'confirmResumed',executionId:blocker.executionId},agent);
  assert.equal(state.executions.find(e=>e.id===blocker.executionId)!.state,'running');
  assert.notEqual(state.specs.find(s=>s.id===blocker.specId)!.state,'done');
});

test('M06: SQL recovery proves assigned revocation, preserves unknown physical stop across reopen and requires separate attestation',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ouro-recovery-'));let store:Awaited<ReturnType<typeof createStore>>|undefined;
  try{
    store=await createStore({dataDir:directory});
    const registered=await store.createAgent('Отозванный работающий агент',human),identity=(await store.authenticateAgentToken(registered.token))!;
    let state=await store.getProject();const spec=state.specs.find(s=>s.humanId==='OURO-S-000005')!;
    const run=async(input:Record<string,unknown>,actor=human,requestId=crypto.randomUUID())=>store!.executeCommand({...input,requestId,expectedVersion:(await store!.getProject()).version},actor);
    const created=await run({type:'startExecution',specId:spec.id,specRevisionId:spec.activeRevisionId,agentId:registered.agent.id});const execution=created.state.executions.at(-1)!;
    await run({type:'confirmResumed',executionId:execution.id},identity);
    const cancel={type:'forceCancelRevokedExecution',executionId:execution.id,reason:'Ключ отозван во время исполнения; агент не может подтвердить остановку.',evidence:'Оператор отключил доступ и проверяет внешний процесс.'};
    await assert.rejects(run(cancel),code('AGENT_NOT_REVOKED'));
    await store.revokeAgent(registered.agent.id,human);
    await assert.rejects(run(cancel,identity),code('FORBIDDEN'));
    const request={...cancel,requestId:'operator-cancel-stable-request',expectedVersion:(await store.getProject()).version};
    const receipt=await store.executeCommand(request,human);state=receipt.state;
    assert.equal(state.executions.find(e=>e.id===execution.id)!.state,'cancelled');assert.equal(state.executions.find(e=>e.id===execution.id)!.stopConfirmation,'unknown');
    assert.equal(state.events.at(-1)!.type,'ExecutionOperatorCancelled');
    assert.equal((await store.executeCommand(request,human)).replayed,true);
    const next=await store.createAgent('Новый исполнитель',human);
    const nextStart={type:'startExecution',specId:spec.id,specRevisionId:spec.activeRevisionId,agentId:next.agent.id};
    await assert.rejects(run(nextStart),code('EXTERNAL_STOP_UNCONFIRMED'));
    await store.close();store=await createStore({dataDir:directory});
    assert.equal((await store.getProject()).executions.find(e=>e.id===execution.id)!.stopConfirmation,'unknown');
    await assert.rejects(run({type:'confirmStopped',executionId:execution.id},identity),code('FORBIDDEN'));
    await assert.rejects(run({type:'attestExternalStop',executionId:execution.id,evidence:''}),code('VALIDATION_ERROR'));
    await run({type:'attestExternalStop',executionId:execution.id,evidence:'Оператор проверил завершение внешнего процесса и освобождение рабочей области.'});
    const after=await run(nextStart);assert.equal(after.state.executions.at(-1)!.agentId,next.agent.id);
    assert.equal(after.state.executions.find(e=>e.id===execution.id)!.stopConfirmation,'operator_attested');
    assert(!after.state.events.some(e=>e.type==='ExecutionPaused'&&e.executionId===execution.id));
    assert.equal(after.state.specs.find(s=>s.id===spec.id)!.acceptance,undefined);
  }finally{if(store)await store.close();await rm(directory,{recursive:true,force:true});}
});

test('M07: recovery rejects simulator, invented revocation proof, foreign human scope and already terminal attempts',async()=>{
  const store=await createStore({dataDir:'memory://'});
  try{
    let state=await store.getProject();const e=state.executions.find(e=>e.state==='running')!;
    const cmd={type:'forceCancelRevokedExecution',executionId:e.id,reason:'Попытка подменить подтверждение отзыва.',evidence:'Непроверенное описание.',revokedAt:'2026-01-01T00:00:00Z',requestId:'forged-recovery-request',expectedVersion:state.version};
    await assert.rejects(store.executeCommand(cmd,human),code('AGENT_NOT_REVOKED'));
    await assert.rejects(store.executeCommand(cmd,{...human,projectIds:['elsewhere']}),code('FORBIDDEN'));
    assert.equal((await store.getProject()).version,state.version);
    assert.throws(()=>command(state,{type:'forceCancelRevokedExecution',executionId:e.id,reason:'Нет серверного доказательства отзыва.',evidence:'Подделка.'}),code('AGENT_NOT_REVOKED'));
  }finally{await store.close();}
});

test('M08: withdrawn Blocker can be explicitly reopened without rewriting its terminal request',()=>{
  let state=seed();const blocker=state.requests.find(r=>r.kind==='Blocker')!;
  state=command(state,{type:'withdrawDecision',decisionRequestId:blocker.id,reason:'План требует повторного рассмотрения.'},agent);
  const withdrawn=structuredClone(state.requests.find(r=>r.id===blocker.id)!);
  assert.throws(()=>command(state,{type:'reopenBlockerPlan',decisionRequestId:blocker.id,reason:'Повторно открыть план.'},agent),code('FORBIDDEN'));
  state=command(state,{type:'reopenBlockerPlan',decisionRequestId:blocker.id,reason:'Человек возвращает физический блокер на рассмотрение.'});
  const reopened=state.requests.at(-1)!;
  assert.equal(reopened.state,'pending');assert.equal(reopened.rootRequestId,blocker.id);assert.equal(reopened.supersedesRequestId,blocker.id);
  assert.deepEqual(state.requests.find(r=>r.id===blocker.id),withdrawn);
  assert.throws(()=>command(state,{type:'resumeExecution',executionId:blocker.executionId}),code('INVALID_TRANSITION'));
  state=command(state,{type:'resolveDecision',decisionRequestId:reopened.id,specRevisionId:reopened.specRevisionId,outcome:{kind:'approve',chosenOptionId:reopened.options[0].id}});
  state=command(state,{type:'correctDecision',decisionRequestId:reopened.id,reason:'Уточнить выбор до выдачи разрешения на устранение.'});
  assert.equal(state.requests.at(-1)!.rootRequestId,blocker.id);
});

test('M09: revision activation never erases a physical Blocker; historical retirement requires stopped work and explicit evidence',()=>{
  let state=seed();const blocker=state.requests.find(r=>r.kind==='Blocker')!,revision=state.revisions.find(r=>r.id===blocker.specRevisionId)!;
  const retire={type:'retireHistoricalBlocker',decisionRequestId:blocker.id,reason:'Старый контракт заменён и препятствие больше не относится к новой цели.',evidence:'Сопоставлены ограничения старой и новой ревизии.'};
  assert.throws(()=>command(state,retire),code('INVALID_TRANSITION'));
  state=command(state,{type:'proposeRevision',specId:blocker.specId,content:{...revision,title:'Новая безопасная область выполнения'}});
  state=command(state,{type:'activateRevision',specId:blocker.specId,revisionId:state.revisions.at(-1)!.id});
  assert.equal(state.specs.find(s=>s.id===blocker.specId)!.state,'blocked');
  assert.throws(()=>command(state,retire),code('INVALID_TRANSITION'));
  state=command(state,{type:'confirmStopped',executionId:blocker.executionId},agent);
  state=command(state,{type:'cancelExecution',executionId:blocker.executionId,reason:'Прежняя работа остановлена и отменена.'});
  const start={type:'startExecution',specId:blocker.specId,specRevisionId:state.specs.find(s=>s.id===blocker.specId)!.activeRevisionId,agentId:AGENT_ID};
  assert.throws(()=>command(state,start),code('INVALID_TRANSITION'));
  assert.throws(()=>command(state,{...retire,evidence:''}),code('VALIDATION_ERROR'));
  state=command(state,retire);
  assert.equal(state.requests.find(r=>r.id===blocker.id)!.clearedEvidence,undefined);
  assert.equal(state.events.at(-1)!.type,'BlockerApplicabilityEnded');
  state=command(state,start);assert.equal(state.executions.at(-1)!.state,'queued');
  assert.deepEqual(replay(state.events),state);
});

test('M10: reactivating a retired Blocker contract permits a fresh plan and remediation without reviving its terminal primary',()=>{
  let state=seed();const blocker=state.requests.find(r=>r.kind==='Blocker')!,revision=state.revisions.find(r=>r.id===blocker.specRevisionId)!;
  state=command(state,{type:'resolveDecision',decisionRequestId:blocker.id,specRevisionId:blocker.specRevisionId,outcome:{kind:'approve',chosenOptionId:blocker.options[0].id}});
  const oldDecision=structuredClone(state.requests.find(r=>r.id===blocker.id)!.decision);
  state=command(state,{type:'proposeRevision',specId:blocker.specId,content:{...revision,title:'Временный другой контракт'}});
  const otherRevisionId=state.revisions.at(-1)!.id;
  state=command(state,{type:'activateRevision',specId:blocker.specId,revisionId:otherRevisionId});
  state=command(state,{type:'confirmStopped',executionId:blocker.executionId},agent);
  state=command(state,{type:'cancelExecution',executionId:blocker.executionId,reason:'Прежняя попытка остановлена.'});
  state=command(state,{type:'retireHistoricalBlocker',decisionRequestId:blocker.id,reason:'Старый блокер не относится к временно выбранному контракту.',evidence:'Проверены границы новой цели.'});
  state=command(state,{type:'activateRevision',specId:blocker.specId,revisionId:revision.id});
  const newPrimary={type:'startExecution',specId:blocker.specId,specRevisionId:revision.id,agentId:AGENT_ID};
  assert.throws(()=>command(state,newPrimary),code('INVALID_TRANSITION'));
  state=command(state,{type:'reopenBlockerPlan',decisionRequestId:blocker.id,reason:'Прежний контракт снова активен, нужен новый план устранения.'});
  const reopened=state.requests.at(-1)!;
  assert.equal(state.executions.find(e=>e.id===blocker.executionId)!.state,'cancelled');
  assert.deepEqual(state.requests.find(r=>r.id===blocker.id)!.decision,oldDecision);
  state=command(state,{type:'resolveDecision',decisionRequestId:reopened.id,specRevisionId:revision.id,outcome:{kind:'approve',chosenOptionId:reopened.options[0].id}});
  state=command(state,{type:'authorizeRemediation',decisionRequestId:reopened.id,agentId:AGENT_ID});
  const remediation=state.executions.at(-1)!;
  state=command(state,{type:'confirmResumed',executionId:remediation.id},agent);
  state=command(state,{type:'completeExecution',executionId:remediation.id,result:'succeeded',evidence:'Физическая причина устранена новой попыткой.'},agent);
  state=command(state,{type:'clearBlocker',decisionRequestId:reopened.id,remediationExecutionId:remediation.id,evidence:'Проверено отсутствие физического препятствия.'},agent);
  state=command(state,newPrimary);
  assert.equal(state.executions.find(e=>e.id===blocker.executionId)!.state,'cancelled');
  assert.equal(state.executions.at(-1)!.state,'queued');assert.deepEqual(replay(state.events),state);
});
