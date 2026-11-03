import {checkHealth} from '@/lib/health';
import {getWorkspaceStore,getStorageMode} from '@/lib/store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){return checkHealth(getWorkspaceStore,getStorageMode());}
