import { after } from 'next/server';
import { createGitHubHandlers } from '@/lib/github/http';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return createGitHubHandlers({afterResponse:after}).retry(request,(await params).id);}
