import { z } from 'zod';
import { authenticatedActor,assertHuman,readCommandBody,AccessError } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { createAgent,listAgents } from '@/lib/store';
import { connectionConfig } from '@/lib/connection-config';
import { PROJECT_ID,AGENT_ID } from '@/packages/core/src';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const input=z.object({name:z.string().trim().min(1).max(100)}).strict();
export async function GET(request:Request){try{
  const actor=authenticatedActor(request,PROJECT_ID,AGENT_ID);assertHuman(actor);
  return Response.json({agents:await listAgents(actor),connection:connectionConfig(request)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
  const actor=authenticatedActor(request,PROJECT_ID,AGENT_ID);assertHuman(actor);
  const data=input.safeParse(await readCommandBody(request));
  if(!data.success)throw new AccessError('VALIDATION_ERROR','Укажите имя агента (1–100 символов).',422);
  const connection=connectionConfig(request);
  const result=await createAgent(data.data.name,actor);
  return Response.json({...result,connection},{status:201,headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
