import { authenticatedAgent, readCommandBody, AccessError } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { executeCommand } from '@/lib/store';
import { PROJECT_ID, AGENT_ID } from '@/packages/core/src';
import { toDomainCommand } from '@/packages/mcp/src';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const actor=await authenticatedAgent(request,PROJECT_ID,AGENT_ID);
    if(actor.kind!=='agent') throw new AccessError('FORBIDDEN','Inbox требует отдельный серверный токен агента.');
    const body=await readCommandBody(request) as {tool?:unknown;arguments?:unknown};
    if(!body || typeof body.tool!=='string' || !body.arguments || typeof body.arguments!=='object' || Array.isArray(body.arguments)) throw new AccessError('VALIDATION_ERROR','Нужны tool и arguments.',422);
    const command=toDomainCommand(body.tool,body.arguments as Record<string,unknown>);
    const committed=await executeCommand(command,actor);
    if(actor.id===AGENT_ID) return Response.json(committed);
    // Registered agent credentials never receive the human/project snapshot.
    const execution=committed.state.executions.find(e=>e.id===(body.arguments as Record<string,unknown>).executionId&&e.agentId===actor.id);
    return Response.json({ok:true,execution,requests:committed.state.requests.filter(r=>r.executionId===execution?.id),events:committed.events,cursor:committed.cursor,replayed:committed.replayed});
  } catch(e) {return apiError(e);}
}
