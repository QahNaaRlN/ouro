import { createCollaborativeHandlers } from '@/lib/collaborative-http';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return createCollaborativeHandlers().update(request,(await context.params).id);}
