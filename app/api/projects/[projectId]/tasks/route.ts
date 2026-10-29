import {z} from 'zod';
import {proposalRevisionContentSchema} from '@ouro/protocol';
import {AccessError,readCommandBody} from '@/lib/auth';
import {resolveWorkspaceRequest} from '@/lib/workspace-access';
import {apiError} from '@/lib/http';
export const runtime='nodejs';
const input=z.strictObject({requestId:z.string().min(8).max(200),expectedVersion:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),agentId:z.string().min(1).max(200),content:proposalRevisionContentSchema});
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{
 const {store,actor}=await resolveWorkspaceRequest(request,(await params).projectId),parsed=input.safeParse(await readCommandBody(request));
 if(!parsed.success)throw new AccessError('VALIDATION_ERROR','Нужны requestId, expectedVersion, выбранный agentId и полное содержание задачи с критериями без посторонних полей.',422);
 const result=await store.executeCommand({type:'startProjectWork',...parsed.data},actor);
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiError(error);}}
