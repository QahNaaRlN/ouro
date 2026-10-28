import { createCollaborativeHandlers } from '@/lib/collaborative-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>createCollaborativeHandlers().list(request);
export const POST=(request:Request)=>createCollaborativeHandlers().create(request);
