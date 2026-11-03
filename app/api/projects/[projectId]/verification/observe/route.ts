import {readCommandBody} from '@/lib/auth';
import {resolveLocalWorkspaceRequest} from '@/lib/workspace-access';
import {apiError} from '@/lib/http';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){
 try{
   const {store,actor}=await resolveLocalWorkspaceRequest(request,(await params).projectId);
  return Response.json(await store.observeVerification(await readCommandBody(request),actor),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return apiError(error);}
}
