import type { Actor, GitHubBinding } from '../../packages/core/src';
import { AGENT_ID,PROJECT_ID } from '../../packages/core/src';
import { z } from 'zod';
import { AccessError,authenticatedParticipant,assertHuman,readCommandBody } from '../auth';
import { apiError } from '../http';
import { requestOrigin } from '../connection-config';
import { createGitHubClient,normalizeGitHubPush,verifyGitHubSignature,type GitHubRepository,type NormalizedGitHubPush } from './verification';
import { kickGitHubWorker } from './worker';

export type GitHubHttpStore={
  getProject():Promise<{githubBindings:GitHubBinding[]}>;
  listGitHubDeliveries(actor:Actor):Promise<unknown[]>;
  createGitHubBinding(data:{executionId:string;repositoryId:number;repositoryFullName:string;ref:string;requestId:string;expectedVersion:number},actor:Actor):Promise<unknown>;
  executeCommand(data:unknown,actor:Actor):Promise<unknown>;
  enqueueGitHubDelivery(deliveryId:string,payload:NormalizedGitHubPush):Promise<{delivery:unknown;duplicate:boolean}>;
  retryGitHubDelivery(id:string,actor:Actor):Promise<unknown>;
};
export type GitHubHttpDependencies={
  getStore?:()=>Promise<GitHubHttpStore>;
  client?:{resolveRepository(fullName:string):Promise<GitHubRepository>};
  authenticateHuman?:(request:Request)=>Actor|Promise<Actor>;
  env?:()=>{secret?:string;token?:string};
  afterResponse?:(task:()=>Promise<void>)=>void;
  kick?:()=>Promise<void>;
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
  const getStore=dependencies.getStore??(async()=>(await import('../store')).getGitHubStore());
  const env=dependencies.env??(()=>({secret:process.env.OURO_GITHUB_WEBHOOK_SECRET,token:process.env.OURO_GITHUB_TOKEN}));
  const client=dependencies.client??createGitHubClient({token:env().token});
  const human=async(request:Request)=>{const actor=await(dependencies.authenticateHuman?dependencies.authenticateHuman(request):authenticatedParticipant(request,PROJECT_ID,AGENT_ID));assertHuman(actor);return actor;};
  const kick=dependencies.kick??kickGitHubWorker;
  const schedule=()=>dependencies.afterResponse?.(async()=>{
    try{await kick();}catch{/* The durable queue/lease recovers on the next tick. Never pass upstream exceptions to Next's logger. */}
  });
  return {
    async list(request:Request){try{
      const actor=await human(request),store=await getStore();
      const [state,deliveries]=await Promise.all([store.getProject(),store.listGitHubDeliveries(actor)]);
      return json({bindings:state.githubBindings,deliveries,setup:{webhookSecretConfigured:!!env().secret,apiTokenConfigured:!!env().token,webhookUrl:`${requestOrigin(request)}/api/github/webhook`,verification:'github-api-sha'}});
    }catch(error){return failure(error);}},
    async create(request:Request){try{
      const actor=await human(request),parsed=bindingInput.safeParse(await readCommandBody(request));
      if(!parsed.success)throw new AccessError('VALIDATION_ERROR','Нужны executionId, repositoryFullName, ref, requestId и expectedVersion без посторонних полей.',422);
      const repository=await client.resolveRepository(parsed.data.repositoryFullName);
      const store=await getStore();const result=await store.createGitHubBinding({...parsed.data,repositoryId:repository.id,repositoryFullName:repository.fullName},actor);
      return json(result,201);
    }catch(error){return failure(error);}},
    async revoke(request:Request,bindingId:string){try{
      const actor=await human(request),parsed=revokeInput.safeParse(await readCommandBody(request));
      if(!parsed.success||!id.safeParse(bindingId).success)throw new AccessError('VALIDATION_ERROR','Нужны bindingId, requestId и expectedVersion.',422);
      return json(await(await getStore()).executeCommand({...parsed.data,type:'revokeGitHubBinding',bindingId},actor));
    }catch(error){return failure(error);}},
    async retry(request:Request,deliveryId:string){try{
      const actor=await human(request);if(!emptyInput.safeParse(await readCommandBody(request)).success||!id.safeParse(deliveryId).success)throw new AccessError('VALIDATION_ERROR','Повтор принимает только ID доставки и пустое JSON-тело.',422);
      const delivery=await(await getStore()).retryGitHubDelivery(deliveryId,actor);schedule();return json({delivery});
    }catch(error){return failure(error);}},
    async webhook(request:Request){try{
      const secret=env().secret;if(!secret)throw new AccessError('CONFIGURATION_ERROR','GitHub webhook secret не настроен на сервере.',503);
      if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new AccessError('UNSUPPORTED_MEDIA_TYPE','Webhook требует application/json.',415);
      const deliveryId=request.headers.get('x-github-delivery'),event=request.headers.get('x-github-event');
      if(!deliveryId||!/^[A-Za-z0-9_-]{1,200}$/.test(deliveryId)||!event||event.length>100)throw new AccessError('VALIDATION_ERROR','Нужны корректные X-GitHub-Delivery и X-GitHub-Event.',400);
      const raw=await readWebhookBytes(request);
      if(!verifyGitHubSignature(raw,request.headers.get('x-hub-signature-256'),secret))throw new AccessError('UNAUTHENTICATED','Подпись webhook недействительна.',401);
      if(event!=='push')return json({outcome:'ignored',reason:'UNSUPPORTED_EVENT'},202);
      const payload=normalizeGitHubPush(raw),accepted=await(await getStore()).enqueueGitHubDelivery(deliveryId,payload);
      schedule();return json({outcome:'accepted',...accepted},202);
    }catch(error){return failure(error);}},
  };
}
