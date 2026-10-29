import {AGENT_ID,PROJECT_ID,type Actor} from '../packages/core/src';
import {AccessError,assertHuman,authenticatedParticipant} from './auth';
import {requestOrigin} from './connection-config';
import {getWorkspaceStore} from './store';

/** The catalog is a local operator boundary, not membership in the demo project. */
export async function requireWorkspaceOperator(request:Request):Promise<Actor>{
 const origin=requestOrigin(request),supplied=request.headers.get('origin');
 if(supplied&&supplied!==origin)throw new AccessError('FORBIDDEN','Origin не разрешён для локального управления проектами.');
 const actor=await authenticatedParticipant(request,PROJECT_ID,AGENT_ID);assertHuman(actor);
 if(!['local-human','human-token'].includes(actor.id))throw new AccessError('FORBIDDEN','Папками и проектами управляет только доверенный локальный оператор.');
 return actor;
}
export function assertExpectedProject(request:Request,projectId:string):void{
 const expected=request.headers.get('X-Ouro-Expected-Project');
 if(expected!==null&&expected!==projectId)throw new AccessError('PROJECT_CHANGED','Операция относится к другому проекту. Повторите её по исходному адресу.',409);
}
/** Internal lookup: callers must authenticate their own human/agent boundary. */
export async function getWorkspaceProjectContext(id:string){
 if(typeof id!=='string'||!id||id.length>200||/[\u0000-\u001f\u007f]/.test(id))throw new AccessError('VALIDATION_ERROR','Нужен корректный ID проекта.',422);
 const owner=await getWorkspaceStore(),project=await owner.getWorkspaceProject(id);
 if(!project)throw new AccessError('NOT_FOUND','Проект не найден в каталоге локального оператора.',404);
 return {project,store:await owner.forProject(id)};
}
export async function resolveWorkspaceRequest(request:Request,id:string){
 const operator=await requireWorkspaceOperator(request);assertExpectedProject(request,id);
 const context=await getWorkspaceProjectContext(id);
 return {...context,actor:{...operator,projectIds:[id]} as Actor};
}
