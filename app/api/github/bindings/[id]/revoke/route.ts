import { createGitHubHandlers } from '@/lib/github/http';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return createGitHubHandlers().revoke(request,(await params).id);}
