import {getWorkspaceProjectContext} from '@/lib/workspace-access';
import {createProjectMcpHandler} from '@/packages/mcp/src/http';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const handle=createProjectMcpHandler(getWorkspaceProjectContext);
export async function POST(request:Request,context:{params:Promise<{projectId:string}>}){
 return handle(request,(await context.params).projectId);
}
const unsupported=()=>new Response(null,{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
export const GET=unsupported;
export const DELETE=unsupported;
