import { createParticipantHandlers } from '@/lib/participant-http';
export const runtime='nodejs';
const handlers=createParticipantHandlers();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return handlers.revoke(request,(await params).id);}
