import { authenticatedParticipant, assertHuman, readCommandBody } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { executeCommandWithReceipt } from '@/lib/store';
import {commandReceiptResponse} from '@/lib/http-command-receipt';
import { PROJECT_ID, AGENT_ID } from '@/packages/core/src';
import { requestedProjectId } from '@/lib/connection-config';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const projectId=requestedProjectId(request);
    const actor = await authenticatedParticipant(request, projectId, AGENT_ID);
    assertHuman(actor);
    const result = await executeCommandWithReceipt(await readCommandBody(request), actor, projectId);
    return commandReceiptResponse(result);
  } catch(e) { return apiError(e); }
}
