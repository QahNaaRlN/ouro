import { authenticatedActor, readCommandBody, AccessError } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { executeCommand } from '@/lib/store';
import { PROJECT_ID, AGENT_ID } from '@/packages/core/src';
import { toDomainCommand } from '@/packages/mcp/src';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const actor=authenticatedActor(request,PROJECT_ID,AGENT_ID);
    if(actor.kind!=='agent') throw new AccessError('FORBIDDEN','Inbox требует отдельный серверный токен агента.');
    const body=await readCommandBody(request) as {tool?:unknown;arguments?:unknown};
    if(!body || typeof body.tool!=='string' || !body.arguments || typeof body.arguments!=='object' || Array.isArray(body.arguments)) throw new AccessError('VALIDATION_ERROR','Нужны tool и arguments.',422);
    return Response.json(await executeCommand(toDomainCommand(body.tool,body.arguments as Record<string,unknown>),actor));
  } catch(e) {return apiError(e);}
}
