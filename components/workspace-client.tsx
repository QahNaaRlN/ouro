'use client';

import {WorkspaceAccordion} from './workspace-ui';
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import type {Actor} from '@/packages/core/src';
import {createIdentityReadController} from '@/packages/client/src/lifecycle/create-identity-read-controller';
import {readIdentitySession} from '@/packages/client/src/http/read-identity-session';
import {readWorkspaceJSON,sendWorkspaceIntent,getWorkspaceIntents,getWorkspaceIntentsVersion,hasPendingWorkspaceIntents,subscribeWorkspaceIntents,forgetRejectedWorkspaceIntent} from '@/packages/client/src/http/workspace-intents';
export {freezeWorkspaceIntent,readWorkspaceJSON,sendWorkspaceIntent,forgetRejectedWorkspaceIntent,reviewUnknownWorkspaceIntent,restoreUnknownWorkspaceIntent} from '@/packages/client/src/http/workspace-intents';
export type {WorkspaceProject,WorkspaceConnection,WorkspaceSnapshot,WorkspaceIntent} from '@/packages/client/src/http/workspace-intents';

let unloadInstalled=false;
/** Hook, который наблюдает RAM-намерения исходного проекта и автора. */
export function useWorkspaceIntents(projectId:string|null,actorId:string|undefined){
  useSyncExternalStore(subscribeWorkspaceIntents,getWorkspaceIntentsVersion,()=>0);
  return getWorkspaceIntents(projectId,actorId);
}
type WorkspaceSession={actor:Actor|null;localOperator:boolean;accessEpoch:number;loading:boolean;error:string;refresh:()=>Promise<void>};
const SessionContext=createContext<WorkspaceSession|null>(null);
export function WorkspaceProvider({children}:{children:ReactNode}){
  const [actor,setActor]=useState<Actor|null>(null),[localOperator,setLocalOperator]=useState(false),[accessEpoch,setAccessEpoch]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [identityReads]=useState(createIdentityReadController);
  const refresh=async()=>{const ticket=identityReads.begin();if(!ticket)return;setAccessEpoch(ticket.accessEpoch);setActor(null);setLocalOperator(false);setLoading(true);setError('');const outcome=await ticket.run(async signal=>{const session=await readIdentitySession(signal);if(!session.hasAccount&&!session.canManageParticipants)throw new Error('Откройте проект через свой аккаунт Ouro.');return session;});if(outcome.status==='superseded')return;if(outcome.status==='accepted'){setActor(outcome.value.actor);setLocalOperator(outcome.value.canManageParticipants);}else setError(outcome.error instanceof Error?outcome.error.message:'Не удалось проверить сессию.');setLoading(false);};
  useEffect(()=>{identityReads.mount();void refresh();if(!unloadInstalled){window.addEventListener('beforeunload',event=>{if(hasPendingWorkspaceIntents()){event.preventDefault();event.returnValue='';}});unloadInstalled=true;}return()=>identityReads.unmount();},[identityReads]);
  return <SessionContext.Provider value={{actor,localOperator,accessEpoch,loading,error,refresh}}>{children}</SessionContext.Provider>;
}
export function useWorkspaceSession(){const session=useContext(SessionContext);if(!session)throw new Error('Workspace provider required');return session;}

export function WorkspacePending(props:{projectId:string|null;onRecovered:()=>Promise<unknown>;onReceipt?:(value:unknown)=>void}){
  const {actor}=useWorkspaceSession();return <WorkspacePendingList {...props} actorId={actor?.id}/>;
}
/** Компонент, который сохраняет видимость исходных RAM-намерений в любом web shell. */
export function WorkspacePendingList({projectId,actorId,onRecovered,onReceipt}:{projectId:string|null;actorId:string|undefined;onRecovered:()=>Promise<unknown>;onReceipt?:(value:unknown)=>void}){
  const intents=useWorkspaceIntents(projectId,actorId),[error,setError]=useState('');
  if(!intents.length)return null;
  return <section className="ws-panel ws-pending" aria-label="Неподтверждённые действия"><h2>Проверить отправленные действия</h2><p>Сохранён исходный проект, автор и тело запроса. Внутренняя навигация сохраняет их; перезагрузка страницы может потерять данные после предупреждения.</p>{error&&<p role="alert">{error}</p>}{intents.map(intent=><article key={intent.key}><strong>{intent.label}</strong><p role="status">{intent.status==='sending'?'Ожидаем ответ сервера…':intent.status==='rejected'?'Действие отклонено сервером. Проверьте историю перед новой попыткой.':'Исход действия неизвестен.'} {intent.message}</p>{intent.copyUnverified&&<p>Запрос восстановлен из копии. Точность исторических байтов не подтверждена.</p>}{intent.rejection==='workspace-binding'&&<p>{intent.status==='rejected'?'Этот запрос отклонён до создания исполнения.':'Отказ в повторе не устанавливает исход первой отправки.'} Привязка папки требует отдельной проверки и решения владельца. Исходный запрос сохранён.</p>}<WorkspaceAccordion title={<>Исходный запрос</>}><dl><dt>Проект</dt><dd>{intent.projectId??'Каталог'}</dd><dt>Автор</dt><dd>{intent.actorId}</dd><dt>Адрес</dt><dd><code>{intent.url}</code></dd><dt>Request ID</dt><dd><code>{intent.requestId}</code></dd><dt>Версия</dt><dd>{intent.expectedVersion??'Каталог'}</dd></dl><pre>{intent.body}</pre></WorkspaceAccordion><div className="ws-actions">{intent.rejection==='workspace-binding'&&intent.projectId&&<button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('ouro:inspect-workspace-binding',{detail:{projectId:intent.projectId}}))}>Проверить привязку папки</button>}<button disabled={intent.status==='sending'} onClick={()=>{void sendWorkspaceIntent(intent,onReceipt).then(async result=>{if(result.ok)await onRecovered();}).catch(e=>setError(e.message));}}>Повторить тот же запрос</button>{intent.status==='rejected'&&intent.rejection!=='workspace-binding'&&<button onClick={()=>{void onRecovered().then(()=>forgetRejectedWorkspaceIntent(intent)).catch(e=>setError(e.message));}}>Проверил историю — закрыть запрос</button>}</div></article>)}</section>;
}
