import { after } from 'next/server';
import { createGitHubHandlers } from '@/lib/github/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const POST=(request:Request)=>createGitHubHandlers({afterResponse:after}).webhook(request);
