'use client';

import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import type {Actor,ProjectState} from '@/packages/core/src';
import type {AgentRegistration} from './agents-panel';

export type WorkspaceProject={id:string;name:string;rootPath:string|null;kind:'folder'|'demo';createdAt:string;createdBy:string;bindingId?:string;rootIdentity?:unknown};
export type WorkspaceConnection={httpUrl:string;stdioCommand:string;stdioArgs:string[];projectId:string};
export type WorkspaceSnapshot={project:WorkspaceProject;state:ProjectState;cursor:number;agents:AgentRegistration[];connection:WorkspaceConnection};
export type WorkspaceIntent={key:string;projectId:string|null;url:string;actorId:string;body:string;requestId:string;expectedVersion?:number;label:string;status:'sending'|'unknown'|'rejected';message:string};
type WireError={error?:{code?:string;message?:string}};
const pending=new Map<string,WorkspaceIntent>(),listeners=new Set<()=>void>();
let pendingVersion=0,unloadInstalled=false;
function notify(){pendingVersion++;listeners.forEach(listener=>listener());}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
const provenRejections=new Set(['VERSION_CONFLICT','REVISION_CONFLICT','INVALID_TRANSITION','VALIDATION_ERROR','DECISION_ALREADY_RESOLVED','IDEMPOTENCY_CONFLICT','REQUEST_ID_CONFLICT','DEPENDENCY_CYCLE','PENDING_LIMIT_EXCEEDED','CORRECTION_REQUIRES_REVISION']);

export async function readWorkspaceJSON<T>(url:string,signal?:AbortSignal):Promise<T>{
  const response=await fetch(url,{cache:'no-store',credentials:'same-origin',signal}),body=await response.json() as T&WireError;
  if(!response.ok)throw new Error(body.error?.message??'Не удалось прочитать рабочее место.');
  return body;
}
export function freezeWorkspaceIntent(input:{projectId:string|null;url:string;actorId:string;label:string;slot:string;body:Record<string,unknown>}):WorkspaceIntent{
  const requestId=typeof input.body.requestId==='string'?input.body.requestId:crypto.randomUUID();
  return {key:`${input.actorId}:${input.projectId??'catalog'}:${input.slot}`,projectId:input.projectId,url:input.url,actorId:input.actorId,label:input.label,requestId,expectedVersion:typeof input.body.expectedVersion==='number'?input.body.expectedVersion:undefined,body:JSON.stringify({...input.body,requestId}),status:'sending',message:''};
}
export async function sendWorkspaceIntent<T=unknown>(intent:WorkspaceIntent):Promise<{ok:true;data:T}|{ok:false}> {
  const existing=pending.get(intent.key);
  if(existing&&existing.body!==intent.body)throw new Error('Сначала восстановите исходное действие.');
  pending.set(intent.key,{...intent,status:'sending',message:''});notify();
  try{
    const response=await fetch(intent.url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Ouro-Expected-Participant':intent.actorId,...(intent.projectId?{'X-Ouro-Expected-Project':intent.projectId}:{})},body:intent.body});
    const body=await response.json() as T&WireError;
    if(response.ok){pending.delete(intent.key);notify();return {ok:true,data:body};}
    const rejected=response.status<500&&provenRejections.has(body.error?.code??'');
    pending.set(intent.key,{...intent,status:rejected?'rejected':'unknown',message:body.error?.message??'Сервер не подтвердил исход действия.'});notify();return {ok:false};
  }catch{
    pending.set(intent.key,{...intent,status:'unknown',message:'Ответ не получен. Действие могло сохраниться. Повторите тот же запрос.'});notify();return {ok:false};
  }
}
export function useWorkspaceIntents(projectId:string|null,actorId:string|undefined){
  useSyncExternalStore(subscribe,()=>pendingVersion,()=>0);
  return [...pending.values()].filter(intent=>intent.projectId===projectId&&intent.actorId===actorId);
}
export function forgetRejectedWorkspaceIntent(intent:WorkspaceIntent){if(pending.get(intent.key)?.status==='rejected'){pending.delete(intent.key);notify();}}
type WorkspaceSession={actor:Actor|null;loading:boolean;error:string;refresh:()=>Promise<void>};
const SessionContext=createContext<WorkspaceSession|null>(null);
export function WorkspaceProvider({children}:{children:ReactNode}){
  const [actor,setActor]=useState<Actor|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const refresh=async()=>{setLoading(true);setError('');try{const session=await readWorkspaceJSON<{actor:Actor;canManageParticipants:boolean}>('/api/session');if(!session.canManageParticipants)throw new Error('Управлять локальными папками может только оператор Ouro.');setActor(session.actor);}catch(e){setActor(null);setError((e as Error).message);}finally{setLoading(false);}};
  useEffect(()=>{void refresh();if(!unloadInstalled){window.addEventListener('beforeunload',event=>{if(pending.size){event.preventDefault();event.returnValue='';}});unloadInstalled=true;}},[]);
  return <SessionContext.Provider value={{actor,loading,error,refresh}}>{children}</SessionContext.Provider>;
}
export function useWorkspaceSession(){const session=useContext(SessionContext);if(!session)throw new Error('Workspace provider required');return session;}

export function WorkspacePending({projectId,onRecovered}:{projectId:string|null;onRecovered:()=>Promise<unknown>}){
  const {actor}=useWorkspaceSession(),intents=useWorkspaceIntents(projectId,actor?.id),[error,setError]=useState('');
  if(!intents.length)return null;
  return <section className="ws-panel ws-pending" aria-label="Неподтверждённые действия"><h2>Проверить отправленные действия</h2><p>Сохранён исходный проект, автор и тело запроса. Внутренняя навигация сохраняет их; перезагрузка страницы может потерять данные после предупреждения.</p>{error&&<p role="alert">{error}</p>}{intents.map(intent=><article key={intent.key}><strong>{intent.label}</strong><p role="status">{intent.status==='sending'?'Ожидаем ответ сервера…':intent.status==='rejected'?'Действие отклонено сервером. Проверьте историю перед новой попыткой.':'Исход действия неизвестен.'} {intent.message}</p><details><summary>Исходный запрос</summary><dl><dt>Проект</dt><dd>{intent.projectId??'Каталог'}</dd><dt>Автор</dt><dd>{intent.actorId}</dd><dt>Адрес</dt><dd><code>{intent.url}</code></dd><dt>Request ID</dt><dd><code>{intent.requestId}</code></dd><dt>Версия</dt><dd>{intent.expectedVersion??'Каталог'}</dd></dl><pre>{intent.body}</pre></details><div className="ws-actions"><button disabled={intent.status==='sending'} onClick={()=>{void sendWorkspaceIntent(intent).then(async result=>{if(result.ok)await onRecovered();}).catch(e=>setError(e.message));}}>Повторить тот же запрос</button>{intent.status==='rejected'&&<button onClick={()=>{void onRecovered().then(()=>forgetRejectedWorkspaceIntent(intent)).catch(e=>setError(e.message));}}>Проверил историю — закрыть запрос</button>}</div></article>)}</section>;
}
