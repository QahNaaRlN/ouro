import {applyCommand} from './engine';
import {currentDecisionRequests,openPhysicalBlockers} from './decision-lineage';
import {buildStateView} from './state-view';
import type {Actor,Command,DomainEvent,Execution,ProjectState,Spec,SpecState} from './types';
import {getVerificationPresentation} from './verification-presentation';

export type WorkTone='neutral'|'blue'|'amber'|'green'|'red'|'purple';
export type WorkIcon='circle-dashed'|'file-check-2'|'loader-circle'|'circle-help'|'pause'|'clipboard-check'|'circle-check'|'circle-x'|'ban'|'lock-keyhole'|'triangle-alert'|'clock-3';
export type StatusPresentation={label:string;code:string;tone:WorkTone;icon:WorkIcon;statusClass:string};
export type SpecWorkPresentation=StatusPresentation&{
  specState:SpecState;
  primaryExecution?:Execution;
  isRunning:boolean;
  /** Counts refer to current request lineages of the active revision. */
  pendingRequestCount:number;
  currentRequestCount:number;
  lastUpdatedAt:string|null;
  verification?:ReturnType<typeof getVerificationPresentation>;
  axes:{spec:StatusPresentation;attempt:StatusPresentation|null;acceptance:StatusPresentation};
};
export type WorkActionAvailability={allowed:boolean;reason?:string;code?:string};

const status=(label:string,code:string,tone:WorkTone,icon:WorkIcon,statusClass=code.toLowerCase()):StatusPresentation=>({label,code,tone,icon,statusClass});
const canonical:Record<string,StatusPresentation>={
  idea:status('Идея','IDEA','neutral','circle-dashed'),
  specified:status('Ожидание задано','SPECIFIED','neutral','file-check-2'),
  in_progress:status('В работе','IN_PROGRESS','blue','loader-circle'),
  blocked:status('Заблокировано','BLOCKED','amber','lock-keyhole'),
  done:status('Принято человеком','DONE','green','circle-check'),
  invalidated:status('Неактуально','INVALIDATED','neutral','ban'),
  queued:status('Ожидает агента','QUEUED','neutral','clock-3'),
  running:status('Выполняется','RUNNING','blue','loader-circle'),
  waiting_for_human:status('Ожидает человека','WAITING_FOR_HUMAN','amber','circle-help'),
  paused:status('Приостановлено','PAUSED','amber','pause'),
  succeeded:status('Результат предъявлен','SUCCEEDED','amber','clipboard-check'),
  failed:status('Попытка завершилась ошибкой','FAILED','red','circle-x'),
  cancelled:status('Отменено','CANCELLED','neutral','ban'),
  skipped:status('Пропущено','SKIPPED','neutral','ban'),
  pending:status('Нужно решение','PENDING','amber','circle-help'),
  resolved:status('Решение записано','RESOLVED','green','file-check-2'),
  withdrawn:status('Отозван','WITHDRAWN','neutral','ban'),
  superseded:status('Замещён','SUPERSEDED','neutral','file-check-2'),
};

/** UI codes do not replace the lowercase canonical domain states. */
export function getCanonicalStatusPresentation(value:string):StatusPresentation{
  return {...(canonical[value]??status(value,value.toUpperCase(),'neutral','circle-dashed'))};
}

export const getExecutionPresentation=(execution:Execution):StatusPresentation=>getCanonicalStatusPresentation(execution.state);

type EventIndex={byId:Map<string,DomainEvent>;direct:Map<string,DomainEvent>;updated:Map<string,string|null>};
const eventIndexes=new WeakMap<ProjectState,EventIndex>();
function lastSpecUpdate(state:ProjectState,spec:Spec):string|null{
  let index=eventIndexes.get(state);
  if(!index){
    index={byId:new Map(),direct:new Map(),updated:new Map()};
    for(const event of state.events){index.byId.set(event.id,event);if(event.specId)index.direct.set(event.specId,event);}
    eventIndexes.set(state,index);
  }
  if(index.updated.has(spec.id))return index.updated.get(spec.id)!;
  // state-view caches one authoritative replay for the whole event array, not one per spec.
  const stateChange=buildStateView(state,{axis:'spec',specId:spec.id}).history.at(-1)?.eventId;
  const changed=stateChange?index.byId.get(stateChange):undefined,direct=index.direct.get(spec.id);
  const latest=changed&&(!direct||changed.version>direct.version)?changed:direct;
  const at=latest?.occurredAt??null;index.updated.set(spec.id,at);return at;
}

/** A derived view only: it never emits SpecAccepted or rewrites an execution. */
export function getSpecWorkPresentation(state:ProjectState,spec:Spec):SpecWorkPresentation{
  const primaryExecution=state.executions.findLast(execution=>execution.specId===spec.id&&execution.specRevisionId===spec.activeRevisionId&&execution.kind==='primary');
  const requests=currentDecisionRequests(state).filter(request=>request.specId===spec.id&&request.specRevisionId===spec.activeRevisionId);
  const specAxis=getCanonicalStatusPresentation(spec.state);
  const attempt=primaryExecution?getExecutionPresentation(primaryExecution):null;
  const accepted=spec.state==='done'&&spec.acceptance?.revisionId===spec.activeRevisionId;
  const acceptance=accepted?status('Принято человеком','ACCEPTED','green','circle-check'):status('Не принято','NOT_ACCEPTED','neutral','circle-dashed');
  let work=specAxis;
  if(!['done','invalidated','idea'].includes(spec.state)){
    const stopUnknown=state.executions.some(execution=>execution.specId===spec.id&&execution.stopConfirmation==='unknown');
    if(stopUnknown)work=status('Остановка не подтверждена','EXTERNAL_STOP_UNCONFIRMED','amber','triangle-alert');
    else if(spec.state==='blocked'){
      if(primaryExecution?.state==='waiting_for_human')work=getCanonicalStatusPresentation('waiting_for_human');
      else if(primaryExecution?.state==='paused')work=getCanonicalStatusPresentation('paused');
      else if(openPhysicalBlockers(state,spec.id).length)work=status('Не устранён блокер','BLOCKED','amber','lock-keyhole');
    }else if(primaryExecution?.stopRequested)work=status('Остановка запрошена','STOP_REQUESTED','amber','pause');
    else if(primaryExecution?.state==='succeeded')work=status('Ожидает приёмки','AWAITING_ACCEPTANCE','amber','clipboard-check');
    else if(attempt)work=attempt;
  }
  const revision=state.revisions.find(item=>item.id===(spec.activeRevisionId??spec.revisionIds.at(-1)));
  return {...work,specState:spec.state,primaryExecution,isRunning:primaryExecution?.state==='running'&&!primaryExecution.stopRequested&&spec.state==='in_progress',pendingRequestCount:requests.filter(request=>request.state==='pending').length,currentRequestCount:requests.length,lastUpdatedAt:lastSpecUpdate(state,spec),axes:{spec:specAxis,attempt,acceptance},...(revision?.verification?{verification:getVerificationPresentation(state,revision)}:{})};
}

/**
 * Read-only domain guard probe, like buildFlowRuntimeView. The returned temporary
 * projection is discarded; current server identity/role/registration checks still
 * run for the real write. No receipt or event is persisted by this function.
 */
export function probeWorkAction(state:ProjectState,body:Record<string,unknown>,actor:Actor):WorkActionAvailability{
  let probeId=0;
  try{
    applyCommand(state,{...body,requestId:'work-view-guard-probe',expectedVersion:state.version} as Command,actor,{now:state.events.at(-1)?.occurredAt??'1970-01-01T00:00:00.000Z',id:()=>`work-view-probe-${state.version}-${++probeId}`});
    return {allowed:true};
  }catch(error){
    const failure=error as {code?:string;message?:string};
    return {allowed:false,reason:failure.message??'Действие недоступно.',...(failure.code?{code:failure.code}:{})};
  }
}

/** Structural eligibility only; entered evidence is validated separately on submit. */
export function getAcceptanceAvailability(state:ProjectState,spec:Spec,revisionId:string,actor:Actor):WorkActionAvailability{
  const revision=state.revisions.find(item=>item.id===revisionId&&item.specId===spec.id);
  if(!revision)return {allowed:false,code:'NOT_FOUND',reason:'Ревизия этой спецификации не найдена.'};
  const evidence=Object.fromEntries(revision.dod.filter(criterion=>criterion.required).map(criterion=>[criterion.id,'Read-only availability probe; not acceptance evidence.']));
  return probeWorkAction(state,{type:'acceptSpec',specId:spec.id,specRevisionId:revision.id,evidence},actor);
}
