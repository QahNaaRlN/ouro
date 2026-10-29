import {z} from 'zod';
import {AccessError,readCommandBody} from '@/lib/auth';
import {resolveWorkspaceRequest} from '@/lib/workspace-access';
import {apiError} from '@/lib/http';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{projectId:string;agentId:string}>}){try{
 const {projectId,agentId}=await params,{store,actor}=await resolveWorkspaceRequest(request,projectId);
 if(!agentId||agentId.length>200||!z.strictObject({}).safeParse(await readCommandBody(request)).success)throw new AccessError('VALIDATION_ERROR','Нужен ID агента и пустое JSON-тело.',422);
 return Response.json({agent:await store.revokeAgent(agentId,actor)},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiError(error);}}
