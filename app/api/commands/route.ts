import { authenticatedParticipant, assertHuman, readCommandBody } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { executeCommand } from '@/lib/store';
import { PROJECT_ID, AGENT_ID } from '@/packages/core/src';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const actor = await authenticatedParticipant(request, PROJECT_ID, AGENT_ID);
    assertHuman(actor);
    const result = await executeCommand(await readCommandBody(request), actor);
    return Response.json(result, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return apiError(e); }
}
