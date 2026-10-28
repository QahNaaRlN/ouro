'use client';

import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, FileText, History, LockKeyhole } from 'lucide-react';
import { projectAtCursor } from '@/packages/core/src/history';
import type { ProjectState } from '@/packages/core/src';
import { Status } from './roadmap';
import { StateTransitions } from './state-transitions';
import './methodology.css';

export default function HistoricalPanel({latest,cursor,onReturn}:{latest:ProjectState;cursor:number;onReturn:()=>void}){
  const [selected,setSelected]=useState(''),[tab,setTab]=useState<'expectation'|'states'|'events'>('expectation');
  const result=useMemo(()=>{
    try{return {state:projectAtCursor(latest.events,cursor,latest.projectId),error:''};}
    catch(error){return {state:null,error:error instanceof Error?error.message:'Историческая проекция недоступна'};}
  },[latest.events,latest.projectId,cursor]);
  const state=result.state;
  const roadmapNames={draft:'Черновик',active:'Активна',frozen:'Заморожена',archived:'В архиве'};
  const flowKinds={action:'Действие',condition:'Условие',question:'Вопрос человеку',fork:'Развилка',blocker:'Блокер',wait:'Ожидание',result:'Результат'};
  const spec=state?.specs.find(s=>s.id===selected)??state?.specs[0];
  const revision=state?.revisions.find(r=>r.id===spec?.activeRevisionId)??state?.revisions.findLast(r=>r.specId===spec?.id);
  const exportSnapshot=()=>{
    if(!state)return;
    const data={format:'ouro-historical-export',schemaVersion:1,projectId:state.projectId,cursor:state.version,exportedAt:new Date().toISOString(),events:state.events,state};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`ouro-historical-cursor-${state.version}.json`;link.click();URL.revokeObjectURL(url);
  };
  return <section className="historical-panel" aria-label="Историческое состояние">
    <div className="historical-banner"><div><LockKeyhole size={20}/><div><strong>Только чтение · Состояние на cursor {cursor}</strong><p>Последний cursor {latest.version}. Живые события поступают в текущий проект; эта точка закреплена.</p></div></div><button type="button" className="btn" onClick={onReturn}><ArrowLeft size={15}/>Вернуться к текущей работе</button></div>
    <div className="page-heading"><div><div className="eyebrow">СОСТОЯНИЕ ИЗ СОХРАНЁННЫХ ФАКТОВ</div><h1>Историческое состояние</h1><p>Решения, ожидания и попытки показаны такими, какими были на выбранной границе истории.</p></div><button type="button" className="btn" disabled={!state} onClick={exportSnapshot}><ArrowDownToLine size={16}/>Экспорт состояния JSON</button></div>
    {result.error?<p className="process-error" role="alert">Не удалось открыть выбранную точку: {result.error}</p>:state&&<>
      <div className="historical-summary"><span>Карта: <strong>{roadmapNames[state.roadmap.state]}</strong></span><span>Спек: <strong>{state.specs.length}</strong></span><span>Попыток: <strong>{state.executions.length}</strong></span><span>Запросов: <strong>{state.requests.length}</strong></span><span>Фактов: <strong>{state.events.length}</strong></span></div>
      {!state.specs.length?<div className="empty-state"><History size={32}/><p>В этой точке спеки ещё не созданы.</p></div>:<>
        <label className="historical-picker">Спецификация в историческом состоянии<select value={spec?.id??''} onChange={event=>setSelected(event.target.value)}>{state.specs.map(s=><option value={s.id} key={s.id}>{s.humanId} — {s.title}</option>)}</select></label>
        <div className="historical-spec-heading"><div><span className="mono">{spec?.humanId}</span><h2>{spec?.title}</h2></div>{spec&&<Status state={spec.state}/>}</div>
        <div className="segmented historical-tabs"><button type="button" className={tab==='expectation'?'selected':''} onClick={()=>setTab('expectation')}><FileText size={14}/>Ожидание и факты</button><button type="button" className={tab==='states'?'selected':''} onClick={()=>setTab('states')}>Состояния в этой точке</button><button type="button" className={tab==='events'?'selected':''} onClick={()=>setTab('events')}><History size={14}/>Источники</button></div>
        {tab==='expectation'&&<div className="historical-grid"><article className="historical-card"><span className="quiet-label">РЕВИЗИЯ r{revision?.revision??'—'} · {spec?.activeRevisionId?'АКТИВНА В ЭТОЙ ТОЧКЕ':'БЕЗ АКТИВАЦИИ'}</span><h3>{revision?.title}</h3><p>{revision?.goal}</p><h4>Критерии DoD</h4><ul>{revision?.dod.map(c=><li key={c.id}>{c.text}{c.required?' · обязательный':''}</li>)}</ul>{(['constraints','assumptions','risks','inputs'] as const).map((key,index)=>revision?.[key]&&<section key={key}><h4>{['Ограничения','Допущения','Риски','Входные данные'][index]}</h4><p>{revision[key]}</p></section>)}{revision?.flow&&<section><h4>Схема процесса</h4><ol>{revision.flow.nodes.map(n=><li key={n.id}><strong>{n.title}</strong> · {flowKinds[n.kind]} · {n.description}</li>)}</ol><ul>{revision.flow.edges.map(e=><li key={e.id}>{revision.flow!.nodes.find(n=>n.id===e.source)?.title} → {revision.flow!.nodes.find(n=>n.id===e.target)?.title}: {e.label}</li>)}</ul></section>}</article><div><article className="historical-card"><h3>Попытки исполнения</h3>{state.executions.filter(e=>e.specId===spec?.id).length?state.executions.filter(e=>e.specId===spec?.id).map(e=><div className="historical-fact" key={e.id}><Status state={e.state}/><code>{e.id}</code>{e.stopRequested&&<p>Остановка запрошена · ACK не получен</p>}{e.stopConfirmation==='unknown'&&<p>Фактическая остановка не подтверждена</p>}{e.stopAttestation&&<p>Внешняя остановка засвидетельствована оператором: {e.stopAttestation.evidence}</p>}{e.resultEvidence&&<p>{e.resultEvidence}</p>}</div>):<p>Попыток ещё нет.</p>}</article><article className="historical-card"><h3>Запросы и решения</h3>{state.requests.filter(r=>r.specId===spec?.id).length?state.requests.filter(r=>r.specId===spec?.id).map(r=><div className="historical-fact" key={r.id}><strong>{r.title}</strong><Status state={r.state}/>{r.decision&&<p>{r.decision.outcome.kind==='answer'?r.decision.outcome.answer:r.decision.outcome.kind==='reject'?r.decision.outcome.reason:r.options.find(o=>o.id===(r.decision!.outcome as {chosenOptionId:string}).chosenOptionId)?.title}</p>}{r.clearedEvidence&&<p>Блокер устранён: {r.clearedEvidence}</p>}{r.applicabilityEndedEvidence&&<p>Применимость прежнего блокера завершена человеком для {r.applicabilityEndedForRevisionId?`r${state.revisions.find(item=>item.id===r.applicabilityEndedForRevisionId)?.revision??'?'}`:'контекста без активной ревизии'}: {r.applicabilityEndedEvidence}. Физическое устранение этим не подтверждено.</p>}</div>):<p>Запросов ещё нет.</p>}</article></div></div>}
        {tab==='states'&&<StateTransitions state={state} specId={spec?.id}/>}
        {tab==='events'&&<div className="historical-card"><h3>Сохранённые источники до cursor {cursor}</h3>{state.events.filter(e=>!e.specId||e.specId===spec?.id).toReversed().map(e=><details className="historical-source" key={e.id}><summary><span className="mono">#{e.version}</span> {e.type} · {e.actor.name??e.actor.id}</summary><p>{String(e.payload.title??e.payload.evidence??e.payload.reason??e.payload.question??'Сохранённый факт')}</p><pre>{JSON.stringify(e,null,2)}</pre></details>)}</div>}
      </>}
    </>}
  </section>;
}
