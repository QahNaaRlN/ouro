import { z } from 'zod';
import { authenticatedParticipant,assertHuman,readCommandBody,AccessError } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { createAgent,listAgents } from '@/lib/store';
import { connectionConfig,requestedProjectId } from '@/lib/connection-config';
import { AGENT_ID } from '@/packages/core/src';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const input=z.object({name:z.string().trim().min(1).max(100)}).strict();
export async function GET(request:Request){try{
  const projectId=requestedProjectId(request),actor=await authenticatedParticipant(request,projectId,AGENT_ID);assertHuman(actor);
  return Response.json({agents:await listAgents(actor,projectId),connection:connectionConfig(request,projectId)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
  const projectId=requestedProjectId(request),actor=await authenticatedParticipant(request,projectId,AGENT_ID);assertHuman(actor);
  const data=input.safeParse(await readCommandBody(request));
  if(!data.success)throw new AccessError('VALIDATION_ERROR','Укажите имя агента (1–100 символов).',422);
  const connection=connectionConfig(request,projectId);
  const result=await createAgent(data.data.name,actor,projectId);
  return Response.json({...result,connection},{status:201,headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
