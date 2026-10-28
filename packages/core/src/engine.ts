import { findCycle } from './graph';
import { getLessonSourceSpecIds, validateLessonContent as assertLessonContent } from './lessons';
import { validateFlowDefinition as assertFlowDefinition } from './flow';
import type { Actor, Command, DecisionRequest, DomainEvent, Execution, FlowDefinition, FlowNodeKind, GitHubBinding, GitHubCommitSource, Lesson, LessonContent, LessonRevision, ProjectState, RevisionContent, Spec, SpecRevision } from './types';

export const PROJECT_ID = '6c7c62dc-694c-4c7b-9cb1-d9e605164001';
export const AGENT_ID = 'a8f5f167-6e7a-4d18-8d2e-88466c165001';
export const GITHUB_SERVICE_ID = 'ouro-github-webhook';
export class DomainError extends Error {
  constructor(public code: string, message: string, public details?: Record<string, unknown>) { super(message); this.name = 'DomainError'; }
}
const fail = (code: string, message: string, details?: Record<string, unknown>): never => { throw new DomainError(code, message, details); };
const text = (value: unknown, label: string, minimum = 1): string => {
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > 20000) fail('VALIDATION_ERROR', `${label}: требуется текст от ${minimum} до 20000 символов`);
  return value as string;
};
const terminal = new Set(['succeeded', 'failed', 'cancelled', 'skipped']);
const copy = <T>(value: T): T => structuredClone(value);
export function validateFlowDefinition(value:unknown):asserts value is FlowDefinition {
  try{assertFlowDefinition(value);}catch(error){
    if((error as {code?:string}).code==='VALIDATION_ERROR')fail('VALIDATION_ERROR',(error as Error).message);
    throw error;
  }
}
export function emptyState(projectId = PROJECT_ID): ProjectState {
  return { projectId, version: 0, roadmap: { id: '7fa3e5d0-e946-4684-9a1a-540eaa334001', title: 'Ouro · Human View', goal: 'От ожидания к проверяемому результату', state: 'active' }, specs: [], revisions: [], executions: [], requests: [], dependencies: [], events: [],githubBindings:[],lessons:[],lessonRevisions:[] };
}

/** Deterministic projection. Authoritative events and historical revisions are never updated. */
export function replay(events: readonly DomainEvent[], projectId = PROJECT_ID): ProjectState {
  const state = emptyState(projectId);
  for (const event of events) {
    if (event.projectId !== projectId || event.schemaVersion !== 1 || event.version !== state.version + 1) fail('INVALID_EVENT_STREAM', 'Нарушен scope, версия схемы или последовательность событий');
    if (event.causationId && !state.events.some(prior => prior.id === event.causationId)) fail('INVALID_EVENT_STREAM', 'Причинная ссылка должна указывать на ранее зафиксированное событие');
    const p = copy(event.payload);
    switch (event.type) {
      case 'SpecCreated': state.specs.push(p.spec as Spec); state.revisions.push(p.revision as SpecRevision); break;
      case 'RevisionProposed': {
        const revision = p.revision as SpecRevision;
        state.revisions.push(revision);
        state.specs.find(s => s.id === revision.specId)!.revisionIds.push(revision.id);
        break;
      }
      case 'RevisionActivated': {
        const spec = state.specs.find(s => s.id === event.specId)!;
        const revision = state.revisions.find(r => r.id === p.revisionId)!;
        spec.activeRevisionId = revision.id; spec.title = revision.title; spec.state = 'specified'; delete spec.acceptance;
        state.executions.filter(e => e.specId === spec.id && !terminal.has(e.state)).forEach(e => { e.stopRequested = true; e.resumeAuthorized = false; });
        break;
      }
      case 'ExecutionCreated': state.executions.push(p.execution as Execution); break;
      case 'ExecutionStarted': case 'ExecutionResumed': {
        const execution = state.executions.find(e => e.id === event.executionId)!;
        execution.state = 'running'; execution.resumeAuthorized = false; execution.stopRequested = false;
        break;
      }
      case 'DecisionRequested': {
        const request = p.request as DecisionRequest;
        state.requests.push(request);
        const execution = state.executions.find(e => e.id === request.executionId)!;
        if (request.blockingScope === 'execution' && !terminal.has(execution.state)) execution.state = 'waiting_for_human';
        break;
      }
      case 'DecisionResolved': {
        const request = state.requests.find(r => r.id === p.decisionRequestId)!;
        request.state = 'resolved'; request.decision = p.decision as DecisionRequest['decision'];
        break;
      }
      case 'DecisionDeferred': {
        const request = state.requests.find(r => r.id === p.decisionRequestId)!;
        request.deferredUntil = p.until as string; request.deferredReason = p.reason as string;
        break;
      }
      case 'DecisionSuperseded': state.requests.find(r => r.id === p.decisionRequestId)!.state = 'superseded'; break;
      case 'ResumeAuthorized': state.executions.find(e => e.id === event.executionId)!.resumeAuthorized = true; break;
      case 'DecisionApplied': state.requests.find(r => r.id === p.decisionRequestId)!.decision!.appliedAt = event.occurredAt; break;
      case 'BlockerCleared': state.requests.find(r => r.id === p.decisionRequestId)!.clearedEvidence = p.evidence as string; break;
      case 'ExecutionCompleted': {
        const execution = state.executions.find(e => e.id === event.executionId)!;
        execution.state = p.result as Execution['state']; execution.resultEvidence = p.evidence as string;
        break;
      }
      case 'ExecutionCancelled': case 'ExecutionSkipped': {
        const execution = state.executions.find(e => e.id === event.executionId)!;
        execution.state = event.type === 'ExecutionCancelled' ? 'cancelled' : 'skipped';
        execution.resumeAuthorized = false; execution.stopRequested = false; break;
      }
      case 'StopRequested': state.executions.find(e => e.id === event.executionId)!.stopRequested = true; break;
      case 'ExecutionPaused': {
        const execution = state.executions.find(e => e.id === event.executionId)!;
        execution.state = 'paused'; execution.stopRequested = false; execution.resumeAuthorized = false; break;
      }
      case 'SpecAccepted': {
        const spec = state.specs.find(s => s.id === event.specId)!;
        spec.state = 'done'; spec.acceptance = { revisionId: event.specRevisionId!, evidence: p.evidence as Record<string, string>, actorId: event.actor.id, at: event.occurredAt }; break;
      }
      case 'SpecInvalidated': {
        const spec = state.specs.find(s => s.id === event.specId)!; spec.state = 'invalidated';
        state.executions.filter(e => e.specId === spec.id && !terminal.has(e.state)).forEach(e => { e.stopRequested = true; e.resumeAuthorized = false; }); break;
      }
      case 'DependencyAdded': state.dependencies.push(p.dependency as ProjectState['dependencies'][number]); break;
      case 'RoadmapStateChanged': {
        state.roadmap.state = p.state as ProjectState['roadmap']['state'];
        if (p.state === 'frozen') state.executions.filter(e => !terminal.has(e.state)).forEach(e => { e.stopRequested = true; e.resumeAuthorized = false; });
        break;
      }
      case 'LessonCreated': state.lessons.push(p.lesson as Lesson);state.lessonRevisions.push(p.revision as LessonRevision);break;
      case 'LessonRevisionProposed': {
        const revision=p.revision as LessonRevision;state.lessonRevisions.push(revision);state.lessons.find(lesson=>lesson.id===revision.lessonId)!.latestRevisionId=revision.id;break;
      }
      case 'LessonPublished': state.lessons.find(lesson=>lesson.id===p.lessonId)!.publishedRevisionId=p.revisionId as string;break;
      case 'ActionReported': break;
      case 'GitHubBindingCreated': state.githubBindings.push(p.binding as GitHubBinding);break;
      case 'GitHubBindingRevoked': {
        const binding=state.githubBindings.find(binding=>binding.id===p.bindingId)!;
        binding.revokedAt=event.occurredAt;binding.revokedBy=event.actor.id;break;
      }
      default: fail('INVALID_EVENT_STREAM', `Неизвестный тип события: ${event.type}`);
    }
    state.version = event.version; state.events.push(copy(event));
    // Lifecycle projection concerns active revision only. Human acceptance stays independent.
    for (const spec of state.specs) {
      if (['done', 'invalidated', 'idea'].includes(spec.state)) continue;
      const active = state.executions.filter(e => e.specId === spec.id && e.specRevisionId === spec.activeRevisionId && e.kind === 'primary');
      const started = state.events.some(e => ['ExecutionStarted', 'ExecutionResumed'].includes(e.type) && e.specId === spec.id && e.specRevisionId === spec.activeRevisionId);
      const unmetDependency = started && state.dependencies.some(d => d.type === 'depends_on' && d.to === spec.id && state.specs.find(s => s.id === d.from)?.state !== 'done');
      const blocked = unmetDependency || active.some(e => ['waiting_for_human', 'paused'].includes(e.state)) || state.requests.some(r => r.specId === spec.id && r.specRevisionId === spec.activeRevisionId && ((r.blockingScope === 'execution' && r.state === 'pending') || (r.kind === 'Blocker' && r.state !== 'superseded' && !r.clearedEvidence)));
      spec.state = blocked ? 'blocked' : started ? 'in_progress' : 'specified';
    }
  }
  return state;
}

function validateContent(content: RevisionContent): void {
  if (!content || typeof content !== 'object') fail('VALIDATION_ERROR', 'Не передано содержание ревизии');
  text(content.title, 'Название'); text(content.goal, 'Цель');
  for (const key of ['constraints', 'assumptions', 'risks', 'inputs'] as const) text(content[key], key, 0);
  text(content.comment, 'comment', 0);
  if(content.flow!==undefined)validateFlowDefinition(content.flow);
  if (!Array.isArray(content.dod) || !content.dod.length || content.dod.length > 50) fail('VALIDATION_ERROR', 'Нужен список критериев DoD (1–50)');
  const ids = new Set<string>();
  for (const criterion of content.dod) {
    if (!criterion || typeof criterion !== 'object') fail('VALIDATION_ERROR', 'Некорректный критерий');
    text(criterion.id, 'criterionId'); text(criterion.text, 'DoD');
    if (typeof criterion.required !== 'boolean' || ids.has(criterion.id)) fail('VALIDATION_ERROR', 'Критерии должны иметь уникальные ID и признак required');
    ids.add(criterion.id);
  }
}

/** A command creates facts; only replay derives current state. No external process is executed here. */
export function applyCommand(state: ProjectState, command: Command, actor: Actor, environment: { now?: string; id?: () => string } = {}): { state: ProjectState; events: DomainEvent[] } {
  if (!command || typeof command !== 'object') fail('VALIDATION_ERROR', 'Команда должна быть объектом');
  text(command.requestId, 'requestId');
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) fail('VALIDATION_ERROR', 'expectedVersion должен быть целым неотрицательным числом');
  if (!actor || !['human', 'agent', 'service'].includes(actor.kind) || !Array.isArray(actor.projectIds) || !actor.projectIds.includes(state.projectId)) fail('FORBIDDEN', 'Нет доступа к проекту');
  text(actor.id, 'actor.id');
  if (command.expectedVersion !== state.version) fail('VERSION_CONFLICT', 'Состояние изменилось. Обновите данные перед решением.', { currentVersion: state.version });
  const now = environment.now ?? new Date().toISOString();
  const id = environment.id ?? (() => globalThis.crypto.randomUUID());
  const events: DomainEvent[] = [];
  const emit = (type: string, payload: Record<string, unknown>, context: { specId?: string; specRevisionId?: string; executionId?: string; causationId?: string } = {}) => {
    const event: DomainEvent = { id: id(), type, schemaVersion: 1, version: state.version + events.length + 1, projectId: state.projectId, occurredAt: now, actor: copy(actor), requestId: command.requestId, correlationId: context.executionId ?? command.requestId, ...context, payload: copy(payload) };
    events.push(event); return event;
  };
  const cause = (predicate: (event: DomainEvent) => boolean) => state.events.findLast(predicate)?.id;
  const requestCause = (requestId: string, eventType = 'DecisionRequested') => cause(e => e.type === eventType && (eventType === 'DecisionRequested' ? (e.payload.request as DecisionRequest)?.id === requestId : e.payload.decisionRequestId === requestId));
  const human = () => { if (actor.kind !== 'human') fail('FORBIDDEN', 'Требуется подтверждённое действие человека'); };
  const getLesson = (lessonId:string) => state.lessons.find(lesson=>lesson.id===lessonId&&lesson.projectId===state.projectId)??fail('NOT_FOUND','Урок не найден.');
  const lessonContent = (content:LessonContent) => {
    try{assertLessonContent(content,state);}catch(error){const e=error as {code?:string;message:string};if(e.code==='VALIDATION_ERROR'||e.code==='FORBIDDEN')fail(e.code,e.message);throw error;}
  };
  const getSpec = (specId: string) => state.specs.find(s => s.id === specId) ?? fail('NOT_FOUND', 'Спецификация не найдена');
  const getExecution = (executionId: string) => state.executions.find(e => e.id === executionId) ?? fail('NOT_FOUND', 'Исполнение не найдено');
  const getRequest = (requestId: string) => state.requests.find(r => r.id === requestId) ?? fail('NOT_FOUND', 'Запрос решения не найден');
  const agent = (execution: Execution) => { if (actor.kind !== 'service' && (actor.kind !== 'agent' || actor.id !== execution.agentId)) fail('FORBIDDEN', 'Отчёт допустим только от назначенного исполнителя'); };
  const activeRevision = (spec: Spec, revisionId?: string) => { if (spec.state === 'invalidated' || !spec.activeRevisionId || (revisionId && revisionId !== spec.activeRevisionId)) fail('REVISION_CONFLICT', 'Нужна активная ревизия спецификации'); };
  const dependenciesReady = (specId: string) => {
    if (state.dependencies.some(d => d.type === 'depends_on' && d.to === specId && getSpec(d.from).state !== 'done')) fail('INVALID_TRANSITION', 'Обязательные зависимости ещё не приняты человеком');
  };
  const blockers = (execution: Execution) => {
    const targetExecutionId = execution.remediatesBlockerId ? getRequest(execution.remediatesBlockerId).executionId : undefined;
    return state.requests.filter(r => (r.executionId === execution.id || r.executionId === targetExecutionId) && r.id !== execution.remediatesBlockerId && ((r.state === 'pending' && r.blockingScope === 'execution') || (r.kind === 'Blocker' && !r.clearedEvidence) || (r.blockingScope === 'execution' && r.state === 'resolved' && r.decision?.outcome.kind === 'reject')));
  };
  const context = (execution: Execution) => ({ specId: execution.specId, specRevisionId: execution.specRevisionId, executionId: execution.id });
  const canRun = (execution: Execution) => {
    if (state.roadmap.state !== 'active') fail('INVALID_TRANSITION', 'Дорожная карта не активна');
    activeRevision(getSpec(execution.specId), execution.specRevisionId); dependenciesReady(execution.specId);
    if (blockers(execution).length) fail('INVALID_TRANSITION', 'Остались неразрешённые блокировки');
    if (state.executions.some(e => e.specId === execution.specId && e.id !== execution.id && e.stopRequested && !terminal.has(e.state))) fail('INVALID_TRANSITION', 'Остановка прежней попытки ещё не подтверждена');
  };
  switch (command.type) {
    case 'createLesson': {
      human();lessonContent(command.content);
      const lessonId=id(),revisionId=id();
      const lesson:Lesson={id:lessonId,projectId:state.projectId,latestRevisionId:revisionId};
      const revision:LessonRevision={...copy(command.content),id:revisionId,lessonId,revision:1,createdBy:actor.id,createdAt:now};
      emit('LessonCreated',{lesson,revision});break;
    }
    case 'reviseLesson': {
      human();const lesson=getLesson(command.lessonId);lessonContent(command.content);
      const parent=state.lessonRevisions.find(revision=>revision.id===lesson.latestRevisionId)!;
      const revision:LessonRevision={...copy(command.content),id:id(),lessonId:lesson.id,revision:parent.revision+1,parentRevisionId:parent.id,createdBy:actor.id,createdAt:now};
      emit('LessonRevisionProposed',{revision},{causationId:cause(event=>event.type==='LessonCreated'?(event.payload.lesson as Lesson)?.id===lesson.id:event.type==='LessonRevisionProposed'&&(event.payload.revision as LessonRevision)?.id===parent.id)});break;
    }
    case 'publishLesson': {
      human();const lesson=getLesson(command.lessonId);
      const revision=state.lessonRevisions.find(revision=>revision.id===command.revisionId&&revision.lessonId===lesson.id)??fail('VALIDATION_ERROR','Редакция не принадлежит выбранному уроку.');
      if(lesson.publishedRevisionId===revision.id)fail('INVALID_TRANSITION','Эта редакция уже опубликована.');
      emit('LessonPublished',{lessonId:lesson.id,revisionId:revision.id},{causationId:cause(event=>['LessonCreated','LessonRevisionProposed'].includes(event.type)&&(event.payload.revision as LessonRevision)?.id===revision.id)});break;
    }
    case 'createSpec': case 'createSpecFromLesson': {
      human();validateContent(command.content);
      let origin:Spec['origin'],publicationCause:string|undefined,sourceSpecId:string|undefined;
      if(command.type==='createSpecFromLesson'){
        const lesson=getLesson(command.lessonId);
        if(!lesson.publishedRevisionId)fail('INVALID_TRANSITION','Для новой спеки нужно сначала опубликовать урок.');
        if(command.lessonRevisionId!==lesson.publishedRevisionId)fail('REVISION_CONFLICT','Опубликованная редакция урока изменилась. Проверьте новый snapshot перед созданием спеки.');
        const lessonRevision=state.lessonRevisions.find(revision=>revision.id===command.lessonRevisionId&&revision.lessonId===lesson.id)??fail('VALIDATION_ERROR','Редакция не принадлежит выбранному уроку.');
        if(command.sourceSpecId!==undefined){
          if(typeof command.sourceSpecId!=='string'||!getLessonSourceSpecIds(state,lessonRevision).includes(command.sourceSpecId))fail('VALIDATION_ERROR','Связать можно только реальную спеку из источников урока.');
          sourceSpecId=command.sourceSpecId;
        }
        origin={kind:'lesson',lessonId:lesson.id,lessonRevisionId:lessonRevision.id};
        publicationCause=cause(event=>event.type==='LessonPublished'&&event.payload.lessonId===lesson.id&&event.payload.revisionId===lessonRevision.id);
      }
      const specId = id(); const revisionId = id();
      const nextNumber = Math.max(0, ...state.specs.map(s => Number(s.humanId.split('-').at(-1)) || 0)) + 1;
      const spec: Spec = { id: specId, projectId: state.projectId, humanId: `OURO-S-${String(nextNumber).padStart(6, '0')}`, title: command.content.title, state: 'idea', activeRevisionId: null, revisionIds: [revisionId],...(origin?{origin}:{}) };
      const revision: SpecRevision = { ...copy(command.content), id: revisionId, specId, revision: 1, createdAt: now, authorId: actor.id };
      const created=emit('SpecCreated', { spec, revision }, { specId,...(publicationCause?{causationId:publicationCause}:{}) });
      if(sourceSpecId)emit('DependencyAdded',{dependency:{id:id(),from:sourceSpecId,to:specId,type:'derived_from'}},{specId,specRevisionId:revisionId,causationId:created.id});
      break;
    }
    case 'proposeRevision': {
      const spec = getSpec(command.specId); validateContent(command.content);
      if (spec.state === 'invalidated') fail('INVALID_TRANSITION', 'Неактуальная цель требует новой спецификации');
      const revision: SpecRevision = { ...copy(command.content), id: id(), specId: spec.id, revision: spec.revisionIds.length + 1, parentRevisionId: spec.revisionIds.at(-1), createdAt: now, authorId: actor.id };
      emit('RevisionProposed', { revision }, { specId: spec.id, specRevisionId: revision.id }); break;
    }
    case 'activateRevision': {
      human(); const spec = getSpec(command.specId);
      const revision = state.revisions.find(r => r.id === command.revisionId && r.specId === spec.id) ?? fail('NOT_FOUND', 'Ревизия не найдена');
      if (spec.state === 'invalidated' || spec.activeRevisionId === revision.id) fail('INVALID_TRANSITION', 'Ревизию нельзя активировать');
      validateContent(revision);
      const activated = emit('RevisionActivated', { revisionId: revision.id }, { specId: spec.id, specRevisionId: revision.id, causationId: cause(e => e.type === 'RevisionProposed' ? (e.payload.revision as SpecRevision)?.id === revision.id : e.type === 'SpecCreated' && (e.payload.revision as SpecRevision)?.id === revision.id) });
      for (const request of state.requests.filter(r => r.specId === spec.id && r.specRevisionId === spec.activeRevisionId && r.state === 'pending')) {
        emit('DecisionSuperseded', { decisionRequestId: request.id, replacingRevisionId: revision.id, reason: 'Человек активировал новую ревизию. Запрос прежнего контракта не переносится автоматически.' }, { specId: spec.id, specRevisionId: request.specRevisionId, executionId: request.executionId, causationId: activated.id });
      }
      break;
    }
    case 'startExecution': {
      human(); const spec = getSpec(command.specId); activeRevision(spec, command.specRevisionId); dependenciesReady(spec.id); text(command.agentId, 'agentId');
      if (spec.state === 'done' || state.roadmap.state !== 'active') fail('INVALID_TRANSITION', 'Нельзя начать исполнение в текущем состоянии');
      if (state.executions.some(e => e.specId === spec.id && !terminal.has(e.state))) fail('INVALID_TRANSITION', 'У спецификации уже есть незавершённая попытка');
      if (command.retryOfExecutionId && !state.executions.some(e => e.id === command.retryOfExecutionId && e.specId === spec.id && terminal.has(e.state))) fail('VALIDATION_ERROR', 'retryOf должен ссылаться на завершённую попытку этой спеки');
      const execution: Execution = { id: id(), specId: spec.id, specRevisionId: command.specRevisionId, agentId: command.agentId, state: 'queued', kind: 'primary', resumeAuthorized: true, retryOfExecutionId: command.retryOfExecutionId };
      emit('ExecutionCreated', { execution }, context(execution)); break;
    }
    case 'reportAction': case 'reportQuestion': case 'reportFork': case 'reportBlocker': {
      if('source' in command)fail('FORBIDDEN','Проверенный внешний источник добавляет только серверный адаптер.');
      const execution = getExecution(command.executionId); agent(execution);
      if (execution.specId !== command.specId || execution.specRevisionId !== command.specRevisionId) fail('REVISION_CONFLICT', 'Отчёт не соответствует контракту попытки');
      if(command.flowNodeId!==undefined){
        if(typeof command.flowNodeId!=='string'||!command.flowNodeId.trim()||command.flowNodeId.length>200)fail('VALIDATION_ERROR','flowNodeId должен содержать от 1 до 200 символов.');
        const flow=state.revisions.find(revision=>revision.id===execution.specRevisionId)?.flow;
        if(!flow)fail('VALIDATION_ERROR','Назначенная ревизия не содержит схемы процесса.');
        validateFlowDefinition(flow);
        const node=flow.nodes.find(node=>node.id===command.flowNodeId);
        const allowed:FlowNodeKind[]=command.type==='reportAction'?['action','condition','wait','result']:command.type==='reportQuestion'?['question']:command.type==='reportFork'?['fork']:['blocker'];
        if(!node||!allowed.includes(node.kind))fail('VALIDATION_ERROR','Узел схемы отсутствует в назначенной ревизии или не соответствует типу сообщения.');
      }
      text(command.title, 'Название'); text(command.context, 'Контекст');
      if (command.type === 'reportAction') {
        text(command.actionId, 'actionId');
        if (!['started', 'completed', 'failed'].includes(command.phase)) fail('VALIDATION_ERROR', 'Некорректная фаза Action');
        if (command.phase !== 'started') text(command.evidence, 'Основание результата');
        const previous = state.events.filter(e => e.type === 'ActionReported' && e.executionId === execution.id && e.payload.actionId === command.actionId);
        if(previous.some(event=>event.payload.flowNodeId!==command.flowNodeId))fail('VALIDATION_ERROR','Привязка actionId к узлу схемы не меняется между фазами.');
        if (previous.some(e => ['completed', 'failed'].includes(String(e.payload.phase))) || (command.phase === 'started' && previous.length)) fail('INVALID_TRANSITION', 'Фаза действия уже завершена или начата');
        if (command.phase === 'started' && (execution.state !== 'running' || execution.stopRequested)) fail('INVALID_TRANSITION', 'Новое действие нельзя начать при остановке или ожидании');
        emit('ActionReported', { actionId: command.actionId, phase: command.phase, title: command.title, context: command.context, evidence: command.evidence ?? '', historicalContext: getSpec(execution.specId).activeRevisionId !== execution.specRevisionId,...(command.flowNodeId!==undefined?{flowNodeId:command.flowNodeId}:{}) }, { ...context(execution), causationId: command.phase === 'started' ? undefined : previous.find(e => e.payload.phase === 'started')?.id });
        break;
      }
      activeRevision(getSpec(execution.specId),execution.specRevisionId);
      if (terminal.has(execution.state) || !['running', 'waiting_for_human'].includes(execution.state)) fail('INVALID_TRANSITION', 'Новый запрос не относится к активному исполнению');
      if (state.requests.filter(r => r.specId === execution.specId && r.agentId === execution.agentId && r.state === 'pending').length >= 10) fail('PENDING_LIMIT_EXCEEDED', 'У агента уже 10 открытых запросов по этой спеке');
      const kind = command.type === 'reportQuestion' ? 'Question' : command.type === 'reportFork' ? 'Fork' : 'Blocker';
      const request: DecisionRequest = { id: id(), kind, title: command.title, context: command.context, reason: '', options: [], state: 'pending', specId: execution.specId, specRevisionId: execution.specRevisionId, executionId: execution.id, agentId: execution.agentId, blockingScope: 'execution' };
      if(command.flowNodeId!==undefined)request.flowNodeId=command.flowNodeId;
      if (command.type === 'reportQuestion') {
        text(command.question, 'Вопрос'); if (!['execution', 'none'].includes(command.blockingScope)) fail('VALIDATION_ERROR', 'Некорректная область блокировки');
        request.question = command.question; request.blockingScope = command.blockingScope;
      } else {
        text(command.reason, 'Причина', 50);
        if (!Array.isArray(command.options) || command.options.length > 10) fail('VALIDATION_ERROR', 'Нужен список вариантов (до 10)');
        const optionIds = new Set<string>();
        for (const option of command.options) {
          if (!option || typeof option !== 'object') fail('VALIDATION_ERROR', 'Некорректный вариант');
          text(option.id, 'optionId'); text(option.title, 'Название варианта'); text(option.description, 'Описание варианта');
          if (optionIds.has(option.id)) fail('VALIDATION_ERROR', 'Варианты должны иметь разные ID'); optionIds.add(option.id);
        }
        request.reason = command.reason; request.options = copy(command.options);
        if (command.type === 'reportFork') {
          if (command.options.length < 2) fail('VALIDATION_ERROR', 'Развилка требует минимум двух вариантов');
          if (command.recommendationOptionId && !optionIds.has(command.recommendationOptionId)) fail('VALIDATION_ERROR', 'Рекомендация должна ссылаться на существующий вариант');
          request.recommendationOptionId = command.recommendationOptionId;
        } else {
          text(command.expected, 'Ожидание'); text(command.actual, 'Факт'); text(command.impact, 'Влияние');
          if (!command.options.length) text(command.noPathReason, 'Почему путь неизвестен');
          Object.assign(request, { expected: command.expected, actual: command.actual, impact: command.impact, noPathReason: command.noPathReason });
        }
      }
      emit('DecisionRequested', { request }, context(execution)); break;
    }
    case 'resolveDecision': {
      human(); const request = getRequest(command.decisionRequestId);
      if (request.state !== 'pending') fail('DECISION_ALREADY_RESOLVED', 'Запрос уже закрыт или заменён новой ревизией');
      activeRevision(getSpec(request.specId), command.specRevisionId);
      if (request.specRevisionId !== command.specRevisionId) fail('REVISION_CONFLICT', 'Запрос относится к другой ревизии');
      if (!command.outcome || typeof command.outcome !== 'object') fail('VALIDATION_ERROR', 'Не передано решение');
      const outcome = command.outcome;
      if (outcome.kind === 'reject') text(outcome.reason, 'Причина отклонения');
      else if (request.kind === 'Question' && outcome.kind === 'answer') text(outcome.answer, 'Ответ человека');
      else if (request.kind !== 'Question' && outcome.kind === 'approve') {
        if (!request.options.some(o => o.id === outcome.chosenOptionId)) fail('VALIDATION_ERROR', 'Выбран неизвестный вариант');
      } else fail('VALIDATION_ERROR', 'Тип решения не соответствует запросу');
      emit('DecisionResolved', { decisionRequestId: request.id, decision: { id: id(), actorId: actor.id, at: now, outcome, comment: command.comment ?? '' } }, { specId: request.specId, specRevisionId: request.specRevisionId, executionId: request.executionId, causationId: requestCause(request.id) }); break;
    }
    case 'deferDecision': {
      human(); const request = getRequest(command.decisionRequestId); if (request.state !== 'pending') fail('INVALID_TRANSITION', 'Запрос уже закрыт');
      text(command.reason, 'Причина отсрочки');
      if (!Number.isFinite(Date.parse(command.until)) || Date.parse(command.until) <= Date.parse(now)) fail('VALIDATION_ERROR', 'Срок отсрочки должен быть в будущем');
      emit('DecisionDeferred', { decisionRequestId: request.id, reason: command.reason, until: command.until }, { specId: request.specId, specRevisionId: request.specRevisionId, executionId: request.executionId, causationId: requestCause(request.id) }); break;
    }
    case 'resumeExecution': {
      human(); const execution = getExecution(command.executionId);
      if (!['paused', 'waiting_for_human', 'queued'].includes(execution.state) || execution.resumeAuthorized) fail('INVALID_TRANSITION', 'Продолжение не требуется или уже разрешено');
      canRun(execution); emit('ResumeAuthorized', {}, context(execution)); break;
    }
    case 'confirmResumed': {
      const execution = getExecution(command.executionId); agent(execution);
      if(command.ackPhase!==undefined&&!['start','resume'].includes(command.ackPhase))fail('VALIDATION_ERROR','Неизвестная фаза подтверждения.');
      if((command.ackPhase==='start'&&execution.state!=='queued')||(command.ackPhase==='resume'&&execution.state==='queued'))fail('INVALID_TRANSITION','Подтверждение не соответствует фазе исполнения.');
      if (!execution.resumeAuthorized || terminal.has(execution.state)) fail('INVALID_TRANSITION', 'Нет разрешения человека на продолжение');
      canRun(execution); emit(execution.state === 'queued' ? 'ExecutionStarted' : 'ExecutionResumed', {}, { ...context(execution), causationId: cause(e => e.executionId === execution.id && ['ResumeAuthorized', 'ExecutionCreated'].includes(e.type)) }); break;
    }
    case 'confirmDecisionApplied': {
      const request = getRequest(command.decisionRequestId); const execution = getExecution(request.executionId); agent(execution); text(command.evidence, 'Основание применения');
      activeRevision(getSpec(request.specId), request.specRevisionId);
      if (request.state !== 'resolved' || !request.decision || request.decision.appliedAt || request.decision.outcome.kind === 'reject') fail('INVALID_TRANSITION', 'Нет положительного неприменённого решения');
      emit('DecisionApplied', { decisionRequestId: request.id, evidence: command.evidence }, { ...context(execution), causationId: requestCause(request.id, 'DecisionResolved') }); break;
    }
    case 'authorizeRemediation': {
      human(); const request = getRequest(command.decisionRequestId); text(command.agentId, 'agentId');
      if (request.kind !== 'Blocker' || request.state !== 'resolved' || request.decision?.outcome.kind !== 'approve' || request.clearedEvidence) fail('INVALID_TRANSITION', 'Для устранения нужен одобренный план открытого блокера');
      activeRevision(getSpec(request.specId), request.specRevisionId);
      if (state.executions.some(e => e.remediatesBlockerId === request.id && !terminal.has(e.state))) fail('INVALID_TRANSITION', 'Попытка устранения уже существует');
      const execution: Execution = { id: id(), specId: request.specId, specRevisionId: request.specRevisionId, agentId: command.agentId, state: 'queued', kind: 'remediation', remediatesBlockerId: request.id, resumeAuthorized: true };
      emit('ExecutionCreated', { execution }, context(execution)); break;
    }
    case 'clearBlocker': {
      const request = getRequest(command.decisionRequestId); const remediation = getExecution(command.remediationExecutionId); agent(remediation); text(command.evidence, 'Подтверждение устранения');
      if (request.kind !== 'Blocker' || request.decision?.outcome.kind !== 'approve' || request.clearedEvidence || remediation.remediatesBlockerId !== request.id || remediation.state !== 'succeeded') fail('INVALID_TRANSITION', 'Снятие блокера требует завершённой разрешённой попытки устранения');
      emit('BlockerCleared', { decisionRequestId: request.id, remediationExecutionId: remediation.id, evidence: command.evidence }, { ...context(remediation), causationId: cause(e => e.type === 'ExecutionCompleted' && e.executionId === remediation.id && e.payload.result === 'succeeded') }); break;
    }
    case 'completeExecution': {
      const execution = getExecution(command.executionId); agent(execution); text(command.evidence, 'Подтверждение результата');
      if (!['succeeded', 'failed'].includes(command.result) || terminal.has(execution.state)) fail('INVALID_TRANSITION', 'Попытка уже завершена или некорректен результат');
      if (command.result === 'succeeded') { canRun(execution); if (execution.state !== 'running' || execution.stopRequested) fail('INVALID_TRANSITION', 'Для успеха требуется выполняющаяся разрешённая попытка'); }
      emit('ExecutionCompleted', { result: command.result, evidence: command.evidence, simulation: actor.id === AGENT_ID }, context(execution)); break;
    }
    case 'cancelExecution': case 'skipExecution': {
      human(); const execution = getExecution(command.executionId); text(command.reason, 'Причина');
      if (terminal.has(execution.state) || (command.type === 'skipExecution' && execution.state !== 'queued')) fail('INVALID_TRANSITION', 'Попытку нельзя отменить или пропустить в текущем состоянии');
      if (command.type === 'cancelExecution' && !['queued', 'paused'].includes(execution.state)) fail('INVALID_TRANSITION', 'Сначала запросите и подтвердите остановку выполняющейся работы');
      emit(command.type === 'cancelExecution' ? 'ExecutionCancelled' : 'ExecutionSkipped', { reason: command.reason }, context(execution)); break;
    }
    case 'requestStop': {
      human(); const execution = getExecution(command.executionId); text(command.reason, 'Причина остановки');
      if (terminal.has(execution.state) || execution.stopRequested) fail('INVALID_TRANSITION', 'Попытка уже завершена или остановка запрошена');
      emit('StopRequested', { reason: command.reason }, context(execution)); break;
    }
    case 'confirmStopped': {
      const execution = getExecution(command.executionId); agent(execution);
      if (!execution.stopRequested || terminal.has(execution.state)) fail('INVALID_TRANSITION', 'Нет ожидающего запроса остановки');
      emit('ExecutionPaused', {}, { ...context(execution), causationId: cause(e => (e.type === 'StopRequested' && e.executionId === execution.id) || (e.type === 'RevisionActivated' && e.specId === execution.specId) || (e.type === 'RoadmapStateChanged' && e.payload.state === 'frozen')) }); break;
    }
    case 'acceptSpec': {
      human(); const spec = getSpec(command.specId); activeRevision(spec, command.specRevisionId);
      if (spec.state !== 'in_progress') fail('INVALID_TRANSITION', 'Спецификация не готова к приёмке');
      const executions = state.executions.filter(e => e.specId === spec.id && e.specRevisionId === command.specRevisionId);
      if (!executions.some(e => e.kind === 'primary' && e.state === 'succeeded') || executions.some(e => !terminal.has(e.state))) fail('INVALID_TRANSITION', 'Нужно завершить актуальную основную попытку и все вспомогательные работы');
      if (state.requests.some(r => r.specId === spec.id && r.specRevisionId === command.specRevisionId && (r.state === 'pending' || (r.kind === 'Blocker' && !r.clearedEvidence)))) fail('INVALID_TRANSITION', 'Остались открытые решения или блокеры');
      if (!command.evidence || typeof command.evidence !== 'object' || Array.isArray(command.evidence)) fail('VALIDATION_ERROR', 'Нужны подтверждения DoD');
      const revision = state.revisions.find(r => r.id === command.specRevisionId)!;
      for (const criterion of revision.dod.filter(c => c.required)) text(command.evidence[criterion.id], `Подтверждение: ${criterion.text}`);
      emit('SpecAccepted', { evidence: command.evidence }, { specId: spec.id, specRevisionId: command.specRevisionId, causationId: cause(e => e.type === 'ExecutionCompleted' && e.specId === spec.id && e.specRevisionId === command.specRevisionId && e.payload.result === 'succeeded') }); break;
    }
    case 'invalidateSpec': {
      human(); const spec = getSpec(command.specId); text(command.reason, 'Причина инвалидации');
      if (spec.state === 'invalidated') fail('INVALID_TRANSITION', 'Спецификация уже неактуальна');
      emit('SpecInvalidated', { reason: command.reason }, { specId: spec.id, specRevisionId: spec.activeRevisionId ?? undefined }); break;
    }
    case 'addDependency': {
      human(); getSpec(command.from); getSpec(command.to); const type = command.relationship ?? 'depends_on';
      if (!['depends_on', 'derived_from', 'replaces', 'relates_to'].includes(type)) fail('VALIDATION_ERROR', 'Неизвестный тип связи');
      if (state.dependencies.some(d => d.from === command.from && d.to === command.to && d.type === type)) fail('VALIDATION_ERROR', 'Связь уже существует');
      const cycle = type === 'depends_on' ? findCycle(state.dependencies, command.from, command.to) : null;
      if (cycle) fail('DEPENDENCY_CYCLE', `Зависимость создаёт цикл: ${cycle.map(specId => getSpec(specId).humanId).join(' → ')}`, { path: cycle });
      if (type === 'depends_on' && getSpec(command.to).state !== 'idea' && getSpec(command.to).state !== 'specified') fail('INVALID_TRANSITION', 'Зависимость исполняемой или принятой спеки меняется новой ревизией');
      emit('DependencyAdded', { dependency: { id: id(), from: command.from, to: command.to, type } }); break;
    }
    case 'changeRoadmapState': {
      human(); const allowed: Record<ProjectState['roadmap']['state'], string[]> = { draft: ['active', 'archived'], active: ['frozen', 'archived'], frozen: ['active', 'archived'], archived: [] };
      if (!allowed[state.roadmap.state].includes(command.state)) fail('INVALID_TRANSITION', 'Недопустимый переход дорожной карты');
      if (command.state === 'active' && !state.specs.length) fail('INVALID_TRANSITION', 'Дорожная карта должна содержать спецификацию');
      if (command.state === 'archived' && state.executions.some(e => !terminal.has(e.state))) fail('INVALID_TRANSITION', 'Нужно завершить все попытки перед архивацией');
      emit('RoadmapStateChanged', { state: command.state }); break;
    }
    case 'createGitHubBinding': {
      human();const execution=getExecution(command.executionId);
      if(!Number.isSafeInteger(command.repositoryId)||command.repositoryId<1||typeof command.repositoryFullName!=='string'||!/^[-\w.]+\/[-\w.]+$/.test(command.repositoryFullName)||command.repositoryFullName.split('/').some(part=>['.','..'].includes(part)))fail('VALIDATION_ERROR','Нужен проверенный репозиторий GitHub.');
      if(typeof command.ref!=='string'||!command.ref.startsWith('refs/heads/')||command.ref.length>250||/[\s~^:?*\[\\]/.test(command.ref)||command.ref.includes('..')||command.ref.includes('@{')||command.ref.endsWith('/')||command.ref.endsWith('.')||command.ref.endsWith('.lock')||command.ref==='refs/heads/')fail('VALIDATION_ERROR','Нужна полная ссылка refs/heads/<ветка>.');
      if(state.githubBindings.some(binding=>!binding.revokedAt&&binding.repositoryId===command.repositoryId&&binding.ref===command.ref))fail('BINDING_CONFLICT','Репозиторий и ветка уже связаны с разрешённой попыткой.');
      const binding:GitHubBinding={id:id(),projectId:state.projectId,executionId:execution.id,specId:execution.specId,specRevisionId:execution.specRevisionId,repositoryId:command.repositoryId,repositoryFullName:command.repositoryFullName,ref:command.ref,createdAt:now,createdBy:actor.id};
      emit('GitHubBindingCreated',{binding},context(execution));break;
    }
    case 'revokeGitHubBinding': {
      human();const binding=state.githubBindings.find(binding=>binding.id===command.bindingId)??fail('NOT_FOUND','Подключение GitHub не найдено.');
      if(binding.revokedAt)fail('BINDING_REVOKED','Подключение уже отозвано.');
      emit('GitHubBindingRevoked',{bindingId:binding.id},{specId:binding.specId,specRevisionId:binding.specRevisionId,executionId:binding.executionId});break;
    }
    case 'recordGitHubCommit': {
      if(actor.kind!=='service'||actor.id!==GITHUB_SERVICE_ID)fail('FORBIDDEN','Проверенный коммит регистрирует только серверный GitHub-адаптер.');
      const binding=state.githubBindings.find(binding=>binding.id===command.bindingId)??fail('NOT_FOUND','Подключение GitHub не найдено.');
      if(binding.revokedAt)fail('BINDING_REVOKED','Подключение GitHub отозвано.');
      const commit=command.commit;
      if(!commit||commit.repositoryId!==binding.repositoryId||typeof commit.repositoryFullName!=='string'||!/^[-\w.]+\/[-\w.]+$/.test(commit.repositoryFullName)||!commit.fullSha||!/^[a-f0-9]{40}$/.test(commit.fullSha)||commit.url!==`https://github.com/${commit.repositoryFullName}/commit/${commit.fullSha}`||commit.verificationMethod!=='github-api-sha'||!Number.isFinite(Date.parse(commit.verifiedAt)))fail('VERIFICATION_FAILED','GitHub API не подтвердил ожидаемый репозиторий и полный SHA.');
      text(commit.title,'Описание коммита');text(command.deliveryId,'ID доставки');
      if(command.deliveryId.length>200||!/^[a-f0-9]{64}$/.test(command.payloadDigest))fail('VALIDATION_ERROR','Некорректные метаданные доставки GitHub.');
      const source:GitHubCommitSource={kind:'github_commit',bindingId:binding.id,repositoryId:binding.repositoryId,repositoryFullName:commit.repositoryFullName,ref:binding.ref,fullSha:commit.fullSha,url:commit.url,deliveryId:command.deliveryId,payloadDigest:command.payloadDigest,verifiedAt:commit.verifiedAt,verificationMethod:'github-api-sha'};
      emit('ActionReported',{actionId:`github:${binding.id}:${commit.fullSha}`,phase:'completed',title:commit.title,context:`GitHub commit в ${binding.ref}. Подтверждён объект коммита, а не качество кода или DoD.`,evidence:commit.url,historicalContext:getSpec(binding.specId).activeRevisionId!==binding.specRevisionId,source},{specId:binding.specId,specRevisionId:binding.specRevisionId,executionId:binding.executionId});break;
    }
    default: fail('VALIDATION_ERROR', 'Неизвестная команда');
  }
  return { state: replay([...state.events, ...events], state.projectId), events };
}
