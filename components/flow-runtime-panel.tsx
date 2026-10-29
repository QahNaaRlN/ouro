'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {AlertCircle,ArrowRight,CheckCircle2,History,LoaderCircle,Play,RotateCcw} from 'lucide-react';
import {AGENT_ID,validateFlowTrackingProfile,type DomainEvent,type Execution,type FlowDefinition,type FlowEdge,type FlowNode,type FlowRuntimeView,type FlowStepRun,type ProjectState} from '@/packages/core/src';
import {edgeStateNames,runStateNames,runtimeStateNames,runtimeEventNames,runtimeIntentKey,type FlowRuntimeCommand,type RuntimeIntent,type RuntimeIntentRegistry,type RuntimeAction} from './flow-runtime-ui';
import './flow-runtime.css';

const contextEventNames:Record<string,string>={ExecutionCreated:'Попытка разрешена',ExecutionStarted:'Запуск подтверждён',ExecutionResumed:'Продолжение подтверждено',ExecutionPaused:'Остановка подтверждена',StopRequested:'Остановка запрошена',ResumeAuthorized:'Продолжение разрешено',ExecutionCompleted:'Попытка завершена',ExecutionCancelled:'Попытка отменена',ExecutionSkipped:'Попытка пропущена',ExecutionOperatorCancelled:'Авторизация попытки отозвана',ExternalStopAttested:'Остановка засвидетельствована'};
const factEventNames:Record<string,string>={ActionReported:'Факт действия',DecisionRequested:'Запрос человеку',DecisionResolved:'Решение человека',DecisionApplied:'Применение решения',DecisionWithdrawn:'Запрос отозван',DecisionSuperseded:'Запрос замещён',DecisionClarificationRequested:'Запрошено уточнение',DecisionClarificationSubmitted:'Уточнение получено',BlockerCleared:'Устранение блокера подтверждено'};

export function flowTrackingUnavailable(flow:FlowDefinition|undefined):string{
 if(!flow)return 'Для строгого учёта сначала опишите схему активной ревизии.';
 try{validateFlowTrackingProfile(flow);return '';}catch(error){return error instanceof Error?error.message:'Эта схема не поддерживает последовательный учёт проходов.';}
}
export function FlowTrackingChoice({checked,reason,disabled,onChange}:{checked:boolean;reason:string;disabled:boolean;onChange:(checked:boolean)=>void}){
 return <div className="flow-tracking-choice"><label><input type="checkbox" aria-label="Строгий учёт проходов" checked={checked&&!reason} disabled={disabled||!!reason} onChange={event=>onChange(event.target.checked)}/><span>Строгий учёт проходов</span></label><small>{reason||'Для этой новой попытки: один текущий шаг, явные переходы и история повторов. Агент подтверждает запуск отдельно.'}</small></div>;
}

export function FlowRuntimeSummary({execution,flow,onOpenCurrent,pending,onOpenPending}:{execution:Execution|undefined;flow:FlowDefinition;onOpenCurrent:(run:FlowStepRun)=>void;pending?:RuntimeIntent;onOpenPending?:(intent:RuntimeIntent)=>void}){
 const runtime=execution?.flowRuntime,current=runtime?.runs.find(run=>run.id===runtime.currentRunId);
 return <section className="flow-runtime-summary" aria-label="Учёт проходов процесса">
  <div><div className="eyebrow">ПРОХОЖДЕНИЕ · НАЗНАЧЕННАЯ РЕВИЗИЯ</div><strong>{runtime?runtimeStateNames[runtime.state]:'Строгий учёт проходов не включён'}</strong><p>{runtime?`${runtime.runs.length} зарегистрированных проходов · ${runtime.traversals.length} переходов`:'Связанные действия и решения остаются фактами. Их наличие не создаёт зарегистрированные проходы автоматически.'}</p>{current&&<p>Текущий шаг: {flow.nodes.find(node=>node.id===current.nodeId)?.title??current.nodeId} · проход {current.visit} · {runStateNames[current.state]}</p>}</div>
  {current&&<button type="button" className="btn btn-small" onClick={()=>onOpenCurrent(current)}><Play size={13}/>Открыть текущий шаг</button>}
  {pending&&<p className="flow-runtime-warning" role="status"><AlertCircle size={15}/>Есть неподтверждённое действие для прохода <code>{pending.runId}</code>. <button type="button" className="text-btn" onClick={()=>onOpenPending?.(pending)}>Проверить отправленное действие</button></p>}
 </section>;
}

function sourceEvents(state:ProjectState,execution:Execution,run:FlowStepRun):DomainEvent[]{
 const requests=new Set(state.requests.filter(request=>request.executionId===execution.id&&request.flowStepRunId===run.id).map(request=>request.id));
 const scoped=state.events.filter(event=>event.executionId===execution.id&&event.specRevisionId===execution.specRevisionId);
 const creates=(event:DomainEvent)=>((event.payload.run as FlowStepRun|undefined)?.id===run.id)||event.type==='ExecutionCreated'&&!!(event.payload.execution as Execution|undefined)?.flowRuntime?.runs.some(candidate=>candidate.id===run.id);
 const birth=scoped.find(creates)?.version??Number.MAX_SAFE_INTEGER;
 const finished=scoped.find(event=>event.version>=birth&&(['FlowStepCompleted','FlowStepFailed','FlowStepSkipped'].includes(event.type)&&event.payload.runId===run.id||['ExecutionCompleted','ExecutionCancelled','ExecutionSkipped','ExecutionOperatorCancelled'].includes(event.type)))?.version??Number.MAX_SAFE_INTEGER;
 const contextEvents=new Set(['ExecutionStarted','ExecutionResumed','ExecutionPaused','StopRequested','ResumeAuthorized','ExecutionCompleted','ExecutionCancelled','ExecutionSkipped','ExecutionOperatorCancelled','ExternalStopAttested']);
 return state.events.filter(event=>{
  if(event.executionId!==execution.id||event.specRevisionId!==execution.specRevisionId)return false;
  const payload=event.payload,record=payload.run as FlowStepRun|undefined,traversal=payload.traversal as {fromRunId?:string;toRunId?:string}|undefined;
  if(payload.runId===run.id||payload.flowStepRunId===run.id||record?.id===run.id||record?.retryOfRunId===run.id||traversal?.fromRunId===run.id||traversal?.toRunId===run.id)return true;
  if(typeof payload.decisionRequestId==='string'&&requests.has(payload.decisionRequestId))return true;
  if((payload.request as {flowStepRunId?:string}|undefined)?.flowStepRunId===run.id)return true;
  if(contextEvents.has(event.type)&&event.version>=birth&&event.version<=finished)return true;
  const initial=(payload.execution as Execution|undefined)?.flowRuntime;
  return event.type==='ExecutionCreated'&&!!initial?.runs.some(candidate=>candidate.id===run.id);
 });
}

export function FlowRuntimeInspector({state,execution,node,edge,run,view,onRunChange,busy,readOnly,actorId,intents,onCommand,onSimulateFlow}:{state:ProjectState;execution:Execution;node:FlowNode;edge?:FlowEdge;run:FlowStepRun|null;view:FlowRuntimeView;onRunChange:(id:string)=>void;busy:boolean;readOnly:boolean;actorId:string;intents:RuntimeIntentRegistry;onCommand?:FlowRuntimeCommand;onSimulateFlow?:FlowRuntimeCommand}){
 const runs=execution.flowRuntime?.runs.filter(candidate=>candidate.nodeId===node.id)??[],selectedEdge=edge&&view.edges.find(candidate=>candidate.id===edge.id),history=run?sourceEvents(state,execution,run):[];
 const requests=run?state.requests.filter(request=>request.executionId===execution.id&&request.flowStepRunId===run.id):[];
 return <div className="flow-runtime-inspection">
  <section className="flow-run-details" aria-label="Проходы узла" {...(run?{'data-step-run-id':run.id}:{})}>
   <div className="section-heading"><h3><History size={15}/>Проходы узла</h3><span className="quiet-label">{runs.length} ЗАРЕГИСТРИРОВАНО</span></div>
   {!execution.flowRuntime?<p>Строгий учёт проходов не включён. Прежние факты не преобразуются в проходы.</p>:!run?<p>Нет зарегистрированных проходов этого узла.</p>:<>
    <label>Проход узла<select aria-label="Проход узла" value={run.id} onChange={event=>onRunChange(event.target.value)}>{runs.map(candidate=><option key={candidate.id} value={candidate.id}>Проход {candidate.visit} · {runStateNames[candidate.state]}{candidate.id===execution.flowRuntime?.currentRunId?' · текущий':''}</option>)}</select></label>
    <div className={`flow-run-status flow-run-${run.state}`} role="status"><span>Проход {run.visit} · {runStateNames[run.state]}</span><code>{run.id}</code></div>
    {run.id!==execution.flowRuntime.currentRunId&&<p className="helper-note">Выбран отдельный прежний проход. Новые события не подменяют его состояние.</p>}
    <dl className="flow-run-fields"><div><dt>Создан</dt><dd>{new Date(run.createdAt).toLocaleString('ru-RU')}</dd></div>{run.startedAt&&<div><dt>Начат</dt><dd>{new Date(run.startedAt).toLocaleString('ru-RU')}</dd></div>}{run.finishedAt&&<div><dt>Завершён</dt><dd>{new Date(run.finishedAt).toLocaleString('ru-RU')}</dd></div>}{run.reason&&<div><dt>Причина</dt><dd>{run.reason}</dd></div>}{run.evidence&&<div><dt>Основание</dt><dd>{run.evidence}</dd></div>}{run.retryOfRunId&&<div><dt>Повтор прохода</dt><dd><code>{run.retryOfRunId}</code></dd></div>}</dl>
    <details className="flow-run-history" open><summary>История прохода · {history.length}</summary>{history.length?<ol>{history.map(event=><li key={event.id}><strong>#{event.version} · {contextEventNames[event.type]?`Контекст исполнения · ${contextEventNames[event.type]}`:runtimeEventNames[event.type]??factEventNames[event.type]??event.type}</strong><small>{event.actor.name??event.actor.id} · {new Date(event.occurredAt).toLocaleString('ru-RU')}</small>{typeof event.payload.evidence==='string'&&<p>{event.payload.evidence}</p>}<details><summary>Исходная запись</summary><pre>{JSON.stringify(event,null,2)}</pre></details></li>)}</ol>:<p>Явные записи прохода отсутствуют.</p>}</details>
   </>}
  </section>
  {run&&requests.length>0&&<section className="flow-edge-details" aria-label="Запросы прохода"><h3>Запросы прохода</h3>{requests.map(request=><article className="flow-run-request" key={request.id}><strong>{request.flowInterrupt?'Внеплановый запрос':request.kind==='Question'?'Вопрос человеку':request.kind==='Fork'?'Развилка человека':'Блокер'} · {request.title}</strong><p>{request.state==='pending'?'Ожидает решения':request.state==='resolved'?'Решение записано':request.state==='withdrawn'?'Запрос отозван':'Запрос замещён'}{request.decision?.appliedAt?' · применение подтверждено':''}{request.clearedEvidence?' · устранение подтверждено':''}</p><code>{request.id}</code></article>)}</section>}
  {edge&&<section className="flow-edge-details" aria-label="Доступность перехода"><h3>{edge.label||'Переход без подписи'}</h3><strong>{selectedEdge?edgeStateNames[selectedEdge.state]:'Возможный путь'}</strong><p>{selectedEdge?.reason??'Доступность не подтверждена.'}</p>{run&&<small>Проход {run.visit} · <code>{run.id}</code></small>}<p className="helper-note">Выбор и применение решения не заменяют отдельную запись перехода. Нажатие на линию ничего не запускает.</p></section>}
  {run&&execution.flowRuntime&&<section className="flow-action-availability" aria-label="Действия назначенного агента"><h3>Действия назначенного агента</h3><ul>{(['start','complete','fail'] as const).map(action=><li key={action}><strong>{action==='start'?'Начать шаг':action==='complete'?'Завершить шаг':'Сообщить ошибку'} · {view.agentActions[action].allowed?'Доступно':'Недоступно'}</strong><span>{view.agentActions[action].reason}</span></li>)}</ul></section>}
  {run&&!readOnly&&onCommand&&<FlowRuntimeActionForm key={`${actorId}:${execution.id}:${run.id}`} state={state} execution={execution} run={run} view={view} actorId={actorId} busy={busy} intents={intents} onCommand={onCommand} onSimulateFlow={onSimulateFlow}/>}
 </div>;
}

const actionNames:Record<RuntimeAction,string>={start:'Начать шаг',complete:'Завершить шаг',fail:'Сообщить ошибку',retry:'Повторить шаг',skip:'Пропустить шаг'};
function FlowRuntimeActionForm({state,execution,run,view,actorId,busy,intents,onCommand,onSimulateFlow}:{state:ProjectState;execution:Execution;run:FlowStepRun;view:FlowRuntimeView;actorId:string;busy:boolean;intents:RuntimeIntentRegistry;onCommand:FlowRuntimeCommand;onSimulateFlow?:FlowRuntimeCommand}){
 const key=runtimeIntentKey(state.projectId,actorId,execution.id,run.id),held=intents.get(key);
 const options:Array<{value:string;source:'human'|'simulation';action:RuntimeAction;allowed:boolean;reason:string}>=(Object.entries(view.humanActions) as [RuntimeAction,{allowed:boolean;reason:string}][]).map(([action,guard])=>({value:`human:${action}`,source:'human',action,...guard}));
 if(execution.agentId===AGENT_ID&&onSimulateFlow)for(const action of ['start','complete','fail'] as const)options.push({value:`simulation:${action}`,source:'simulation',action,...view.agentActions[action]});
 const preferred=options.find(option=>option.allowed&&option.source==='simulation'&&['start','complete'].includes(option.action))??options.find(option=>option.allowed&&option.source==='human'&&['start','complete','retry'].includes(option.action));
 const initial=held?`${held.source}:${held.action}`:preferred?.value??options[0].value;
 const [selected,setSelected]=useState(initial),[reason,setReason]=useState(held?.reason??''),[evidence,setEvidence]=useState(held?.evidence??''),[edgeId,setEdgeId]=useState(held?.edgeId??'');
 const [baseVersion,setBaseVersion]=useState(held?.expectedVersion??state.version),[intent,setIntent]=useState<RuntimeIntent|undefined>(held),[posting,setPosting]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[needsReview,setNeedsReview]=useState(false);
 const alive=useRef(true),pending=useRef(held);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const chosen=options.find(option=>option.value===selected)??options[0],source=intent?.source??chosen.source,action=intent?.action??chosen.action;
 const revision=state.revisions.find(candidate=>candidate.id===execution.specRevisionId)!,outgoing=revision.flow?.edges.filter(edge=>edge.source===run.nodeId)??[];
 const anotherPending=[...intents.values()].some(candidate=>candidate.actorId===actorId&&candidate.projectId===state.projectId&&candidate.executionId===execution.id&&candidate.runId!==run.id);
 const uncertain=!!intent,locked=posting||uncertain,stale=baseVersion!==state.version;
 const clear=(value:RuntimeIntent)=>{if(intents.get(key)?.body.requestId===value.body.requestId)intents.delete(key);pending.current=undefined;setIntent(undefined);};
 const send=async(value:RuntimeIntent)=>{
  if(posting||busy)return;pending.current=value;intents.set(key,value);setIntent(value);setPosting(true);setError('');setNotice('');
  try{
   const invoke=value.source==='simulation'?onSimulateFlow:onCommand;if(!invoke)throw new Error('Учебный симулятор сейчас недоступен.');
   const result=await invoke(value.body,value.expectedVersion);if(!alive.current)return;
   if(result.ok){clear(value);setNotice('Действие записано. Новый проход можно выбрать отдельно.');setNeedsReview(false);setReason('');setEvidence('');setEdgeId('');}
   else if(result.status&&result.status>=400&&result.status<500&&['VERSION_CONFLICT','REVISION_CONFLICT','INVALID_TRANSITION','VALIDATION_ERROR'].includes(result.code??'')){clear(value);setNeedsReview(true);setError('Сервер отклонил этот запрос до записи. Проверьте события и явно обновите основу.');}
   else setError('Результат не подтверждён. Сохранены прежние автор, проход и тело; повторите тот же запрос для квитанции.');
  }catch{if(alive.current)setError('Результат не подтверждён. Повторите тот же запрос; новые ID не создаются.');}
  finally{if(alive.current)setPosting(false);}
 };
 const submit=(event:FormEvent)=>{
  event.preventDefault();if(locked||busy||anotherPending||stale||needsReview||!chosen.allowed)return;
  const selectedEdge=edgeId||(outgoing.length===1?outgoing[0].id:'');
  if(action==='complete'&&outgoing.length>1&&!selectedEdge){setError('Выберите точный переход.');return;}
  const base={executionId:execution.id,runId:run.id,requestId:crypto.randomUUID()};
  const body:Record<string,unknown>=source==='simulation'?{...base,scenario:`flow_${action}`,specId:execution.specId}:{...base,type:action==='retry'?'retryFlowStep':action==='skip'?'skipFlowStep':'reportFlowStep',...(['start','complete','fail'].includes(action)?{phase:action}:{}),...(['retry','skip'].includes(action)?{reason}:{}),...(['start','complete','fail','skip'].includes(action)?{evidence}:{})};
  if(action==='complete'&&selectedEdge)body.edgeId=selectedEdge;
  void send({actorId,projectId:state.projectId,executionId:execution.id,runId:run.id,source,action,body,expectedVersion:baseVersion,reason,evidence,edgeId:selectedEdge});
 };
 return <form className="flow-runtime-action-form" aria-label="Действие человека на шаге" onSubmit={submit}>
  <h3>Подтвердить действие</h3><p>Человек подтверждает свои и наблюдаемые системные шаги. Учебный симулятор указан отдельно.</p>
  {error&&<p className="flow-runtime-warning" role="alert">{error}</p>}{notice&&<p className="flow-runtime-success" role="status"><CheckCircle2 size={14}/>{notice}</p>}
  {anotherPending&&<p className="flow-runtime-warning">Сначала выясните исход отправленного действия другого прохода этой попытки.</p>}
  {intent&&<div className="flow-runtime-warning"><strong>Отправка закреплена за исходным проходом</strong><code>{intent.runId}</code><span>requestId: {String(intent.body.requestId)}</span><button type="button" className="btn btn-small" disabled={posting||busy} onClick={()=>void send(intent)}><RotateCcw size={13}/>Повторить то же действие</button></div>}
  <label>Действие человека<select aria-label="Действие человека" value={selected} disabled={locked||anotherPending} onChange={event=>{setSelected(event.target.value);setError('');}}>{options.map(option=><option value={option.value} key={option.value} disabled={!option.allowed}>{option.source==='simulation'?'Учебный симулятор: ':''}{actionNames[option.action]}{!option.allowed?' · недоступно':''}</option>)}</select></label>
  <p className="helper-note">{chosen.reason}</p>
  {source==='simulation'?<p className="flow-simulation-note">Учебный симулятор агента. Evidence будет явно синтетическим; внешний агент не запускался.</p>:<>
   {['retry','skip'].includes(action)&&<label>Причина действия<textarea aria-label="Причина действия" required rows={2} maxLength={20000} readOnly={locked} value={reason} onChange={event=>setReason(event.target.value)}/></label>}
   {['start','complete','fail','skip'].includes(action)&&<label>Основание действия<textarea aria-label="Основание действия" required rows={3} maxLength={20000} readOnly={locked} value={evidence} onChange={event=>setEvidence(event.target.value)}/></label>}
  </>}
  {action==='complete'&&outgoing.length>0&&<label>Переход после шага<select aria-label="Переход после шага" value={edgeId||(outgoing.length===1?outgoing[0].id:'')} required disabled={locked||anotherPending} onChange={event=>setEdgeId(event.target.value)}><option value="">Выберите переход</option>{outgoing.map(edge=>{const status=view.edges.find(candidate=>candidate.id===edge.id);return <option key={edge.id} value={edge.id} disabled={status?.state!=='available'}>{edge.label||edge.id} · {status?edgeStateNames[status.state]:'Недоступен'}</option>;})}</select></label>}
  {!intent&&(stale||needsReview)&&<p className="flow-runtime-warning">Есть события, которые нужно проверить перед новым действием. <button type="button" className="text-btn" onClick={()=>{setBaseVersion(state.version);setNeedsReview(false);setError('');}}>Проверил события перед действием</button></p>}
  <button className="btn btn-primary" disabled={posting||busy||uncertain||anotherPending||stale||needsReview||!chosen.allowed}>{posting?<LoaderCircle size={14} className="spin"/>:<ArrowRight size={14}/>}Записать действие человека</button>
 </form>;
}
