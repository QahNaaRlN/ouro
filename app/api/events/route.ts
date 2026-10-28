import { authenticatedParticipant,assertHuman } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { getEvents } from '@/lib/store';
import { PROJECT_ID, AGENT_ID } from '@/packages/core/src';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    assertHuman(await authenticatedParticipant(request, PROJECT_ID, AGENT_ID));
    const after = Number(new URL(request.url).searchParams.get('after') ?? 0);
    if (!Number.isSafeInteger(after) || after < 0) return Response.json({error:{code:'VALIDATION_ERROR',message:'Курсор должен быть неотрицательным целым.'}}, {status:422});
    const result = await getEvents(after);
    if (after > result.cursor) return Response.json({error:{code:'CURSOR_CONFLICT',message:'Курсор опережает журнал. Загрузите снимок проекта.'}}, {status:409});
    return Response.json(result, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return apiError(e); }
}
