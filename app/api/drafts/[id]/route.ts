import { createCollaborativeHandlers } from '@/lib/collaborative-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return createCollaborativeHandlers().read(request,(await context.params).id);}
