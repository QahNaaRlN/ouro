import { authenticatedParticipant,assertHuman } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { getProject, getStorageMode } from '@/lib/store';
import { PROJECT_ID, AGENT_ID } from '@/packages/core/src';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    assertHuman(await authenticatedParticipant(request, PROJECT_ID, AGENT_ID));
    const state = await getProject();
    return Response.json({state,cursor:state.version,storage:getStorageMode()}, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return apiError(e); }
}
