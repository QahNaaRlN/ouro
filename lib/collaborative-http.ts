import type { Actor } from '../packages/core/src';
import { AGENT_ID,PROJECT_ID } from '../packages/core/src';
import { AccessError,authenticatedParticipant,assertHuman,readCommandBody,defaultAuthService,type AuthService } from './auth';
import { apiError } from './http';
import { requestedProjectId } from './connection-config';
import type { createStore } from './store';

type DraftStore=Pick<Awaited<ReturnType<typeof createStore>>,'createCollaborativeDraft'|'listCollaborativeDrafts'|'getCollaborativeDraft'|'updateCollaborativeDraft'|'publishCollaborativeDraft'>;
/** Создаёт HTTP-операции совместных черновиков с проверкой человеческой идентичности и выбранного проекта. */
export function createCollaborativeHandlers(deps:{getStore?:()=>Promise<DraftStore>;authenticateHuman?:(request:Request)=>Actor|Promise<Actor>;auth?:AuthService}={}){
  const {authenticatedParticipant,readCommandBody}=deps.auth??defaultAuthService;
  const getStore=deps.getStore??(async()=>(await import('./store')).getCollaborativeDraftStore());
  const human=async(request:Request,projectId:string)=>{const actor=await(deps.authenticateHuman?.(request)??authenticatedParticipant(request,projectId,AGENT_ID));assertHuman(actor);return actor;};
  const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  const failure=(error:unknown)=>{
    const code=(error as {code?:string}).code;
    if(code==='DRAFT_PUBLISHED'||code==='DRAFT_CONFLICT')return apiError(new AccessError(code,(error as Error).message,409));
    return apiError(error);
  };
  return {
    async list(request:Request){try{const projectId=requestedProjectId(request),actor=await human(request,projectId),specId=new URL(request.url).searchParams.get('specId')??undefined;return json({drafts:await(await getStore()).listCollaborativeDrafts(actor,specId,projectId)});}catch(error){return failure(error);}},
    async create(request:Request){try{const projectId=requestedProjectId(request),actor=await human(request,projectId);return json({draft:await(await getStore()).createCollaborativeDraft(await readCommandBody(request),actor,projectId)},201);}catch(error){return failure(error);}},
    async read(request:Request,draftId:string){try{const projectId=requestedProjectId(request);return json({draft:await(await getStore()).getCollaborativeDraft(draftId,await human(request,projectId),projectId)});}catch(error){return failure(error);}},
    async update(request:Request,draftId:string){try{
      const projectId=requestedProjectId(request),actor=await human(request,projectId),body=await readCommandBody(request);
      if(!body||typeof body!=='object'||Array.isArray(body)||'draftId'in body)throw new AccessError('VALIDATION_ERROR','ID черновика берётся из адреса, тело содержит updateId/clientId/updateBase64.',422);
      return json(await(await getStore()).updateCollaborativeDraft({...body,draftId},actor,projectId));
    }catch(error){return failure(error);}},
    async publish(request:Request,draftId:string){try{
      const projectId=requestedProjectId(request),actor=await human(request,projectId),body=await readCommandBody(request);
      if(!body||typeof body!=='object'||Array.isArray(body)||'draftId'in body)throw new AccessError('VALIDATION_ERROR','ID черновика берётся из адреса.',422);
      return json(await(await getStore()).publishCollaborativeDraft({...body,draftId},actor,projectId));
    }catch(error){return failure(error);}},
  };
}
