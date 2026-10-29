import {resolveWorkspaceRequest} from '@/lib/workspace-access';
import {connectionConfig} from '@/lib/connection-config';
import {apiError} from '@/lib/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}){try{
 const {projectId}=await params,{project,store,actor}=await resolveWorkspaceRequest(request,projectId);
 const [state,agents]=await Promise.all([store.getProject(),store.listAgents(actor)]);
 return Response.json({project,state,cursor:state.version,agents,connection:connectionConfig(request,projectId)},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiError(error);}}
