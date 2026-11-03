'use client';

import {useState} from 'react';
import {Bot,ClipboardCheck,Cpu,FlaskConical,ShieldCheck,UserRound} from 'lucide-react';
import type {ProjectState} from '@/packages/core/src';
import {selectWorkspaceHistory,workspaceHistoryEntry,workspaceHistoryRelations,workspaceHistoryRowLabel,type WorkspaceEventProvenance} from '@/lib/workspace-history-view';
import {WorkspaceAccordion,WorkspaceCopyValue} from './workspace-ui';
import reviewStyles from './workspace-grouped-review.module.css';

type HistoryProps={state:ProjectState;specId?:string;revisionId?:string;executionId?:string;onOpenEvent:(eventId:string)=>void;selectedEventId?:string};
const date=(value:string)=>new Date(value).toLocaleString('ru-RU');
function HistoryProvenance({provenance}:{provenance:WorkspaceEventProvenance}){
  const Icon={human_acceptance:ClipboardCheck,verified_github:ShieldCheck,agent_report:Bot,human_action:UserRound,system_record:Cpu,simulation:FlaskConical}[provenance.kind];
  return <span className={`ws-history-provenance ws-history-provenance-${provenance.tone}`} data-provenance={provenance.kind}><Icon size={13} aria-hidden="true"/>{provenance.label}</span>;
}

export function WorkspaceHistory({state,specId,revisionId,executionId,onOpenEvent,selectedEventId}:HistoryProps){
  const scopeKey=JSON.stringify([state.projectId,specId,revisionId,executionId]),[expandedScope,setExpandedScope]=useState<string|null>(null),all=expandedScope===scopeKey;
  const events=selectWorkspaceHistory(state,{specId,revisionId,executionId}),visible=all?events:events.slice(0,40);
  return <section className="ws-panel ws-history-panel" aria-label={specId?'История спеки':'История проекта'}>
    <div className="ws-section-top"><h2>{specId?'История спеки':'История проекта'}</h2><span className="ws-muted">{events.length} событий</span></div>
    {!events.length&&<p className="ws-muted">Для выбранной области событий пока нет.</p>}
    <ol className="ws-history-list">{visible.map(event=>{const entry=workspaceHistoryEntry(event);return <li key={event.id} data-event-id={event.id} data-event-type={event.type}><button type="button" className="ws-history-row" aria-label={workspaceHistoryRowLabel(entry,date(entry.occurredAt),entry.specId?state.specs.find(spec=>spec.id===entry.specId)?.humanId??entry.specId:undefined)} aria-pressed={selectedEventId===event.id} onClick={()=>onOpenEvent(event.id)}><span className="ws-history-row-main"><strong>{entry.title}</strong><span className="ws-history-row-meta"><HistoryProvenance provenance={entry.provenance}/><span>{entry.label}</span><span>{entry.actor}</span>{entry.specId&&<span>{state.specs.find(spec=>spec.id===entry.specId)?.humanId??entry.specId}</span>}</span>{entry.reason&&<span className={reviewStyles.historyFact} data-history-fact="reason"><span className={reviewStyles.historyFactLabel}>Причина: </span>{entry.reason}</span>}{entry.outcome&&<span className={reviewStyles.historyFact} data-history-fact="outcome"><span className={reviewStyles.historyFactLabel}>Результат: </span>{entry.outcome}</span>}</span><span className="ws-history-row-time">Событие №{entry.version}<br/>{date(entry.occurredAt)}</span></button></li>;})}</ol>
    {events.length>40&&<button type="button" onClick={()=>setExpandedScope(all?null:scopeKey)}>{all?'Последние 40 событий':'Показать всю историю'}</button>}
  </section>;
}

export function WorkspaceEventDetail({state,eventId,onClose,onOpenEvent}:{state:ProjectState;eventId:string;onClose?:()=>void;onOpenEvent?:(eventId:string)=>void}){
  const event=state.events.find(candidate=>candidate.projectId===state.projectId&&candidate.id===eventId);
  if(!event)return <section className="ws-event-detail"><p className="ws-muted">Событие не найдено в истории этого проекта.</p>{onClose&&<button type="button" onClick={onClose}>Закрыть</button>}</section>;
  const entry=workspaceHistoryEntry(event),relations=workspaceHistoryRelations(state,event);
  return <section className="ws-event-detail" aria-label="Подробности события"><p className="ws-muted">{entry.label} · событие №{entry.version}</p><HistoryProvenance provenance={entry.provenance}/><h3>{entry.title}</h3>
    <dl><div><dt>Автор и время</dt><dd>{entry.actor} · {date(entry.occurredAt)}</dd></div>
      <div><dt>Идентификатор события</dt><dd><WorkspaceCopyValue value={event.id} label="ID события"/></dd></div>
      {event.specId&&<div><dt>Спецификация</dt><dd><WorkspaceCopyValue value={event.specId} label="ID спеки" displayValue={state.specs.find(spec=>spec.id===event.specId)?.humanId??event.specId}/></dd></div>}
      {event.specRevisionId&&<div><dt>Ревизия</dt><dd><WorkspaceCopyValue value={event.specRevisionId} label="ID ревизии"/></dd></div>}
      {event.executionId&&<div><dt>Попытка</dt><dd><WorkspaceCopyValue value={event.executionId} label="ID попытки"/></dd></div>}
      {entry.phase&&<div><dt>Фаза</dt><dd>{entry.phase}</dd></div>}{entry.reason&&<div><dt>Причина из записи</dt><dd>{entry.reason}</dd></div>}{entry.outcome&&<div><dt>Результат из записи</dt><dd>{entry.outcome}</dd></div>}{entry.evidence&&<div><dt>Предъявленное основание</dt><dd>{entry.evidence}</dd></div>}
      {event.causationId&&<div><dt>Связанное основание · causationId</dt><dd><WorkspaceCopyValue value={event.causationId} label="causationId"/>{relations.cause&&onOpenEvent&&<button type="button" onClick={()=>onOpenEvent(relations.cause!.id)}>Открыть событие №{relations.cause.version}</button>}{!relations.cause&&<p className="ws-muted">Исходное событие отсутствует в текущем снимке.</p>}</dd></div>}
      {relations.effects.length>0&&<div><dt>События с прямой причинной ссылкой</dt><dd className="ws-event-links">{relations.effects.map(effect=>onOpenEvent?<button type="button" key={effect.id} onClick={()=>onOpenEvent(effect.id)}>Событие №{effect.version}</button>:<WorkspaceCopyValue key={effect.id} value={effect.id} label={`Событие №${effect.version}`}/>)}</dd></div>}
    </dl>
    <WorkspaceAccordion title="Полная исходная запись"><pre className="ws-event-raw">{JSON.stringify(event,null,2)}</pre></WorkspaceAccordion>
  </section>;
}
