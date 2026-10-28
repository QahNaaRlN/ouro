import { createParticipantHandlers } from '@/lib/participant-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const handlers=createParticipantHandlers();
export const GET=handlers.list;
export const POST=handlers.create;
