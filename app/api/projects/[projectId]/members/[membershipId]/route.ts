import { createProjectHandlers } from '@/lib/project-http';
const handlers = createProjectHandlers();
export const runtime = 'nodejs';
export async function PATCH(request: Request, context: { params: Promise<{ projectId: string; membershipId: string }> }) {
  const params = await context.params; return handlers.changeRole(request, params.projectId, params.membershipId);
}
export async function DELETE(request: Request, context: { params: Promise<{ projectId: string; membershipId: string }> }) {
  const params = await context.params; return handlers.revokeMember(request, params.projectId, params.membershipId);
}
