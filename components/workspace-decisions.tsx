'use client';

import {useState,type FormEvent} from 'react';
import type {Actor,DecisionRequest,Execution,ProjectState,RevisionContent,Spec,SpecRevision} from '@/packages/core/src';
import {currentDecisionRequests,isCurrentDecisionRequest} from '@/packages/core/src/decision-lineage';
import {validateFlowTrackingProfile} from '@/packages/core/src';
import {getAcceptanceAvailability,getCanonicalStatusPresentation,getExecutionPresentation,probeWorkAction} from '@/packages/core/src/work-presentation';
import type {AgentRegistration} from './agents-panel';
import {workspaceContent} from './workspace-task';
import {WorkspaceAccordion,WorkspaceSelect,WorkspaceTextarea} from './workspace-ui';
import {WorkStatus} from './work-status';
import reviewStyles from './workspace-grouped-review.module.css';

export type WorkspaceCommand=(payload:Record<string,unknown>,slot:string,label:string)=>Promise<boolean>;
const viewHuman=(state:ProjectState):Actor=>({id:'workspace-view-human',kind:'human',projectIds:[state.projectId]});
const message=(error:unknown)=>error instanceof Error?error.message:'Не удалось выполнить действие.';
const terminal=new Set<Execution['state']>(['succeeded','failed','cancelled','skipped']);

type StartAttemptProps={spec:Spec;revision:SpecRevision;state:ProjectState;agents:AgentRegistration[];command:WorkspaceCommand;disabled:boolean;actor?:Actor};
export function WorkspaceStartAttempt(props:StartAttemptProps){return <StartAttemptForm key={props.revision.id} {...props}/>;}
function StartAttemptForm({spec,revision,state,agents,command,disabled,actor}:StartAttemptProps){
  const available=agents.filter(agent=>!agent.revokedAt);
  const [agentId,setAgentId]=useState(''),[tracking,setTracking]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const chosen=available.some(agent=>agent.id===agentId)?agentId:available[0]?.id??'';
  let profileReason='';try{validateFlowTrackingProfile(revision.flow);}catch(e){profileReason=message(e);}
  if(spec.activeRevisionId!==revision.id)return <p className="ws-muted">Историческая ревизия доступна только для чтения. Назначение относится к активному ожиданию.</p>;
  if(['done','invalidated'].includes(spec.state))return null;
  const body={type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:chosen,...(tracking?{flowTracking:'enforced'}:{})};
  const gate=probeWorkAction(state,body,actor??viewHuman(state));
  const unavailable=!chosen?'Подключите агента для новой попытки.':gate.reason;
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(disabled||busy||!gate.allowed||!chosen)return;
    setBusy(true);setError('');
    try{await command(body,`start:${spec.id}`,'Назначить попытку по ревизии');}catch(e){setError(message(e));}finally{setBusy(false);}
  };
  return <section className="ws-start-attempt" aria-label="Назначить попытку по ревизии">
    <h3>Назначить попытку по этому ожиданию</h3><p className="ws-muted">Активация ревизии сама не запускает работу. Выберите зарегистрированного агента и явно назначьте попытку.</p>
    {error&&<p role="alert" className="ws-error">{error}</p>}
    <form onSubmit={submit}>
      <label>Агент для новой попытки<WorkspaceSelect aria-label="Агент для новой попытки" value={chosen} onValueChange={selectedValue=>setAgentId(selectedValue)} required><option value="">Выберите подключение</option>{available.map(agent=><option key={agent.id} value={agent.id}>{agent.name} · {agent.id.slice(0,8)}</option>)}</WorkspaceSelect></label>
      <label className="ws-check"><input type="checkbox" checked={tracking} disabled={!!profileReason} onChange={event=>setTracking(event.target.checked)}/>Строгий учёт проходов</label>
      {profileReason&&<p className="ws-muted">{profileReason}</p>}
      {!gate.allowed&&<p className="ws-muted" role="status">Назначение недоступно: {unavailable}</p>}
      <button className="ws-primary" disabled={disabled||busy||!chosen||!gate.allowed}>Назначить попытку</button>
    </form>
  </section>;
}

type DecisionsProps={state:ProjectState;specId?:string;revisionId?:string;executionId?:string;requestId?:string;onOpenRequest?:(requestId:string)=>void;agents:AgentRegistration[];command:WorkspaceCommand;disabled:boolean;actor?:Actor};
const requestKinds=[['Question','Вопросы'],['Fork','Развилки'],['Blocker','Блокеры']] as const;
const requestStates=['pending','resolved','withdrawn','superseded'] as const;
export function WorkspaceDecisions({state,specId,revisionId,executionId,requestId,onOpenRequest,agents,command,disabled,actor}:DecisionsProps){
  const inScope=(request:DecisionRequest)=>(!specId||request.specId===specId)&&(!revisionId||request.specRevisionId===revisionId)&&(!executionId||request.executionId===executionId);
  const selected=requestId?state.requests.find(request=>request.id===requestId&&inScope(request)):undefined;
  const requests=requestId?(selected?[selected]:[]):currentDecisionRequests(state).filter(inScope);
  const renderRequest=(request:DecisionRequest)=>onOpenRequest&&!requestId?<article className="ws-request ws-request-compact" key={request.id} data-request-id={request.id}>
    <div className="ws-section-top"><span className="ws-badge">{request.kind==='Question'?'Вопрос':request.kind==='Fork'?'Развилка':'Блокер'}</span><WorkStatus presentation={getCanonicalStatusPresentation(request.state)}/></div>
    <button type="button" className="ws-event-link" onClick={()=>onOpenRequest(request.id)}>{request.title}</button>
    <RequestScope request={request} state={state} agents={agents}/>
    <p className="ws-muted">{request.question??request.reason??request.context}</p>
    {request.decision&&request.decision.outcome.kind!=='reject'&&<p className="ws-muted">{request.decision.appliedAt?'Применение подтверждено агентом.':'Применение ещё не подтверждено агентом.'}</p>}
  </article>:<DecisionCard key={request.id} request={request} state={state} agents={agents} command={command} disabled={disabled} actor={actor}/>;
  return <section className="ws-panel" aria-label="Вопросы и решения">
    <h2>Вопросы и решения</h2><p>Ответ, применение решения и разрешение продолжения — отдельные действия.</p>
    {!requests.length&&<p className="ws-muted">{requestId?'Запрос не найден в выбранной области.':'Запросов в выбранной области нет. Новые вопросы, развилки и блокеры появятся по мере работы.'}</p>}
    {requestId?requests.map(renderRequest):requestKinds.map(([kind,label])=>{
      const kindRequests=requests.filter(request=>request.kind===kind);
      return kindRequests.length>0&&<section key={kind} className={reviewStyles.kindGroup} aria-label={`${label} · ${kindRequests.length}`} data-request-kind={kind}>
        <h3 className={reviewStyles.kindHeading}>{label}<span className="ws-badge">{kindRequests.length}</span></h3>
        {requestStates.map(requestState=>{
          const stateRequests=kindRequests.filter(request=>request.state===requestState);
          return stateRequests.length>0&&<div key={requestState} className={reviewStyles.stateGroup} data-request-state={requestState}>
            <h4 className={reviewStyles.stateHeading}>{getCanonicalStatusPresentation(requestState).label}<span className="ws-badge">{stateRequests.length}</span></h4>
            {stateRequests.map(renderRequest)}
          </div>;
        })}
      </section>;
    })}
  </section>;
}

function RequestScope({request,state,agents}:{request:DecisionRequest;state:ProjectState;agents:AgentRegistration[]}){
  const spec=state.specs.find(item=>item.id===request.specId),revision=state.revisions.find(item=>item.id===request.specRevisionId);
  const attempts=state.executions.filter(item=>item.specId===request.specId),attempt=attempts.findIndex(item=>item.id===request.executionId);
  return <p className="ws-muted">{spec?.humanId??request.specId} · r{revision?.revision??'?'} · попытка {attempt<0?'не найдена':`#${attempt+1}`} · {agents.find(agent=>agent.id===request.agentId)?.name??request.agentId}</p>;
}

function DecisionCard({request,state,agents,command,disabled,actor}:{request:DecisionRequest;state:ProjectState;agents:AgentRegistration[];command:WorkspaceCommand;disabled:boolean;actor?:Actor}){
  const [answer,setAnswer]=useState(''),[option,setOption]=useState(request.recommendationOptionId??request.options[0]?.id??''),[reject,setReject]=useState(false),[reason,setReason]=useState(''),[agentId,setAgentId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const available=agents.filter(agent=>!agent.revokedAt),chosen=available.some(agent=>agent.id===agentId)?agentId:available[0]?.id??'';
  const active=state.specs.find(spec=>spec.id===request.specId)?.activeRevisionId===request.specRevisionId;
  const current=isCurrentDecisionRequest(state,request);
  const outcome=request.decision?.outcome;
  const body={type:'resolveDecision',decisionRequestId:request.id,specRevisionId:request.specRevisionId,outcome:reject?{kind:'reject',reason}:request.kind==='Question'?{kind:'answer',answer}:{kind:'approve',chosenOptionId:option}};
  const formValid=reject?!!reason.trim():request.kind==='Question'?!!answer.trim():!!option;
  const eligibility=probeWorkAction(state,{...body,outcome:reject?{kind:'reject',reason:reason||'Read-only decision guard probe.'}:request.kind==='Question'?{kind:'answer',answer:answer||'Read-only answer guard probe.'}:body.outcome},actor??viewHuman(state));
  const remediationGate=probeWorkAction(state,{type:'authorizeRemediation',decisionRequestId:request.id,agentId:chosen},actor??viewHuman(state));
  const remediation=state.executions.filter(execution=>execution.remediatesBlockerId===request.id);
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(busy||disabled||!eligibility.allowed||!formValid)return;
    setBusy(true);setError('');
    try{await command(body,`decision:${request.id}`,`Ответ: ${request.title}`);}catch(e){setError(message(e));}finally{setBusy(false);}
  };
  return <article className="ws-request" aria-label={`Запрос: ${request.title}`} data-request-id={request.id}>
    <div className="ws-section-top"><span className="ws-badge">{request.kind==='Question'?'Вопрос':request.kind==='Fork'?'Развилка':'Блокер'}</span><WorkStatus presentation={getCanonicalStatusPresentation(request.state)} showCode/></div>
    <h3>{request.title}</h3><RequestScope request={request} state={state} agents={agents}/><p>{request.context}</p>
    {request.question&&<p><strong>{request.question}</strong></p>}{request.reason&&<p>{request.reason}</p>}{request.expected&&<p><strong>Ожидалось:</strong> {request.expected}</p>}{request.actual&&<p><strong>Наблюдается:</strong> {request.actual}</p>}{request.impact&&<p><strong>Влияние:</strong> {request.impact}</p>}
    {error&&<p role="alert" className="ws-error">{error}</p>}
    {request.state==='pending'&&active?<form onSubmit={submit}>
      {request.kind==='Question'?<label>Ответ агенту<WorkspaceTextarea aria-label={`Ответ на вопрос ${request.title}`} value={answer} onChange={event=>setAnswer(event.target.value)} required={!reject} rows={3}/></label>:<label>Выбор человека<WorkspaceSelect aria-label={`Решение по запросу ${request.title}`} value={option} onValueChange={selectedValue=>setOption(selectedValue)} disabled={reject}>{request.options.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</WorkspaceSelect></label>}
      {request.options.length>0&&<ul>{request.options.map(item=><li key={item.id}><strong>{item.title}</strong> — {item.description}</li>)}</ul>}
      <label className="ws-check"><input type="checkbox" checked={reject} onChange={event=>setReject(event.target.checked)}/>Отклонить с объяснением</label>
      {reject&&<label>Причина отклонения<WorkspaceTextarea value={reason} onChange={event=>setReason(event.target.value)} required rows={2}/></label>}
      {!eligibility.allowed&&<p className="ws-muted" role="status">Решение недоступно: {eligibility.reason}</p>}
      <button disabled={disabled||busy||!formValid||!eligibility.allowed} className="ws-primary">Записать решение</button>
    </form>:<>
      {outcome&&<p className="ws-decision-result">{outcome.kind==='answer'?`Ответ: ${outcome.answer}`:outcome.kind==='approve'?`Выбрано: ${request.options.find(item=>item.id===outcome.chosenOptionId)?.title??outcome.chosenOptionId}`:`Отклонено: ${outcome.reason}`}</p>}
      {outcome&&outcome.kind!=='reject'&&<p>{request.decision?.appliedAt?'Агент подтвердил применение решения.':current?'Ожидается подтверждение применения агентом.':'Прежнее решение сохранено в истории. Его заменило новое решение этой цепочки.'}</p>}
      {!active&&<p className="ws-muted">Запрос относится к прежней ревизии и доступен только для чтения.</p>}
    </>}
    {request.kind==='Blocker'&&outcome?.kind==='approve'&&active&&!request.clearedEvidence&&<div className="ws-remediation">
      <p>{remediation.length?'Попытки устранения: '+remediation.map(item=>getExecutionPresentation(item).label).join(', '):'План выбран. Разрешите отдельную попытку устранения; снятие блокера подтвердит назначенный агент.'}</p>
      <label>Агент для устранения<WorkspaceSelect aria-label="Агент для устранения" value={chosen} onValueChange={selectedValue=>setAgentId(selectedValue)}><option value="">Выберите подключение</option>{available.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</WorkspaceSelect></label>
      {!remediationGate.allowed&&<p className="ws-muted" role="status">Устранение недоступно: {!chosen?'Выберите действующее подключение.':remediationGate.reason}</p>}
      <button disabled={disabled||busy||!chosen||!remediationGate.allowed} onClick={()=>{setBusy(true);setError('');void command({type:'authorizeRemediation',decisionRequestId:request.id,agentId:chosen},`remediation:${request.id}`,'Разрешить устранение блокера').catch(e=>setError(message(e))).finally(()=>setBusy(false));}}>Разрешить устранение блокера</button>
    </div>}
    {request.clearedEvidence&&<p>Блокер устранён: {request.clearedEvidence}</p>}
  </article>;
}

type ExecutionControlsProps={state:ProjectState;execution:Execution;command:WorkspaceCommand;disabled:boolean;actor?:Actor};
export function WorkspaceExecutionControls(props:ExecutionControlsProps){return <ExecutionControls key={props.execution.id} {...props}/>;}
function ExecutionControls({state,execution,command,disabled,actor}:ExecutionControlsProps){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reason,setReason]=useState('');
  const viewer=actor??viewHuman(state);
  const resume=probeWorkAction(state,{type:'resumeExecution',executionId:execution.id},viewer);
  const stop=probeWorkAction(state,{type:'requestStop',executionId:execution.id,reason:reason||'Read-only stop guard probe.'},viewer);
  const cancel=probeWorkAction(state,{type:'cancelExecution',executionId:execution.id,reason:reason||'Read-only cancellation guard probe.'},viewer);
  const awaitingApplication=currentDecisionRequests(state).filter(request=>request.executionId===execution.id&&request.state==='resolved'&&request.decision?.outcome.kind!=='reject'&&!request.decision?.appliedAt).length;
  const run=async(payload:Record<string,unknown>,label:string)=>{
    if(disabled||busy)return;const gate=probeWorkAction(state,payload,viewer);if(!gate.allowed){setError(gate.reason??'Действие недоступно.');return;}
    setBusy(true);setError('');try{await command(payload,`execution:${execution.id}`,label);}catch(e){setError(message(e));}finally{setBusy(false);}
  };
  const historical=state.specs.find(spec=>spec.id===execution.specId)?.activeRevisionId!==execution.specRevisionId;
  return <section className="ws-execution-controls" aria-label="Управление попыткой">
    {error&&<p role="alert" className="ws-error">{error}</p>}
    {awaitingApplication>0&&<p className="ws-muted" role="status">Решений без подтверждения применения: {awaitingApplication}. Применение решения и разрешение продолжения — отдельные факты.</p>}
    {historical&&<p className="ws-muted">Попытка относится к прежней ревизии. Новое исполнение требует активного ожидания; остановка прежней работы остаётся доступной по её состоянию.</p>}
    {['waiting_for_human','paused'].includes(execution.state)&&!execution.resumeAuthorized&&<>
      <button className="ws-primary" disabled={disabled||busy||!resume.allowed} onClick={()=>void run({type:'resumeExecution',executionId:execution.id},'Разрешить продолжение')}>Разрешить продолжение</button>
      {!resume.allowed&&<p className="ws-muted" role="status">Продолжение недоступно: {resume.reason}</p>}
    </>}
    {execution.resumeAuthorized&&<p className="ws-muted" role="status">{execution.state==='queued'?'Запуск разрешён. Ожидается фактическое подтверждение агента.':'Продолжение разрешено. Ожидается отдельное MCP-подтверждение агента.'}</p>}
    {execution.stopConfirmation==='unknown'&&<p className="ws-muted" role="status">Разрешение отменено, но фактическая остановка не подтверждена. До отдельного свидетельства оператора новая работа запрещена.</p>}
    {!terminal.has(execution.state)&&<WorkspaceAccordion title="Остановка и отмена">
      <label>Причина остановки<input value={reason} onChange={event=>setReason(event.target.value)}/></label>
      <div className="ws-actions">
        {!execution.stopRequested&&<button disabled={disabled||busy||!reason.trim()||!stop.allowed} onClick={()=>void run({type:'requestStop',executionId:execution.id,reason},'Запросить остановку')}>Запросить остановку</button>}
        {['queued','paused'].includes(execution.state)&&<button disabled={disabled||busy||!reason.trim()||!cancel.allowed} onClick={()=>void run({type:'cancelExecution',executionId:execution.id,reason},'Отменить попытку')}>Отменить попытку</button>}
      </div>
      {execution.stopRequested&&<p>Остановка запрошена. Фактическую остановку подтверждает агент.</p>}
      {!stop.allowed&&!execution.stopRequested&&<p className="ws-muted">{stop.reason}</p>}
      {!cancel.allowed&&['queued','paused'].includes(execution.state)&&<p className="ws-muted">{cancel.reason}</p>}
    </WorkspaceAccordion>}
  </section>;
}

type AcceptanceProps={spec:Spec;revision:SpecRevision;state:ProjectState;command:WorkspaceCommand;disabled:boolean;actor?:Actor};
export function WorkspaceAcceptance(props:AcceptanceProps){return <AcceptanceForm key={props.revision.id} {...props}/>;}
function AcceptanceForm({spec,revision,state,command,disabled,actor}:AcceptanceProps){
  const [evidence,setEvidence]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const viewer=actor??viewHuman(state),gate=getAcceptanceAvailability(state,spec,revision.id,viewer);
  if(spec.state==='done'&&spec.acceptance?.revisionId===revision.id)return <section className="ws-panel" aria-label="Приёмка результата"><h2>Результат принят человеком</h2><p>Приёмка этой ревизии уже зафиксирована отдельным человеческим решением.</p></section>;
  if(!gate.allowed)return <section className="ws-panel" aria-label="Приёмка результата"><h2>Приёмка результата</h2><p className="ws-muted" role="status">Приёмка недоступна: {gate.reason}</p></section>;
  const complete=revision.dod.filter(criterion=>criterion.required).every(criterion=>!!evidence[criterion.id]?.trim());
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(disabled||busy||!complete)return;
    const body={type:'acceptSpec',specId:spec.id,specRevisionId:revision.id,evidence};
    const actual=probeWorkAction(state,body,viewer);if(!actual.allowed){setError(actual.reason??'Приёмка недоступна.');return;}
    setBusy(true);setError('');try{await command(body,`accept:${spec.id}`,'Принять результат по DoD');}catch(e){setError(message(e));}finally{setBusy(false);}
  };
  return <section className="ws-panel" aria-label="Приёмка результата"><h2>Проверить и принять результат</h2>
    <p>Успех попытки ещё не означает выполнение DoD. Укажите собственное подтверждение каждого обязательного критерия.</p>
    {error&&<p role="alert" className="ws-error">{error}</p>}
    <form onSubmit={submit}>{revision.dod.map(criterion=><label key={criterion.id}>{criterion.text}{criterion.required?' · обязательно':''}<WorkspaceTextarea aria-label={`Подтверждение: ${criterion.text}`} value={evidence[criterion.id]??''} onChange={event=>setEvidence({...evidence,[criterion.id]:event.target.value})} required={criterion.required} rows={2}/></label>)}
      <button className="ws-primary" disabled={disabled||busy||!complete}>Принять результат по DoD</button>
    </form>
  </section>;
}

type RevisionFormProps={spec:Spec;revision:SpecRevision;command:WorkspaceCommand;disabled:boolean};
export function WorkspaceRevisionForm(props:RevisionFormProps){return <RevisionForm key={props.revision.id} {...props}/>;}
function RevisionForm({spec,revision,command,disabled}:RevisionFormProps){
  const [title,setTitle]=useState(revision.title),[goal,setGoal]=useState(revision.goal),[dod,setDod]=useState(revision.dod.map(item=>item.text).join('\n')),[busy,setBusy]=useState(false),[error,setError]=useState('');
  if(spec.activeRevisionId!==revision.id||['done','invalidated'].includes(spec.state))return <p className="ws-muted">Эта ревизия доступна только для чтения.</p>;
  return <WorkspaceAccordion className="ws-revision-form" title="Предложить новую ревизию задачи">
    <p>Новая редакция сохраняется отдельно. Активация — следующее решение человека; действующий агент должен подтвердить остановку прежней работы.</p>
    {error&&<p role="alert" className="ws-error">{error}</p>}
    <form onSubmit={event=>{event.preventDefault();if(disabled||busy)return;setBusy(true);setError('');const content:RevisionContent={...workspaceContent(title,goal,dod),constraints:revision.constraints,assumptions:revision.assumptions,risks:revision.risks,inputs:revision.inputs,comment:revision.comment,...(revision.flow?{flow:revision.flow}:{})};void command({type:'proposeRevision',specId:spec.id,content},`revision:${spec.id}`,'Предложить новую ревизию').catch(e=>setError(message(e))).finally(()=>setBusy(false));}}>
      <label>Новое название<input value={title} onChange={event=>setTitle(event.target.value)} required/></label>
      <label>Новая цель<WorkspaceTextarea value={goal} onChange={event=>setGoal(event.target.value)} required rows={3}/></label>
      <label>Новые критерии<WorkspaceTextarea value={dod} onChange={event=>setDod(event.target.value)} required rows={3}/></label>
      <button disabled={disabled||busy}>Сохранить предложение ревизии</button>
    </form>
  </WorkspaceAccordion>;
}
