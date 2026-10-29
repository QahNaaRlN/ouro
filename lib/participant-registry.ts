import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { PROJECT_ID,type Actor } from '../packages/core/src';
import { isWellFormedUnicode } from '../packages/core/src/unicode';

export type ParticipantConnection={query:<T=Record<string,unknown>>(sql:string,values?:unknown[])=>Promise<{rows:T[]}>;exec(sql:string):Promise<unknown>};
export type ParticipantDatabase=ParticipantConnection&{transaction<T>(fn:(tx:ParticipantConnection)=>Promise<T>):Promise<T>};
export type ParticipantRegistration={id:string;projectId:string;name:string;createdAt:string;createdBy:string;revokedAt:string|null;revokedBy:string|null};
export type ParticipantRegistryOptions={projectId?:string;db:ParticipantDatabase;serialize:<T>(fn:()=>Promise<T>)=>Promise<T>;lockProject:(tx:ParticipantConnection)=>Promise<unknown>;assertHuman?:(tx:ParticipantConnection,actor:Actor)=>Promise<void>};
export class ParticipantError extends Error{constructor(public code:string,message:string){super(message);this.name='ParticipantError';}}
const fail=(code:string,message:string):never=>{throw new ParticipantError(code,message);};
function scopedHuman(actor:Actor,projectId=PROJECT_ID){if(!actor||actor.kind!=='human'||typeof actor.id!=='string'||!actor.id||!Array.isArray(actor.projectIds)||!actor.projectIds.includes(projectId))fail('FORBIDDEN','Нужна человеческая идентичность текущего проекта.');}
/** Legacy trusted human identities remain valid; a registered participant cannot outlive revocation. */
export async function assertRegisteredHumanActive(tx:ParticipantConnection,actor:Actor,projectId=PROJECT_ID):Promise<void>{
  scopedHuman(actor,projectId);
  const principal=await tx.query<{kind:string}>('SELECT kind FROM ouro_principals WHERE id=$1',[actor.id]);
  if(principal.rows[0]&&principal.rows[0].kind!=='human')fail('FORBIDDEN','Нельзя изменить тип зарегистрированного участника.');
  const found=await tx.query<{project_id:string;revoked_at:Date|string|null}>(`SELECT r.project_id,v.revoked_at FROM ouro_participant_registrations r LEFT JOIN ouro_participant_revocations v ON v.participant_id=r.id WHERE r.id=$1`,[actor.id]);
  if(found.rows[0]&&(found.rows[0].project_id!==projectId||found.rows[0].revoked_at))fail('FORBIDDEN','Доступ участника недействителен или отозван.');
}
function operator(actor:Actor,projectId=PROJECT_ID){scopedHuman(actor,projectId);if(!['local-human','human-token'].includes(actor.id))fail('FORBIDDEN','Регистрацией и отзывом участников управляет доверенный оператор.');}
type ParticipantRow={id:string;project_id:string;name:string;created_at:Date|string;created_by:string;revoked_at:Date|string|null;revoked_by:string|null};
const selection=`SELECT r.id,r.project_id,r.name,r.created_at,r.created_by,v.revoked_at,v.revoked_by FROM ouro_participant_registrations r LEFT JOIN ouro_participant_revocations v ON v.participant_id=r.id`;
const date=(v:Date|string)=>new Date(v).toISOString();
const metadata=(row:ParticipantRow):ParticipantRegistration=>({id:row.id,projectId:row.project_id,name:row.name,createdAt:date(row.created_at),createdBy:row.created_by,revokedAt:row.revoked_at?date(row.revoked_at):null,revokedBy:row.revoked_by});
const digest=(credential:string)=>createHash('sha256').update(credential).digest('hex');
const identity=(row:{id:string;name:string;project_id:string}):Actor=>({id:row.id,name:row.name,kind:'human',projectIds:[row.project_id]});
export function createParticipantRegistry(options:ParticipantRegistryOptions){
  const {db,serialize,lockProject,projectId=PROJECT_ID}=options;
  const human=async(tx:ParticipantConnection,actor:Actor)=>{
    await assertRegisteredHumanActive(tx,actor,projectId);
    if(options.assertHuman)await options.assertHuman(tx,actor);
    else{
      await tx.query('INSERT INTO ouro_principals (id,kind) VALUES ($1,$2) ON CONFLICT DO NOTHING',[actor.id,'human']);
      await assertRegisteredHumanActive(tx,actor,projectId);
    }
  };
  return {
    createParticipant:(name:string,actor:Actor):Promise<{participant:ParticipantRegistration;credential:string}>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx);operator(actor,projectId);await human(tx,actor);
      if(typeof name!=='string'||!name.trim()||name.trim().length>120||/[\x00-\x1f\x7f]/.test(name)||!isWellFormedUnicode(name))fail('VALIDATION_ERROR','Имя участника должно содержать1–120 корректных символов без управляющих знаков.');
      const id=randomUUID(),credential=`ouro_human_${randomBytes(32).toString('base64url')}`;
      await tx.query('INSERT INTO ouro_principals (id,kind) VALUES ($1,$2)',[id,'human']);
      await tx.query('INSERT INTO ouro_participant_registrations (id,project_id,name,created_by) VALUES ($1,$2,$3,$4)',[id,projectId,name.trim(),actor.id]);
      await tx.query('INSERT INTO ouro_participant_credentials (participant_id,credential_hash) VALUES ($1,$2)',[id,digest(credential)]);
      const result=await tx.query<ParticipantRow>(`${selection} WHERE r.id=$1`,[id]);
      return {participant:metadata(result.rows[0]),credential};
    })),
    listParticipants:(actor:Actor):Promise<ParticipantRegistration[]>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx);await human(tx,actor);
      const result=await tx.query<ParticipantRow>(`${selection} WHERE r.project_id=$1 ORDER BY r.created_at,r.id`,[projectId]);return result.rows.map(metadata);
    })),
    revokeParticipant:(id:string,actor:Actor):Promise<ParticipantRegistration>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx);operator(actor,projectId);await human(tx,actor);
      if(typeof id!=='string'||!id.trim()||id.length>200)fail('VALIDATION_ERROR','Нужен ID участника.');
      const result=await tx.query<ParticipantRow>(`${selection} WHERE r.id=$1 AND r.project_id=$2`,[id,projectId]);
      if(!result.rows[0])fail('NOT_FOUND','Участник не найден.');
      await tx.query('INSERT INTO ouro_participant_revocations (participant_id,revoked_by) VALUES ($1,$2) ON CONFLICT DO NOTHING',[id,actor.id]);
      const revoked=await tx.query<ParticipantRow>(`${selection} WHERE r.id=$1`,[id]);return metadata(revoked.rows[0]);
    })),
    authenticateParticipantCredential:(credential:string):Promise<Actor|null>=>serialize(async()=>{
      if(typeof credential!=='string'||!/^ouro_human_[A-Za-z0-9_-]{43}$/.test(credential))return null;
      return db.transaction(async tx=>{
        await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR SHARE',[projectId]);
        const result=await tx.query<{id:string;name:string;project_id:string}>(`SELECT r.id,r.name,r.project_id FROM ouro_participant_credentials c JOIN ouro_participant_registrations r ON r.id=c.participant_id LEFT JOIN ouro_participant_revocations v ON v.participant_id=r.id WHERE c.credential_hash=$1 AND r.project_id=$2 AND v.participant_id IS NULL`,[digest(credential),projectId]);
        return result.rows[0]?identity(result.rows[0]):null;
      });
    }),
    resolveParticipantIdentity:(id:string):Promise<Actor|null>=>serialize(async()=>{
      if(typeof id!=='string'||!id||id.length>200)return null;
      return db.transaction(async tx=>{
        await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR SHARE',[projectId]);
        const result=await tx.query<{id:string;name:string;project_id:string}>(`SELECT r.id,r.name,r.project_id FROM ouro_participant_registrations r LEFT JOIN ouro_participant_revocations v ON v.participant_id=r.id WHERE r.id=$1 AND r.project_id=$2 AND v.participant_id IS NULL`,[id,projectId]);
        return result.rows[0]?identity(result.rows[0]):null;
      });
    }),
  };
}
export type ParticipantRegistry=ReturnType<typeof createParticipantRegistry>;
