'use client';

import Link from 'next/link';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {DomainEvent,Execution,ProjectState,RevisionContent} from '@/packages/core/src';
import {createProjectSnapshotAdopter,type ProjectSnapshot} from '@/lib/project-snapshot';
import {startProjectSubscription,type ProjectSubscriptionStatus} from '@/lib/project-subscription';
import WorkspaceProjectView from './workspace-project-view';
import {WorkspacePending,freezeWorkspaceIntent,readWorkspaceJSON,sendWorkspaceIntent,useWorkspaceIntents,useWorkspaceSession,type WorkspaceSnapshot} from './workspace-client';

export default function WorkspaceProjectPage({projectId}:{projectId:string}){
 const {actor,loading,error}=useWorkspaceSession();
 if(loading)return <p className="ws-loading">Открываем локальную сессию…</p>;
 if(!actor)return <div className="ws-error" role="alert">{error||'Нужна сессия локального оператора.'}</div>;
 return <ProjectScope key={projectId+':'+actor.id} projectId={projectId} actorId={actor.id}/>;
}
function ProjectScope({projectId,actorId}:{projectId:string;actorId:string}){
 const base='/api/projects/'+encodeURIComponent(projectId),adopter=useMemo(()=>createProjectSnapshotAdopter(projectId),[projectId]),live=useRef(true);
 const [metadata,setMetadata]=useState<WorkspaceSnapshot|null>(null),[snapshot,setSnapshot]=useState<ProjectSnapshot|null>(null),[error,setError]=useState(''),[status,setStatus]=useState<ProjectSubscriptionStatus>('connecting'),[busy,setBusy]=useState(false);
 const pending=useWorkspaceIntents(projectId,actorId),disabled=busy||pending.length>0;
 const apply=useCallback((value:unknown)=>{const result=adopter.adopt(value);if(result.status==='invalid')throw new Error('История проекта не подтверждена: '+result.reason+'.');if(live.current&&result.status!=='stale')setSnapshot(result.snapshot);return result.snapshot;},[adopter]);
 const refresh=useCallback(async()=>{const body=await readWorkspaceJSON<WorkspaceSnapshot>(base);if(body.project.id!==projectId||body.connection.projectId!==projectId)throw new Error('Ответ относится к другому проекту.');apply(body);if(live.current)setMetadata(body);return body;},[base,projectId,apply]);
 useEffect(()=>{live.current=true;let closed=false,subscription:ReturnType<typeof startProjectSubscription>|undefined;
  void refresh().then(()=>{if(closed)return;subscription=startProjectSubscription({adopter,onSnapshot:value=>{if(!closed)setSnapshot(value);},onStatus:value=>{if(!closed)setStatus(value);},createEventSource:url=>new EventSource(base+'/stream?'+(url.split('?')[1]??'after=0')),reconcile:()=>readWorkspaceJSON<WorkspaceSnapshot>(base)});}).catch(e=>{if(!closed)setError(e.message);});
  const timer=setInterval(()=>{void readWorkspaceJSON<Pick<WorkspaceSnapshot,'agents'|'connection'>>(base+'/agents').then(body=>{if(!closed&&body.connection.projectId===projectId)setMetadata(current=>current?{...current,agents:body.agents,connection:body.connection}:current);}).catch(()=>{});},8000);
  return()=>{closed=true;live.current=false;subscription?.close();clearInterval(timer);};
 },[refresh,adopter,base,projectId]);
 const transact=async(payload:Record<string,unknown>,slot:string,label:string,url=base+'/commands')=>{
  if(disabled)return null;const current=adopter.getSnapshot();if(!current)throw new Error('Дождитесь состояния проекта.');setBusy(true);setError('');
  try{const intent=freezeWorkspaceIntent({projectId,url,actorId,label,slot,body:{...payload,expectedVersion:payload.expectedVersion??current.cursor}}),result=await sendWorkspaceIntent<{state:ProjectState;cursor:number;events:DomainEvent[];replayed:boolean}>(intent);if(!result.ok)return null;if(live.current){apply(result.data);await refresh();}return result.data;}catch(e){if(live.current)setError((e as Error).message);return null;}finally{if(live.current)setBusy(false);}
 };
 const command=async(payload:Record<string,unknown>,slot:string,label:string)=>!!await transact(payload,slot,label);
 const assign=async(agentId:string,content:RevisionContent)=>{const result=await transact({agentId,content},'task','Назначить работу: '+content.title,base+'/tasks');return result?.events.find(event=>event.type==='ExecutionCreated')?.payload.execution as Execution??null;};
 const reload=async()=>{try{return await refresh();}catch(e){if(live.current)setError((e as Error).message);return null;}};
 if(!metadata||!snapshot)return <><Link href="/projects">← Проекты</Link>{error?<div role="alert" className="ws-error">{error}<button onClick={()=>void reload()}>Повторить чтение</button></div>:<p>Читаем проект…</p>}</>;
 return <WorkspaceProjectView metadata={metadata} state={snapshot.state} cursor={snapshot.cursor} subscriptionStatus={status} error={error} disabled={disabled} command={command} onAssign={assign} onRefresh={reload} pending={<WorkspacePending projectId={projectId} onRecovered={refresh}/>}/>;
}
