import {z} from 'zod';
import {AccessError,readCommandBody} from '@/lib/auth';
import {resolveWorkspaceRequest} from '@/lib/workspace-access';
import {connectionConfig} from '@/lib/connection-config';
import {apiError} from '@/lib/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const input=z.strictObject({name:z.string().trim().min(1).max(120)});
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}){try{
 const {projectId}=await params,{store,actor}=await resolveWorkspaceRequest(request,projectId);
 return Response.json({agents:await store.listAgents(actor),connection:connectionConfig(request,projectId)},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiError(error);}}
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{
 const {projectId}=await params,{store,actor}=await resolveWorkspaceRequest(request,projectId),parsed=input.safeParse(await readCommandBody(request));
 if(!parsed.success)throw new AccessError('VALIDATION_ERROR','Укажите имя агента (1–120 символов), без посторонних полей.',422);
 return Response.json({...await store.createAgent(parsed.data.name,actor),connection:connectionConfig(request,projectId)},{status:201,headers:{'Cache-Control':'no-store'}});
}catch(error){return apiError(error);}}
