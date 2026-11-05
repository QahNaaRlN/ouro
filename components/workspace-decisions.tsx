'use client';
import {twMerge} from 'tailwind-merge';
import {workspacePresentation as ui} from './workspace-presentation';

import {useState,type FormEvent} from 'react';
import type {Actor,DecisionRequest,Execution,ProjectState,RevisionContent,Spec,SpecRevision} from '@/packages/core/src';
import {currentDecisionRequests,isCurrentDecisionRequest} from '@/packages/core/src/decision-lineage';
import {validateFlowTrackingProfile} from '@/packages/core/src';
import {getAcceptanceAvailability,getCanonicalStatusPresentation,getExecutionPresentation,probeWorkAction} from '@/packages/core/src/work-presentation';
import type {AgentRegistration} from './agents-panel';
import {workspaceContent} from '@/packages/frontend/src/entities/specification';
import {WorkspaceAccordion,WorkspaceSelect,WorkspaceTextarea} from './workspace-ui';
import {WorkStatus} from '@/packages/frontend/src/entities/work';

/** Оформление элементов этого модуля; общие элементы используют workspacePresentation. */
const presentationSlots={
  flatPanel:"min-w-0 rounded-[10px] border-solid border-ouro-border at-most-520:rounded-[8px] mb-[22px] border-0 bg-transparent p-0 at-most-520:p-0",
  decisionError:"my-[15px] rounded-[7px] border border-solid border-[color:var(--negative)] bg-[var(--negative-surface)] px-[16px] py-[14px] text-[color:var(--negative)] text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",
  decisionResult:"border-0 border-l-2 border-solid border-ouro-positive px-[14px] py-[10px] text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",
  acceptanceFormError:"rounded-[7px] border border-solid border-[color:var(--negative)] bg-[var(--negative-surface)] px-[16px] py-[14px] m-[8px_0_20px] text-[12px] text-ouro-text-muted",
} as const;

export type WorkspaceCommand=(payload:Record<string,unknown>,slot:string,label:string)=>Promise<boolean>;
const viewHuman=(state:ProjectState):Actor=>({id:'workspace-view-human',kind:'human',projectIds:[state.projectId]});
const message=(error:unknown)=>error instanceof Error?error.message:'Не удалось выполнить действие.';
const terminal=new Set<Execution['state']>(['succeeded','failed','cancelled','skipped']);

/** Задаёт состояние, список агентов и команду для формы назначения попытки по ревизии. */
type StartAttemptProps={spec:Spec;revision:SpecRevision;state:ProjectState;agents:AgentRegistration[];command:WorkspaceCommand;disabled:boolean;actor?:Actor;className?:string};
export function WorkspaceStartAttempt(props:StartAttemptProps){return <StartAttemptForm key={props.revision.id} {...props}/>;}
function StartAttemptForm({spec,revision,state,agents,command,disabled,actor,className=''}:StartAttemptProps){
  const available=agents.filter(agent=>!agent.revokedAt);
  const [agentId,setAgentId]=useState(''),[tracking,setTracking]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const chosen=available.some(agent=>agent.id===agentId)?agentId:available[0]?.id??'';
  let profileReason='';try{validateFlowTrackingProfile(revision.flow);}catch(e){profileReason=message(e);}
  if(spec.activeRevisionId!==revision.id)return <p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>Историческая ревизия доступна только для чтения. Назначение относится к активному ожиданию.</p>;
  if(['done','invalidated'].includes(spec.state))return null;
  const body={type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:chosen,...(tracking?{flowTracking:'enforced'}:{})};
  const gate=probeWorkAction(state,body,actor??viewHuman(state));
  const unavailable=!chosen?'Подключите агента для новой попытки.':gate.reason;
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(disabled||busy||!gate.allowed||!chosen)return;
    setBusy(true);setError('');
    try{await command(body,`start:${spec.id}`,'Назначить попытку по ревизии');}catch(e){setError(message(e));}finally{setBusy(false);}
  };
  return <section className={twMerge("ws-start-attempt","mt-[20px] border-0 border-t border-solid border-ouro-border py-[20px]",className)} aria-label="Назначить попытку по ревизии">
    <h3 className={twMerge(ui.h3,"leading-[1.5]")}>Назначить попытку по этому ожиданию</h3><p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>Активация ревизии сама не запускает работу. Выберите зарегистрированного агента и явно назначьте попытку.</p>
    {error&&<p role="alert" className={twMerge(ui.paragraph,"ws-error",ui.error,ui.paragraph)}>{error}</p>}
    <form className={ui.form} onSubmit={submit}>
      <label className={ui.label}>Агент для новой попытки<WorkspaceSelect aria-label="Агент для новой попытки" value={chosen} onValueChange={selectedValue=>setAgentId(selectedValue)} required><option value="">Выберите подключение</option>{available.map(agent=><option key={agent.id} value={agent.id}>{agent.name} · {agent.id.slice(0,8)}</option>)}</WorkspaceSelect></label>
      <label className={twMerge(ui.label,"ws-check","flex flex-wrap items-center gap-[8px]")}><input className={twMerge("leading-[1.6]")} type="checkbox" checked={tracking} disabled={!!profileReason} onChange={event=>setTracking(event.target.checked)}/>Строгий учёт проходов</label>
      {profileReason&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>{profileReason}</p>}
      {!gate.allowed&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)} role="status">Назначение недоступно: {unavailable}</p>}
      <button className={twMerge(ui.button,"ws-primary",ui.primary,"leading-[1.6]")} disabled={disabled||busy||!chosen||!gate.allowed}>Назначить попытку</button>
    </form>
  </section>;
}

type DecisionsProps={state:ProjectState;specId?:string;revisionId?:string;executionId?:string;requestId?:string;onOpenRequest?:(requestId:string)=>void;agents:AgentRegistration[];command:WorkspaceCommand;disabled:boolean;actor?:Actor};
const requestKinds=[['Question','Вопросы'],['Fork','Развилки'],['Blocker','Блокеры']] as const;
const requestStates=['pending','resolved','withdrawn','superseded'] as const;
/** Показывает запросы к человеку в заданной области и формы ответа и дальнейших решений. */
export function WorkspaceDecisions({state,specId,revisionId,executionId,requestId,onOpenRequest,agents,command,disabled,actor}:DecisionsProps){
  const inScope=(request:DecisionRequest)=>(!specId||request.specId===specId)&&(!revisionId||request.specRevisionId===revisionId)&&(!executionId||request.executionId===executionId);
  const selected=requestId?state.requests.find(request=>request.id===requestId&&inScope(request)):undefined;
  const requests=requestId?(selected?[selected]:[]):currentDecisionRequests(state).filter(inScope);
  const renderRequest=(request:DecisionRequest)=>onOpenRequest&&!requestId?<article className={twMerge("ws-request ws-request-compact","min-w-0 border-0 border-t border-solid border-ouro-border py-[24px]")} key={request.id} data-request-id={request.id}>
    <div className={twMerge("ws-section-top",ui.sectionHeading)}><span className={twMerge("ws-badge",ui.badge)}>{request.kind==='Question'?'Вопрос':request.kind==='Fork'?'Развилка':'Блокер'}</span><WorkStatus presentation={getCanonicalStatusPresentation(request.state)}/></div>
    <button type="button" className={twMerge(ui.button,"ws-event-link","mt-[8px] px-[8px] py-[4px] text-[10px]","leading-[1.6]")} onClick={()=>onOpenRequest(request.id)}>{request.title}</button>
    <RequestScope request={request} state={state} agents={agents}/>
    <p className={twMerge(ui.paragraph,"ws-muted","text-ouro-text-muted text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}>{request.question??request.reason??request.context}</p>
    {request.decision&&request.decision.outcome.kind!=='reject'&&<p className={twMerge(ui.paragraph,"ws-muted","text-ouro-text-muted text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}>{request.decision.appliedAt?'Применение подтверждено агентом.':'Применение ещё не подтверждено агентом.'}</p>}
  </article>:<DecisionCard key={request.id} request={request} state={state} agents={agents} command={command} disabled={disabled} actor={actor}/>;
  return <section className={twMerge("ws-panel",presentationSlots.flatPanel,"border-none border-current")} aria-label="Вопросы и решения">
    <h2 className={twMerge(ui.h2,"leading-[1.4]")}>Вопросы и решения</h2><p className={twMerge(ui.paragraph,"m-[8px_0_20px] text-[12px] text-ouro-text-muted",ui.paragraph)}>Ответ, применение решения и разрешение продолжения — отдельные действия.</p>
    {!requests.length&&<p className={twMerge(ui.paragraph,"ws-muted","m-[8px_0_20px] text-[12px] text-ouro-text-muted",ui.paragraph)}>{requestId?'Запрос не найден в выбранной области.':'Запросов в выбранной области нет. Новые вопросы, развилки и блокеры появятся по мере работы.'}</p>}
    {requestId?requests.map(renderRequest):requestKinds.map(([kind,label])=>{
      const kindRequests=requests.filter(request=>request.kind===kind);
      return kindRequests.length>0&&<section key={kind} className={"mt-[26px] min-w-0"} aria-label={`${label} · ${kindRequests.length}`} data-request-kind={kind}>
        <h3 className={twMerge(ui.h3,"m-[0_0_12px] flex items-center gap-[10px]","leading-[1.5]")}>{label}<span className={twMerge("ws-badge",ui.badge)}>{kindRequests.length}</span></h3>
        {requestStates.map(requestState=>{
          const stateRequests=kindRequests.filter(request=>request.state===requestState);
          return stateRequests.length>0&&<div key={requestState} className={"mt-[18px] min-w-0"} data-request-state={requestState}>
            <h4 className={twMerge(ui.h4,"m-[0_0_12px] flex items-center gap-[10px] text-[12px] font-medium text-ouro-text-muted","leading-[1.5]")}>{getCanonicalStatusPresentation(requestState).label}<span className={twMerge("ws-badge",ui.badge)}>{stateRequests.length}</span></h4>
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
  return <p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph,"text-[12px] leading-[1.75] whitespace-pre-wrap [overflow-wrap:break-word]")}>{spec?.humanId??request.specId} · r{revision?.revision??'?'} · попытка {attempt<0?'не найдена':`#${attempt+1}`} · {agents.find(agent=>agent.id===request.agentId)?.name??request.agentId}</p>;
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
  return <article className={twMerge("ws-request","min-w-0 border-0 border-t border-solid border-ouro-border py-[24px]")} aria-label={`Запрос: ${request.title}`} data-request-id={request.id}>
    <div className={twMerge("ws-section-top",ui.sectionHeading)}><span className={twMerge("ws-badge",ui.badge)}>{request.kind==='Question'?'Вопрос':request.kind==='Fork'?'Развилка':'Блокер'}</span><WorkStatus presentation={getCanonicalStatusPresentation(request.state)} showCode/></div>
    <h3 className={twMerge(ui.h3,"leading-[1.5]")}>{request.title}</h3><RequestScope request={request} state={state} agents={agents}/><p className={twMerge(ui.paragraph,"text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}>{request.context}</p>
    {request.question&&<p className={twMerge(ui.paragraph,"text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}><strong>{request.question}</strong></p>}{request.reason&&<p className={twMerge(ui.paragraph,"text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}>{request.reason}</p>}{request.expected&&<p className={twMerge(ui.paragraph,"text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}><strong>Ожидалось:</strong> {request.expected}</p>}{request.actual&&<p className={twMerge(ui.paragraph,"text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}><strong>Наблюдается:</strong> {request.actual}</p>}{request.impact&&<p className={twMerge(ui.paragraph,"text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}><strong>Влияние:</strong> {request.impact}</p>}
    {error&&<p role="alert" className={twMerge(ui.paragraph,"ws-error",presentationSlots.decisionError,ui.paragraph)}>{error}</p>}
    {request.state==='pending'&&active?<form className={ui.form} onSubmit={submit}>
      {request.kind==='Question'?<label className={ui.label}>Ответ агенту<WorkspaceTextarea aria-label={`Ответ на вопрос ${request.title}`} value={answer} onChange={event=>setAnswer(event.target.value)} required={!reject} rows={3}/></label>:<label className={ui.label}>Выбор человека<WorkspaceSelect aria-label={`Решение по запросу ${request.title}`} value={option} onValueChange={selectedValue=>setOption(selectedValue)} disabled={reject}>{request.options.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</WorkspaceSelect></label>}
      {request.options.length>0&&<ul className={"pl-[18px]"}>{request.options.map(item=><li className={"text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]"} key={item.id}><strong>{item.title}</strong> — {item.description}</li>)}</ul>}
      <label className={twMerge(ui.label,"ws-check","flex flex-wrap items-center gap-[8px]")}><input className={twMerge("leading-[1.6]")} type="checkbox" checked={reject} onChange={event=>setReject(event.target.checked)}/>Отклонить с объяснением</label>
      {reject&&<label className={ui.label}>Причина отклонения<WorkspaceTextarea value={reason} onChange={event=>setReason(event.target.value)} required rows={2}/></label>}
      {!eligibility.allowed&&<p className={twMerge(ui.paragraph,"ws-muted","text-ouro-text-muted text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)} role="status">Решение недоступно: {eligibility.reason}</p>}
      <button disabled={disabled||busy||!formValid||!eligibility.allowed} className={twMerge(ui.button,"ws-primary",ui.primary,"leading-[1.6]")}>Записать решение</button>
    </form>:<>
      {outcome&&<p className={twMerge(ui.paragraph,"ws-decision-result",presentationSlots.decisionResult,ui.paragraph)}>{outcome.kind==='answer'?`Ответ: ${outcome.answer}`:outcome.kind==='approve'?`Выбрано: ${request.options.find(item=>item.id===outcome.chosenOptionId)?.title??outcome.chosenOptionId}`:`Отклонено: ${outcome.reason}`}</p>}
      {outcome&&outcome.kind!=='reject'&&<p className={twMerge(ui.paragraph,"text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}>{request.decision?.appliedAt?'Агент подтвердил применение решения.':current?'Ожидается подтверждение применения агентом.':'Прежнее решение сохранено в истории. Его заменило новое решение этой цепочки.'}</p>}
      {!active&&<p className={twMerge(ui.paragraph,"ws-muted","text-ouro-text-muted text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}>Запрос относится к прежней ревизии и доступен только для чтения.</p>}
    </>}
    {request.kind==='Blocker'&&outcome?.kind==='approve'&&active&&!request.clearedEvidence&&<div className={twMerge("ws-remediation","mt-[20px] grid gap-[12px] rounded-[6px] border border-solid border-ouro-border p-[16px]")}>
      <p className={twMerge(ui.paragraph,"text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}>{remediation.length?'Попытки устранения: '+remediation.map(item=>getExecutionPresentation(item).label).join(', '):'План выбран. Разрешите отдельную попытку устранения; снятие блокера подтвердит назначенный агент.'}</p>
      <label className={ui.label}>Агент для устранения<WorkspaceSelect aria-label="Агент для устранения" value={chosen} onValueChange={selectedValue=>setAgentId(selectedValue)}><option value="">Выберите подключение</option>{available.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</WorkspaceSelect></label>
      {!remediationGate.allowed&&<p className={twMerge(ui.paragraph,"ws-muted","text-ouro-text-muted text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)} role="status">Устранение недоступно: {!chosen?'Выберите действующее подключение.':remediationGate.reason}</p>}
      <button className={twMerge(ui.button,"leading-[1.6]")} disabled={disabled||busy||!chosen||!remediationGate.allowed} onClick={()=>{setBusy(true);setError('');void command({type:'authorizeRemediation',decisionRequestId:request.id,agentId:chosen},`remediation:${request.id}`,'Разрешить устранение блокера').catch(e=>setError(message(e))).finally(()=>setBusy(false));}}>Разрешить устранение блокера</button>
    </div>}
    {request.clearedEvidence&&<p className={twMerge(ui.paragraph,"text-[12px] whitespace-pre-wrap [overflow-wrap:break-word]",ui.paragraph)}>Блокер устранён: {request.clearedEvidence}</p>}
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
  return <section className={twMerge("ws-execution-controls","mt-[20px]")} aria-label="Управление попыткой">
    {error&&<p role="alert" className={twMerge(ui.paragraph,"ws-error",ui.error,ui.paragraph)}>{error}</p>}
    {awaitingApplication>0&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)} role="status">Решений без подтверждения применения: {awaitingApplication}. Применение решения и разрешение продолжения — отдельные факты.</p>}
    {historical&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>Попытка относится к прежней ревизии. Новое исполнение требует активного ожидания; остановка прежней работы остаётся доступной по её состоянию.</p>}
    {['waiting_for_human','paused'].includes(execution.state)&&!execution.resumeAuthorized&&<>
      <button className={twMerge(ui.button,"ws-primary",ui.primary,"leading-[1.6]")} disabled={disabled||busy||!resume.allowed} onClick={()=>void run({type:'resumeExecution',executionId:execution.id},'Разрешить продолжение')}>Разрешить продолжение</button>
      {!resume.allowed&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)} role="status">Продолжение недоступно: {resume.reason}</p>}
    </>}
    {execution.resumeAuthorized&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)} role="status">{execution.state==='queued'?'Запуск разрешён. Ожидается фактическое подтверждение агента.':'Продолжение разрешено. Ожидается отдельное MCP-подтверждение агента.'}</p>}
    {execution.stopConfirmation==='unknown'&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)} role="status">Разрешение отменено, но фактическая остановка не подтверждена. До отдельного свидетельства оператора новая работа запрещена.</p>}
    {!terminal.has(execution.state)&&<WorkspaceAccordion title="Остановка и отмена">
      <label className={ui.label}>Причина остановки<input className={twMerge(ui.input,"leading-[1.6]")} value={reason} onChange={event=>setReason(event.target.value)}/></label>
      <div className={twMerge("ws-actions",ui.actions)}>
        {!execution.stopRequested&&<button className={twMerge(ui.button,"leading-[1.6]")} disabled={disabled||busy||!reason.trim()||!stop.allowed} onClick={()=>void run({type:'requestStop',executionId:execution.id,reason},'Запросить остановку')}>Запросить остановку</button>}
        {['queued','paused'].includes(execution.state)&&<button className={twMerge(ui.button,"leading-[1.6]")} disabled={disabled||busy||!reason.trim()||!cancel.allowed} onClick={()=>void run({type:'cancelExecution',executionId:execution.id,reason},'Отменить попытку')}>Отменить попытку</button>}
      </div>
      {execution.stopRequested&&<p className={twMerge(ui.paragraph,ui.paragraph)}>Остановка запрошена. Фактическую остановку подтверждает агент.</p>}
      {!stop.allowed&&!execution.stopRequested&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>{stop.reason}</p>}
      {!cancel.allowed&&['queued','paused'].includes(execution.state)&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>{cancel.reason}</p>}
    </WorkspaceAccordion>}
  </section>;
}

type AcceptanceProps={spec:Spec;revision:SpecRevision;state:ProjectState;command:WorkspaceCommand;disabled:boolean;actor?:Actor};
export function WorkspaceAcceptance(props:AcceptanceProps){return <AcceptanceForm key={props.revision.id} {...props}/>;}
function AcceptanceForm({spec,revision,state,command,disabled,actor}:AcceptanceProps){
  const [evidence,setEvidence]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const viewer=actor??viewHuman(state),gate=getAcceptanceAvailability(state,spec,revision.id,viewer);
  if(spec.state==='done'&&spec.acceptance?.revisionId===revision.id)return <section className={twMerge("ws-panel",presentationSlots.flatPanel,"border-none border-current")} aria-label="Приёмка результата"><h2 className={twMerge(ui.h2,"leading-[1.4]")}>Результат принят человеком</h2><p className={twMerge(ui.paragraph,"m-[8px_0_20px] text-[12px] text-ouro-text-muted",ui.paragraph)}>Приёмка этой ревизии уже зафиксирована отдельным человеческим решением.</p></section>;
  if(!gate.allowed)return <section className={twMerge("ws-panel",presentationSlots.flatPanel,"border-none border-current")} aria-label="Приёмка результата"><h2 className={twMerge(ui.h2,"leading-[1.4]")}>Приёмка результата</h2><p className={twMerge(ui.paragraph,"ws-muted","m-[8px_0_20px] text-[12px] text-ouro-text-muted",ui.paragraph)} role="status">Приёмка недоступна: {gate.reason}</p></section>;
  const complete=revision.dod.filter(criterion=>criterion.required).every(criterion=>!!evidence[criterion.id]?.trim());
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(disabled||busy||!complete)return;
    const body={type:'acceptSpec',specId:spec.id,specRevisionId:revision.id,evidence};
    const actual=probeWorkAction(state,body,viewer);if(!actual.allowed){setError(actual.reason??'Приёмка недоступна.');return;}
    setBusy(true);setError('');try{await command(body,`accept:${spec.id}`,'Принять результат по DoD');}catch(e){setError(message(e));}finally{setBusy(false);}
  };
  return <section className={twMerge("ws-panel",presentationSlots.flatPanel,"border-none border-current")} aria-label="Приёмка результата"><h2 className={twMerge(ui.h2,"leading-[1.4]")}>Проверить и принять результат</h2>
    <p className={twMerge(ui.paragraph,"m-[8px_0_20px] text-[12px] text-ouro-text-muted",ui.paragraph)}>Успех попытки ещё не означает выполнение DoD. Укажите собственное подтверждение каждого обязательного критерия.</p>
    {error&&<p role="alert" className={twMerge(ui.paragraph,"ws-error",presentationSlots.acceptanceFormError,ui.paragraph)}>{error}</p>}
    <form className={ui.form} onSubmit={submit}>{revision.dod.map(criterion=><label className={ui.label} key={criterion.id}>{criterion.text}{criterion.required?' · обязательно':''}<WorkspaceTextarea aria-label={`Подтверждение: ${criterion.text}`} value={evidence[criterion.id]??''} onChange={event=>setEvidence({...evidence,[criterion.id]:event.target.value})} required={criterion.required} rows={2}/></label>)}
      <button className={twMerge(ui.button,"ws-primary",ui.primary,"leading-[1.6]")} disabled={disabled||busy||!complete}>Принять результат по DoD</button>
    </form>
  </section>;
}

type RevisionFormProps={spec:Spec;revision:SpecRevision;command:WorkspaceCommand;disabled:boolean};
export function WorkspaceRevisionForm(props:RevisionFormProps){return <RevisionForm key={props.revision.id} {...props}/>;}
function RevisionForm({spec,revision,command,disabled}:RevisionFormProps){
  const [title,setTitle]=useState(revision.title),[goal,setGoal]=useState(revision.goal),[dod,setDod]=useState(revision.dod.map(item=>item.text).join('\n')),[busy,setBusy]=useState(false),[error,setError]=useState('');
  if(spec.activeRevisionId!==revision.id||['done','invalidated'].includes(spec.state))return <p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>Эта ревизия доступна только для чтения.</p>;
  return <WorkspaceAccordion className="ws-revision-form" title="Предложить новую ревизию задачи">
    <p className={twMerge(ui.paragraph,ui.paragraph)}>Новая редакция сохраняется отдельно. Активация — следующее решение человека; действующий агент должен подтвердить остановку прежней работы.</p>
    {error&&<p role="alert" className={twMerge(ui.paragraph,"ws-error",ui.error,ui.paragraph)}>{error}</p>}
    <form className={twMerge(ui.form,"mt-[16px]")} onSubmit={event=>{event.preventDefault();if(disabled||busy)return;setBusy(true);setError('');const content:RevisionContent={...workspaceContent(title,goal,dod),constraints:revision.constraints,assumptions:revision.assumptions,risks:revision.risks,inputs:revision.inputs,comment:revision.comment,...(revision.flow?{flow:revision.flow}:{}),...(revision.verification?{verification:revision.verification}:{})};void command({type:'proposeRevision',specId:spec.id,content},`revision:${spec.id}`,'Предложить новую ревизию').catch(e=>setError(message(e))).finally(()=>setBusy(false));}}>
      <label className={ui.label}>Новое название<input className={twMerge(ui.input,"leading-[1.6]")} value={title} onChange={event=>setTitle(event.target.value)} required/></label>
      <label className={ui.label}>Новая цель<WorkspaceTextarea value={goal} onChange={event=>setGoal(event.target.value)} required rows={3}/></label>
      <label className={ui.label}>Новые критерии<WorkspaceTextarea value={dod} onChange={event=>setDod(event.target.value)} required rows={3}/></label>
      <button className={twMerge(ui.button,"leading-[1.6]")} disabled={disabled||busy}>Сохранить предложение ревизии</button>
    </form>
  </WorkspaceAccordion>;
}
