import type { Actor, GitHubBinding } from '../../packages/core/src';
import { AGENT_ID,PROJECT_ID } from '../../packages/core/src';
import { z } from 'zod';
import { AccessError,authenticatedParticipant,assertHuman,readCommandBody,defaultAuthService,type AuthService } from '../auth';
import { apiError } from '../http';
import { requestOrigin,requestedProjectId } from '../connection-config';
import { createGitHubClient,normalizeGitHubPush,verifyGitHubSignature,type GitHubRepository,type NormalizedGitHubPush } from './verification';
import { kickGitHubWorker } from './worker';

export type GitHubHttpStore={
  getProject(projectId?:string):Promise<{githubBindings:GitHubBinding[]}>;
  listGitHubDeliveries(actor:Actor,projectId?:string):Promise<unknown[]>;
  createGitHubBinding(data:{executionId:string;repositoryId:number;repositoryFullName:string;ref:string;requestId:string;expectedVersion:number},actor:Actor,projectId?:string):Promise<unknown>;
  executeCommand(data:unknown,actor:Actor,projectId?:string):Promise<unknown>;
  enqueueGitHubDelivery(deliveryId:string,payload:NormalizedGitHubPush,projectId?:string):Promise<{delivery:unknown;duplicate:boolean}>;
  retryGitHubDelivery(id:string,actor:Actor,projectId?:string):Promise<unknown>;
};
export type GitHubHttpDependencies={
  auth?:AuthService;
  getStore?:()=>Promise<GitHubHttpStore>;
  client?:{resolveRepository(fullName:string):Promise<GitHubRepository>};
  authenticateHuman?:(request:Request)=>Actor|Promise<Actor>;
  env?:()=>{secret?:string;token?:string};
  afterResponse?:(task:(signal?:AbortSignal)=>Promise<void>)=>void;
  kick?:(signal?:AbortSignal)=>Promise<void>;
};
const id=z.string().trim().min(1).max(200),version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const command={requestId:z.string().min(8).max(200),expectedVersion:version};
const bindingInput=z.strictObject({...command,executionId:id,repositoryFullName:z.string().min(3).max(201),ref:z.string().regex(/^refs\/heads\/.+/).max(1024)});
const revokeInput=z.strictObject(command),emptyInput=z.strictObject({});
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown):Response{
  if(error instanceof AccessError)return apiError(error);
  const code=(error as {code?:string}).code;
  if(code==='BINDING_REVOKED')return apiError(new AccessError(code,'Подключение GitHub уже отозвано.',409));
  if(code==='GITHUB_UNAVAILABLE')return apiError(new AccessError(code,'GitHub API временно недоступен. Повторите проверку позже.',503));
  if(code==='VERIFICATION_FAILED')return apiError(new AccessError(code,'GitHub не подтвердил репозиторий или коммит.',422));
  if(typeof code==='string'&&/CONFLICT|VALIDATION|FORBIDDEN|NOT_FOUND|TRANSITION|LIMIT/.test(code))return apiError(error);
  // Unknown database/network errors must not print request/credential-bearing exception objects.
  return json({error:{code:'INTERNAL_ERROR',message:'Операция GitHub не подтверждена. Повторите чтение.'}},500);
}
async function readWebhookBytes(request:Request):Promise<Uint8Array>{
  const limit=2*1024*1024;
  if(Number(request.headers.get('content-length')??0)>limit)throw new AccessError('PAYLOAD_TOO_LARGE','Размер webhook превышает 2 MiB.',413);
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new AccessError('PAYLOAD_TOO_LARGE','Размер webhook превышает 2 MiB.',413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}return raw;
}
export function createGitHubHandlers(dependencies:GitHubHttpDependencies={}){
  const {authenticatedParticipant,readCommandBody,requestOrigin}=dependencies.auth??defaultAuthService;
  const getStore=dependencies.getStore??(async()=>(await import('../store')).getGitHubStore());
  const env=dependencies.env??(()=>({secret:process.env.OURO_GITHUB_WEBHOOK_SECRET,token:process.env.OURO_GITHUB_TOKEN}));
  const client=dependencies.client??createGitHubClient({token:env().token});
  const human=async(request:Request,projectId:string)=>{const actor=await(dependencies.authenticateHuman?dependencies.authenticateHuman(request):authenticatedParticipant(request,projectId,AGENT_ID));assertHuman(actor);return actor;};
  const kick=dependencies.kick??kickGitHubWorker;
  const schedule=()=>dependencies.afterResponse?.(async(signal)=>{
    try{await kick(signal);}catch{/* The durable queue/lease recovers on the next tick. Never pass upstream exceptions to Next's logger. */}
  });
  return {
    async list(request:Request){try{
      const projectId=requestedProjectId(request),actor=await human(request,projectId),store=await getStore();
      const [state,deliveries]=await Promise.all([store.getProject(projectId),store.listGitHubDeliveries(actor,projectId)]);
      const webhookBase=`${requestOrigin(request)}/api/github/webhook`;
      return json({bindings:state.githubBindings,deliveries,setup:{webhookSecretConfigured:!!env().secret,apiTokenConfigured:!!env().token,webhookUrl:projectId===PROJECT_ID?webhookBase:`${webhookBase}?projectId=${encodeURIComponent(projectId)}`,verification:'github-api-sha'}});
    }catch(error){return failure(error);}},
    async create(request:Request){try{
      const projectId=requestedProjectId(request),actor=await human(request,projectId),parsed=bindingInput.safeParse(await readCommandBody(request));
      if(!parsed.success)throw new AccessError('VALIDATION_ERROR','Нужны executionId, repositoryFullName, ref, requestId и expectedVersion без посторонних полей.',422);
      const repository=await client.resolveRepository(parsed.data.repositoryFullName);
      const store=await getStore();const result=await store.createGitHubBinding({...parsed.data,repositoryId:repository.id,repositoryFullName:repository.fullName},actor,projectId);
      return json(result,201);
    }catch(error){return failure(error);}},
    async revoke(request:Request,bindingId:string){try{
      const projectId=requestedProjectId(request),actor=await human(request,projectId),parsed=revokeInput.safeParse(await readCommandBody(request));
      if(!parsed.success||!id.safeParse(bindingId).success)throw new AccessError('VALIDATION_ERROR','Нужны bindingId, requestId и expectedVersion.',422);
      return json(await(await getStore()).executeCommand({...parsed.data,type:'revokeGitHubBinding',bindingId},actor,projectId));
    }catch(error){return failure(error);}},
    async retry(request:Request,deliveryId:string){try{
      const projectId=requestedProjectId(request),actor=await human(request,projectId);if(!emptyInput.safeParse(await readCommandBody(request)).success||!id.safeParse(deliveryId).success)throw new AccessError('VALIDATION_ERROR','Повтор принимает только ID доставки и пустое JSON-тело.',422);
      const delivery=await(await getStore()).retryGitHubDelivery(deliveryId,actor,projectId);schedule();return json({delivery});
    }catch(error){return failure(error);}},
    async webhook(request:Request){try{
      const projectId=requestedProjectId(request),secret=env().secret;if(!secret)throw new AccessError('CONFIGURATION_ERROR','GitHub webhook secret не настроен на сервере.',503);
      if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new AccessError('UNSUPPORTED_MEDIA_TYPE','Webhook требует application/json.',415);
      const deliveryId=request.headers.get('x-github-delivery'),event=request.headers.get('x-github-event');
      if(!deliveryId||!/^[A-Za-z0-9_-]{1,200}$/.test(deliveryId)||!event||event.length>100)throw new AccessError('VALIDATION_ERROR','Нужны корректные X-GitHub-Delivery и X-GitHub-Event.',400);
      const raw=await readWebhookBytes(request);
      if(!verifyGitHubSignature(raw,request.headers.get('x-hub-signature-256'),secret))throw new AccessError('UNAUTHENTICATED','Подпись webhook недействительна.',401);
      if(event!=='push')return json({outcome:'ignored',reason:'UNSUPPORTED_EVENT'},202);
      const payload=normalizeGitHubPush(raw),accepted=await(await getStore()).enqueueGitHubDelivery(deliveryId,payload,projectId);
      schedule();return json({outcome:'accepted',...accepted},202);
    }catch(error){return failure(error);}},
  };
}
