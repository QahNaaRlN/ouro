import {QueryClient} from '@tanstack/react-query';
import type {ProjectSession} from '../../../../client/src/lifecycle/project-session';
import {projectSessionKey} from '../../../../client/src/lifecycle/project-session';
import {createQueryErrorPolicy,type QueryErrorPolicyOptions} from '../error-policy';

/** Утилита, которая создаёт изолированный cache с явными безопасными повторами. */
export const createProjectQueryClient=(errors:QueryErrorPolicyOptions={})=>new QueryClient({...createQueryErrorPolicy(errors),defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false},mutations:{retry:false,networkMode:'always',gcTime:0}}});
/** Утилита, которая адресует принятую проекцию полного access scope. */
export const projectSnapshotQueryKey=(session:ProjectSession)=>['project-snapshot',projectSessionKey(session.sourceId,session.scope)] as const;
/** Утилита, которая изолирует незавершённые чтения конкретного lifecycle owner. */
export const projectReadQueryKey=(session:ProjectSession,kind?:'workspace'|'legacy')=>kind?['project-read',projectSessionKey(session.sourceId,session.scope),session.id,kind] as const:['project-read',projectSessionKey(session.sourceId,session.scope),session.id] as const;
/** Утилита, которая публикует только принятую ссылку без собственного запроса или replay. */
export function bindProjectSessionQuery(client:QueryClient,session:ProjectSession){
 const queryKey=projectSnapshotQueryKey(session);
 client.setQueryDefaults(queryKey,{structuralSharing:false,staleTime:Infinity,gcTime:0});
 const publish=()=>{const view=session.getView();if(view.active&&view.snapshot)client.setQueryData(queryKey,view.snapshot);else client.removeQueries({queryKey,exact:true});};
 const unsubscribe=session.subscribe(publish);publish();
 return ()=>{unsubscribe();client.removeQueries({queryKey,exact:true});};
}
