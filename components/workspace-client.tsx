'use client';

import {WorkspaceAccordion} from './workspace-ui';
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import type {Actor,ProjectState} from '@/packages/core/src';
import type {AgentRegistration} from './agents-panel';
import {isWorkspaceBindingRejection,isWorkspaceCommandReceipt,isWorkspaceRecoveryTicketRejection} from './workspace-intent-proof';
import {isWellFormedUnicode} from '@/packages/core/src/unicode';

export type WorkspaceProject={id:string;name:string;rootPath:string|null;kind:'folder'|'demo';createdAt:string;createdBy:string;bindingId?:string;rootIdentity?:unknown};
export type WorkspaceConnection={httpUrl:string;stdioCommand:string;stdioArgs:string[];projectId:string};
export type WorkspaceSnapshot={project:WorkspaceProject;state:ProjectState;cursor:number;agents:AgentRegistration[];connection:WorkspaceConnection};
export type WorkspaceIntent={key:string;projectId:string|null;url:string;actorId:string;body:string;requestId:string;expectedVersion?:number;label:string;status:'sending'|'unknown'|'rejected';message:string;uncertain?:boolean;rejection?:'workspace-binding';copyUnverified?:true};
type WireError={error?:{code?:string;message?:string}};
const pending=new Map<string,WorkspaceIntent>(),listeners=new Set<()=>void>();
let pendingVersion=0,unloadInstalled=false;
function notify(){pendingVersion++;listeners.forEach(listener=>listener());}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
const provenRejections=new Set(['VERSION_CONFLICT','REVISION_CONFLICT','INVALID_TRANSITION','VALIDATION_ERROR','DECISION_ALREADY_RESOLVED','IDEMPOTENCY_CONFLICT','REQUEST_ID_CONFLICT','DEPENDENCY_CYCLE','PENDING_LIMIT_EXCEEDED','CORRECTION_REQUIRES_REVISION']);
function sameFrozenIntent(current:WorkspaceIntent|undefined,intent:WorkspaceIntent):current is WorkspaceIntent{
  return !!current&&current.key===intent.key&&current.body===intent.body&&current.url===intent.url&&current.actorId===intent.actorId&&current.projectId===intent.projectId&&current.requestId===intent.requestId;
}

export async function readWorkspaceJSON<T>(url:string,signal?:AbortSignal):Promise<T>{
  const response=await fetch(url,{cache:'no-store',credentials:'same-origin',signal}),body=await response.json() as T&WireError;
  if(!response.ok)throw new Error(body.error?.message??'Не удалось прочитать рабочее место.');
  return body;
}
export function freezeWorkspaceIntent(input:{projectId:string|null;url:string;actorId:string;label:string;slot:string;body:Record<string,unknown>}):WorkspaceIntent{
  const requestId=typeof input.body.requestId==='string'?input.body.requestId:crypto.randomUUID();
  return {key:`${input.actorId}:${input.projectId??'catalog'}:${input.slot}`,projectId:input.projectId,url:input.url,actorId:input.actorId,label:input.label,requestId,expectedVersion:typeof input.body.expectedVersion==='number'?input.body.expectedVersion:undefined,body:JSON.stringify({...input.body,requestId}),status:'sending',message:''};
}
/** Local review only. A copied envelope cannot prove the historical wire bytes. */
export function reviewUnknownWorkspaceIntent(input:{copy:string;projectId:string;actorId:string}):WorkspaceIntent{
  if(typeof input.copy!=='string'||!input.copy.length||input.copy.length>64000)throw new Error('Вставьте копию JSON размером не более 64 000 символов.');
  const value=JSON.parse(input.copy) as {projectId?:unknown;actorId?:unknown;request?:unknown};
  if(!value||value.projectId!==input.projectId||value.actorId!==input.actorId)throw new Error('Проект и автор копии должны точно совпадать с открытым проектом и текущим участником.');
  const request=value.request as Record<string,unknown>,id=(item:unknown,min=1):item is string=>typeof item==='string'&&item.length>=min&&item.length<=200&&isWellFormedUnicode(item)&&!/[\u0000-\u001f\u007f]/.test(item);
  if(!id(input.projectId)||!id(input.actorId))throw new Error('Для восстановления нужны текущий проект и исходный участник.');
  const fields=['type','specId','specRevisionId','agentId','requestId','expectedVersion','flowTracking','retryOfExecutionId'];
  if(!request||typeof request!=='object'||Array.isArray(request)||request.type!=='startExecution'||Object.keys(request).some(key=>!fields.includes(key))||!id(request.specId)||!id(request.specRevisionId)||!id(request.agentId)||!id(request.requestId,8)||typeof request.expectedVersion!=='number'||!Number.isSafeInteger(request.expectedVersion)||request.expectedVersion<0||('flowTracking' in request&&request.flowTracking!=='enforced')||('retryOfExecutionId' in request&&!id(request.retryOfExecutionId)))throw new Error('Нужна исходная команда startExecution с точными ID, requestId и версией. Неизвестные поля и другие команды не поддерживаются.');
  return {key:`${input.actorId}:${input.projectId}:restored-start:${request.requestId}`,projectId:input.projectId,actorId:input.actorId,url:'/api/projects/'+encodeURIComponent(input.projectId)+'/commands',body:JSON.stringify(request),requestId:request.requestId,expectedVersion:request.expectedVersion,label:'Исходное назначение из копии',status:'unknown',uncertain:true,copyUnverified:true,message:'Запрос сохранён из копии. Точность исторических байтов не подтверждена; исход остаётся UNKNOWN.'};
}
/** Register an owner-reviewed copy in memory; never send or replace a request. */
export function restoreUnknownWorkspaceIntent(input:{copy:string;projectId:string;actorId:string;acknowledgeUnverifiedCopy:boolean}):WorkspaceIntent{
  if(input.acknowledgeUnverifiedCopy!==true)throw new Error('Сначала рассмотрите копию и подтвердите, что её историческая точность не установлена.');
  const intent=reviewUnknownWorkspaceIntent(input);
  const existing=[...pending.values()].find(item=>item.requestId===intent.requestId)||pending.get(intent.key);
  if(existing){
    if(existing.requestId!==intent.requestId||existing.projectId!==intent.projectId||existing.actorId!==intent.actorId||existing.url!==intent.url||existing.body!==intent.body)throw new Error('Этот requestId уже сохранён с другим телом, адресом, автором или проектом. Исходный запрос оставлен без изменений.');
    return existing;
  }
  pending.set(intent.key,intent);notify();return intent;
}
export async function sendWorkspaceIntent<T=unknown>(intent:WorkspaceIntent):Promise<{ok:true;data:T}|{ok:false}> {
  const existing=pending.get(intent.key);
  if(existing&&!sameFrozenIntent(existing,intent))throw new Error('Сначала восстановите исходное действие.');
  const wasUncertain=!!(existing?.uncertain||intent.uncertain||existing?.status==='unknown'||intent.status==='unknown');
  pending.set(intent.key,{...(existing??intent),uncertain:wasUncertain,status:'sending',message:''});notify();
  try{
    const response=await fetch(intent.url,{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','X-Ouro-Expected-Participant':intent.actorId,...(intent.projectId?{'X-Ouro-Expected-Project':intent.projectId}:{})},body:intent.body});
    const body=await response.json() as T&WireError;
    if(response.ok&&!response.redirected&&isWorkspaceCommandReceipt(intent,body)){if(sameFrozenIntent(pending.get(intent.key),intent)){pending.delete(intent.key);notify();}return {ok:true,data:body};}
    const bindingRejected=await isWorkspaceBindingRejection(intent,response,body);
    const current=pending.get(intent.key);if(!sameFrozenIntent(current,intent))return {ok:false};
    const uncertain=!!(wasUncertain||current.uncertain||current.status==='unknown');
    const rejected=!uncertain&&(bindingRejected||isWorkspaceRecoveryTicketRejection(intent,response,body)||(response.status>=400&&response.status<500&&provenRejections.has(body.error?.code??'')));
    pending.set(intent.key,{...current,uncertain:uncertain||!rejected,status:rejected?'rejected':'unknown',...(bindingRejected?{rejection:'workspace-binding' as const}:{}),message:body.error?.message??'Сервер не подтвердил исход действия.'});notify();return {ok:false};
  }catch{
    const current=pending.get(intent.key);if(sameFrozenIntent(current,intent)){pending.set(intent.key,{...current,uncertain:true,status:'unknown',message:'Ответ не получен. Действие могло сохраниться. Повторите тот же запрос.'});notify();}return {ok:false};
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
  return <section className="ws-panel ws-pending" aria-label="Неподтверждённые действия"><h2>Проверить отправленные действия</h2><p>Сохранён исходный проект, автор и тело запроса. Внутренняя навигация сохраняет их; перезагрузка страницы может потерять данные после предупреждения.</p>{error&&<p role="alert">{error}</p>}{intents.map(intent=><article key={intent.key}><strong>{intent.label}</strong><p role="status">{intent.status==='sending'?'Ожидаем ответ сервера…':intent.status==='rejected'?'Действие отклонено сервером. Проверьте историю перед новой попыткой.':'Исход действия неизвестен.'} {intent.message}</p>{intent.copyUnverified&&<p>Запрос восстановлен из копии. Точность исторических байтов не подтверждена.</p>}{intent.rejection==='workspace-binding'&&<p>{intent.status==='rejected'?'Этот запрос отклонён до создания исполнения.':'Отказ в повторе не устанавливает исход первой отправки.'} Привязка папки требует отдельной проверки и решения владельца. Исходный запрос сохранён.</p>}<WorkspaceAccordion title={<>Исходный запрос</>}><dl><dt>Проект</dt><dd>{intent.projectId??'Каталог'}</dd><dt>Автор</dt><dd>{intent.actorId}</dd><dt>Адрес</dt><dd><code>{intent.url}</code></dd><dt>Request ID</dt><dd><code>{intent.requestId}</code></dd><dt>Версия</dt><dd>{intent.expectedVersion??'Каталог'}</dd></dl><pre>{intent.body}</pre></WorkspaceAccordion><div className="ws-actions">{intent.rejection==='workspace-binding'&&intent.projectId&&<button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('ouro:inspect-workspace-binding',{detail:{projectId:intent.projectId}}))}>Проверить привязку папки</button>}<button disabled={intent.status==='sending'} onClick={()=>{void sendWorkspaceIntent(intent).then(async result=>{if(result.ok)await onRecovered();}).catch(e=>setError(e.message));}}>Повторить тот же запрос</button>{intent.status==='rejected'&&intent.rejection!=='workspace-binding'&&<button onClick={()=>{void onRecovered().then(()=>forgetRejectedWorkspaceIntent(intent)).catch(e=>setError(e.message));}}>Проверил историю — закрыть запрос</button>}</div></article>)}</section>;
}
