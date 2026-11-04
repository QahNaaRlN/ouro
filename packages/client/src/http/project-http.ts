import {z} from 'zod';
import {inspectProjectSnapshot,type ProjectSnapshotAdopter} from '../../../../lib/project-snapshot';
import {startProjectSubscription,type ProjectEventSource} from '../../../../lib/project-subscription';
import type {ClientCancellationSignal,ProjectClientScope,ProjectReadPort,ProjectCommandPort,ProjectSubscriptionPort,ProjectCommandReceiptDTO} from '../ports';
import {ClientError} from '../ports/client-error.types';
import {getWorkspaceIntents,sendWorkspaceIntent,type WorkspaceIntent} from './workspace-intents';
import {createClientCancellation} from '../lifecycle/create-client-cancellation';
import type {ProjectCommandPresentationLookup} from '../lifecycle/project-command-presentation.types';

const projectSchema=z.object({id:z.string().min(1),name:z.string(),rootPath:z.string().nullable(),kind:z.enum(['folder','demo','hosted']),createdAt:z.string(),createdBy:z.string().nullable(),bindingId:z.string().nullable().optional(),rootIdentity:z.unknown().optional(),role:z.enum(['Owner','Contributor','Viewer']).optional()});
const agentsSchema=z.array(z.object({id:z.string(),projectId:z.string(),name:z.string(),createdAt:z.string(),lastSeenAt:z.string().nullable(),revokedAt:z.string().nullable()}));
const connectionSchema=z.object({httpUrl:z.string(),stdioCommand:z.string(),stdioArgs:z.array(z.string()),projectId:z.string(),localBridgeRequired:z.boolean().optional()});
/** Тип, описывающий ограниченную конфигурацию существующего web-транспорта. */
export type ProjectHttpOptions={scope:ProjectClientScope;mode:'workspace'|'legacy';adopter:ProjectSnapshotAdopter;fetch?:typeof fetch;createEventSource?:(url:string)=>ProjectEventSource;commandPresentation?:ProjectCommandPresentationLookup};

/**
 * Утилита, которая связывает семантические порты только с существующими project endpoints.
 * @param options - Закреплённый контекст, транспорт и единый владелец admission.
 * @returns Ограниченные чтение, команды и подписка с прежними HTTP-контрактами.
 * @example
 * createProjectHttpPorts({scope, mode:'workspace', adopter})
 */
export function createProjectHttpPorts(options:ProjectHttpOptions):{read:ProjectReadPort;command:ProjectCommandPort;subscription:ProjectSubscriptionPort}{
 const {scope,mode,adopter}=options,base='/api/projects/'+encodeURIComponent(scope.projectId),fetcher=options.fetch??globalThis.fetch;
 const assertScope=(candidate:ProjectClientScope)=>{if(candidate.projectId!==scope.projectId||candidate.actorId!==scope.actorId||candidate.accessEpoch!==scope.accessEpoch||candidate.hostEpoch!==scope.hostEpoch)throw new ClientError('CONTEXT_CHANGED','Запрос относится к другому контексту.','access');};
 const readJSON=async(url:string,signal?:ClientCancellationSignal)=>{
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort);if(signal?.aborted)abort();
  let response:Response,body:unknown;
  try{response=await fetcher(url,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal,headers:{'X-Ouro-Project-Id':scope.projectId,'X-Ouro-Expected-Participant':scope.actorId}});try{body=await response.json();}catch{throw new ClientError('RESPONSE_CONTRACT','Ответ чтения не соответствует контракту.',[401,403].includes(response.status)?'access':'contract',response.status);}}
  finally{signal?.removeEventListener('abort',abort);}
  if(!response.ok){const error=z.object({error:z.object({code:z.string(),message:z.string().optional()})}).safeParse(body);throw new ClientError(error.success?error.data.error.code:'READ_FAILED',error.success?error.data.error.message??'Чтение проекта недоступно.':'Чтение проекта недоступно.',[401,403].includes(response.status)?'access':'rejected',response.status);}
  if(response.redirected)throw new ClientError('RESPONSE_CONTRACT','Перенаправленный ответ проекта не принят.','contract');return body;
 };
 const read:ProjectReadPort={
  readSnapshot:async(candidate,options)=>{assertScope(candidate);const value=await readJSON(mode==='workspace'?base:'/api/project?projectId='+encodeURIComponent(scope.projectId),options?.signal),checked=inspectProjectSnapshot(value,scope.projectId);if(!checked.valid)throw new ClientError('SNAPSHOT_CONTRACT','Ответ не подтверждает историю проекта.','contract');return {status:'available',value:checked.snapshot};},
  readWorkspace:async(candidate,options)=>{assertScope(candidate);const value=await readJSON(base,options?.signal),checked=inspectProjectSnapshot(value,scope.projectId),metadata=z.object({project:projectSchema,agents:agentsSchema,connection:connectionSchema}).safeParse(value);if(!checked.valid||!metadata.success||metadata.data.project.id!==scope.projectId||metadata.data.connection.projectId!==scope.projectId||metadata.data.agents.some(agent=>agent.projectId!==scope.projectId))throw new ClientError('WORKSPACE_CONTRACT','Ответ не подтверждает выбранное рабочее место.','contract');return {status:'available',value:{...checked.snapshot,...metadata.data}};},
 };
 const command:ProjectCommandPort={execute:async intent=>{
  assertScope(intent.scope);
  const url=intent.operation==='start-project-work'?base+'/tasks':mode==='workspace'?base+'/commands':'/api/commands';
  const presentation=options.commandPresentation?.(intent),pending=getWorkspaceIntents(scope.projectId,scope.actorId),existing=pending.find(value=>value.requestId===intent.requestId);
  const key=`${intent.scope.actorId}:${intent.scope.projectId}:`+(presentation?.slot??`project-command:${intent.requestId}`);
  const allowedUrls=intent.operation==='start-project-work'?[base+'/tasks']:[base+'/commands','/api/commands'];
  if(existing&&(existing.body!==intent.body||!allowedUrls.includes(existing.url)||presentation&&existing.key!==key))return {status:'rejected',code:'CLIENT_INTENT_CHANGED',message:'Сначала восстановите исходное действие.'};
  if(!existing&&pending.some(value=>value.key===key))return {status:'rejected',code:'INTENT_SLOT_BUSY',message:'Сначала восстановите исходное действие в этом разделе.'};
  const wire:WorkspaceIntent=existing??{key,projectId:intent.scope.projectId,actorId:intent.scope.actorId,url,body:intent.body,requestId:intent.requestId,expectedVersion:intent.expectedVersion,label:presentation?.label??(intent.operation==='start-project-work'?'Назначить работу':'Команда проекта'),status:'sending',message:''};
  const result=await sendWorkspaceIntent<ProjectCommandReceiptDTO>(wire,value=>{const checked=adopter.adopt(value);if(checked.status==='invalid'){if(checked.reason==='disposed-scope')return 'inactive';throw new ClientError('RESPONSE_CONTRACT','Квитанция не подтверждает принятую историю.','contract');}return 'admitted';},fetcher);
  if(result.ok)return {status:'confirmed',receipt:result.data};
  const saved=getWorkspaceIntents(scope.projectId,scope.actorId).find(value=>value.key===wire.key);
  if(saved?.httpStatus===401||saved?.httpStatus===403)throw new ClientError(saved.errorCode??'ACCESS_REVOKED','Участник или доступ к проекту изменился. Исходный запрос сохранён.','access',saved.httpStatus);
  return saved?.status==='rejected'?{status:'rejected',code:saved.errorCode??'COMMAND_REJECTED',message:saved.message,httpStatus:saved.httpStatus}:{status:'unknown',reason:'unconfirmed'};
 }};
 const subscription:ProjectSubscriptionPort={subscribe:(candidate,_afterCursor,observer)=>{
  assertScope(candidate);let engine:ReturnType<typeof startProjectSubscription>|undefined;const cancellation=createClientCancellation();
  engine=startProjectSubscription({adopter,onSnapshot:snapshot=>observer.onSnapshot(snapshot),onStatus:(status,reason)=>observer.onStatus(status,reason),createEventSource:url=>{const query=url.split('?')[1]??'after=0';const target=mode==='workspace'?base+'/stream?'+query:'/api/stream?'+query+'&projectId='+encodeURIComponent(scope.projectId);return options.createEventSource?options.createEventSource(target):new EventSource(target);},reconcile:async()=>{try{const result=await read.readSnapshot(scope,{signal:cancellation.signal});if(result.status==='unsupported')throw new ClientError('UNSUPPORTED','Чтение проекта недоступно.','rejected');return result.value;}catch(error){if(error instanceof ClientError&&error.kind==='access'){engine?.close();observer.onStatus('reload-required','access-denied');}throw error;}}});
  return {close:()=>{cancellation.abort();engine?.close();},reconnect:()=>engine?.reconnect()};
 }};
 return {read,command,subscription};
}
