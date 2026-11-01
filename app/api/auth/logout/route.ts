import { createUserAuthHandlers } from '@/lib/user-auth-http';
export const runtime = 'nodejs';
export const POST = createUserAuthHandlers().logout;
