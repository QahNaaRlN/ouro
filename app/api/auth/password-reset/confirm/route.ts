import { createProjectHandlers } from '@/lib/project-http';
export const runtime = 'nodejs';
export const POST = createProjectHandlers().resetPassword;
