import {createProjectStreamHandler} from '@/lib/project-stream';
import {resolveWorkspaceRequest} from '@/lib/workspace-access';
import {getStorageMode} from '@/lib/store';
import {apiError} from '@/lib/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}){try{
 const {projectId}=await params,{store}=await resolveWorkspaceRequest(request,projectId);
 return createProjectStreamHandler({store,storage:getStorageMode(),authenticateHuman:async incoming=>(await resolveWorkspaceRequest(incoming,projectId)).actor})(request);
}catch(error){return apiError(error);}}
