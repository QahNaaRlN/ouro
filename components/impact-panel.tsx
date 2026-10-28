"use client";

import { useId, useMemo, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, Clock3, FileText, GitBranch, Info } from 'lucide-react';
import type { DomainEvent, ProjectState } from '../packages/core/src/types';
import { calculateExpectationImpact, type ExpectationImpactReport } from '../packages/core/src/expectation-impact';
import './impact-panel.css';

type Selection = {c0:number;end:'current'|'historical';c1:number;scope:'all'|'selected';specIds:string[]};
type SourceReference = {eventId:string;version:number;type?:string;occurredAt?:string};
const fields:Record<string,string>={goal:'Цель',dod:'Критерии DoD',constraints:'Ограничения',assumptions:'Допущения',risks:'Риски',inputs:'Входные данные',flow:'Схема процесса',mandatoryPrerequisiteIds:'Обязательные предпосылки',mandatoryPrerequisites:'Обязательные предпосылки',dependencies:'Обязательные предпосылки',prerequisites:'Обязательные предпосылки',validity:'Актуальность цели'};
const eventLabels:Record<string,string>={RevisionActivated:'Активирована ревизия',SpecInvalidated:'Цель снята с работы',DependencyAdded:'Добавлена зависимость',SpecCreated:'Создана спека',DecisionSuperseded:'Запрос замещён',DecisionRequested:'Запрос человеку',ActionReported:'Факт действия'};
const changeReasons:Record<string,string>={
  'revision-content-changed':'Человек активировал ревизию, отличающуюся от исходного контракта.',
  'spec-invalidated':'Человек признал исходную цель неактуальной.',
  'mandatory-prerequisites-changed':'Изменился набор обязательных предпосылок исходной спеки.',
};
const reasons:Record<string,string>={
  'no-baseline':'В исходной точке ещё нет действующих утверждённых спек. Выберите момент после активации ревизии.',
  'empty-scope':'Область пуста: выберите спеки для расчёта или переключитесь на весь проект.',
  'invalid-window':'Проверьте точки истории: исходная должна быть не позже конечной.',
  'invalid-cursor':'Точки истории должны быть целыми неотрицательными номерами событий.',
  'cursor-ahead':'Выбранная точка ещё отсутствует в загруженной истории.',
  'incomplete-history':'Для воспроизводимого расчёта нужна полная история до конечной точки.',
  'invalid-history':'История содержит противоречивые данные. Расчёт не подтверждён.',
  'unknown-scope':'В выбранной точке истории не удалось найти все указанные спеки.',
  'invalid-scope':'Проверьте выбранную область отчёта.',
  'invalid-project':'Не удалось определить проект для этого отчёта.',
  'unavailable-revision':'Одна из необходимых ревизий недоступна. Без неё сравнение не подтверждено.',
  'unsupported-schema':'Эта версия истории не поддерживается текущим алгоритмом.',
};
const countDefinitions:Array<{key:string;label:string;description:string}>=[
  {key:'revisionChanges',label:'Смены активной ревизии',description:'Повторные активации, включая возврат к прежнему содержанию.'},
  {key:'firstActivations',label:'Первые активации',description:'Первые утверждённые ревизии внутри окна.'},
  {key:'newApprovedSpecs',label:'Новые утверждённые спеки',description:'Впервые активированы внутри окна; исходная база сохраняется.'},
  {key:'newDraftSpecs',label:'Новые черновики',description:'Созданные цели, ожидающие активации.'},
  {key:'invalidatedBaselineSpecs',label:'Снятые исходные цели',description:'Явная инвалидация спек исходной базы.'},
  {key:'supersededRequests',label:'Замещённые запросы',description:'Запросы, замещённые новой ревизией ожидания.'},
  {key:'pendingQuestions',label:'Открытые вопросы',description:'Ожидают человека на конечной точке.'},
  {key:'pendingForks',label:'Открытые развилки',description:'Ожидают выбора человека на конечной точке.'},
  {key:'pendingBlockers',label:'Открытые блокеры',description:'Ожидают решения на конечной точке.'},
  {key:'historicalActions',label:'Поздние факты',description:'Явно помечены контекстом прежней ревизии.'},
  {key:'unlinkedFactsWithFlow',label:'Без привязки при наличии схемы',description:'У факта отсутствует optional-ссылка на узел процесса.'},
  {key:'unlinkedFactsWithoutFlow',label:'Факты без заданной схемы',description:'У ревизии нет процессной схемы для сопоставления.'},
];

function sourceTime(value?:string){if(!value)return '';const date=new Date(value);return Number.isNaN(date.valueOf())?'':date.toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
function SourceDetail({source,events}:{source:SourceReference;events:Map<string,DomainEvent>}){
  const event=events.get(source.eventId),type=event?.type??source.type??'Событие';
  return <details className="impact-source"><summary><span className="mono">#{source.version}</span><span>{eventLabels[type]??type}</span><span className="impact-source-time">{sourceTime(event?.occurredAt??source.occurredAt)}</span></summary><div className="impact-source-body"><div className="impact-source-meta"><code>{type}</code><code>{source.eventId}</code></div>{event?<><p>{event.actor.kind==='human'?'Человек':event.actor.kind==='agent'?'Агент':'Система'} · {event.specRevisionId??'Общий контекст проекта'}</p><pre>{JSON.stringify(event.payload,null,2)}</pre></>:<p>Полный источник недоступен в текущем снимке истории.</p>}</div></details>;
}
function download(report:ExpectationImpactReport){
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`ouro-expectation-impact-${report.c0??'unknown'}-${report.c1??'unknown'}.json`;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
}

export default function ImpactPanel({state}:{state:ProjectState}){
  const scopeId=useId();
  const [baselineDraft,setBaselineDraft]=useState('0'),[endMode,setEndMode]=useState<'current'|'historical'>('current'),[endDraft,setEndDraft]=useState(String(state.version));
  const [scopeMode,setScopeMode]=useState<'all'|'selected'>('all'),[specIds,setSpecIds]=useState<string[]>([]);
  const [selection,setSelection]=useState<Selection>({c0:0,end:'current',c1:state.version,scope:'all',specIds:[]});
  const c1=selection.end==='current'?state.version:selection.c1;
  const report=useMemo(()=>calculateExpectationImpact(state.events,{projectId:state.projectId,c0:selection.c0,c1,...(selection.scope==='selected'?{specIds:selection.specIds}:{})}),[state.events,state.projectId,selection,c1]);
  const events=useMemo(()=>new Map(state.events.map(event=>[event.id,event])),[state.events]);
  const changedParameters=Number(baselineDraft)!==selection.c0||endMode!==selection.end||(endMode==='historical'&&Number(endDraft)!==selection.c1)||scopeMode!==selection.scope||(scopeMode==='selected'&&[...specIds].sort().join('|')!==[...selection.specIds].sort().join('|'));
  const submit=(event:FormEvent)=>{event.preventDefault();setSelection({c0:Number(baselineDraft),end:endMode,c1:Number(endDraft),scope:scopeMode,specIds:[...specIds]});};
  const explanation=report.reason?(reasons[report.reason]??'Недостаточно подтверждённых данных для расчёта. Основание сохранено в JSON отчёта.'):null;
  const available=report.status==='available'&&report.K!==null&&report.N!==null&&report.percent!==null;
  const percent=report.percent===null?null:new Intl.NumberFormat('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1}).format(report.percent);
  return <section className="impact-panel" aria-label="Показатели ожиданий">
    <div className="page-heading"><div><div className="eyebrow">ОЖИДАНИЕ · ИЗМЕНЕНИЯ</div><h1>Показатели ожиданий</h1><p>Сравните утверждённый объём с выбранным моментом истории.</p></div><button className="btn" type="button" onClick={()=>download(report)}><ArrowDownToLine size={15}/>Экспорт отчёта JSON</button></div>
    <form className="impact-controls" onSubmit={submit} aria-label="Параметры отчёта ожиданий">
      <div className="impact-control-grid">
        <div className="impact-control-field">
          <label htmlFor={`${scopeId}-baseline`}>Исходная точка истории</label>
          <input id={`${scopeId}-baseline`} aria-describedby={`${scopeId}-baseline-help`} required type="number" min={0} max={state.version} step={1} value={baselineDraft} onChange={event=>setBaselineDraft(event.target.value)}/>
          <small id={`${scopeId}-baseline-help`}>№ события, после которого фиксируем исходную базу.</small>
        </div>
        <div className="impact-control-field">
          <label htmlFor={`${scopeId}-end-mode`}>Конечная точка отчёта</label>
          <select id={`${scopeId}-end-mode`} value={endMode} onChange={event=>{const value=event.target.value as 'current'|'historical';setEndMode(value);if(value==='historical')setEndDraft(String(state.version));}}>
            <option value="current">Текущий момент · #{state.version}</option>
            <option value="historical">Момент в истории</option>
          </select>
          {endMode==='historical'?<div className="impact-control-field impact-nested-field">
            <label htmlFor={`${scopeId}-end`}>Конечная точка истории</label>
            <input id={`${scopeId}-end`} required type="number" min={0} max={state.version} step={1} value={endDraft} onChange={event=>setEndDraft(event.target.value)}/>
          </div>:<small>Новые факты обновляют отчёт; исходная база сохраняется.</small>}
        </div>
        <div className="impact-control-field">
          <label htmlFor={`${scopeId}-scope`}>Область отчёта</label>
          <select id={`${scopeId}-scope`} aria-describedby={`${scopeId}-scope-help`} value={scopeMode} onChange={event=>setScopeMode(event.target.value as 'all'|'selected')}>
            <option value="all">Все спеки проекта</option>
            <option value="selected">Выбранные спеки</option>
          </select>
          <small id={`${scopeId}-scope-help`}>{scopeMode==='all'?'В базу входят действующие спеки с активной ревизией.':`Выбрано: ${specIds.length}. Пустой выбор остаётся пустой областью.`}</small>
        </div>
      </div>
      {scopeMode==='selected'&&<fieldset className="impact-scope"><legend>Спеки для расчёта</legend>{state.specs.length?<div className="impact-spec-options">{state.specs.map(spec=><label key={spec.id} htmlFor={`${scopeId}-${spec.id}`}><input id={`${scopeId}-${spec.id}`} type="checkbox" checked={specIds.includes(spec.id)} onChange={event=>setSpecIds(current=>event.target.checked?[...current,spec.id]:current.filter(id=>id!==spec.id))}/><span><span className="mono">{spec.humanId}</span> — {spec.title}</span></label>)}</div>:<p>В проекте пока нет спек.</p>}</fieldset>}
      <div className="impact-controls-footer"><p>{changedParameters?'Параметры изменены. Пересчитайте отчёт, чтобы применить выбор.':'Выбор точки истории меняет только представление отчёта.'}</p><button className="btn btn-primary" type="submit"><GitBranch size={15}/>Пересчитать отчёт</button></div>
    </form>
    <div className="impact-result" role="status" aria-live="polite"><div><span className="quiet-label">ИЗМЕНЕНО ИСХОДНЫХ ОЖИДАНИЙ</span><h2 className="impact-result-count">{available?`${report.K} из ${report.N} исходных спек`:report.status==='no-baseline'?'Нет исходной утверждённой базы':'Недостаточно данных для расчёта'}</h2>{available?<p>Спеки, чьё исходное ожидание изменилось в выбранном окне. Каждая учитывается один раз.</p>:<p>{explanation}</p>}<div className="impact-window"><Clock3 size={13}/><span>После #{report.c0??'—'}</span><ArrowRight size={13}/><span>До #{report.c1??'—'} включительно</span><span className="impact-window-scope">{report.scope.mode==='all'?'Весь проект':`Выбрано ID: ${report.scope.specIds?.length??0}`}</span></div></div>{percent!==null&&<div className="impact-result-percent"><strong aria-label="Доля изменённых исходных ожиданий">{percent}%</strong><div className="impact-meter" aria-hidden="true"><span style={{width:`${Math.max(0,Math.min(100,report.percent??0))}%`}}/></div></div>}</div>
    <p className="impact-context-note"><Info size={15}/><span><strong>Не оценивает качество агента.</strong> Изменение ожидания может быть обоснованным решением человека. Новые цели и частота изменений показаны отдельно.</span></p>
    <section className="impact-changes" aria-label="Изменения исходных ожиданий"><div className="section-heading"><h2>Что изменилось</h2><span className="quiet-label">{report.changedSpecs.length} ИСХОДНЫХ СПЕК</span></div>{report.changedSpecs.length?<div className="impact-change-list">{report.changedSpecs.map(spec=><article className="impact-change-item" role="group" aria-label={`Основание изменения ${spec.humanId}`} key={spec.specId}><div className="impact-spec-heading"><FileText size={17}/><div><code>{spec.humanId}</code><h3>{spec.title}</h3></div></div>{spec.changes.map((change,index)=><div className="impact-change-reason" key={`${change.eventId}-${index}`}><p><strong>{change.fields.length?change.fields.map(field=>fields[field]??field).join(' · '):change.type==='SpecInvalidated'?'Цель снята с работы':'Обязательные предпосылки'}</strong></p><p className="helper-note">{changeReasons[change.reason]??change.reason}</p><SourceDetail source={change} events={events}/></div>)}</article>)}</div>:<p className="impact-empty">{report.status==='unknown'?'Изменения не подтверждены: сначала нужна доступная полная история.':report.status==='no-baseline'?'Сначала выберите исходную точку с утверждёнными спеками.':'В выбранном окне исходные ожидания не менялись.'}</p>}</section>
    <section className="impact-count-section" aria-label="Отдельные проверяемые количества"><div className="section-heading"><h2>Отдельные факты</h2><span className="quiet-label">БЕЗ СМЕШИВАНИЯ В ОДИН БАЛЛ</span></div>{report.status==='unknown'?<p className="impact-empty">Счётчики недоступны без подтверждённой истории.</p>:<dl className="impact-count-grid">{countDefinitions.map(item=>{const count=report.counts[item.key],sources=report.sources[item.key]??[];if(count===undefined)return null;return <div className="impact-count-card" key={item.key}><dt>{item.label}</dt><dd><strong>{count}</strong><p>{item.description}</p>{sources.length>0&&<details className="impact-counter-sources"><summary>Основания · {sources.length}</summary>{sources.map((source,index)=><SourceDetail key={`${source.eventId}-${index}`} source={source} events={events}/>)}</details>}</dd></div>;})}</dl>}</section>
    {(report.newApprovedSpecs.length>0||report.newDraftSpecs.length>0)&&<section className="impact-new-goals"><div className="section-heading"><h2>Новые цели вне исходной базы</h2></div><p className="helper-note">Показываются отдельно и не меняют знаменатель отчёта.</p>{[{title:'Утверждённые спеки',items:report.newApprovedSpecs},{title:'Черновики',items:report.newDraftSpecs}].map(group=>group.items.length>0&&<details key={group.title}><summary>{group.title} · {group.items.length}</summary>{group.items.map(item=><div className="impact-new-goal" key={`${group.title}-${item.specId}`}><p><code>{item.humanId}</code> · {item.title}</p><SourceDetail source={item} events={events}/></div>)}</details>)}</section>}
    <details className="impact-baseline"><summary>Исходная база · {report.baseline.length} спек</summary>{report.baseline.length?<div className="impact-table-wrap"><table aria-label="Исходная база отчёта"><thead><tr><th>Спека</th><th>Исходная ревизия</th><th>Обязательные предпосылки</th></tr></thead><tbody>{report.baseline.map(item=><tr key={item.specId}><td><code>{item.humanId}</code><strong>{item.title}</strong></td><td>r{item.revision}<code className="impact-uuid">{item.revisionId}</code></td><td>{item.mandatoryPrerequisiteIds.length?item.mandatoryPrerequisiteIds.map(id=><code className="impact-uuid" key={id}>{state.specs.find(spec=>spec.id===id)?.humanId??id}</code>):'Нет'}</td></tr>)}</tbody></table></div>:<p className="helper-note">{explanation??'Исходная база пуста.'}</p>}</details>
    <details className="impact-method"><summary>Как считается показатель</summary><div><p><strong>100 × K / N.</strong> N — фиксированная база действующих утверждённых спек в исходной точке. K — уникальные спеки этой базы, чьё ожидание изменено, цель снята с работы или изменены обязательные предпосылки.</p><p>Повторные изменения и возврат к исходному содержанию не стирают факт изменения. Смена только названия или комментария не увеличивает K. Все спеки имеют одинаковый вес.</p><p>Без исходной базы процент не рассчитывается. Пробелы истории и недоступные данные показываются отдельно.</p><code>{report.algorithmId}</code><a href="https://github.com/QahNaaRlN/ouro/blob/feat/drift-metric/docs/specs/drift-metric.md" target="_blank" rel="noreferrer">Контракт расчёта и критерии проверки</a></div></details>
  </section>;
}
