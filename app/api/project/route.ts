import { authenticatedParticipant,assertHuman } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { getProject, getStorageMode } from '@/lib/store';
import { PROJECT_ID, AGENT_ID } from '@/packages/core/src';
import { requestedProjectId } from '@/lib/connection-config';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const projectId=requestedProjectId(request);
    const actor=await authenticatedParticipant(request, projectId, AGENT_ID);assertHuman(actor);
    const state = await getProject(projectId,actor);
    return Response.json({state,cursor:state.version,storage:getStorageMode()}, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return apiError(e); }
}
