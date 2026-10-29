'use client';

import Link from 'next/link';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Check,Copy,FolderOpen,RefreshCw} from 'lucide-react';
import type {DomainEvent,Execution,ProjectState,RevisionContent} from '@/packages/core/src';
import {createProjectSnapshotAdopter,type ProjectSnapshot} from '@/lib/project-snapshot';
import {startProjectSubscription,type ProjectSubscriptionStatus} from '@/lib/project-subscription';
import Roadmap,{specLabels} from './roadmap';
import SpecFlow from './spec-flow';
import WorkspaceOnboarding from './onboarding';
import {WorkspaceOverview,WorkspaceAgentActivity,WorkspaceActivityFeed,WorkspaceSources} from './workspace-dashboard';
import WorkspaceConnectionPanel from './workspace-connection';
import WorkspaceTaskForm from './workspace-task';
import {WorkspaceProposals} from './workspace-proposals';
import WorkspaceCurrentFlowControls from './workspace-flow-controls';
import {WorkspaceAcceptance,WorkspaceDecisions,WorkspaceExecutionControls,WorkspaceRevisionForm,WorkspaceStartAttempt,type WorkspaceCommand} from './workspace-decisions';
import {WorkspacePending,freezeWorkspaceIntent,readWorkspaceJSON,sendWorkspaceIntent,useWorkspaceIntents,useWorkspaceSession,type WorkspaceSnapshot} from './workspace-client';

const executionNames:Record<Execution['state'],string>={queued:'Ожидает агента',running:'Выполняется',waiting_for_human:'Ожидает человека',paused:'Приостановлено',succeeded:'Результат предъявлен',failed:'Попытка завершилась ошибкой',cancelled:'Отменено',skipped:'Пропущено'};
const promptFor=(projectId:string,execution:Execution)=>`Работай в Ouro с проектом ${projectId} и назначенной попыткой ${execution.id}. Вызови ouro.get_context с executionId «${execution.id}», прочитай назначенную ревизию, цель и DoD. Для контекста папки используй read-only tools ouro.list_workspace_files и ouro.read_workspace_file с этим executionId; пути только относительные. Перед работой подтверди разрешённое начало через ouro.confirm_started. Файловой записи и shell в этом подключении нет: сообщи ограничение или предложи следующий шаг, если задача их требует. Сообщай реальные Action с evidence, а вопросы, развилки и блокеры — через соответствующие tools. Ожидай человеческого решения; применение, разрешение продолжения и ACK — отдельные действия. Предъяви результат через ouro.complete_execution. Не принимай DoD за человека.`;

export default function WorkspaceProjectPage({projectId}:{projectId:string}){
  const {actor,loading,error:sessionError}=useWorkspaceSession();
  if(loading)return <p className="ws-loading">Открываем локальную сессию…</p>;
  if(!actor)return <div className="ws-error" role="alert">{sessionError||'Нужна сессия локального оператора.'}</div>;
  return <ProjectScope key={`${projectId}:${actor.id}`} projectId={projectId} actorId={actor.id}/>;
}
function ProjectScope({projectId,actorId}:{projectId:string;actorId:string}){
  const base=`/api/projects/${encodeURIComponent(projectId)}`,adopter=useMemo(()=>createProjectSnapshotAdopter(projectId),[projectId]),live=useRef(true);
  const [metadata,setMetadata]=useState<WorkspaceSnapshot|null>(null),[snapshot,setSnapshot]=useState<ProjectSnapshot|null>(null),[error,setError]=useState(''),[status,setStatus]=useState<ProjectSubscriptionStatus>('connecting');
  const [selected,setSelected]=useState(''),[chosenRevision,setChosenRevision]=useState(''),[chosenExecution,setChosenExecution]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
  const pending=useWorkspaceIntents(projectId,actorId),disabled=busy||pending.length>0;
  const apply=useCallback((value:unknown)=>{const result=adopter.adopt(value);if(result.status==='invalid')throw new Error(`История проекта не подтверждена: ${result.reason}.`);if(live.current&&result.status!=='stale')setSnapshot(result.snapshot);return result.snapshot;},[adopter]);
  const refresh=useCallback(async()=>{const body=await readWorkspaceJSON<WorkspaceSnapshot>(base);if(body.project.id!==projectId||body.connection.projectId!==projectId)throw new Error('Ответ относится к другому проекту.');apply(body);if(live.current)setMetadata(body);return body;},[base,projectId,apply]);
  useEffect(()=>{live.current=true;let closed=false,subscription:ReturnType<typeof startProjectSubscription>|undefined;
    void refresh().then(()=>{if(closed)return;subscription=startProjectSubscription({adopter,onSnapshot:value=>{if(!closed)setSnapshot(value);},onStatus:value=>{if(!closed)setStatus(value);},createEventSource:url=>new EventSource(`${base}/stream?${url.split('?')[1]??'after=0'}`),reconcile:()=>readWorkspaceJSON<WorkspaceSnapshot>(base)});}).catch(e=>{if(!closed)setError(e.message);});
    const timer=setInterval(()=>{void readWorkspaceJSON<Pick<WorkspaceSnapshot,'agents'|'connection'>>(`${base}/agents`).then(body=>{if(!closed&&body.connection.projectId===projectId)setMetadata(current=>current?{...current,agents:body.agents,connection:body.connection}:current);}).catch(()=>{});},8000);
    return()=>{closed=true;live.current=false;subscription?.close();clearInterval(timer);};
  },[refresh,adopter,base,projectId]);
  const transact=async(payload:Record<string,unknown>,slot:string,label:string,url=`${base}/commands`)=>{
    if(disabled)return null;const current=adopter.getSnapshot();if(!current)throw new Error('Дождитесь состояния проекта.');setBusy(true);setError('');
    try{const intent=freezeWorkspaceIntent({projectId,url,actorId,label,slot,body:{...payload,expectedVersion:payload.expectedVersion??current.cursor}}),result=await sendWorkspaceIntent<{state:ProjectState;cursor:number;events:DomainEvent[];replayed:boolean}>(intent);if(!result.ok)return null;if(live.current){apply(result.data);await refresh();}return result.data;}finally{if(live.current)setBusy(false);}
  };
  const command:WorkspaceCommand=async(payload,slot,label)=>!!await transact(payload,slot,label);
  const start=async(agentId:string,content:RevisionContent)=>{const result=await transact({agentId,content},'task',`Начать работу: ${content.title}`,`${base}/tasks`);if(result&&live.current){const event=result.events.find(event=>event.type==='ExecutionCreated'),execution=event?.payload.execution as Execution|undefined;if(execution){setSelected(execution.specId);setChosenExecution(execution.id);setChosenRevision(execution.specRevisionId);}}return !!result;};
  if(!metadata||!snapshot)return <><Link href="/projects">← Проекты</Link>{error?<div role="alert" className="ws-error">{error}<button onClick={()=>void refresh().catch(e=>setError(e.message))}>Повторить чтение</button></div>:<p>Читаем проект…</p>}</>;
  const state=snapshot.state,spec=state.specs.find(item=>item.id===selected)??state.specs.at(-1),revision=state.revisions.find(item=>item.id===chosenRevision&&item.specId===spec?.id)??state.revisions.find(item=>item.id===spec?.activeRevisionId)??state.revisions.find(item=>item.id===spec?.revisionIds.at(-1));
  const executions=state.executions.filter(item=>item.specId===spec?.id),execution=executions.find(item=>item.id===chosenExecution)??executions.filter(item=>item.kind==='primary').at(-1)??executions.at(-1),latestRevision=state.revisions.find(item=>item.id===spec?.revisionIds.at(-1));
  const copyPrompt=async()=>{if(!execution)return;try{await navigator.clipboard.writeText(promptFor(projectId,execution));setCopied(true);}catch{setError('Буфер обмена недоступен. Скопируйте текст инструкции из поля.');}};
  const pick=(specId:string)=>{setSelected(specId);setChosenRevision('');setChosenExecution('');setCopied(false);};
  return <>
    <header className="ws-heading">
      <div><Link href="/projects" className="ws-back">← Проекты</Link><h1>{metadata.project.name}</h1><p className="ws-path"><FolderOpen size={15}/>{metadata.project.rootPath??'Demo · прежний учебный проект'}</p></div>
      <button aria-label="Обновить проект" onClick={()=>void refresh().catch(e=>setError(e.message))}><RefreshCw size={16}/></button>
    </header>
    <WorkspaceOnboarding scope="project" hasFlow={!!spec&&!!revision}/>
    <div className="ws-project-meta"><code>projectId: {projectId}</code><span role="status">{status==='connected'?'История обновляется':status==='reload-required'?'Нужно перечитать историю':status==='reconnecting'?'Восстанавливаем обновления':'Подключаем обновления'} · v{snapshot.cursor}</span></div>
    {error&&<div role="alert" className="ws-error">{error}</div>}
    <WorkspaceOverview state={state} agents={metadata.agents}/><WorkspaceAgentActivity state={state} agents={metadata.agents} onSelect={pick} compact/>
    <WorkspacePending projectId={projectId} onRecovered={refresh}/>
    <details className="ws-setup" open={!state.specs.length}>
      <summary>Назначить работу агенту</summary>
      {metadata.project.kind==='demo'&&<p className="ws-muted">Учебный проект не привязан к папке. Добавьте папку в каталоге либо используйте <Link href="/">прежний Human View</Link>.</p>}
      <div className="ws-setup-grid"><WorkspaceTaskForm projectId={projectId} agents={metadata.agents} onStart={start} disabledReason={metadata.project.kind==='demo'?'Для назначения выберите папку-проект.':undefined}/><WorkspaceConnectionPanel projectId={projectId} agents={metadata.agents} connection={metadata.connection} onRefresh={refresh}/></div>
    </details>
    <div className="ws-dashboard-grid">
      <div className="ws-dashboard-main">
        <section className="ws-panel ws-work" aria-label="Дорожная карта проекта" data-onboarding="project-roadmap">
          <div className="ws-section-top"><h2>Дорожная карта</h2><span className="ws-muted">{state.specs.length} задач</span></div>
          {!state.specs.length?<div className="ws-empty">Задач пока нет. Назначьте первую работу агенту выше.</div>:<>
            <div className="ws-map" aria-label="Граф спецификаций проекта"><Roadmap state={state} selected={spec?.id??null} onSelect={pick} query="" status="" layoutKey={0}/></div>
            <div className="ws-task-list" role="region" aria-label="Задачи проекта">{state.specs.map(item=>{const last=state.executions.filter(attempt=>attempt.specId===item.id&&attempt.kind==='primary').at(-1);return <button type="button" aria-pressed={item.id===spec?.id} key={item.id} onClick={()=>pick(item.id)} data-spec-id={item.id}><span className="ws-muted">{item.humanId}</span><strong>{item.title}</strong><span className="ws-badge">{item.state==='done'?'Принято человеком':last?executionNames[last.state]:specLabels[item.state]}</span></button>;})}</div>
          </>}
        </section>
        {spec&&revision&&<>
          <section className="ws-panel ws-selected-task" aria-label="Выбранная задача" data-project-id={projectId} data-spec-id={spec.id}>
            <div className="ws-section-top"><div><span className="ws-muted">{spec.humanId} · {specLabels[spec.state]}</span><h2>{spec.title}</h2></div><label>Ревизия задачи<select aria-label="Ревизия задачи" value={revision.id} onChange={event=>setChosenRevision(event.target.value)}>{state.revisions.filter(item=>item.specId===spec.id).map(item=><option key={item.id} value={item.id}>r{item.revision}{item.id===spec.activeRevisionId?' · активная':' · предложение'}</option>)}</select></label></div>
            <p className="ws-goal">{revision.goal}</p><details className="ws-expectation-details"><summary>Критерии готовности · {revision.dod.length}</summary><ul>{revision.dod.map(item=><li key={item.id}>{item.text}{!item.required&&' · необязательный'}</li>)}</ul></details>
            {execution&&<section className="ws-attempt" aria-label="Попытка задачи" data-execution-id={execution.id}>
              <div className="ws-section-top"><h3>{executionNames[execution.state]}</h3><label>Попытка<select aria-label="Попытка задачи" value={execution.id} onChange={event=>{setChosenExecution(event.target.value);setCopied(false);}}>{executions.map((item,index)=><option key={item.id} value={item.id}>#{index+1} · {executionNames[item.state]}{item.kind==='remediation'?' · устранение блокера':''}</option>)}</select></label></div>
              <p>Назначена: {metadata.agents.find(agent=>agent.id===execution.agentId)?.name??execution.agentId}</p><details><summary>Назначение и управление попыткой</summary><code className="ws-path">executionId: {execution.id}</code>
              {execution.state==='queued'&&<p>Передайте инструкцию агенту в своём MCP-клиенте. До фактического ACK работа остаётся в ожидании.</p>}
              {execution.resultEvidence&&<p className="ws-evidence">Результат агента: {execution.resultEvidence}</p>}
              <details><summary>Инструкция для MCP-агента</summary><textarea aria-label="Инструкция задачи для агента" readOnly rows={8} value={promptFor(projectId,execution)}/></details>
              <button onClick={()=>void copyPrompt()}>{copied?<Check size={15}/>:<Copy size={15}/>}Скопировать задание для агента</button>
              </details><WorkspaceExecutionControls state={state} execution={execution} command={command} disabled={disabled}/>
            </section>}
            {latestRevision&&latestRevision.id!==spec.activeRevisionId&&<div className="ws-revision-notice"><p>Есть предложение r{latestRevision.revision}. Проверьте его перед активацией.</p><button disabled={disabled} onClick={()=>void command({type:'activateRevision',specId:spec.id,revisionId:latestRevision.id},`activate:${spec.id}`,'Активировать новую ревизию').catch(e=>setError(e.message))}>Активировать новую ревизию</button></div>}
            <WorkspaceStartAttempt key={`start:${revision.id}`} spec={spec} revision={revision} state={state} agents={metadata.agents} command={command} disabled={disabled}/><WorkspaceRevisionForm key={revision.id} spec={spec} revision={revision} command={command} disabled={disabled}/>
          </section>
          <section className="ws-panel ws-work" aria-label="Текущий процесс" data-onboarding="project-flow"><div className="ws-section-top"><h2>Процесс выбранной спеки</h2><span className="ws-muted">r{revision.revision}{revision.id===spec.activeRevisionId?' · активная':' · предложение'}</span></div><WorkspaceCurrentFlowControls state={state} execution={execution?.specRevisionId===revision.id?execution:undefined} command={command} disabled={disabled}/>{!revision.flow&&<p className="ws-muted">Схема не задана этой ревизией. Предложение агента с Flow появится отдельно до человеческого рассмотрения и активации.</p>}<SpecFlow revision={revision} state={state} busy={disabled} readOnly onSave={async()=>false}/></section>
          <WorkspaceAcceptance key={revision.id} spec={spec} revision={revision} state={state} command={command} disabled={disabled}/>
        </>}
        <WorkspaceProposals state={state} command={command} disabled={disabled} onOpenSpec={pick}/>
        <WorkspaceSources state={state} rootPath={metadata.project.rootPath}/>
      </div>
      <aside className="ws-dashboard-side" aria-label="Внимание и события">
        <WorkspaceDecisions state={state} agents={metadata.agents} command={command} disabled={disabled}/>
        <WorkspaceActivityFeed state={state} onSelect={pick}/>
      </aside>
    </div>
  </>;
}
