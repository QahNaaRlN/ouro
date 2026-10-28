import { createParticipantHandlers } from '@/lib/participant-http';
export const runtime='nodejs';
export const POST=createParticipantHandlers().logout;
