'use client';

import {useCallback,useId,useMemo,useRef,useEffect} from 'react';
import {useQuery,useQueryClient,type UseQueryResult} from '@tanstack/react-query';
import {ClientError,type CatalogReadResult,type CatalogReadScope,type ClientCancellationSignal} from '../../../../client/src/ports';
import {useCatalogReadEnvironment} from '../../shared/catalog-read-environment';
import {createClientCancellation} from '../../../../client/src/lifecycle/create-client-cancellation';
import {catalogReadScope,catalogReadQueryKey,identitySessionQueryOptions,workspaceProjectsQueryOptions,accountProjectsQueryOptions,fetchCatalogRead,cancelInactiveCatalogRead} from './catalog-read.query';

/** Выводит finite read state; disabled и unsupported не являются вечной загрузкой. */
export function catalogReadView<T>(query:Pick<UseQueryResult<CatalogReadResult<T>,ClientError>,'data'|'error'|'isFetching'|'isPending'>,enabled:boolean,available=true){
 if(!enabled)return {status:'idle' as const,data:undefined,error:null,refreshing:false};
 if(!available||query.data?.status==='unsupported')return {status:'unavailable' as const,data:undefined,error:null,refreshing:false};
 if(query.data?.status==='available')return {status:'ready' as const,data:query.data.value,error:query.error,refreshing:query.isFetching};
 if(query.error)return {status:'error' as const,data:undefined,error:query.error,refreshing:false};
 return {status:query.isFetching?'loading' as const:'idle' as const,data:undefined,error:null,refreshing:false};
}

/** Даёт существующему identity controller fresh Query read без автоматической второй проверки. */
export function useIdentitySessionRead(){
 const client=useQueryClient(),environment=useCatalogReadEnvironment(),ownerId=useId();
 const read=useCallback(async(input:{accessEpoch:number;projectId:string|null},signal:ClientCancellationSignal)=>{
  if(!environment)return {status:'unsupported' as const,capability:'read-identity-session' as const};
  return fetchCatalogRead(client,identitySessionQueryOptions(environment,catalogReadScope(environment,ownerId,{...input,actorId:null})),signal);
 },[client,environment,ownerId]);
 const scope=useCallback((input:{accessEpoch:number;projectId:string|null;actorId:string|null}):CatalogReadScope=>environment?catalogReadScope(environment,ownerId,input):{...input,ownerId,sourceId:'unavailable'},[environment,ownerId]);
 const readAccountProjects=useCallback(async(input:CatalogReadScope,signal:ClientCancellationSignal)=>environment?fetchCatalogRead(client,accountProjectsQueryOptions(environment,input),signal):{status:'unsupported' as const,capability:'list-account-projects' as const},[client,environment]);
 return {read,scope,readAccountProjects};
}

/** Наблюдает один из двух каталогов; оба hooks сохраняют стабильный порядок React вызовов. */
export function useCatalogProjects(input:CatalogReadScope,kind:'workspace'|'account',enabled:boolean){
 const scope=useMemo(()=>input,[input.sourceId,input.ownerId,input.actorId,input.projectId,input.accessEpoch,input.hostEpoch]);
 const environment=useCatalogReadEnvironment(),client=useQueryClient();
 const valid=!!environment&&environment.sourceId===scope.sourceId&&environment.hostEpoch===scope.hostEpoch;
 const lifetime=useMemo(()=>({active:true,pending:new Set<ReturnType<typeof createClientCancellation>>()}),[environment,scope,kind,enabled]),current=useRef(lifetime);current.current=lifetime;
 useEffect(()=>{lifetime.active=true;return()=>{lifetime.active=false;lifetime.pending.forEach(value=>value.abort());lifetime.pending.clear();};},[lifetime]);
 const workspace=useQuery(environment?{...workspaceProjectsQueryOptions(environment,scope),enabled:valid&&enabled&&kind==='workspace'}:{queryKey:catalogReadQueryKey('list-workspace-projects',scope),enabled:false,queryFn:async()=>({status:'unsupported' as const,capability:'list-workspace-projects' as const})});
 const account=useQuery(environment?{...accountProjectsQueryOptions(environment,scope),enabled:valid&&enabled&&kind==='account'}:{queryKey:catalogReadQueryKey('list-account-projects',scope),enabled:false,queryFn:async()=>({status:'unsupported' as const,capability:'list-account-projects' as const})});
 useEffect(()=>{if(!valid||!enabled||kind!=='workspace')cancelInactiveCatalogRead(client,catalogReadQueryKey('list-workspace-projects',scope));if(!valid||!enabled||kind!=='account')cancelInactiveCatalogRead(client,catalogReadQueryKey('list-account-projects',scope));},[client,scope,kind,enabled,valid]);
 const refresh=useCallback(async()=>{
  if(!enabled||!environment||!valid)throw new ClientError('CATALOG_UNAVAILABLE','Чтение каталога недоступно.','rejected');
  if(current.current!==lifetime||!lifetime.active)throw new ClientError('CANCELLED','Ожидание отменено.','cancelled');
  const cancellation=createClientCancellation();lifetime.pending.add(cancellation);
  try{
   const result=kind==='workspace'?await fetchCatalogRead(client,workspaceProjectsQueryOptions(environment,scope),cancellation.signal):await fetchCatalogRead(client,accountProjectsQueryOptions(environment,scope),cancellation.signal);
   if(current.current!==lifetime||!lifetime.active||cancellation.signal.aborted)throw new ClientError('CANCELLED','Ожидание отменено.','cancelled');
   if(result.status==='unsupported')throw new ClientError('CATALOG_UNAVAILABLE','Чтение каталога недоступно.','rejected');
   return result.value;
  }finally{lifetime.pending.delete(cancellation);}
 },[client,environment,scope,kind,enabled,valid,lifetime]);
 return {workspace:catalogReadView(workspace,enabled&&kind==='workspace',valid),account:catalogReadView(account,enabled&&kind==='account',valid),refresh};
}
