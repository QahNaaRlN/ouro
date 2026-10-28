import { createProjectStreamHandler } from '@/lib/project-stream';
import { getEvents, getProject, getStorageMode } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (request: Request) => createProjectStreamHandler({
  store: { getEvents, getProject }, storage: getStorageMode(),
})(request);
