import { createGitHubHandlers } from '@/lib/github/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>createGitHubHandlers().list(request);
