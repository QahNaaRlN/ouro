import {createProjectRuntime} from '@/packages/frontend/src/app/project-runtime';
import {createProjectHttpPorts} from '@/packages/client/src/http/project-http';
import type {ErrorReporterPort} from '@/packages/client/src/ports';

/** Неприватный идентификатор существующего web-источника для project и catalog scopes. */
export const WEB_PROJECT_SOURCE_ID='ouro:same-origin';

/** Собирает прежний same-origin web adapter для обеих временно сосуществующих оболочек. */
export function createWebProjectRuntime(reporter:ErrorReporterPort){
 return createProjectRuntime({sourceId:WEB_PROJECT_SOURCE_ID,ports:createProjectHttpPorts,reporter,listenConnectivity:callback=>{
  window.addEventListener('online',callback);window.addEventListener('offline',callback);
  return()=>{window.removeEventListener('online',callback);window.removeEventListener('offline',callback);};
 }});
}
