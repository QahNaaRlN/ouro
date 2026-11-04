import {createProjectSnapshotAdopter,type ProjectSnapshotAdopter,type SnapshotAdoption} from './project-snapshot';
import type {FrozenProjectCommandIntent,ProjectClientScope,ProjectCommandPort,ProjectReadPort,ProjectSubscriptionPort,ProjectSnapshotDTO,WorkspaceSnapshotDTO,ProjectConnectionStatus,ProjectSubscription} from '../ports';
import {ClientError,type ErrorReporterPort} from '../ports/client-error.types';
import {normalizeClientError,captureClientError} from './client-error-reporting';
import {createClientCancellation} from './create-client-cancellation';
import type {ProjectCommandPresentation,ProjectCommandPresentationLookup} from './project-command-presentation.types';

let nextSessionOccurrence=0;

/** Тип, описывающий зависимости одного переносимого владельца проекта. */
export type ProjectSessionOptions={sourceId:string;scope:ProjectClientScope;reporter?:ErrorReporterPort;ports:(adopter:ProjectSnapshotAdopter,presentation:ProjectCommandPresentationLookup)=>{read:ProjectReadPort;command:ProjectCommandPort;subscription:ProjectSubscriptionPort}};
/** Тип, описывающий метаданные без второй копии проектной истории. */
export type ProjectMetadata=Omit<WorkspaceSnapshotDTO,'state'|'cursor'|'storage'>;
/** Тип, описывающий наблюдаемое состояние единственного владельца проекта. */
export type ProjectSessionView=Readonly<{snapshot:ProjectSnapshotDTO|null;metadata:ProjectMetadata|null;status:ProjectConnectionStatus;error:ClientError|null;active:boolean;busy:boolean}>;
/**
 * Утилита, которая создаёт владельца подтверждённого состояния проекта.
 * @param options - Исходный контекст, фабрика семантических портов и безопасный reporter.
 * @returns Lifecycle с единственным adopter, явным завершением и сохранением UNKNOWN.
 * @example
 * createProjectSession({sourceId:'web', scope, ports})
 */
export function createProjectSession(options:ProjectSessionOptions){
 const scope=Object.freeze({...options.scope}),adopter=createProjectSnapshotAdopter(scope.projectId),listeners=new Set<()=>void>(),cancellation=createClientCancellation(),occurrencePrefix=String(++nextSessionOccurrence);
 let active=true,revoked=false,subscription:ProjectSubscription|undefined,occurrence=0,busyCount=0;
 let view:ProjectSessionView={snapshot:null,metadata:null,status:'connecting',error:null,active:true,busy:false};
 const update=(patch:Partial<ProjectSessionView>)=>{if(!active)return;view={...view,...patch};listeners.forEach(listener=>listener());};
 const capture=(value:unknown,operation:'read-project'|'project-command'|'project-stream')=>{
  const error=captureClientError(value,{reporter:options.reporter,normalize:normalizeClientError,occurrence:normalized=>({occurrenceId:occurrencePrefix+':'+String(++occurrence),code:normalized.code,kind:normalized.kind,operation,sourceId:options.sourceId,accessEpoch:scope.accessEpoch,...(scope.hostEpoch===undefined?{}:{hostEpoch:scope.hostEpoch})})});
  if(active&&error.kind!=='cancelled')update({error});return error;
 };
 const revoke=(error:ClientError)=>{revoked=true;cancellation.abort();subscription?.close();subscription=undefined;update({snapshot:null,metadata:null,error,status:'reload-required',active:false});};
 const admit=(value:unknown):SnapshotAdoption=>{
  if(!active||revoked)return {status:'invalid',reason:'disposed-scope',snapshot:adopter.getSnapshot()};
  const result=adopter.adopt(value);
  if(result.status==='invalid')return result;
  if(result.status!=='stale'&&view.snapshot!==result.snapshot)update({snapshot:result.snapshot});
  return result;
 };
 const admission={projectId:scope.projectId,getSnapshot:adopter.getSnapshot,inspect:adopter.inspect,adopt:admit};
 const presentations=new Map<FrozenProjectCommandIntent,ProjectCommandPresentation>();
 const ports=options.ports(admission,intent=>presentations.get(intent));
 const reads=new Map<boolean,Promise<ProjectMetadata|null>>();
 const refresh=(workspace=false):Promise<ProjectMetadata|null>=>{
  if(!active||revoked)return Promise.resolve(null);const inFlight=reads.get(workspace);if(inFlight)return inFlight;
  const operation=(async()=>{
   try{
    const result=workspace?await ports.read.readWorkspace(scope,{signal:cancellation.signal}):await ports.read.readSnapshot(scope,{signal:cancellation.signal});
    if(!active)return null;
    if(result.status==='unsupported')throw new ClientError('UNSUPPORTED','Чтение проекта недоступно.','rejected');
    const adopted=admit(result.value);if(adopted.status==='invalid')throw new ClientError('SNAPSHOT_CONTRACT','История проекта не подтверждена: '+adopted.reason+'.','contract');
    const value=result.value;
    const workspaceValue=(candidate:ProjectSnapshotDTO):candidate is WorkspaceSnapshotDTO=>'project' in candidate&&'agents' in candidate&&'connection' in candidate;
    if(workspaceValue(value)){const {project,agents,connection}=value;update({metadata:{project,agents,connection},error:null});}else update({error:null});
    return view.metadata;
   }catch(value){if(!active)return null;const error=capture(value,'read-project');if(error.kind==='access')revoke(error);throw error;}
  })();
  const pending=operation.finally(()=>{if(reads.get(workspace)===pending)reads.delete(workspace);});reads.set(workspace,pending);return pending;
 };
 const start=()=>{
  if(!active||revoked||subscription)return;
  subscription=ports.subscription.subscribe(scope,adopter.getSnapshot()?.cursor??0,{
   onSnapshot:value=>{if(!active)return;const result=admit(value);if(result.status==='invalid')throw new ClientError('SNAPSHOT_CONTRACT','История проекта не подтверждена.','contract');},
   onStatus:(status,reason)=>{if(!active||revoked)return;if(reason==='access-denied'){revoke(capture(new ClientError('ACCESS_REVOKED','Доступ к проекту отозван.','access'),'project-stream'));return;}update({status});if(status==='reload-required')capture(new ClientError('STREAM_RECOVERY_REQUIRED','Нужно перечитать историю: '+(reason??'stream')+'.','contract'),'project-stream');},
  });
 };
 const execute=async(intent:FrozenProjectCommandIntent,presentation?:ProjectCommandPresentation)=>{
  if(!active||revoked||intent.scope.projectId!==scope.projectId||intent.scope.actorId!==scope.actorId||intent.scope.accessEpoch!==scope.accessEpoch||intent.scope.hostEpoch!==scope.hostEpoch)throw new ClientError('CONTEXT_CHANGED','Запрос относится к исходному проекту и автору.','access');
  if(presentation&&!presentations.has(intent))presentations.set(intent,Object.freeze({slot:presentation.slot,label:presentation.label}));
  busyCount++;update({busy:true,error:null});
  try{
   const outcome=await ports.command.execute(intent);
   if(outcome.status==='confirmed'&&active){const result=admit(outcome.receipt);if(result.status==='invalid'){capture(new ClientError('RESPONSE_CONTRACT','Ответ записи не подтверждён. Сохранён исходный запрос.','contract'),'project-command');return {status:'unknown',reason:'response-contract'} as const;}}
   if(outcome.status==='unknown'&&active)capture(new ClientError('COMMAND_OUTCOME_UNKNOWN','Исход действия неизвестен. Повторите тот же запрос.','contract'),'project-command');
   if(outcome.status==='rejected'&&active)capture(new ClientError(outcome.code,outcome.message,'rejected'),'project-command');
   return outcome;
  }catch(value){const error=capture(value,'project-command');if(active&&error.kind==='access')revoke(error);return {status:'unknown',reason:'transport'} as const;}
  finally{presentations.delete(intent);busyCount--;update({busy:busyCount>0});}
 };
 return {id:occurrencePrefix,scope,sourceId:options.sourceId,getSnapshot:()=>active&&!revoked?adopter.getSnapshot():null,getView:()=>view,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},refresh,admit,start,execute,reconnect:()=>{if(active)subscription?.reconnect();},dispose:()=>{if(!active)return;cancellation.abort();subscription?.close();subscription=undefined;view={...view,snapshot:null,metadata:null,active:false};active=false;listeners.forEach(listener=>listener());listeners.clear();}};
}
/** Тип, описывающий публичный lifecycle одного проектного контекста. */
export type ProjectSession=ReturnType<typeof createProjectSession>;
/** Утилита, которая формирует ключ без credential для изоляции проектного контекста. */
export const projectSessionKey=(sourceId:string,scope:ProjectClientScope)=>JSON.stringify([sourceId,scope.projectId,scope.actorId,scope.accessEpoch,scope.hostEpoch??null]);
/**
 * Утилита, которая совместно арендует одну сессию без параллельных SSE owners.
 * @returns Registry, где последняя освобождённая аренда завершает свой owner.
 * @example
 * const lease=registry.acquire(options); lease.release();
 */
export function createProjectSessionRegistry(){
 const sessions=new Map<string,{session:ProjectSession;leases:number}>();
 return {acquire:(options:ProjectSessionOptions)=>{const key=projectSessionKey(options.sourceId,options.scope);let entry=sessions.get(key);if(!entry){entry={session:createProjectSession(options),leases:0};sessions.set(key,entry);}entry.leases++;let released=false;return {session:entry.session,release:()=>{if(released)return;released=true;if(--entry.leases===0){entry.session.dispose();sessions.delete(key);}}};}};
}
