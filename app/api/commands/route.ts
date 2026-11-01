import { authenticatedParticipant, assertHuman, readCommandBody } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { executeCommand } from '@/lib/store';
import { PROJECT_ID, AGENT_ID } from '@/packages/core/src';
import { requestedProjectId } from '@/lib/connection-config';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const projectId=requestedProjectId(request);
    const actor = await authenticatedParticipant(request, projectId, AGENT_ID);
    assertHuman(actor);
    const result = await executeCommand(await readCommandBody(request), actor, projectId);
    return Response.json(result, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return apiError(e); }
}
