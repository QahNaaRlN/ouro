import { createUserAuthHandlers } from '@/lib/user-auth-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createUserAuthHandlers().session;
