import { createGitHubHandlers } from '@/lib/github/http';
export const runtime='nodejs';
export const POST=(request:Request)=>createGitHubHandlers().create(request);
