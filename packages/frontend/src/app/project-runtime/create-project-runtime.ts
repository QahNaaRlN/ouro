import {createProjectSessionRegistry,type ProjectSession} from '@/packages/client/src/lifecycle/project-session';
import {createProjectHttpPorts} from '@/packages/client/src/http/project-http';
import type {ProjectClientScope,ErrorReporterPort} from '@/packages/client/src/ports';
import {createProjectQueryClient,bindProjectSessionQuery,projectReadQueryKey} from '@/packages/frontend/src/api/project-session';

/** Тип, описывающий внедрение транспорта, диагностики и сигналов browser runtime. */
export type ProjectRuntimeOptions={ports?:typeof createProjectHttpPorts;reporter?:ErrorReporterPort;listenConnectivity?:(reconnect:()=>void)=>()=>void};
/** Утилита, которая собирает browser runtime без открытия транспорта при импорте. */
export function createProjectRuntime(options:ProjectRuntimeOptions={}){
 const queryClient=createProjectQueryClient({reporter:options.reporter}),registry=createProjectSessionRegistry(),bindings=new Map<ProjectSession,{count:number;close:()=>void}>();
 return {queryClient,acquire:(scope:ProjectClientScope,mode:'workspace'|'legacy')=>{
  const lease=registry.acquire({sourceId:'ouro:same-origin',scope,ports:(adopter,commandPresentation)=>(options.ports??createProjectHttpPorts)({scope,mode,adopter,commandPresentation}),reporter:options.reporter});
  let binding=bindings.get(lease.session);
  if(!binding){const closeProjection=bindProjectSessionQuery(queryClient,lease.session),reconnect=()=>lease.session.reconnect(),readKey=projectReadQueryKey(lease.session),listen=options.listenConnectivity??((callback:()=>void)=>{window.addEventListener('online',callback);window.addEventListener('offline',callback);return()=>{window.removeEventListener('online',callback);window.removeEventListener('offline',callback);};}),closeConnectivity=listen(reconnect);binding={count:0,close:()=>{closeConnectivity();closeProjection();void queryClient.cancelQueries({queryKey:readKey}).catch(()=>{});queryClient.removeQueries({queryKey:readKey});}};bindings.set(lease.session,binding);}
  binding.count++;let released=false;
  return {session:lease.session,release:()=>{if(released)return;released=true;if(--binding.count===0){binding.close();bindings.delete(lease.session);}lease.release();}};
 }};
}
