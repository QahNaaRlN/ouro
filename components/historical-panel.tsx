'use client';

import {WorkspaceAccordion} from './workspace-ui';
import {AppSelect} from './app-select';
import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, FileText, History, LockKeyhole } from 'lucide-react';
import { projectAtCursor } from '@/packages/core/src/history';
import type { ProjectState } from '@/packages/core/src';
import { Status } from './roadmap';
import { StateTransitions } from './state-transitions';
import {twMerge} from 'tailwind-merge';
import {historicalPresentation as ui} from './historical-presentation';
import {WorkspaceVerification} from './verification-panel';

/** Показывает историческую проекцию проекта на заданном курсоре с возвратом к текущему состоянию. */
export default function HistoricalPanel({latest,cursor,onReturn}:{latest:ProjectState;cursor:number;onReturn:()=>void}){
  const [selected,setSelected]=useState(''),[selectedRevisionId,setSelectedRevisionId]=useState(''),[tab,setTab]=useState<'expectation'|'states'|'events'>('expectation');
  const result=useMemo(()=>{
    try{return {state:projectAtCursor(latest.events,cursor,latest.projectId),error:''};}
    catch(error){return {state:null,error:error instanceof Error?error.message:'Историческая проекция недоступна'};}
  },[latest.events,latest.projectId,cursor]);
  const state=result.state;
  const roadmapNames={draft:'Черновик',active:'Активна',frozen:'Заморожена',archived:'В архиве'};
  const flowKinds={action:'Действие',condition:'Условие',question:'Вопрос человеку',fork:'Развилка',blocker:'Блокер',wait:'Ожидание',result:'Результат'};
  const spec=state?.specs.find(s=>s.id===selected)??state?.specs[0];
  const revision=selectedRevisionId?state?.revisions.find(r=>r.id===selectedRevisionId&&r.specId===spec?.id):state?.revisions.find(r=>r.id===spec?.activeRevisionId)??state?.revisions.findLast(r=>r.specId===spec?.id);
  const exportSnapshot=()=>{
    if(!state)return;
    const data={format:'ouro-historical-export',schemaVersion:1,projectId:state.projectId,cursor:state.version,exportedAt:new Date().toISOString(),events:state.events,state};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`ouro-historical-cursor-${state.version}.json`;link.click();URL.revokeObjectURL(url);
  };
  return <section className={twMerge("historical-panel",ui.root)} aria-label="Историческое состояние">
    <div className={twMerge("historical-banner",ui.banner)}><div className={ui.bannerBody}><LockKeyhole size={20}/><div><strong className={ui.bannerTitle}>Только чтение · Состояние на cursor {cursor}</strong><p className={ui.bannerCopy}>Последний cursor {latest.version}. Живые события поступают в текущий проект; эта точка закреплена.</p></div></div><button type="button" className={`btn ${ui.bannerAction}`} onClick={onReturn}><ArrowLeft size={15}/>Вернуться к текущей работе</button></div>
    <div className={twMerge("page-heading",ui.heading)}><div><div className="eyebrow">СОСТОЯНИЕ ИЗ СОХРАНЁННЫХ ФАКТОВ</div><h1>Историческое состояние</h1><p>Решения, ожидания и попытки показаны такими, какими были на выбранной границе истории.</p></div><button type="button" className={`btn ${ui.export}`} disabled={!state} onClick={exportSnapshot}><ArrowDownToLine size={16}/>Экспорт состояния JSON</button></div>
    {result.error?<p className="process-error" role="alert">Не удалось открыть выбранную точку: {result.error}</p>:state&&<>
      <div className={twMerge("historical-summary",ui.summary)}><span>Карта: <strong className={ui.summaryValue}>{roadmapNames[state.roadmap.state]}</strong></span><span>Спек: <strong className={ui.summaryValue}>{state.specs.length}</strong></span><span>Попыток: <strong className={ui.summaryValue}>{state.executions.length}</strong></span><span>Запросов: <strong className={ui.summaryValue}>{state.requests.length}</strong></span><span>Фактов: <strong className={ui.summaryValue}>{state.events.length}</strong></span></div>
      {revision&&<WorkspaceVerification key={revision.id} state={state} revision={revision} command={async()=>false} disabled readOnly onOpen={(id,revisionId)=>{setSelected(id);setSelectedRevisionId(revisionId);}}/>}
      {!state.specs.length?<div className="empty-state"><History size={32}/><p>В этой точке спеки ещё не созданы.</p></div>:<>
        <label className={twMerge("historical-picker",ui.picker)}>Спецификация в историческом состоянии<AppSelect aria-label="Спецификация в историческом состоянии" value={spec?.id??''} onValueChange={selectedValue=>{setSelected(selectedValue);setSelectedRevisionId('');}}>{state.specs.map(s=><option value={s.id} key={s.id}>{s.humanId} — {s.title}</option>)}</AppSelect></label>
        <div className={twMerge("historical-spec-heading",ui.specHeading)}><div><span className={twMerge("mono",ui.specId)}>{spec?.humanId}</span><h2 className={ui.specTitle}>{spec?.title}</h2></div>{spec&&<Status state={spec.state}/>}</div>
        <div className={twMerge("segmented historical-tabs",ui.tabs)}><button type="button" className={twMerge(ui.tab,tab==='expectation'?'selected':'')} onClick={()=>setTab('expectation')}><FileText size={14}/>Ожидание и факты</button><button type="button" className={twMerge(ui.tab,tab==='states'?'selected':'')} onClick={()=>setTab('states')}>Состояния в этой точке</button><button type="button" className={twMerge(ui.tab,tab==='events'?'selected':'')} onClick={()=>setTab('events')}><History size={14}/>Источники</button></div>
        {tab==='expectation'&&<div className={twMerge("historical-grid",ui.grid)}><article className={twMerge("historical-card",ui.card)}><span className="quiet-label">РЕВИЗИЯ r{revision?.revision??'—'} · {spec?.activeRevisionId?'АКТИВНА В ЭТОЙ ТОЧКЕ':'БЕЗ АКТИВАЦИИ'}</span><h3 className={ui.cardTitle}>{revision?.title}</h3><p className={ui.copy}>{revision?.goal}</p><h4 className={ui.cardSubtitle}>Критерии DoD</h4><ul className={ui.list}>{revision?.dod.map(c=><li className={ui.copy} key={c.id}>{c.text}{c.required?' · обязательный':''}</li>)}</ul>{(['constraints','assumptions','risks','inputs'] as const).map((key,index)=>revision?.[key]&&<section key={key}><h4 className={ui.cardSubtitle}>{['Ограничения','Допущения','Риски','Входные данные'][index]}</h4><p className={ui.copy}>{revision[key]}</p></section>)}{revision?.flow&&<section><h4 className={ui.cardSubtitle}>Схема процесса</h4><ol className={ui.list}>{revision.flow.nodes.map(n=><li className={ui.copy} key={n.id}><strong>{n.title}</strong> · {flowKinds[n.kind]} · {n.description}</li>)}</ol><ul className={ui.list}>{revision.flow.edges.map(e=><li className={ui.copy} key={e.id}>{revision.flow!.nodes.find(n=>n.id===e.source)?.title} → {revision.flow!.nodes.find(n=>n.id===e.target)?.title}: {e.label}</li>)}</ul></section>}</article><div><article className={twMerge("historical-card",ui.card)}><h3 className={ui.cardTitle}>Попытки исполнения</h3>{state.executions.filter(e=>e.specId===spec?.id).length?state.executions.filter(e=>e.specId===spec?.id).map(e=><div className={twMerge("historical-fact",ui.fact)} key={e.id}><Status state={e.state}/><code className={ui.factCode}>{e.id}</code>{e.stopRequested&&<p className={ui.copy}>Остановка запрошена · ACK не получен</p>}{e.stopConfirmation==='unknown'&&<p className={ui.copy}>Фактическая остановка не подтверждена</p>}{e.stopAttestation&&<p className={ui.copy}>Внешняя остановка засвидетельствована оператором: {e.stopAttestation.evidence}</p>}{e.resultEvidence&&<p className={ui.copy}>{e.resultEvidence}</p>}</div>):<p className={ui.copy}>Попыток ещё нет.</p>}</article><article className={twMerge("historical-card",ui.card)}><h3 className={ui.cardTitle}>Запросы и решения</h3>{state.requests.filter(r=>r.specId===spec?.id).length?state.requests.filter(r=>r.specId===spec?.id).map(r=><div className={twMerge("historical-fact",ui.fact)} key={r.id}><strong className={ui.factTitle}>{r.title}</strong><Status state={r.state}/>{r.decision&&<p className={ui.copy}>{r.decision.outcome.kind==='answer'?r.decision.outcome.answer:r.decision.outcome.kind==='reject'?r.decision.outcome.reason:r.options.find(o=>o.id===(r.decision!.outcome as {chosenOptionId:string}).chosenOptionId)?.title}</p>}{r.clearedEvidence&&<p className={ui.copy}>Блокер устранён: {r.clearedEvidence}</p>}{r.applicabilityEndedEvidence&&<p className={ui.copy}>Применимость прежнего блокера завершена человеком для {r.applicabilityEndedForRevisionId?`r${state.revisions.find(item=>item.id===r.applicabilityEndedForRevisionId)?.revision??'?'}`:'контекста без активной ревизии'}: {r.applicabilityEndedEvidence}. Физическое устранение этим не подтверждено.</p>}</div>):<p className={ui.copy}>Запросов ещё нет.</p>}</article></div></div>}
        {tab==='states'&&<StateTransitions state={state} specId={spec?.id}/>}
        {tab==='events'&&<div className={twMerge("historical-card",ui.card)}><h3 className={ui.cardTitle}>Сохранённые источники до cursor {cursor}</h3>{state.events.filter(e=>!e.specId||e.specId===spec?.id).toReversed().map(e=><WorkspaceAccordion className={twMerge("historical-source",ui.source)} triggerClassName="[overflow-wrap:anywhere] leading-[1.8]" key={e.id} title={<><span className={twMerge("mono",ui.sourceVersion)}>#{e.version}</span> {e.type} · {e.actor.name??e.actor.id}</>}><p className={ui.copy}>{String(e.payload.title??e.payload.evidence??e.payload.reason??e.payload.question??'Сохранённый факт')}</p><pre className={ui.sourceRecord}>{JSON.stringify(e,null,2)}</pre></WorkspaceAccordion>)}</div>}
     </>}
   </>}
  </section>;
}
