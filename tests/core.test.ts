import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_ID, HUMAN_ID, PROJECT_ID, applyCommand, createSeedEvents, DomainError, findCycle, replay, topologicalLayers } from '../packages/core/src';
import type { Actor, Command, ProjectState } from '../packages/core/src';

const human: Actor = { id: HUMAN_ID, kind: 'human', projectIds: [PROJECT_ID] };
const agent: Actor = { id: AGENT_ID, kind: 'agent', projectIds: [PROJECT_ID] };
const seed = () => replay(createSeedEvents());
function command(state: ProjectState, data: Record<string, unknown>, actor = human): ProjectState {
  return applyCommand(state, { requestId: crypto.randomUUID(), expectedVersion: state.version, ...data } as Command, actor).state;
}
function code(expected: string) { return (error: unknown) => error instanceof DomainError && error.code === expected; }

test('seed is deterministic, replayable and keeps three independent state axes', () => {
  assert.deepEqual(createSeedEvents(), createSeedEvents());
  const state = seed();
  assert.equal(state.specs.length, 6); assert.equal(state.requests.length, 3);
  assert.equal(state.specs[0].state, 'done');
  assert.equal(state.requests.find(r => r.kind === 'Question')!.state, 'pending');
  const question = state.requests.find(r => r.kind === 'Question')!;
  assert.equal(state.executions.find(e => e.id === question.executionId)!.state, 'running');
  assert.deepEqual(replay(state.events), state);
});

test('only a scoped human can resolve a request, regardless of client intent', () => {
  const state = seed(); const request = state.requests[0];
  const data = { type: 'resolveDecision', decisionRequestId: request.id, specRevisionId: request.specRevisionId, outcome: { kind: 'approve', chosenOptionId: request.options[0].id } };
  assert.throws(() => command(state, data, agent), code('FORBIDDEN'));
  assert.throws(() => command(state, data, { ...human, projectIds: [] }), code('FORBIDDEN'));
  assert.throws(() => command(state, { ...data, outcome: { kind: 'approve', chosenOptionId: 'unknown' } }), code('VALIDATION_ERROR'));
});

test('Fork approval neither creates a spec nor resumes execution; authorization and ACK are distinct', () => {
  const before = seed(); const request = before.requests.find(r => r.kind === 'Fork')!;
  let state = command(before, { type: 'resolveDecision', decisionRequestId: request.id, specRevisionId: request.specRevisionId, outcome: { kind: 'approve', chosenOptionId: request.options[0].id } });
  assert.equal(state.specs.length, before.specs.length);
  assert.equal(state.executions.find(e => e.id === request.executionId)!.state, 'waiting_for_human');
  assert.equal(state.requests[0].decision?.appliedAt, undefined);
  assert.throws(() => command(state, { type: 'confirmResumed', executionId: request.executionId }, agent), code('INVALID_TRANSITION'));
  state = command(state, { type: 'resumeExecution', executionId: request.executionId });
  assert.equal(state.executions.find(e => e.id === request.executionId)!.state, 'waiting_for_human');
  state = command(state, { type: 'confirmResumed', executionId: request.executionId }, agent);
  assert.equal(state.executions.find(e => e.id === request.executionId)!.state, 'running');
  state = command(state, { type: 'confirmDecisionApplied', decisionRequestId: request.id, evidence: 'Положение узлов закреплено в текущем представлении.' }, agent);
  assert.ok(state.requests[0].decision?.appliedAt);
  assert.equal(before.requests[0].state, 'pending', 'original state must remain unchanged');
});

test('Question always remains pending until a human answers; deferral does not close it', () => {
  let state = seed(); const request = state.requests.find(r => r.kind === 'Question')!;
  state = command(state, { type: 'deferDecision', decisionRequestId: request.id, reason: 'Уточнить терминологию с владельцем.', until: '2099-01-01T00:00:00Z' });
  assert.equal(state.requests.find(r => r.id === request.id)!.state, 'pending');
  assert.throws(() => command(state, { type: 'resolveDecision', decisionRequestId: request.id, specRevisionId: request.specRevisionId, outcome: { kind: 'approve', chosenOptionId: 'automatic' } }), code('VALIDATION_ERROR'));
  state = command(state, { type: 'resolveDecision', decisionRequestId: request.id, specRevisionId: request.specRevisionId, outcome: { kind: 'answer', answer: 'История решений' } });
  assert.equal(state.requests.find(r => r.id === request.id)!.decision?.outcome.kind, 'answer');
});

test('Blocker approval requires successful scoped remediation and evidence before normal work resumes', () => {
  let state = seed(); const blocker = state.requests.find(r => r.kind === 'Blocker')!;
  state = command(state, { type: 'resolveDecision', decisionRequestId: blocker.id, specRevisionId: blocker.specRevisionId, outcome: { kind: 'approve', chosenOptionId: blocker.options[0].id } });
  assert.equal(state.requests.find(r => r.id === blocker.id)!.clearedEvidence, undefined);
  assert.throws(() => command(state, { type: 'resumeExecution', executionId: blocker.executionId }), code('INVALID_TRANSITION'));
  state = command(state, { type: 'authorizeRemediation', decisionRequestId: blocker.id, agentId: AGENT_ID });
  const remediation = state.executions.at(-1)!;
  assert.equal(state.executions.find(e => e.id === blocker.executionId)!.state, 'waiting_for_human');
  state = command(state, { type: 'confirmResumed', executionId: remediation.id }, agent);
  assert.throws(() => command(state, { type: 'clearBlocker', decisionRequestId: blocker.id, remediationExecutionId: remediation.id, evidence: 'Проверен scope.' }, agent), code('INVALID_TRANSITION'));
  state = command(state, { type: 'completeExecution', executionId: remediation.id, result: 'succeeded', evidence: 'Контекст другого проекта отклоняется.' }, agent);
  state = command(state, { type: 'clearBlocker', decisionRequestId: blocker.id, remediationExecutionId: remediation.id, evidence: 'Изолированная проверка scope выполнена; посторонний проект получает FORBIDDEN.' }, agent);
  state = command(state, { type: 'resumeExecution', executionId: blocker.executionId });
  state = command(state, { type: 'confirmResumed', executionId: blocker.executionId }, agent);
  assert.equal(state.executions.find(e => e.id === blocker.executionId)!.state, 'running');
  assert.notEqual(state.specs.find(s => s.id === blocker.specId)!.state, 'done');
});

test('Action is a fact without approval; duplicate terminal phase is rejected and input state is immutable', () => {
  const before = seed(); const execution = before.executions.find(e => e.state === 'running')!;
  const data = { type: 'reportAction', executionId: execution.id, specId: execution.specId, specRevisionId: execution.specRevisionId, actionId: crypto.randomUUID(), phase: 'completed', title: 'Проверен журнал', context: 'Сверка причинных ссылок.', evidence: 'Все ссылки принадлежат текущему проекту.' };
  const after = command(before, data, agent);
  assert.equal(after.requests.length, before.requests.length);
  assert.equal(after.events.at(-1)!.type, 'ActionReported');
  assert.equal(before.version + 1, after.version);
  assert.throws(() => command(after, data, agent), code('INVALID_TRANSITION'));
});

test('successful execution does not imply DoD acceptance; every required criterion needs evidence', () => {
  let state = seed(); const question = state.requests.find(r => r.kind === 'Question')!;
  state = command(state, { type: 'resolveDecision', decisionRequestId: question.id, specRevisionId: question.specRevisionId, outcome: { kind: 'answer', answer: 'История решений' } });
  state = command(state, { type: 'completeExecution', executionId: question.executionId, result: 'succeeded', evidence: 'Сверка воспроизведения прошла.' }, agent);
  assert.equal(state.specs.find(s => s.id === question.specId)!.state, 'in_progress');
  assert.throws(() => command(state, { type: 'acceptSpec', specId: question.specId, specRevisionId: question.specRevisionId, evidence: {} }), code('VALIDATION_ERROR'));
  state = command(state, { type: 'acceptSpec', specId: question.specId, specRevisionId: question.specRevisionId, evidence: { 'criterion-1': 'Старая история сохранена.', 'criterion-2': 'Повтор команды дал прежний receipt.' } });
  assert.equal(state.specs.find(s => s.id === question.specId)!.state, 'done');
});

test('proposing a revision never activates it; activation preserves history and requests stop without claiming ACK', () => {
  let state = seed(); const request = state.requests.find(r => r.kind === 'Fork')!;
  const original = state.revisions.find(r => r.id === request.specRevisionId)!;
  const immutableCopy = structuredClone(original);
  const { id: _id, specId: _specId, revision: _revision, createdAt: _createdAt, authorId: _authorId, ...content } = original;
  state = command(state, { type: 'proposeRevision', specId: original.specId, content: { ...content, title: 'Дорожная карта с устойчивыми позициями' } }, agent);
  assert.equal(state.specs.find(s => s.id === original.specId)!.activeRevisionId, original.id);
  const proposed = state.revisions.at(-1)!;
  state = command(state, { type: 'activateRevision', specId: original.specId, revisionId: proposed.id });
  assert.deepEqual(state.revisions.find(r => r.id === original.id), immutableCopy);
  const execution = state.executions.find(e => e.id === request.executionId)!;
  assert.equal(execution.stopRequested, true); assert.equal(execution.state, 'waiting_for_human');
  assert.equal(state.requests.find(r => r.id === request.id)!.state, 'superseded');
  const superseded = state.events.at(-1)!;
  assert.equal(superseded.type, 'DecisionSuperseded');
  assert.equal(superseded.payload.replacingRevisionId, proposed.id);
  assert.equal(state.events.find(e => e.id === superseded.causationId)!.type, 'RevisionActivated');
  assert.equal((state.events.find(e => e.type === 'DecisionRequested' && (e.payload.request as { id: string }).id === request.id)!.payload.request as { state: string }).state, 'pending');
  assert.throws(() => command(state, { type: 'resolveDecision', decisionRequestId: request.id, specRevisionId: original.id, outcome: { kind: 'approve', chosenOptionId: request.options[0].id } }), code('DECISION_ALREADY_RESOLVED'));
});

test('late Action evidence is retained on its original revision without resuming it', () => {
  let state = seed(); const request = state.requests.find(r => r.kind === 'Fork')!;
  const original = state.revisions.find(r => r.id === request.specRevisionId)!;
  state = command(state, { type: 'proposeRevision', specId: original.specId, content: original });
  state = command(state, { type: 'activateRevision', specId: original.specId, revisionId: state.revisions.at(-1)!.id });
  state = command(state, { type: 'reportAction', executionId: request.executionId, specId: request.specId, specRevisionId: original.id, actionId: crypto.randomUUID(), phase: 'completed', title: 'Поздний результат', context: 'Ответ относится к прежней попытке.', evidence: 'Старый снимок сохранён.' }, agent);
  assert.equal(state.events.at(-1)!.payload.historicalContext, true);
  assert.equal(state.events.at(-1)!.specRevisionId, original.id);
  assert.equal(state.executions.find(e => e.id === request.executionId)!.state, 'waiting_for_human');
});

test('global project optimistic version rejects concurrent stale decisions', () => {
  const state = seed(); const request = state.requests[0];
  const data: Command = { requestId: crypto.randomUUID(), expectedVersion: state.version, type: 'resolveDecision', decisionRequestId: request.id, specRevisionId: request.specRevisionId, outcome: { kind: 'approve', chosenOptionId: request.options[0].id } };
  const after = applyCommand(state, data, human).state;
  assert.throws(() => applyCommand(after, { ...data, requestId: crypto.randomUUID() }, human), code('VERSION_CONFLICT'));
});

test('dependency DAG rejects a concrete cycle while provenance links do not impose order', () => {
  const state = seed(); const [core, road, , , , release] = state.specs;
  const cycle = findCycle(state.dependencies, release.id, core.id);
  assert.ok(cycle); assert.equal(cycle![0], release.id); assert.equal(cycle!.at(-1), release.id);
  assert.throws(() => command(state, { type: 'addDependency', from: release.id, to: core.id }), code('DEPENDENCY_CYCLE'));
  const after = command(state, { type: 'addDependency', from: release.id, to: core.id, relationship: 'derived_from' });
  assert.equal(after.dependencies.at(-1)!.type, 'derived_from');
  const layers = topologicalLayers(state.specs.map(s => s.id), state.dependencies);
  assert.deepEqual(layers[0], [core.id]); assert.ok(layers[1].includes(road.id)); assert.deepEqual(layers.at(-1), [release.id]);
});

test('runtime payload validation and request limit cannot be bypassed by TypeScript casts', () => {
  let state = seed();
  assert.throws(() => command(state, { type: 'createSpec', content: { title: 'Нет DoD' } }), code('VALIDATION_ERROR'));
  const question = state.requests.find(r => r.kind === 'Question')!;
  for (let i = 0; i < 9; i++) state = command(state, { type: 'reportQuestion', specId: question.specId, specRevisionId: question.specRevisionId, executionId: question.executionId, title: `Уточнение ${i}`, context: 'Неблокирующее уточнение.', question: `Вопрос ${i}?`, blockingScope: 'none' }, agent);
  assert.throws(() => command(state, { type: 'reportQuestion', specId: question.specId, specRevisionId: question.specRevisionId, executionId: question.executionId, title: 'Одиннадцатый вопрос', context: 'Лимит запросов.', question: 'Превысить лимит?', blockingScope: 'none' }, agent), code('PENDING_LIMIT_EXCEEDED'));
});

test('freezing roadmap requests stops; only executor ACK changes confirmed execution state', () => {
  let state = seed(); const execution = state.executions.find(e => e.state === 'running')!;
  state = command(state, { type: 'changeRoadmapState', state: 'frozen' });
  assert.equal(state.executions.find(e => e.id === execution.id)!.stopRequested, true);
  assert.equal(state.executions.find(e => e.id === execution.id)!.state, 'running');
  state = command(state, { type: 'confirmStopped', executionId: execution.id }, agent);
  assert.equal(state.executions.find(e => e.id === execution.id)!.state, 'paused');
  state = command(state, { type: 'changeRoadmapState', state: 'active' });
  assert.equal(state.executions.find(e => e.id === execution.id)!.state, 'paused');
});

test('replay rejects gaps, unknown schema and foreign project scope', () => {
  const events = createSeedEvents();
  assert.throws(() => replay(events.slice(1)), code('INVALID_EVENT_STREAM'));
  assert.throws(() => replay([{ ...events[0], schemaVersion: 2 } as never]), code('INVALID_EVENT_STREAM'));
  assert.throws(() => replay(events, 'foreign-project'), code('INVALID_EVENT_STREAM'));
  assert.throws(() => replay([{ ...events[0], causationId: events[1].id }]), code('INVALID_EVENT_STREAM'));
});

test('causal envelope links logical responses, without inventing chronology edges', () => {
  let state = seed(); const request = state.requests[0];
  state = command(state, { type: 'resolveDecision', decisionRequestId: request.id, specRevisionId: request.specRevisionId, outcome: { kind: 'approve', chosenOptionId: request.options[0].id } });
  const resolved = state.events.at(-1)!;
  assert.equal(resolved.correlationId, request.executionId);
  const causalRequest = state.events.find(e => e.id === resolved.causationId)!;
  assert.equal(causalRequest.type, 'DecisionRequested'); assert.equal((causalRequest.payload.request as { id: string }).id, request.id);
  state = command(state, { type: 'resumeExecution', executionId: request.executionId });
  const authorized = state.events.at(-1)!;
  state = command(state, { type: 'confirmResumed', executionId: request.executionId }, agent);
  assert.equal(state.events.at(-1)!.causationId, authorized.id);
});

test('queued-only work stays specified; upstream revised expectations block dependent work', () => {
  let state = seed(); const meridian = state.specs[4];
  state = command(state, { type: 'startExecution', specId: meridian.id, specRevisionId: meridian.activeRevisionId, agentId: AGENT_ID });
  assert.equal(state.specs.find(s => s.id === meridian.id)!.state, 'specified');
  state = command(state, { type: 'confirmResumed', executionId: state.executions.at(-1)!.id }, agent);
  assert.equal(state.specs.find(s => s.id === meridian.id)!.state, 'in_progress');
  const core = state.specs[0]; const original = state.revisions.find(r => r.id === core.activeRevisionId)!;
  state = command(state, { type: 'proposeRevision', specId: core.id, content: original });
  state = command(state, { type: 'activateRevision', specId: core.id, revisionId: state.revisions.at(-1)!.id });
  assert.equal(state.specs.find(s => s.id === core.id)!.state, 'specified');
  assert.equal(state.specs.find(s => s.id === meridian.id)!.state, 'blocked');
});
