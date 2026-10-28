import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticatedAgent } from '@/lib/auth';
import { assertMcpRequest } from '@/lib/connection-config';
import { apiError } from '@/lib/http';
import { executeCommand,getEvents,getProject } from '@/lib/store';
import { PROJECT_ID,AGENT_ID } from '@/packages/core/src';
import { createOuroMcpServer } from '@/packages/mcp/src/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  let server:ReturnType<typeof createOuroMcpServer>|undefined;
  try{
    assertMcpRequest(request);
    const actor=await authenticatedAgent(request,PROJECT_ID,AGENT_ID);
    server=createOuroMcpServer({store:{getProject,getEvents,executeCommand},actor});
    const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:256_000});
    await server.connect(transport);
    const response=await transport.handleRequest(request);
    // JSON responses are finite; consume before closing this per-request transport.
    const body=await response.arrayBuffer();
    return new Response(body.byteLength?body:null,{status:response.status,headers:response.headers});
  }catch(e){return apiError(e);}finally{await server?.close();}
}
const unsupported=()=>new Response(null,{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
export const GET=unsupported;
export const DELETE=unsupported;
