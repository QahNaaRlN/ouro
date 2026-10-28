import { issueLocalSession } from '@/lib/auth';
import { apiError } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const token = issueLocalSession(request);
    return Response.json({mode:'local-demo', role:'human'}, {headers:{'Set-Cookie':`ouro_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`, 'Cache-Control':'no-store'}});
  } catch(e) { return apiError(e); }
}
