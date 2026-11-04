import {StrictMode,useContext,useEffect,useRef,useState,type ContextType} from 'react';
import {createRoot} from 'react-dom/client';
import {ProjectRuntimeProvider,ProjectRuntimeContext} from '@/components/ProjectRuntimeProvider';
import {useIdentitySessionRead} from '@/packages/frontend/src/api/catalog-reads/useCatalogReads';
import {normalizeAppError} from '@/packages/client/src/lifecycle/client-error-reporting';
import {freezeProjectCommandIntent,type ClientErrorOccurrence,type FrozenProjectCommandIntent} from '@/packages/client/src/ports';
import {getWorkspaceIntents} from '@/packages/client/src/http/workspace-intents';
import type {ProjectSession} from '@/packages/client/src/lifecycle/project-session';
import '@/app/tailwind.css';
import '@/app/theme.css';

const events:ClientErrorOccurrence[]=[],original=console.error;
console.error=(...values:unknown[])=>{if(values[0]==='[ouro/client]')events.push(values[1] as ClientErrorOccurrence);else original(...values);};
let retained:ContextType<typeof ProjectRuntimeContext>=null;
let originalIntent:FrozenProjectCommandIntent|undefined,retainedSession:ProjectSession|undefined,releases=0;
const warningOwners=new Set<object>(),warningIds=new WeakMap<object,number>();let nextWarning=0;
const nativeAdd=window.addEventListener,nativeRemove=window.removeEventListener;
window.addEventListener=((...args:Parameters<typeof window.addEventListener>)=>{if(args[0]==='beforeunload'&&args[1]){const listener=args[1] as object;warningOwners.add(listener);if(!warningIds.has(listener))warningIds.set(listener,++nextWarning);}Reflect.apply(nativeAdd,window,args);}) as typeof window.addEventListener;
window.removeEventListener=((...args:Parameters<typeof window.removeEventListener>)=>{if(args[0]==='beforeunload'&&args[1])warningOwners.delete(args[1] as object);Reflect.apply(nativeRemove,window,args);}) as typeof window.removeEventListener;
const probe={events:()=>events,retained:()=>retained?.queryClient.getQueryData(['retained']),warningOwners:()=>[...warningOwners].map(owner=>warningIds.get(owner)!),original:()=>originalIntent,pending:()=>originalIntent?getWorkspaceIntents(originalIntent.scope.projectId,originalIntent.scope.actorId):[],lease:()=>({active:retainedSession?.getView().active,releases})};
Object.assign(window,{clientErrorProbe:probe});

/** Контролируемые test-only failures идут через настоящий application provider и Query hooks. */
function Content(){
 const runtime=useContext(ProjectRuntimeContext)!;retained=runtime;
 const identity=useIdentitySessionRead(),[failure,setFailure]=useState<unknown>(null),[status,setStatus]=useState('Готово');
 const lease=useRef<ReturnType<typeof runtime.acquire>|null>(null);
 useEffect(()=>{runtime.queryClient.setQueryData(['retained'],'original-owner');},[runtime]);
 useEffect(()=>()=>{if(lease.current){lease.current.release();lease.current=null;releases++;}},[]);
 if(failure)throw failure;
 const queryFailure=async()=>{
  const error=normalizeAppError(new Error('SECRET document and cookie'));
  try{await runtime.queryClient.fetchQuery({queryKey:['fixture-failure'],queryFn:async()=>{throw error;},meta:{errorUi:'inline'}});}catch(value){setFailure(value);}
 };
 const asyncFailure=async()=>{const controller=new AbortController();try{await identity.read({accessEpoch:4,projectId:null},controller.signal);setStatus('Чтение завершено');}catch(error){setStatus(normalizeAppError(error).code);}};
 const unknown=async()=>{
  const scope={projectId:'boundary-fake-project',actorId:'boundary-fake-human',accessEpoch:12,hostEpoch:3},requestId=crypto.randomUUID(),expectedVersion=0;
  const content={title:'Owned pending fixture',goal:'Keep original pending bytes',dod:[{id:'fixture',text:'No automatic retry',required:true}],constraints:'Test-only aborted POST',assumptions:'',risks:'Not a commit proof',inputs:'',comment:''};
  originalIntent=freezeProjectCommandIntent({scope,requestId,expectedVersion,operation:'execute-command',body:' \n'+JSON.stringify({type:'createSpec',requestId,expectedVersion,content})+'\n '});
  lease.current=runtime.acquire(scope,'workspace');retainedSession=lease.current.session;
  const outcome=await retainedSession.execute(originalIntent,{slot:'owned-pending',label:'Original pending fixture'});setStatus(outcome.status);
 };
 return <main><h1>Проверка ошибок клиента</h1><button onClick={()=>setFailure(new Error('SECRET render document'))}>Ошибка рендера</button><button onClick={()=>void queryFailure()}>Query и renderer</button><button onClick={()=>void asyncFailure()}>Ошибка async чтения</button><button onClick={()=>void unknown()}>Создать UNKNOWN fixture</button><output>{status}</output></main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><ProjectRuntimeProvider><Content/></ProjectRuntimeProvider></StrictMode>);
