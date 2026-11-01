import { createParticipantHandlers } from '@/lib/participant-http';
import { createUserAuthHandlers } from '@/lib/user-auth-http';
import { userSessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';
const participant = createParticipantHandlers().session;
const user = createUserAuthHandlers().session;
export async function GET(request: Request) {
  return userSessionCookie(request) !== undefined ? user(request) : participant(request);
}
