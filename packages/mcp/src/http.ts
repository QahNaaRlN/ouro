import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {authenticatedAgent,AccessError} from '../../../lib/auth';
import {assertMcpRequest} from '../../../lib/connection-config';
import {apiError} from '../../../lib/http';
import {AGENT_ID,type Actor} from '../../core/src';
import {createOuroMcpServer} from './server';
import {createAgentWorkspace,type WorkspaceMetadataStore} from './workspace';
import type {AgentStore} from './agent-service';

type ProjectMcpStore=AgentStore&WorkspaceMetadataStore&{authenticateAgentToken(token:string):Promise<Actor|null>};
export type ProjectMcpContext={store:ProjectMcpStore};

/** Same finite, stateless HTTP handler for the Next route and SDK integration checks. */
export function createProjectMcpHandler(getContext:(id:string)=>Promise<ProjectMcpContext>){
 return async(request:Request,projectId:string)=>{
  let server:ReturnType<typeof createOuroMcpServer>|undefined;
  try{
   assertMcpRequest(request);
   const expected=request.headers.get('X-Ouro-Expected-Project');
   if(expected!==null&&expected!==projectId)throw new AccessError('PROJECT_CHANGED','Проект запроса изменился. Повторите исходную операцию в прежнем проекте.',409);
   const {store}=await getContext(projectId);
   const actor=await authenticatedAgent(request,projectId,AGENT_ID,token=>store.authenticateAgentToken(token));
   server=createOuroMcpServer({store,actor,projectId,workspace:createAgentWorkspace(store)});
   const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:256_000});
   await server.connect(transport);
   const response=await transport.handleRequest(request),body=await response.arrayBuffer();
   return new Response(body.byteLength?body:null,{status:response.status,headers:response.headers});
  }catch(error){return apiError(error);}finally{await server?.close();}
 };
}
