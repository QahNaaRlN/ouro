import { createProjectHandlers } from '@/lib/project-http';
const handlers = createProjectHandlers();
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return handlers.listInvitations(request, (await context.params).projectId);
}
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return handlers.createInvitation(request, (await context.params).projectId);
}
