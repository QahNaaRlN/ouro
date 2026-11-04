import {AGENT_ID,PROJECT_ID,type Actor} from '../packages/core/src';
import {AccessError,assertHuman,authenticatedParticipant,userSessionCookie,defaultAuthService,type AuthService} from './auth';
import {requestOrigin} from './connection-config';
import {getWorkspaceStore,type Store} from './store';

/** Собирает workspace authority из переданного storage owner и identity adapter. */
export function createWorkspaceAccess(dependencies:{getStore?:()=>Promise<Store>;auth?:AuthService;environment?:Record<string,string|undefined>}={}){
 const getWorkspaceStore=dependencies.getStore??legacyGetStore;
 const {authenticatedParticipant,requestOrigin}=dependencies.auth??defaultAuthService;
 const environment=dependencies.environment??process.env;

/** The catalog is a local operator boundary, not membership in the demo project. */
async function requireWorkspaceOperator(request:Request):Promise<Actor>{
 if(environment.OURO_DEPLOYMENT_MODE==='cloud')throw new AccessError('FORBIDDEN','Файловая система сервера недоступна из облачного проекта.');
 if(!request.headers.has('authorization')&&userSessionCookie(request)!==undefined)throw new AccessError('FORBIDDEN','Аккаунт проекта не предоставляет полномочия локального оператора и доступ к папкам сервера.');
 const origin=requestOrigin(request),supplied=request.headers.get('origin');
 if(supplied&&supplied!==origin)throw new AccessError('FORBIDDEN','Origin не разрешён для локального управления проектами.');
 const actor=await authenticatedParticipant(request,PROJECT_ID,AGENT_ID);assertHuman(actor);
 if(!['local-human','human-token'].includes(actor.id))throw new AccessError('FORBIDDEN','Папками и проектами управляет только доверенный локальный оператор.');
 return actor;
}
function assertExpectedProject(request:Request,projectId:string):void{
 const expected=request.headers.get('X-Ouro-Expected-Project');
 if(expected!==null&&expected!==projectId)throw new AccessError('PROJECT_CHANGED','Операция относится к другому проекту. Повторите её по исходному адресу.',409);
}
/** Internal lookup: callers must authenticate their own human/agent boundary. */
async function getWorkspaceProjectContext(id:string){
 if(typeof id!=='string'||!id||id.length>200||/[\u0000-\u001f\u007f]/.test(id))throw new AccessError('VALIDATION_ERROR','Нужен корректный ID проекта.',422);
 const owner=await getWorkspaceStore(),project=await owner.getWorkspaceProject(id);
 if(!project)throw new AccessError('NOT_FOUND','Проект не найден в каталоге локального оператора.',404);
 return {project,store:await owner.forProject(id)};
}
async function resolveWorkspaceRequest(request:Request,id:string){
 if(userSessionCookie(request)!==undefined){
  const origin=requestOrigin(request),supplied=request.headers.get('origin');
  if(supplied&&supplied!==origin)throw new AccessError('FORBIDDEN','Origin не разрешён для проекта.');
  assertExpectedProject(request,id);
  const actor=await authenticatedParticipant(request,id,AGENT_ID);assertHuman(actor);
  const owner=await getWorkspaceStore(),metadata=(await owner.listProjects(actor)).find(project=>project.id===id);
  if(!metadata)throw new AccessError('FORBIDDEN','Нет действующего членства в этом проекте.');
  // A hosted membership never conveys a path or local-operator authority, even
  // when an operator explicitly granted access to an existing local project.
  const project={...metadata,kind:'hosted' as const,rootPath:null,bindingId:null,rootIdentity:null};
  return {project,store:await owner.forProject(id),actor};
 }
 const operator=await requireWorkspaceOperator(request);assertExpectedProject(request,id);
 const context=await getWorkspaceProjectContext(id);
 return {...context,project:{...context.project,role:'Owner' as const},actor:{...operator,projectIds:[id]} as Actor};
}

/** OS reads and execution remain an explicit trusted local-folder capability. */
async function resolveLocalWorkspaceRequest(request:Request,id:string){
 const operator=await requireWorkspaceOperator(request);assertExpectedProject(request,id);
 const context=await getWorkspaceProjectContext(id);
 if(context.project.kind!=='folder')throw new AccessError('FORBIDDEN','Наблюдение файлов и локальный запуск доступны только в папке-проекте на вашем компьютере.');
 return {...context,actor:{...operator,projectIds:[id]} as Actor};
}
 return {requireWorkspaceOperator,assertExpectedProject,getWorkspaceProjectContext,resolveWorkspaceRequest,resolveLocalWorkspaceRequest};
}

const legacyGetStore=getWorkspaceStore;
const legacy=createWorkspaceAccess();
export const {requireWorkspaceOperator,assertExpectedProject,getWorkspaceProjectContext,resolveWorkspaceRequest,resolveLocalWorkspaceRequest}=legacy;
