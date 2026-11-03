import { createProjectHandlers } from '@/lib/project-http';
const handlers = createProjectHandlers();
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return handlers.listMembers(request, (await context.params).projectId);
}
