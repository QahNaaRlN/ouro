import {queryOptions,QueryObserver,type QueryClient} from '@tanstack/react-query';
import {ClientError,type CatalogReadCapability,type CatalogReadScope,type CatalogReadResult,type ClientCancellationSignal} from '../../../../client/src/ports';
import {normalizeClientError,captureClientError} from '../../../../client/src/lifecycle/client-error-reporting';
import type {CatalogReadEnvironment} from '../../shared/catalog-read-environment';

let occurrence=0;
const cancelled=()=>new ClientError('CANCELLED','Ожидание отменено.','cancelled');
/** Нормализует только разрешённую классификацию без raw message, payload и reporting. */
export function normalizeCatalogReadError(value:unknown):ClientError{
 const error=normalizeClientError(value);
 if(error.kind==='cancelled')return cancelled();
 if(error.kind==='access')return new ClientError('CATALOG_ACCESS','Нет доступа к текущей сессии или каталогу.','access',error.status);
 if(error.kind==='contract')return new ClientError('CATALOG_CONTRACT','Ответ чтения не соответствует контракту.','contract',error.status);
 if(error.kind==='rejected')return new ClientError('CATALOG_REJECTED','Не удалось прочитать сессию или каталог.','rejected',error.status);
 return new ClientError('CATALOG_NETWORK','Не удалось получить подтверждённый ответ.','network');
}
/** Формирует секретонезависимый key исходного access scope и отдельного lifecycle owner. */
export const catalogReadQueryKey=(operation:CatalogReadCapability,scope:CatalogReadScope)=>['catalog-read',operation,scope.sourceId,scope.actorId,scope.projectId,scope.accessEpoch,scope.hostEpoch??null,scope.ownerId] as const;
/** Создаёт scope только из принятого identity owner и явно внедрённого источника. */
export const catalogReadScope=(environment:CatalogReadEnvironment,ownerId:string,input:{actorId:string|null;projectId:string|null;accessEpoch:number}):CatalogReadScope=>({...input,ownerId,sourceId:environment.sourceId,...(environment.hostEpoch===undefined?{}:{hostEpoch:environment.hostEpoch})});

function options<T>(environment:CatalogReadEnvironment,scope:CatalogReadScope,operation:CatalogReadCapability,read:(signal:ClientCancellationSignal)=>Promise<CatalogReadResult<T>>){
 return queryOptions<CatalogReadResult<T>,ClientError,CatalogReadResult<T>,ReturnType<typeof catalogReadQueryKey>>({queryKey:catalogReadQueryKey(operation,scope),queryFn:async({signal}):Promise<CatalogReadResult<T>>=>{
  try{
   if(signal.aborted)throw cancelled();
   if(scope.sourceId!==environment.sourceId||scope.hostEpoch!==environment.hostEpoch||!scope.ownerId||!Number.isSafeInteger(scope.accessEpoch)||scope.accessEpoch<0)throw new ClientError('CATALOG_CONTRACT','Контекст чтения изменился.','contract');
   const result=await read(signal);
   if(signal.aborted)throw cancelled();
   if(result.status==='unsupported'&&result.capability!==operation)throw new ClientError('CATALOG_CONTRACT','Операция чтения не подтверждена.','contract');
   return result;
  }catch(value){
   const error=captureClientError(value,{reporter:environment.reporter,normalize:normalizeCatalogReadError,reportCancelled:false,occurrence:normalized=>({occurrenceId:'catalog-read:'+String(++occurrence),code:normalized.code,kind:normalized.kind,operation,sourceId:/^[A-Za-z0-9][A-Za-z0-9:._-]{0,99}$/.test(scope.sourceId)?scope.sourceId:'untrusted-source',accessEpoch:scope.accessEpoch,...(scope.hostEpoch===undefined?{}:{hostEpoch:scope.hostEpoch})})});
   throw error;
  }
 },meta:{errorUi:'inline',errorReportOwner:'operation',suppressToast:true},retry:false,staleTime:0,gcTime:0,networkMode:'always',refetchOnWindowFocus:false,refetchOnReconnect:false,refetchOnMount:'always',refetchInterval:false});
}
/** Настраивает проверку identity; публикацией actor по-прежнему владеет identity ticket. */
export const identitySessionQueryOptions=(environment:CatalogReadEnvironment,scope:CatalogReadScope)=>options(environment,scope,'read-identity-session',signal=>environment.reads.readIdentitySession(scope,{signal}));
/** Настраивает чтение folder/demo каталога без account schema coercion. */
export const workspaceProjectsQueryOptions=(environment:CatalogReadEnvironment,scope:CatalogReadScope)=>options(environment,scope,'list-workspace-projects',signal=>environment.reads.listWorkspaceProjects(scope,{signal}));
/** Настраивает чтение canonical account metadata с текущей авторизацией. */
export const accountProjectsQueryOptions=(environment:CatalogReadEnvironment,scope:CatalogReadScope)=>options(environment,scope,'list-account-projects',signal=>environment.reads.listAccountProjects(scope,{signal}));

const leases=new WeakMap<QueryClient,Map<string,number>>();
/** Прерывает только неактивное чтение без других enabled observers или imperative арендаторов. */
export function cancelInactiveCatalogRead(client:QueryClient,queryKey:ReturnType<typeof catalogReadQueryKey>):void{
 const query=client.getQueryCache().find({queryKey,exact:true});
 if(query&&!query.isActive()&&!leases.get(client)?.get(JSON.stringify(queryKey)))void client.cancelQueries({queryKey,exact:true}).catch(()=>{});
}
/** Выполняет явный fresh read; последний imperative/observed reader освобождает только свой key. */
export async function fetchCatalogRead<T>(client:QueryClient,input:ReturnType<typeof options<T>>,signal?:ClientCancellationSignal):Promise<CatalogReadResult<T>>{
 if(signal?.aborted)throw cancelled();
 let counts=leases.get(client);if(!counts){counts=new Map();leases.set(client,counts);}
 const key=JSON.stringify(input.queryKey);counts.set(key,(counts.get(key)??0)+1);
 const observer=new QueryObserver(client,{...input,enabled:false}),releaseObserver=observer.subscribe(()=>{});
 const pending=client.fetchQuery(input),owned=client.getQueryCache().find({queryKey:input.queryKey,exact:true});
 let rejectAbort:(error:ClientError)=>void=()=>{};
 const aborted=new Promise<never>((_resolve,reject)=>{rejectAbort=reject;});
 const abort=()=>rejectAbort(cancelled());signal?.addEventListener('abort',abort);if(signal?.aborted)abort();
 try{return await Promise.race([pending,aborted]);}
 finally{
  signal?.removeEventListener('abort',abort);
  const remaining=(counts.get(key)??1)-1;if(remaining)counts.set(key,remaining);else counts.delete(key);
  releaseObserver();
  if(!remaining&&owned&&client.getQueryCache().find({queryKey:input.queryKey,exact:true})===owned&&owned.getObserversCount()===0){void client.cancelQueries({queryKey:input.queryKey,exact:true}).catch(()=>{});client.removeQueries({queryKey:input.queryKey,exact:true});}
 }
}
