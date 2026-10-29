import {AccessError} from '@/lib/auth';
import {apiError} from '@/lib/http';
import {requireWorkspaceOperator} from '@/lib/workspace-access';
import {browseWorkspaceFolders} from '@/lib/workspace-files';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 await requireWorkspaceOperator(request);
 const query=new URL(request.url).searchParams;
 if([...query.keys()].some(key=>key!=='path')||query.getAll('path').length>1)throw new AccessError('VALIDATION_ERROR','Просмотр папок принимает только один необязательный path.',422);
 return Response.json(await browseWorkspaceFolders(query.get('path')??undefined),{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiError(error);}}
