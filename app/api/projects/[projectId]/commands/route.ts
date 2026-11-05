import {readCommandBody} from '@/lib/auth';
import {resolveWorkspaceRequest} from '@/lib/workspace-access';
import {apiError} from '@/lib/http';
import {commandReceiptResponse} from '@/lib/http-command-receipt';
export const runtime='nodejs';
/** Проверяет доступ к проекту из маршрута и передаёт JSON-команду его store с возвратом HTTP-квитанции. */
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{
 const {store,actor}=await resolveWorkspaceRequest(request,(await params).projectId);
 const result=await store.executeCommandWithReceipt(await readCommandBody(request),actor);
 return commandReceiptResponse(result);
}catch(error){return apiError(error);}}
