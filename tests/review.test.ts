import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENT_ID, HUMAN_ID, PROJECT_ID, applyCommand, createSeedEvents, replay } from '../packages/core/src';
import type { Actor, Command, ProjectState } from '../packages/core/src';

const human: Actor = {id: HUMAN_ID, kind: 'human', projectIds: [PROJECT_ID]};
const agent: Actor = {id: AGENT_ID, kind: 'agent', projectIds: [PROJECT_ID]};
const run = (state: ProjectState, command: Record<string, unknown>, actor = human) =>
  applyCommand(state, {...command, requestId: crypto.randomUUID(), expectedVersion: state.version} as Command, actor).state;

test('revision handoff retires a stopped old attempt before a new contract starts', () => {
  let state = replay(createSeedEvents());
  const spec = state.specs[2];
  const previous = state.executions.find(e => e.specId === spec.id)!;
  const revision = state.revisions.find(r => r.id === spec.activeRevisionId)!;
  state = run(state, {type: 'proposeRevision', specId: spec.id, content: {...revision, goal: 'Уточнённое ожидание для новой попытки'}});
  const newRevision = state.revisions.at(-1)!;
  state = run(state, {type: 'activateRevision', specId: spec.id, revisionId: newRevision.id});
  assert.equal(state.executions.find(e=>e.id===previous.id)?.stopRequested, true);
  assert.throws(() => run(state, {type:'startExecution',specId:spec.id,specRevisionId:newRevision.id,agentId:AGENT_ID}));
  state = run(state, {type:'confirmStopped',executionId:previous.id},agent);
  state = run(state, {type:'cancelExecution',executionId:previous.id,reason:'Предыдущий контракт остановлен; переходим к новой ревизии.'});
  state = run(state, {type:'startExecution',specId:spec.id,specRevisionId:newRevision.id,agentId:AGENT_ID});
  assert.equal(state.executions.find(e=>e.id===previous.id)?.state,'cancelled');
  assert.equal(state.executions.at(-1)?.specRevisionId,newRevision.id);
  assert.deepEqual(replay(state.events),state);
});

test('remediation exempts its target blocker but preserves other blocking requests', () => {
  let state = replay(createSeedEvents());
  const blocker=state.requests.find(r=>r.kind==='Blocker')!;
  const main=state.executions.find(e=>e.id===blocker.executionId)!;
  state=run(state,{type:'reportQuestion',specId:blocker.specId,specRevisionId:blocker.specRevisionId,executionId:main.id,title:'Второе обязательное ограничение',context:'Ограничение относится ко всей разрешённой области устранения.',question:'Можно ли использовать локальный источник?',blockingScope:'execution'},agent);
  state=run(state,{type:'resolveDecision',decisionRequestId:blocker.id,specRevisionId:blocker.specRevisionId,outcome:{kind:'approve',chosenOptionId:blocker.options[0].id}});
  state=run(state,{type:'authorizeRemediation',decisionRequestId:blocker.id,agentId:AGENT_ID});
  const remediation=state.executions.at(-1)!;
  assert.throws(()=>run(state,{type:'confirmResumed',executionId:remediation.id},agent));
  const question=state.requests.at(-1)!;
  state=run(state,{type:'resolveDecision',decisionRequestId:question.id,specRevisionId:question.specRevisionId,outcome:{kind:'answer',answer:'Да, локальный источник разрешён в согласованной области.'}});
  state=run(state,{type:'confirmResumed',executionId:remediation.id},agent);
  assert.equal(state.executions.find(e=>e.id===remediation.id)?.state,'running');
  assert.equal(state.executions.find(e=>e.id===main.id)?.state,'waiting_for_human');
  assert.equal(state.requests.find(r=>r.id===blocker.id)?.clearedEvidence,undefined);
});

test('malformed decision payload is a domain validation failure, not a TypeError',()=>{
  const state=replay(createSeedEvents());
  const request=state.requests.find(r=>r.kind==='Fork')!;
  for(const outcome of [null,[],{kind:'answer',answer:'Не тот тип ответа'}, {kind:'approve',chosenOptionId:'missing'}]) {
    assert.throws(()=>run(state,{type:'resolveDecision',decisionRequestId:request.id,specRevisionId:request.specRevisionId,outcome}),(error:unknown)=>(error as {code?:string}).code==='VALIDATION_ERROR');
  }
});
