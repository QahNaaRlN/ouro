'use client';

import Link from 'next/link';
import type {Execution,RevisionContent} from '@/packages/core/src';
import {useProjectSession} from './project-session-provider';
import WorkspaceProjectView from './workspace-project-view';
import {WorkspacePending,useWorkspaceIntents,useWorkspaceSession} from './workspace-client';

export default function WorkspaceProjectPage({projectId}:{projectId:string}){
 const {actor,accessEpoch,loading,error}=useWorkspaceSession();
 if(loading)return <p className="ws-loading">Проверяем сессию…</p>;
 if(!actor)return <div className="ws-error" role="alert">{error||'Войдите в свой аккаунт Ouro.'}<Link href="/projects">Войти</Link></div>;
 return <ProjectScope key={projectId+':'+actor.id+':'+accessEpoch} projectId={projectId} actorId={actor.id} accessEpoch={accessEpoch}/>;
}
function ProjectScope({projectId,actorId,accessEpoch}:{projectId:string;actorId:string;accessEpoch:number}){
 const owner=useProjectSession({projectId,actorId,accessEpoch},'workspace'),{snapshot,view}=owner;
 const metadata=snapshot&&view.metadata?{...snapshot,...view.metadata,agents:[...view.metadata.agents],connection:{...view.metadata.connection,stdioArgs:[...view.metadata.connection.stdioArgs]}}:null;
 const error=view.error?.message??'',status=view.status,pending=useWorkspaceIntents(projectId,actorId),disabled=view.busy||!view.active||pending.length>0||metadata?.project.role==='Viewer';
 const command=async(payload:Record<string,unknown>,slot:string,label:string)=>{if(disabled)return false;try{const result=await owner.execute(payload,'execute-command',{slot,label});if(result.status!=='confirmed'||!owner.session?.getView().active)return false;await owner.refresh().catch(()=>{});return true;}catch{return false;}};
 const assign=async(agentId:string,content:RevisionContent)=>{if(disabled)return null;try{const result=await owner.execute({agentId,content},'start-project-work',{slot:'task',label:'Назначить работу: '+content.title});if(result.status!=='confirmed'||!owner.session?.getView().active)return null;await owner.refresh().catch(()=>{});return result.receipt.events.find(event=>event.type==='ExecutionCreated')?.payload.execution as Execution??null;}catch{return null;}};
 const reload=async()=>{try{return await owner.refresh();}catch{return null;}};
 const receipt=(value:unknown)=>{const result=owner.session?.admit(value);if(!result||result.status==='invalid')throw new Error('История проекта не подтверждена.');};
 if(!metadata||!snapshot)return <><Link href="/projects">← Проекты</Link>{error?<div role="alert" className="ws-error">{error}<button onClick={()=>void reload()}>Повторить чтение</button></div>:<p>Читаем проект…</p>}</>;
 return <WorkspaceProjectView metadata={metadata} state={snapshot.state} cursor={snapshot.cursor} subscriptionStatus={status} error={error} disabled={disabled} command={command} onAssign={assign} onRefresh={reload} pending={<WorkspacePending projectId={projectId} onRecovered={owner.refresh} onReceipt={receipt}/>}/>;
}
