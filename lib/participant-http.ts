import { z } from 'zod';
import { PROJECT_ID,AGENT_ID,type Actor } from '../packages/core/src';
import { AccessError,authenticatedParticipant,assertHuman,issueLocalSession,issueParticipantSession,participantCookie,readCommandBody } from './auth';
import { requestOrigin } from './connection-config';
import { apiError } from './http';
import type { ParticipantRegistry } from './participant-registry';

export type ParticipantHttpDependencies={getRegistry?:()=>Promise<ParticipantRegistry>;authenticateHuman?:(request:Request)=>Actor|Promise<Actor>};
const nameInput=z.strictObject({name:z.string().trim().min(1).max(120)}),credentialInput=z.strictObject({credential:z.string().regex(/^ouro_human_[A-Za-z0-9_-]{43}$/)}),empty=z.strictObject({});
const json=(data:unknown,status=200,headers?:HeadersInit)=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...Object.fromEntries(new Headers(headers))}});
const manager=(actor:Actor)=>actor.kind==='human'&&['local-human','human-token'].includes(actor.id);
export function createParticipantHandlers(dependencies:ParticipantHttpDependencies={}){
  const registry=dependencies.getRegistry??(async()=>(await import('./store')).getParticipantRegistry());
  const authenticate=async(request:Request)=>{const actor=await(dependencies.authenticateHuman?dependencies.authenticateHuman(request):authenticatedParticipant(request,PROJECT_ID,AGENT_ID));assertHuman(actor);return actor;};
  const cookie=(request:Request,value:string,age=43200)=>`ouro_participant=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${requestOrigin(request).startsWith('https:')?'; Secure':''}`;
  return {
    async session(request:Request){try{
      requestOrigin(request);
      if(request.headers.has('authorization')||participantCookie(request)!==undefined){
        const actor=await authenticate(request);
        return json({mode:manager(actor)?'local-operator':'participant',role:'human',actor,canManageParticipants:manager(actor)});
      }
      const token=issueLocalSession(request),actor:Actor={id:'local-human',name:'Человек · локальная сессия',kind:'human',projectIds:[PROJECT_ID]};
      return json({mode:'local-demo',role:'human',actor,canManageParticipants:true},200,{'Set-Cookie':`ouro_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`});
    }catch(error){return apiError(error);}},
    async login(request:Request){try{
      requestOrigin(request);const input=credentialInput.safeParse(await readCommandBody(request));
      if(!input.success)throw new AccessError('UNAUTHENTICATED','Ключ участника недействителен или отозван.',401);
      const actor=await(await registry()).authenticateParticipantCredential(input.data.credential);
      if(!actor)throw new AccessError('UNAUTHENTICATED','Ключ участника недействителен или отозван.',401);
      const session=issueParticipantSession(actor,PROJECT_ID);
      return json({mode:'participant',role:'human',actor,canManageParticipants:false},200,{'Set-Cookie':cookie(request,session)});
    }catch(error){return apiError(error);}},
    async logout(request:Request){try{
      requestOrigin(request);if(!empty.safeParse(await readCommandBody(request)).success)throw new AccessError('VALIDATION_ERROR','Выход принимает пустое JSON-тело.',422);
      const headers=new Headers({'Cache-Control':'no-store'});headers.append('Set-Cookie',cookie(request,'',0));headers.append('Set-Cookie','ouro_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      return Response.json({ok:true},{headers});
    }catch(error){return apiError(error);}},
    async list(request:Request){try{
      requestOrigin(request);const actor=await authenticate(request);
      return json({participants:await(await registry()).listParticipants(actor),actor,canManageParticipants:manager(actor)});
    }catch(error){return apiError(error);}},
    async create(request:Request){try{
      requestOrigin(request);const actor=await authenticate(request),input=nameInput.safeParse(await readCommandBody(request));
      if(!input.success)throw new AccessError('VALIDATION_ERROR','Укажите имя участника (1–120 символов), без посторонних полей.',422);
      return json(await(await registry()).createParticipant(input.data.name,actor),201);
    }catch(error){return apiError(error);}},
    async revoke(request:Request,id:string){try{
      requestOrigin(request);const actor=await authenticate(request);
      if(typeof id!=='string'||!id||id.length>200||!empty.safeParse(await readCommandBody(request)).success)throw new AccessError('VALIDATION_ERROR','Нужен ID участника и пустое JSON-тело.',422);
      return json({participant:await(await registry()).revokeParticipant(id,actor)});
    }catch(error){return apiError(error);}},
  };
}
