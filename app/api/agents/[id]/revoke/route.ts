import { authenticatedParticipant,assertHuman,readCommandBody } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { revokeAgent } from '@/lib/store';
import { PROJECT_ID,AGENT_ID } from '@/packages/core/src';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const actor=await authenticatedParticipant(request,PROJECT_ID,AGENT_ID);assertHuman(actor);
  await readCommandBody(request);
  return Response.json({agent:await revokeAgent((await params).id,actor)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
