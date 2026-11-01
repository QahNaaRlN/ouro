import { authenticatedParticipant,assertHuman,readCommandBody } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { revokeAgent } from '@/lib/store';
import { AGENT_ID } from '@/packages/core/src';
import { requestedProjectId } from '@/lib/connection-config';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const projectId=requestedProjectId(request),actor=await authenticatedParticipant(request,projectId,AGENT_ID);assertHuman(actor);
  await readCommandBody(request);
  return Response.json({agent:await revokeAgent((await params).id,actor,projectId)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
