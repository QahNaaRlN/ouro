import type {DomainEvent,ProjectState} from '../packages/core/src/types';

export type WorkspaceHistoryScope={projectId?:string;specId?:string;revisionId?:string;executionId?:string};
export type WorkspaceEventProvenance={kind:'human_acceptance'|'verified_github'|'agent_report'|'human_action'|'system_record'|'simulation';label:string;tone:'positive'|'neutral'|'attention'};
export const workspaceHistoryEventNames:Record<string,string>={ProjectInitialized:'Проект создан',SpecCreated:'Задача создана',RevisionActivated:'Ожидание активировано',RevisionProposed:'Предложена ревизия',ExecutionCreated:'Попытка назначена',ExecutionStarted:'Агент подтвердил начало',ActionReported:'Отчёт о действии',DecisionRequested:'Запрос к человеку',DecisionResolved:'Решение человека',DecisionApplied:'Агент подтвердил применение',ResumeAuthorized:'Человек разрешил продолжение',ExecutionResumed:'Агент подтвердил продолжение',ExecutionCompleted:'Предъявлен результат попытки',SpecAccepted:'Человек принял DoD',StopRequested:'Запрошена остановка',ExecutionPaused:'Агент подтвердил остановку',ExecutionCancelled:'Попытка отменена',BlockerCleared:'Агент подтвердил устранение блокера',AgentProposalSubmitted:'Агент предложил сводку или спеку',AgentProposalRevisionSubmitted:'Агент уточнил предложение',AgentProposalReviewed:'Предложение рассмотрено',AgentProposalDismissed:'Предложение отклонено',AgentProposalAdopted:'Предложение принято в черновик',FlowStepStarted:'Проход шага начат',FlowStepCompleted:'Проход шага завершён',FlowStepFailed:'Ошибка прохода шага',FlowStepSkipped:'Проход шага пропущен человеком',FlowStepRetried:'Разрешён повтор шага',FlowEdgeTraversed:'Переход процесса зафиксирован'};
const record=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
Object.assign(workspaceHistoryEventNames,{VerificationRunRecorded:'Записан прогон проверки',VerificationRunReviewed:'Человек оценил прогон',VerificationSliceDeclared:'Указан текущий срез проверки',VerificationPhaseRecorded:'Записана фаза работы и проверки'});
Object.assign(workspaceHistoryEventNames,{VerificationCycleStarted:'Начат цикл проверки',VerificationCycleAdvanced:'Записан переход цикла проверки',VerificationRefactorAdmitted:'Человек рассмотрел рефакторинг тестов',VerificationObservationConfigured:'Настроено наблюдение входов проверки',VerificationWorkspaceObserved:'Записан снимок файлов и окружения'});
const text=(value:unknown):string|undefined=>typeof value==='string'&&value.trim()?value:undefined;

/** Actor authority and structured source metadata determine provenance, never an author's prose or display name. */
export function workspaceEventProvenance(event:DomainEvent):WorkspaceEventProvenance{
  if(event.payload.simulation===true)return {kind:'simulation',label:'Учебная симуляция',tone:'attention'};
  if(event.actor.kind==='human'&&event.type==='SpecAccepted')return {kind:'human_acceptance',label:'Приёмка человеком',tone:'positive'};
  const source=record(event.payload.source);
  if(event.actor.kind==='service'&&source?.kind==='github_commit'&&source.verificationMethod==='github-api-sha')return {kind:'verified_github',label:'Проверенный источник GitHub',tone:'positive'};
  if(event.actor.kind==='agent')return {kind:'agent_report',label:'Сообщение агента',tone:'neutral'};
  if(event.actor.kind==='human')return {kind:'human_action',label:'Действие человека',tone:'neutral'};
  return {kind:'system_record',label:'Системная запись',tone:'neutral'};
}

/** Scope fields are conjunctive. Missing fields and another project never fall back to the latest item. */
export function selectWorkspaceHistory(state:Pick<ProjectState,'projectId'|'events'>,scope:WorkspaceHistoryScope={}):DomainEvent[]{
  if(scope.projectId!==undefined&&scope.projectId!==state.projectId)return [];
  return state.events.filter(event=>event.projectId===state.projectId&&(scope.specId===undefined||event.specId===scope.specId)&&(scope.revisionId===undefined||event.specRevisionId===scope.revisionId)&&(scope.executionId===undefined||event.executionId===scope.executionId)).toSorted((a,b)=>b.version-a.version);
}

export function workspaceHistoryEntry(event:DomainEvent){
  const payload=event.payload,request=record(payload.request),decision=record(payload.decision),outcome=record(decision?.outcome);
  const label=workspaceHistoryEventNames[event.type]??event.type;
  const phase=text(payload.phase);
  const result=outcome?.kind==='answer'?text(outcome.answer):outcome?.kind==='approve'&&text(outcome.chosenOptionId)?`Выбран вариант: ${outcome.chosenOptionId}`:outcome?.kind==='reject'?text(outcome.reason):text(payload.result);
  return {id:event.id,type:event.type,label,title:text(payload.title)??text(request?.title)??label,actor:event.actor.name??event.actor.id,occurredAt:event.occurredAt,version:event.version,phase:phase?({started:'Начато',completed:'Выполнено',failed:'Ошибка'} as Record<string,string>)[phase]??phase:undefined,reason:text(payload.reason)??text(request?.reason),outcome:result,evidence:text(payload.evidence),specId:event.specId,revisionId:event.specRevisionId,executionId:event.executionId,causationId:event.causationId,correlationId:event.correlationId,provenance:workspaceEventProvenance(event)};
}

const rowExcerpt=(value:string,limit:number):string=>{
  const characters=Array.from(value.replace(/\s+/gu,' ').trim());
  return characters.length>limit?characters.slice(0,limit-1).join('')+'…':characters.join('');
};

/** Only the accessible row name is shortened; the event and its detail fields stay intact. */
export function workspaceHistoryRowLabel(entry:ReturnType<typeof workspaceHistoryEntry>,dateLabel:string,specLabel?:string):string{
  return [rowExcerpt(entry.title,100),`Тип: ${rowExcerpt(entry.label,64)}`,`Автор: ${rowExcerpt(entry.actor,64)}`,entry.provenance.label,`Событие №${entry.version}`,dateLabel,
    ...(specLabel?[`Спецификация: ${rowExcerpt(specLabel,64)}`]:[]),
    ...(entry.reason?[`Причина: ${rowExcerpt(entry.reason,120)}`]:[]),
    ...(entry.outcome?[`Результат: ${rowExcerpt(entry.outcome,120)}`]:[]),
    'Полное содержание — в подробностях.',
  ].join('. ');
}

/** Chronological order or a shared correlation never manufactures a causal link. */
export function workspaceHistoryRelations(state:Pick<ProjectState,'projectId'|'events'>,event:DomainEvent){
  if(event.projectId!==state.projectId)return {cause:undefined,effects:[] as DomainEvent[]};
  const events=state.events.filter(candidate=>candidate.projectId===state.projectId);
  return {cause:event.causationId?events.find(candidate=>candidate.id===event.causationId):undefined,effects:events.filter(candidate=>candidate.causationId===event.id).toSorted((a,b)=>a.version-b.version)};
}
