'use client';
import {twMerge} from 'tailwind-merge';
import {workspacePresentation as ui} from './workspace-presentation';

import {useState} from 'react';
import {Bot,ClipboardCheck,Cpu,FlaskConical,ShieldCheck,UserRound} from 'lucide-react';
import type {ProjectState} from '@/packages/core/src';
import {selectWorkspaceHistory,workspaceHistoryEntry,workspaceHistoryRelations,workspaceHistoryRowLabel,type WorkspaceEventProvenance} from '@/lib/workspace-history-view';
import {WorkspaceAccordion,WorkspaceCopyValue} from './workspace-ui';

/** Оформление элементов этого модуля; общие элементы используют workspacePresentation. */
const presentationSlots={
  historyProvenance:"inline-flex w-fit max-w-full items-center gap-[5px] rounded-[5px] bg-ouro-bg px-[6px] py-[2px] text-[11px] leading-[1.5] font-normal text-ouro-text-muted [&>svg]:shrink-0",
  historyPanel:"min-w-0 rounded-[10px] border-solid border-ouro-border at-most-520:rounded-[8px] mb-[22px] border-0 bg-transparent p-0 at-most-520:p-0",
  historyRow:"flex w-full items-start justify-between gap-[18px] rounded-none border-0 bg-transparent px-0 py-[17px] text-left aria-pressed:bg-ouro-muted at-most-560:gap-[12px]",
  historyFact:"line-clamp-2 whitespace-pre-wrap text-[12px] leading-[1.7] font-normal text-ouro-text-muted [overflow-wrap:anywhere]",
  historyRowTime:"shrink-0 text-right text-[11px] leading-[1.7] font-normal whitespace-nowrap text-ouro-text-muted at-most-560:max-w-[112px] at-most-560:whitespace-normal",
} as const;

type HistoryProps={state:ProjectState;specId?:string;revisionId?:string;executionId?:string;onOpenEvent:(eventId:string)=>void;selectedEventId?:string};
const date=(value:string)=>new Date(value).toLocaleString('ru-RU');
function HistoryProvenance({provenance,className=''}:{provenance:WorkspaceEventProvenance;className?:string}){
  const Icon={human_acceptance:ClipboardCheck,verified_github:ShieldCheck,agent_report:Bot,human_action:UserRound,system_record:Cpu,simulation:FlaskConical}[provenance.kind];
  return <span className={twMerge(`ws-history-provenance ws-history-provenance-${provenance.tone}`,presentationSlots.historyProvenance,provenance.tone==='positive'?'bg-[color-mix(in_srgb,var(--positive)_10%,var(--bg))] text-ouro-positive':provenance.tone==='attention'?'bg-[color-mix(in_srgb,var(--attention)_10%,var(--bg))] text-[color:var(--attention)]':undefined,className)} data-provenance={provenance.kind}><Icon  size={13} aria-hidden="true"/>{provenance.label}</span>;
}

export function WorkspaceHistory({state,specId,revisionId,executionId,onOpenEvent,selectedEventId}:HistoryProps){
  const scopeKey=JSON.stringify([state.projectId,specId,revisionId,executionId]),[expandedScope,setExpandedScope]=useState<string|null>(null),all=expandedScope===scopeKey;
  const events=selectWorkspaceHistory(state,{specId,revisionId,executionId}),visible=all?events:events.slice(0,40);
  return <section className={twMerge("ws-panel ws-history-panel",presentationSlots.historyPanel,"border-none border-current")} aria-label={specId?'История спеки':'История проекта'}>
    <div className={twMerge("ws-section-top",ui.sectionHeading)}><h2 className={twMerge(ui.h2,"mb-0","leading-[1.4]")}>{specId?'История спеки':'История проекта'}</h2><span className={twMerge("ws-muted",ui.muted)}>{events.length} событий</span></div>
    {!events.length&&<p className={twMerge(ui.paragraph,"ws-muted","m-[8px_0_20px] text-[12px] text-ouro-text-muted",ui.paragraph)}>Для выбранной области событий пока нет.</p>}
    <ol className={twMerge("ws-history-list","m-0 list-none p-0")}>{visible.map(event=>{const entry=workspaceHistoryEntry(event);return <li className={"not-first:border-0 not-first:border-t not-first:border-solid not-first:border-ouro-border"} key={event.id} data-event-id={event.id} data-event-type={event.type}><button type="button" className={twMerge(ui.button,"ws-history-row",presentationSlots.historyRow,"leading-[1.6]","border-none border-current")} aria-label={workspaceHistoryRowLabel(entry,date(entry.occurredAt),entry.specId?state.specs.find(spec=>spec.id===entry.specId)?.humanId??entry.specId:undefined)} aria-pressed={selectedEventId===event.id} onClick={()=>onOpenEvent(event.id)}><span className={twMerge("ws-history-row-main","grid min-w-0 gap-[7px]")}><strong className={"text-[13px] leading-[1.6] font-medium"}>{entry.title}</strong><span className={twMerge("ws-history-row-meta","flex flex-wrap gap-x-[12px] gap-y-[4px] text-[11px] leading-[1.6] text-ouro-text-muted")}><HistoryProvenance provenance={entry.provenance}/><span>{entry.label}</span><span>{entry.actor}</span>{entry.specId&&<span>{state.specs.find(spec=>spec.id===entry.specId)?.humanId??entry.specId}</span>}</span>{entry.reason&&<span className={presentationSlots.historyFact} data-history-fact="reason"><span className={"font-medium text-ouro-text"}>Причина: </span>{entry.reason}</span>}{entry.outcome&&<span className={presentationSlots.historyFact} data-history-fact="outcome"><span className={"font-medium text-ouro-text"}>Результат: </span>{entry.outcome}</span>}</span><span className={twMerge("ws-history-row-time",presentationSlots.historyRowTime)}>Событие №{entry.version}<br/>{date(entry.occurredAt)}</span></button></li>;})}</ol>
    {events.length>40&&<button className={twMerge(ui.button,"leading-[1.6]")} type="button" onClick={()=>setExpandedScope(all?null:scopeKey)}>{all?'Последние 40 событий':'Показать всю историю'}</button>}
  </section>;
}

export function WorkspaceEventDetail({state,eventId,onClose,onOpenEvent}:{state:ProjectState;eventId:string;onClose?:()=>void;onOpenEvent?:(eventId:string)=>void}){
  const event=state.events.find(candidate=>candidate.projectId===state.projectId&&candidate.id===eventId);
  if(!event)return <section className="ws-event-detail"><p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>Событие не найдено в истории этого проекта.</p>{onClose&&<button className={twMerge(ui.button,"leading-[1.6]")} type="button" onClick={onClose}>Закрыть</button>}</section>;
  const entry=workspaceHistoryEntry(event),relations=workspaceHistoryRelations(state,event);
  return <section className="ws-event-detail" aria-label="Подробности события"><p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>{entry.label} · событие №{entry.version}</p><HistoryProvenance className={twMerge("m-[8px_0_12px]")} provenance={entry.provenance}/><h3 className={twMerge(ui.h3,"[overflow-wrap:anywhere]","leading-[1.5]")}>{entry.title}</h3>
    <dl className={"my-[20px] grid gap-[15px]"}><div><dt className={"mb-[5px] text-[11px] text-ouro-text-muted"}>Автор и время</dt><dd className={"m-0 text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]"}>{entry.actor} · {date(entry.occurredAt)}</dd></div>
      <div><dt className={"mb-[5px] text-[11px] text-ouro-text-muted"}>Идентификатор события</dt><dd className={"m-0 text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]"}><WorkspaceCopyValue value={event.id} label="ID события"/></dd></div>
      {event.specId&&<div><dt className={"mb-[5px] text-[11px] text-ouro-text-muted"}>Спецификация</dt><dd className={"m-0 text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]"}><WorkspaceCopyValue value={event.specId} label="ID спеки" displayValue={state.specs.find(spec=>spec.id===event.specId)?.humanId??event.specId}/></dd></div>}
      {event.specRevisionId&&<div><dt className={"mb-[5px] text-[11px] text-ouro-text-muted"}>Ревизия</dt><dd className={"m-0 text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]"}><WorkspaceCopyValue value={event.specRevisionId} label="ID ревизии"/></dd></div>}
      {event.executionId&&<div><dt className={"mb-[5px] text-[11px] text-ouro-text-muted"}>Попытка</dt><dd className={"m-0 text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]"}><WorkspaceCopyValue value={event.executionId} label="ID попытки"/></dd></div>}
      {entry.phase&&<div><dt className={"mb-[5px] text-[11px] text-ouro-text-muted"}>Фаза</dt><dd className={"m-0 text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]"}>{entry.phase}</dd></div>}{entry.reason&&<div><dt className={"mb-[5px] text-[11px] text-ouro-text-muted"}>Причина из записи</dt><dd className={"m-0 text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]"}>{entry.reason}</dd></div>}{entry.outcome&&<div><dt className={"mb-[5px] text-[11px] text-ouro-text-muted"}>Результат из записи</dt><dd className={"m-0 text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]"}>{entry.outcome}</dd></div>}{entry.evidence&&<div><dt className={"mb-[5px] text-[11px] text-ouro-text-muted"}>Предъявленное основание</dt><dd className={"m-0 text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]"}>{entry.evidence}</dd></div>}
      {event.causationId&&<div><dt className={"mb-[5px] text-[11px] text-ouro-text-muted"}>Связанное основание · causationId</dt><dd className={"m-0 text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]"}><WorkspaceCopyValue value={event.causationId} label="causationId"/>{relations.cause&&onOpenEvent&&<button className={twMerge(ui.button,"leading-[1.6]")} type="button" onClick={()=>onOpenEvent(relations.cause!.id)}>Открыть событие №{relations.cause.version}</button>}{!relations.cause&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>Исходное событие отсутствует в текущем снимке.</p>}</dd></div>}
      {relations.effects.length>0&&<div><dt className={"mb-[5px] text-[11px] text-ouro-text-muted"}>События с прямой причинной ссылкой</dt><dd className={twMerge("ws-event-links","flex flex-wrap gap-[8px] m-0 text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]")}>{relations.effects.map(effect=>onOpenEvent?<button className={twMerge(ui.button,"leading-[1.6]")} type="button" key={effect.id} onClick={()=>onOpenEvent(effect.id)}>Событие №{effect.version}</button>:<WorkspaceCopyValue key={effect.id} value={effect.id} label={`Событие №${effect.version}`}/>)}</dd></div>}
    </dl>
    <WorkspaceAccordion title="Полная исходная запись"><pre className={twMerge(ui.pre,"ws-event-raw","whitespace-pre-wrap [overflow-wrap:anywhere]")}>{JSON.stringify(event,null,2)}</pre></WorkspaceAccordion>
  </section>;
}
