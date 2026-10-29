import {readCommandBody} from '@/lib/auth';
import {resolveWorkspaceRequest} from '@/lib/workspace-access';
import {apiError} from '@/lib/http';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{
 const {store,actor}=await resolveWorkspaceRequest(request,(await params).projectId);
 const result=await store.executeCommand(await readCommandBody(request),actor);
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiError(error);}}
