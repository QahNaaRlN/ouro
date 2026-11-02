'use client';

import {useEffect,useState,type FormEvent} from 'react';
import {ArrowUpRight} from 'lucide-react';
import type {RevisionContent} from '@/packages/core/src';
import type {AgentRegistration} from './agents-panel';
import {useWorkspaceIntents,useWorkspaceSession} from './workspace-client';
import {WorkspaceSelect,WorkspaceTextarea} from './workspace-ui';
type TaskDraft={title:string;titleEdited:boolean;goal:string;dod:string;agentId:string};
const drafts=new Map<string,TaskDraft>();

export function workspaceContent(title:string,goal:string,dodText:string):RevisionContent{
  return {title,goal,dod:dodText.split('\n').filter(text=>text.trim()).map((text,index)=>({id:`criterion-${index+1}`,text,required:true})),constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
}
export default function WorkspaceTaskForm({projectId,agents,onStart,disabledReason}:{projectId:string;agents:AgentRegistration[];onStart:(agentId:string,content:RevisionContent)=>Promise<boolean>;disabledReason?:string}){
  const {actor}=useWorkspaceSession(),pending=useWorkspaceIntents(projectId,actor?.id);
  const draftKey=(actor?.id??'')+':'+projectId,previous=drafts.get(draftKey);
  const [title,setTitle]=useState(previous?.title??''),[titleEdited,setTitleEdited]=useState(previous?.titleEdited??false),[goal,setGoal]=useState(previous?.goal??''),[dod,setDod]=useState(previous?.dod??''),[agentId,setAgentId]=useState(previous?.agentId??''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{drafts.set(draftKey,{title,titleEdited,goal,dod,agentId});},[draftKey,title,titleEdited,goal,dod,agentId]);
  const available=agents.filter(agent=>!agent.revokedAt),chosen=available.some(agent=>agent.id===agentId)?agentId:'';
  useEffect(()=>{if(!agentId&&available[0])setAgentId(available[0].id);},[agentId,available[0]?.id]);
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!chosen||busy||pending.length||disabledReason)return;setBusy(true);setError('');try{if(await onStart(chosen,workspaceContent(title,goal,dod))){drafts.delete(draftKey);setGoal('');setTitle('');setTitleEdited(false);setDod('');}}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <section className="ws-panel" aria-label="Назначить задачу агенту"><h2>Задача для подключённого агента</h2><p>Агент получит одну назначенную попытку. Она останется в ожидании до его настоящего MCP-подтверждения.</p>{error&&<p role="alert" className="ws-error">{error}</p>}<form onSubmit={submit}><label>Исполнитель задачи<WorkspaceSelect aria-label="Исполнитель задачи" value={chosen} onValueChange={selectedValue=>setAgentId(selectedValue)} required><option value="">Выберите подключение</option>{available.map(agent=><option key={agent.id} value={agent.id}>{agent.name} · {agent.id.slice(0,8)}</option>)}</WorkspaceSelect></label><label>Задача для агента<WorkspaceTextarea aria-label="Задача для агента" value={goal} onChange={event=>{setGoal(event.target.value);if(!titleEdited)setTitle(event.target.value.split('\n')[0].slice(0,160));}} required rows={5} placeholder="Опишите цель и ожидаемый результат своими словами."/></label><label>Название задачи<input aria-label="Название задачи" value={title} onChange={event=>{setTitleEdited(true);setTitle(event.target.value);}} required maxLength={200}/></label><label>Критерии готовности<WorkspaceTextarea aria-label="Критерии готовности" value={dod} onChange={event=>setDod(event.target.value)} required rows={3} placeholder="По одному проверяемому критерию на строку."/></label>{dod.trim()&&<div className="ws-dod-preview" aria-label="Критерии перед запуском"><strong>Будет проверено человеком</strong><ul>{dod.split('\n').filter(text=>text.trim()).map((text,index)=><li key={index}>{text}</li>)}</ul></div>}<p className="ws-muted">Нажатие назначает эту задачу. Подробный план, ответы на вопросы и приёмка результата согласуются отдельно.</p><button className="ws-primary" type="submit" disabled={!actor||busy||!chosen||!title.trim()||!goal.trim()||!dod.trim()||!!pending.length||!!disabledReason}><ArrowUpRight size={16}/>Назначить работу</button>{disabledReason&&<p className="ws-muted">{disabledReason}</p>}{!available.length&&<p className="ws-muted">Сначала зарегистрируйте подключение MCP-агента в этом проекте.</p>}</form></section>;
}
