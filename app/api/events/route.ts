import { authenticatedParticipant,assertHuman } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { getEvents } from '@/lib/store';
import { PROJECT_ID, AGENT_ID } from '@/packages/core/src';
import { requestedProjectId } from '@/lib/connection-config';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const projectId=requestedProjectId(request);
    const actor=await authenticatedParticipant(request, projectId, AGENT_ID);assertHuman(actor);
    const after = Number(new URL(request.url).searchParams.get('after') ?? 0);
    if (!Number.isSafeInteger(after) || after < 0) return Response.json({error:{code:'VALIDATION_ERROR',message:'Курсор должен быть неотрицательным целым.'}}, {status:422});
    const result = await getEvents(after,projectId,actor);
    if (after > result.cursor) return Response.json({error:{code:'CURSOR_CONFLICT',message:'Курсор опережает журнал. Загрузите снимок проекта.'}}, {status:409});
    return Response.json(result, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return apiError(e); }
}
