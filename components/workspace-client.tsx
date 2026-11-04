'use client';
import {twMerge} from 'tailwind-merge';
import {workspacePresentation as ui} from './workspace-presentation';

import {WorkspaceAccordion} from './workspace-ui';
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import type {Actor} from '@/packages/core/src';
import {createIdentityReadController} from '@/packages/client/src/lifecycle/create-identity-read-controller';
import {readIdentitySession} from '@/packages/client/src/http/read-identity-session';
import {readWorkspaceJSON,sendWorkspaceIntent,getWorkspaceIntents,getWorkspaceIntentsVersion,hasPendingWorkspaceIntents,subscribeWorkspaceIntents,forgetRejectedWorkspaceIntent} from '@/packages/client/src/http/workspace-intents';
export {freezeWorkspaceIntent,readWorkspaceJSON,sendWorkspaceIntent,forgetRejectedWorkspaceIntent,reviewUnknownWorkspaceIntent,restoreUnknownWorkspaceIntent} from '@/packages/client/src/http/workspace-intents';
export type {WorkspaceProject,WorkspaceConnection,WorkspaceSnapshot,WorkspaceIntent} from '@/packages/client/src/http/workspace-intents';

/** Оформление неподтверждённых действий; runtime и wire остаются у прежнего владельца. */
const presentationSlots={
  pendingPanel:"mb-[24px] min-w-0 rounded-[10px] border border-solid bg-ouro-subtle p-[26px] at-most-520:rounded-[8px] at-most-520:px-[16px] at-most-520:py-[19px] border-[color:var(--attention)]",
} as const;

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
  return <section className={twMerge("ws-panel ws-pending",presentationSlots.pendingPanel)} aria-label="Неподтверждённые действия"><h2 className={twMerge(ui.h2,"leading-[1.4]")}>Проверить отправленные действия</h2><p className={twMerge(ui.paragraph,"m-[8px_0_20px] text-ouro-text-muted text-[12px]",ui.paragraph)}>Сохранён исходный проект, автор и тело запроса. Внутренняя навигация сохраняет их; перезагрузка страницы может потерять данные после предупреждения.</p>{error&&<p className={twMerge(ui.paragraph,"m-[8px_0_20px] text-ouro-text-muted text-[12px]",ui.paragraph)} role="alert">{error}</p>}{intents.map(intent=><article className={"border-0 border-t border-solid border-ouro-border py-[16px]"} key={intent.key}><strong>{intent.label}</strong><p className={twMerge(ui.paragraph,"text-[12px]",ui.paragraph)} role="status">{intent.status==='sending'?'Ожидаем ответ сервера…':intent.status==='rejected'?'Действие отклонено сервером. Проверьте историю перед новой попыткой.':'Исход действия неизвестен.'} {intent.message}</p>{intent.copyUnverified&&<p className={twMerge(ui.paragraph,"text-[12px]",ui.paragraph)}>Запрос восстановлен из копии. Точность исторических байтов не подтверждена.</p>}{intent.rejection==='workspace-binding'&&<p className={twMerge(ui.paragraph,"text-[12px]",ui.paragraph)}>{intent.status==='rejected'?'Этот запрос отклонён до создания исполнения.':'Отказ в повторе не устанавливает исход первой отправки.'} Привязка папки требует отдельной проверки и решения владельца. Исходный запрос сохранён.</p>}<WorkspaceAccordion title={<>Исходный запрос</>}><dl><dt className={"text-[11px] text-ouro-text-muted"}>Проект</dt><dd className={"m-[3px_0_12px] text-[12px] [overflow-wrap:anywhere]"}>{intent.projectId??'Каталог'}</dd><dt className={"text-[11px] text-ouro-text-muted"}>Автор</dt><dd className={"m-[3px_0_12px] text-[12px] [overflow-wrap:anywhere]"}>{intent.actorId}</dd><dt className={"text-[11px] text-ouro-text-muted"}>Адрес</dt><dd className={"m-[3px_0_12px] text-[12px] [overflow-wrap:anywhere]"}><code className={ui.code}>{intent.url}</code></dd><dt className={"text-[11px] text-ouro-text-muted"}>Request ID</dt><dd className={"m-[3px_0_12px] text-[12px] [overflow-wrap:anywhere]"}><code className={ui.code}>{intent.requestId}</code></dd><dt className={"text-[11px] text-ouro-text-muted"}>Версия</dt><dd className={"m-[3px_0_12px] text-[12px] [overflow-wrap:anywhere]"}>{intent.expectedVersion??'Каталог'}</dd></dl><pre className={ui.pre}>{intent.body}</pre></WorkspaceAccordion><div className={twMerge("ws-actions",ui.actions)}>{intent.rejection==='workspace-binding'&&intent.projectId&&<button className={twMerge(ui.button,"leading-[1.6]")} type="button" onClick={()=>window.dispatchEvent(new CustomEvent('ouro:inspect-workspace-binding',{detail:{projectId:intent.projectId}}))}>Проверить привязку папки</button>}<button className={twMerge(ui.button,"leading-[1.6]")} disabled={intent.status==='sending'} onClick={()=>{void sendWorkspaceIntent(intent,onReceipt).then(async result=>{if(result.ok)await onRecovered();}).catch(e=>setError(e.message));}}>Повторить тот же запрос</button>{intent.status==='rejected'&&intent.rejection!=='workspace-binding'&&<button className={twMerge(ui.button,"leading-[1.6]")} onClick={()=>{void onRecovered().then(()=>forgetRejectedWorkspaceIntent(intent)).catch(e=>setError(e.message));}}>Проверил историю — закрыть запрос</button>}</div></article>)}</section>;
}
