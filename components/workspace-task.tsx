'use client';
import {twMerge} from 'tailwind-merge';
import {workspacePresentation as ui} from './workspace-presentation';

import {useEffect,useState,type FormEvent} from 'react';
import {ArrowUpRight} from 'lucide-react';
import type {RevisionContent} from '@/packages/core/src';
import {workspaceContent} from '@/packages/frontend/src/entities/specification';
import type {AgentRegistration} from './agents-panel';
import {useWorkspaceIntents,useWorkspaceSession} from './workspace-client';
import {WorkspaceSelect,WorkspaceTextarea} from './workspace-ui';

/** Оформление элементов этого модуля; общие элементы используют workspacePresentation. */
const presentationSlots={
  taskPanel:"mb-[24px] min-w-0 rounded-[10px] border border-solid border-ouro-border bg-ouro-subtle p-[26px] at-most-520:rounded-[8px] at-most-520:px-[16px] at-most-520:py-[19px]",
  assignmentError:"rounded-[7px] border border-solid border-[color:var(--negative)] bg-[var(--negative-surface)] px-[16px] py-[14px] m-[8px_0_20px] text-[12px] text-ouro-text-muted",
} as const;
type TaskDraft={title:string;titleEdited:boolean;goal:string;dod:string;agentId:string};
const drafts=new Map<string,TaskDraft>();

export default function WorkspaceTaskForm({projectId,agents,onStart,disabledReason}:{projectId:string;agents:AgentRegistration[];onStart:(agentId:string,content:RevisionContent)=>Promise<boolean>;disabledReason?:string}){
  const {actor}=useWorkspaceSession(),pending=useWorkspaceIntents(projectId,actor?.id);
  const draftKey=(actor?.id??'')+':'+projectId,previous=drafts.get(draftKey);
  const [title,setTitle]=useState(previous?.title??''),[titleEdited,setTitleEdited]=useState(previous?.titleEdited??false),[goal,setGoal]=useState(previous?.goal??''),[dod,setDod]=useState(previous?.dod??''),[agentId,setAgentId]=useState(previous?.agentId??''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{drafts.set(draftKey,{title,titleEdited,goal,dod,agentId});},[draftKey,title,titleEdited,goal,dod,agentId]);
  const available=agents.filter(agent=>!agent.revokedAt),chosen=available.some(agent=>agent.id===agentId)?agentId:'';
  useEffect(()=>{if(!agentId&&available[0])setAgentId(available[0].id);},[agentId,available[0]?.id]);
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!chosen||busy||pending.length||disabledReason)return;setBusy(true);setError('');try{if(await onStart(chosen,workspaceContent(title,goal,dod))){drafts.delete(draftKey);setGoal('');setTitle('');setTitleEdited(false);setDod('');}}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <section className={twMerge("ws-panel",presentationSlots.taskPanel)} aria-label="Назначить задачу агенту"><h2 className={twMerge(ui.h2,"leading-[1.4]")}>Задача для подключённого агента</h2><p className={twMerge(ui.paragraph,"m-[8px_0_20px] text-[12px] text-ouro-text-muted",ui.paragraph)}>Агент получит одну назначенную попытку. Она останется в ожидании до его настоящего MCP-подтверждения.</p>{error&&<p role="alert" className={twMerge(ui.paragraph,"ws-error",presentationSlots.assignmentError,ui.paragraph)}>{error}</p>}<form className={ui.form} onSubmit={submit}><label className={ui.label}>Исполнитель задачи<WorkspaceSelect aria-label="Исполнитель задачи" value={chosen} onValueChange={selectedValue=>setAgentId(selectedValue)} required><option value="">Выберите подключение</option>{available.map(agent=><option key={agent.id} value={agent.id}>{agent.name} · {agent.id.slice(0,8)}</option>)}</WorkspaceSelect></label><label className={ui.label}>Задача для агента<WorkspaceTextarea aria-label="Задача для агента" value={goal} onChange={event=>{setGoal(event.target.value);if(!titleEdited)setTitle(event.target.value.split('\n')[0].slice(0,160));}} required rows={5} placeholder="Опишите цель и ожидаемый результат своими словами."/></label><label className={ui.label}>Название задачи<input className={twMerge(ui.input,"leading-[1.6]")} aria-label="Название задачи" value={title} onChange={event=>{setTitleEdited(true);setTitle(event.target.value);}} required maxLength={200}/></label><label className={ui.label}>Критерии готовности<WorkspaceTextarea aria-label="Критерии готовности" value={dod} onChange={event=>setDod(event.target.value)} required rows={3} placeholder="По одному проверяемому критерию на строку."/></label>{dod.trim()&&<div className={twMerge("ws-dod-preview","border-0 border-l-2 border-solid border-ouro-positive px-[15px] py-[8px] text-[12px] leading-[1.8]")} aria-label="Критерии перед запуском"><strong>Будет проверено человеком</strong><ul className={"my-[6px] pl-[18px]"}>{dod.split('\n').filter(text=>text.trim()).map((text,index)=><li key={index}>{text}</li>)}</ul></div>}<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>Нажатие назначает эту задачу. Подробный план, ответы на вопросы и приёмка результата согласуются отдельно.</p><button className={twMerge(ui.button,"ws-primary",ui.primary,"leading-[1.6]")} type="submit" disabled={!actor||busy||!chosen||!title.trim()||!goal.trim()||!dod.trim()||!!pending.length||!!disabledReason}><ArrowUpRight size={16}/>Назначить работу</button>{disabledReason&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>{disabledReason}</p>}{!available.length&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph)}>Сначала зарегистрируйте подключение MCP-агента в этом проекте.</p>}</form></section>;
}
