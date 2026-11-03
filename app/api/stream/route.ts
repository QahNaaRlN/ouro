import { createProjectStreamHandler } from '@/lib/project-stream';
import { getEvents, getProject, getStorageMode } from '@/lib/store';
import { requestedProjectId } from '@/lib/connection-config';
import { authenticatedParticipant } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { AGENT_ID } from '@/packages/core/src';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (request: Request) => {
  try {
    const projectId=requestedProjectId(request);
    return createProjectStreamHandler({
      store: {
        getEvents:(after:number)=>getEvents(after,projectId),
        getProject:()=>getProject(projectId),
      },
      authenticateHuman:(streamRequest)=>authenticatedParticipant(streamRequest,projectId,AGENT_ID),
      storage: getStorageMode(),
    })(request);
  } catch(error) { return apiError(error); }
};
