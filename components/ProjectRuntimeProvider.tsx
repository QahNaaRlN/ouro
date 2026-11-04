'use client';

import {createContext,useEffect,useState,type ReactNode} from 'react';
import {QueryClientProvider} from '@tanstack/react-query';
import {createProjectRuntime} from '@/packages/frontend/src/app/project-runtime/create-project-runtime';
import {hasPendingWorkspaceIntents} from '@/packages/client/src/http/workspace-intents';
import {createCatalogHttpReads} from '@/packages/client/src/http/create-catalog-http-reads';
import {CatalogReadEnvironmentProvider,type CatalogReadEnvironment} from '@/packages/frontend/src/shared/catalog-read-environment';

/** Контекст, который передаёт уже собранный runtime ближайшему владельцу проекта. */
export const ProjectRuntimeContext=createContext<ReturnType<typeof createProjectRuntime>|null>(null);
/** Компонент, который предоставляет общий web cache и registry обоим существующим интерфейсам. */
export function ProjectRuntimeProvider({children}:{children:ReactNode}){
 const [runtime]=useState(()=>createProjectRuntime());
 const [readEnvironment]=useState<CatalogReadEnvironment>(()=>({sourceId:'ouro:same-origin',reads:createCatalogHttpReads(),reporter:{report:occurrence=>{console.error('[ouro/client]',occurrence);}}}));
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(hasPendingWorkspaceIntents()){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 return <ProjectRuntimeContext.Provider value={runtime}><QueryClientProvider client={runtime.queryClient}><CatalogReadEnvironmentProvider value={readEnvironment}>{children}</CatalogReadEnvironmentProvider></QueryClientProvider></ProjectRuntimeContext.Provider>;
}
