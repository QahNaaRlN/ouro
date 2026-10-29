import {z} from 'zod';
import {AccessError,readCommandBody} from '@/lib/auth';
import {apiError} from '@/lib/http';
import {requireWorkspaceOperator} from '@/lib/workspace-access';
import {getWorkspaceStore} from '@/lib/store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const input=z.strictObject({requestId:z.string().min(8).max(200),name:z.string().min(1).max(120).optional(),rootPath:z.string().min(1).max(4096)});
export async function GET(request:Request){try{
 const actor=await requireWorkspaceOperator(request);
 return Response.json({projects:await(await getWorkspaceStore()).listWorkspaceProjects(actor)},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiError(error);}}
export async function POST(request:Request){try{
 const actor=await requireWorkspaceOperator(request),parsed=input.safeParse(await readCommandBody(request));
 if(!parsed.success)throw new AccessError('VALIDATION_ERROR','Укажите requestId, абсолютный rootPath и необязательное имя проекта без посторонних полей.',422);
 const result=await(await getWorkspaceStore()).createWorkspaceProject(parsed.data,actor);
 return Response.json(result,{status:result.created?201:200,headers:{'Cache-Control':'no-store'}});
}catch(error){return apiError(error);}}
