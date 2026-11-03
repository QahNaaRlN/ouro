import { createProjectHandlers } from '@/lib/project-http';
const handlers = createProjectHandlers();
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ projectId: string; invitationId: string }> }) {
  const params = await context.params; return handlers.revokeInvitation(request, params.projectId, params.invitationId);
}
