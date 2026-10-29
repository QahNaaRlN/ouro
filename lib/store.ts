import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { applyCommand, createSeedEvents, replay, AGENT_ID, GITHUB_SERVICE_ID, PROJECT_ID,DomainError } from '../packages/core/src';
import type { Actor, Command, DomainEvent, GitHubVerifiedCommit, ProjectState } from '../packages/core/src';
import type { NormalizedGitHubPush } from './github/verification';
import { createParticipantRegistry,assertRegisteredHumanActive } from './participant-registry';
import { createCollaborativeDraftService } from './collaborative-drafts';
import { isWellFormedUnicode } from '../packages/core/src/unicode';
import {parseMeridianScope} from '../packages/meridian/src/context';
import {resolveWorkspaceFolder,assertWorkspaceFolder} from './workspace-files';

export class StoreError extends Error {
  constructor(public code: string, message: string, public details?: Record<string, unknown>) {
    super(message); this.name = 'StoreError';
  }
}

type Row = Record<string, unknown>;
type Query = <T = Row>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
type Connection = { query: Query; exec(sql: string): Promise<unknown> };
type Database = Connection & { transaction<T>(fn: (connection: Connection) => Promise<T>): Promise<T>; close(): Promise<void> };
export type CommandResult = { state: ProjectState; events: DomainEvent[]; cursor: number; replayed: boolean };
export type StoreOptions = { dataDir?: string; databaseUrl?: string; seedEvents?: DomainEvent[]; projectId?:string };
export type WorkspaceBinding={id:string;canonicalPath:string;identity:{dev:string;ino:string}};
export type WorkspaceProject={id:string;name:string;rootPath:string|null;kind:'folder'|'demo';createdAt:string;createdBy:string;bindingId:string|null;rootIdentity:{dev:string;ino:string}|null};
type WorkspaceProjectRow={id:string;name:string;root_path:string|null;kind:'folder'|'demo';created_at:Date|string;created_by:string;binding_id:string|null;root_dev:string|null;root_ino:string|null};
type StoreOwner={db:Database;storage:'postgres'|'embedded-postgres';serialize:<T>(fn:()=>Promise<T>)=>Promise<T>;close:()=>Promise<void>};
export type AgentRegistration = { id:string; projectId:string; name:string; createdAt:string; createdBy:string; lastSeenAt:string|null; revokedAt:string|null };
export type PublicGitHubDelivery = {id:string;deliveryId:string;repositoryId:number;repositoryFullName:string;ref:string;status:'pending'|'processing'|'retryable'|'processed'|'needs_review';attempts:number;reason:string|null;lastError:string|null;receivedAt:string;updatedAt:string;nextAttemptAt:string;commitCount:number};
export type ClaimedGitHubDelivery = {id:string;deliveryId:string;payload:NormalizedGitHubPush;bindingIds:string[];leaseToken:string;attempts:number};
type GitHubJobRow={id:string;delivery_id:string;payload:NormalizedGitHubPush;binding_ids:string[];received_at:Date|string;status:PublicGitHubDelivery['status'];attempts:number;reason:string|null;last_error:string|null;updated_at:Date|string;next_attempt_at:Date|string;lease_token:string|null;lease_until:Date|string|null};
const githubJobSelection=`SELECT d.id,d.delivery_id,d.payload,d.binding_ids,d.received_at,j.status,j.attempts,j.reason,j.last_error,j.updated_at,j.next_attempt_at,j.lease_token,j.lease_until FROM ouro_github_deliveries d JOIN ouro_github_jobs j ON j.delivery_id=d.id`;
const publicGitHubJob=(row:GitHubJobRow):PublicGitHubDelivery=>({id:row.id,deliveryId:row.delivery_id,repositoryId:row.payload.repositoryId,repositoryFullName:row.payload.repositoryFullName,ref:row.payload.ref,status:row.status,attempts:row.attempts,reason:row.reason,lastError:row.last_error,receivedAt:new Date(row.received_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),nextAttemptAt:new Date(row.next_attempt_at).toISOString(),commitCount:row.payload.commitShas.length});

/** Stable JSON encoding: object order cannot evade an idempotency key. */
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON((value as Row)[key])}`).join(',')}}`;
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new StoreError('VALIDATION_ERROR', 'Команда должна содержать только JSON-значения.');
  }
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash('sha256').update(canonicalJSON(value)).digest('hex');
const tokenHash = (token:string) => createHash('sha256').update(token).digest('hex');
type AgentRow = { id:string; project_id:string; name:string; created_at:Date|string; created_by:string; last_seen_at:Date|string|null; revoked_at:Date|string|null };
const dateString=(value:Date|string)=>new Date(value).toISOString();
const publicAgent=(row:AgentRow):AgentRegistration=>({id:row.id,projectId:row.project_id,name:row.name,createdAt:dateString(row.created_at),createdBy:row.created_by,lastSeenAt:row.last_seen_at ? dateString(row.last_seen_at) : null,revokedAt:row.revoked_at ? dateString(row.revoked_at) : null});
const agentSelection=`SELECT r.id,r.project_id,r.name,r.created_at,r.created_by,p.last_seen_at,v.revoked_at
  FROM ouro_agent_registrations r
  LEFT JOIN ouro_agent_presence p ON p.agent_id=r.id
  LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id`;

async function openDatabase(options: StoreOptions): Promise<Database> {
  if (options.databaseUrl) {
    const pool = new Pool({ connectionString: options.databaseUrl, max: 5 });
    const query: Query = async (sql, values) => ({ rows: (await pool.query(sql, values)).rows });
    return {
      query, exec: async sql => pool.query(sql),
      transaction: async fn => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn({ query: async (sql, values) => ({ rows: (await client.query(sql, values)).rows }), exec: sql => client.query(sql) });
          await client.query('COMMIT');
          return result;
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      },
      close: () => pool.end(),
    };
  }
  const dataDir = options.dataDir ?? path.join(process.cwd(), '.ouro', 'postgres');
  if (dataDir !== 'memory://') await mkdir(dataDir, { recursive: true });
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  return {
    query: (sql, values) => pg.query(sql, values),
    exec: sql => pg.exec(sql),
    transaction: fn => pg.transaction(tx => fn({ query: (sql, values) => tx.query(sql, values), exec: sql => tx.exec(sql) })),
    close: () => pg.close(),
  };
}

function assertActor(actor: Actor,projectId=PROJECT_ID) {
  if (!actor || !['human', 'agent', 'service'].includes(actor.kind) || typeof actor.id !== 'string' || !actor.id || !Array.isArray(actor.projectIds) || !actor.projectIds.includes(projectId)) {
    throw new StoreError('FORBIDDEN', 'Участник не имеет доступа к этому проекту.');
  }
}

async function registerActor(tx: Connection, actor: Actor) {
  await tx.query('INSERT INTO ouro_principals (id, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING', [actor.id, actor.kind]);
  const found = await tx.query<{ kind: string }>('SELECT kind FROM ouro_principals WHERE id=$1', [actor.id]);
  if (found.rows[0]?.kind !== actor.kind) throw new StoreError('FORBIDDEN', 'Нельзя изменить тип зарегистрированного участника.');
}

async function assertHumanActor(tx:Connection,actor:Actor,projectId=PROJECT_ID) {
  assertActor(actor,projectId);
  if(actor.kind!=='human')throw new StoreError('FORBIDDEN','Регистрацией и доступом агентов управляет человек.');
  await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[projectId]);
  await assertRegisteredHumanActive(tx,actor,projectId);
  await registerActor(tx,actor);
}

async function assertRegisteredAgentActive(tx:Connection,actor:Actor) {
  if(actor.kind!=='agent')return;
  const revoked=await tx.query('SELECT agent_id FROM ouro_agent_revocations WHERE agent_id=$1',[actor.id]);
  if(revoked.rows.length)throw new StoreError('FORBIDDEN','Доступ агента отозван человеком.');
}

async function assertAssignmentActive(tx:Connection,command:Command,projectId=PROJECT_ID) {
  if(command.type!=='startExecution'&&command.type!=='authorizeRemediation'&&command.type!=='startProjectWork')return;
  if(typeof command.agentId!=='string'||!command.agentId)throw new StoreError('VALIDATION_ERROR','Нужен agentId исполнителя.');
  // The seed simulator remains an explicit separate choice. All external
  // assignments require a live registration in the current project.
  if(projectId===PROJECT_ID&&command.agentId===AGENT_ID&&command.type!=='startProjectWork')return;
  const found=await tx.query<{id:string}>(`SELECT r.id FROM ouro_agent_registrations r
    LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id
    WHERE r.id=$1 AND r.project_id=$2 AND v.agent_id IS NULL`,[command.agentId,projectId]);
  if(!found.rows.length)throw new StoreError('FORBIDDEN','Назначение требует действующего зарегистрированного агента этого проекта.');
}

async function readEvents(tx: Connection, after = 0,projectId=PROJECT_ID): Promise<DomainEvent[]> {
  const result = await tx.query<{ event: DomainEvent }>('SELECT event FROM ouro_domain_events WHERE project_id=$1 AND version>$2 ORDER BY version', [projectId, after]);
  return result.rows.map(row => row.event);
}

async function append(tx: Connection, events: DomainEvent[], state: ProjectState) {
  for (const event of events) {
    await registerActor(tx, event.actor);
    await tx.query(`INSERT INTO ouro_domain_events
      (id,project_id,version,event_type,schema_version,actor_id,occurred_at,event)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [event.id, event.projectId, event.version, event.type, event.schemaVersion, event.actor.id, event.occurredAt, JSON.stringify(event)]);
    await tx.query('INSERT INTO ouro_outbox (event_id,project_id,cursor) VALUES ($1,$2,$3)', [event.id, event.projectId, event.version]);
  }
  for (const spec of state.specs) {
    await tx.query('INSERT INTO ouro_specs (id,project_id,human_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [spec.id, state.projectId, spec.humanId]);
  }
  for (const revision of state.revisions) {
    await tx.query(`INSERT INTO ouro_spec_revisions (id,spec_id,revision,content,content_hash)
      VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT DO NOTHING`, [revision.id, revision.specId, revision.revision, JSON.stringify(revision), hash(revision)]);
    const persisted = await tx.query<{ content_hash: string }>('SELECT content_hash FROM ouro_spec_revisions WHERE id=$1', [revision.id]);
    if (persisted.rows[0]?.content_hash !== hash(revision)) throw new StoreError('IMMUTABLE_REVISION_CONFLICT', 'Содержание сохранённой ревизии изменилось.');
  }
  await tx.query('UPDATE ouro_projects SET version=$2 WHERE id=$1', [state.projectId, state.version]);
}

function projectIdValue(value:unknown):string{
  if(typeof value!=='string'||!value||value.length>200||!isWellFormedUnicode(value)||/[\x00-\x1f\x7f]/.test(value))throw new StoreError('VALIDATION_ERROR','Нужен корректный projectId.');
  return value;
}
function workspaceProject(row:WorkspaceProjectRow):WorkspaceProject{
  return {id:row.id,name:row.name,rootPath:row.root_path,kind:row.kind,createdAt:dateString(row.created_at),createdBy:row.created_by,bindingId:row.binding_id,rootIdentity:row.root_dev!==null&&row.root_ino!==null?{dev:row.root_dev,ino:row.root_ino}:null};
}
async function readWorkspaceProject(tx:Connection,projectId:string):Promise<WorkspaceProject|null>{
  const found=await tx.query<WorkspaceProjectRow>('SELECT * FROM ouro_workspace_projects WHERE id=$1',[projectId]);
  return found.rows[0]?workspaceProject(found.rows[0]):null;
}
function workspaceBinding(project:WorkspaceProject|null):WorkspaceBinding|null{
  return project?.kind==='folder'&&project.rootPath&&project.bindingId&&project.rootIdentity?{id:project.bindingId,canonicalPath:project.rootPath,identity:project.rootIdentity}:null;
}
async function assertCatalogOperator(tx:Connection,actor:Actor):Promise<void>{
  if(!actor||actor.kind!=='human'||!['local-human','human-token'].includes(actor.id))throw new StoreError('FORBIDDEN','Каталогом папок управляет доверенный локальный оператор.');
  await assertHumanActor(tx,actor,PROJECT_ID);
}

export async function createStore(options:StoreOptions={}):Promise<Store>{
  const selectedProjectId=projectIdValue(options.projectId??PROJECT_ID),db=await openDatabase(options);
  try{
    const migrations=await Promise.all(['001_initial.sql','002_agents.sql','003_github.sql','004_participants.sql','005_drafts.sql','006_workspace_projects.sql'].map(file=>readFile(path.join(process.cwd(),'db','migrations',file),'utf8')));
    await db.transaction(async tx=>{
      if(options.databaseUrl)await tx.query('SELECT pg_advisory_xact_lock(187652019)');
      for(const migration of migrations)await tx.exec(migration);
      await tx.query('INSERT INTO ouro_projects(id,version) VALUES($1,0) ON CONFLICT DO NOTHING',[PROJECT_ID]);
      const legacy=await tx.query<{version:string|number}>('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[PROJECT_ID]);
      if(Number(legacy.rows[0]?.version)===0){
        const events=selectedProjectId===PROJECT_ID?(options.seedEvents??createSeedEvents()):createSeedEvents();
        if(events.length)await append(tx,events,replay(events,PROJECT_ID));
      }
      await tx.query(`INSERT INTO ouro_workspace_projects(id,name,kind,created_by) VALUES($1,$2,'demo','ouro-bootstrap') ON CONFLICT(id) DO NOTHING`,[PROJECT_ID,'Учебный проект Ouro']);
      if(selectedProjectId!==PROJECT_ID){
        await tx.query('INSERT INTO ouro_projects(id,version) VALUES($1,0) ON CONFLICT DO NOTHING',[selectedProjectId]);
        const selected=await tx.query<{version:string|number}>('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[selectedProjectId]);
        if(Number(selected.rows[0]?.version)===0&&options.seedEvents?.length)await append(tx,options.seedEvents,replay(options.seedEvents,selectedProjectId));
      }
    });
    let tail:Promise<unknown>=Promise.resolve(),closing=false,closePromise:Promise<void>|undefined;
    const serialize=<T>(fn:()=>Promise<T>):Promise<T>=>{
      if(closing)return Promise.reject(new StoreError('STORE_CLOSED','Хранилище закрыто.'));
      const run=tail.then(fn,fn);tail=run.catch(()=>undefined);return run;
    };
    const owner:StoreOwner={db,storage:options.databaseUrl?'postgres':'embedded-postgres',serialize,close:()=>{
      if(!closePromise){closing=true;closePromise=tail.then(()=>db.close());tail=closePromise.catch(()=>undefined);}
      return closePromise;
    }};
    const cache=new Map<string,Store>();
    const forProject=async(value:string):Promise<Store>=>{
      const projectId=projectIdValue(value),cached=cache.get(projectId);if(cached)return cached;
      return serialize(async()=>{
        const current=cache.get(projectId);if(current)return current;
        const found=await db.query<{id:string}>('SELECT id FROM ouro_projects WHERE id=$1',[projectId]);
        if(!found.rows.length)throw new StoreError('NOT_FOUND','Проект не найден.');
        const scoped=Object.assign(createProjectStore(projectId,owner),{forProject});cache.set(projectId,scoped);return scoped;
      });
    };
    return await forProject(selectedProjectId);
  }catch(error){await db.close();throw error;}
}

function createProjectStore(projectId:string,owner:StoreOwner){
  const {db,serialize}=owner;
  const scopedActor=(actor:Actor)=>assertActor(actor,projectId);
  const scopedHuman=(tx:Connection,actor:Actor)=>assertHumanActor(tx,actor,projectId);
  const projectEvents=(tx:Connection,after=0)=>readEvents(tx,after,projectId);
  async function commitCommandInTransaction(tx:Connection,body:unknown,actor:Actor,internal=false):Promise<CommandResult>{
    scopedActor(actor);
    if(!body||typeof body!=='object'||Array.isArray(body))throw new StoreError('VALIDATION_ERROR','Ожидается JSON-команда.');
    const command=body as Command;
    if(!internal&&['createGitHubBinding','recordGitHubCommit','importMeridianScope','initializeProject'].includes(command.type))throw new StoreError('FORBIDDEN','Команда доступна только соответствующему серверному адаптеру.');
    if(typeof command.requestId!=='string'||command.requestId.length<8||command.requestId.length>200||!isWellFormedUnicode(command.requestId)||command.requestId.includes('\u0000')||!Number.isSafeInteger(command.expectedVersion)||command.expectedVersion<0)throw new StoreError('VALIDATION_ERROR','Нужны допустимый requestId и неотрицательная expectedVersion.');
    const payloadHash=hash(body);
      await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[projectId]);
      await registerActor(tx,actor);await assertRegisteredAgentActive(tx,actor);
      if(actor.kind==='human')await assertRegisteredHumanActive(tx,actor,projectId);
      const duplicate=await tx.query<{payload_hash:string;response:Omit<CommandResult,'replayed'>}>('SELECT payload_hash,response FROM ouro_command_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[projectId,actor.id,command.requestId]);
      if(duplicate.rows[0]){
        if(duplicate.rows[0].payload_hash!==payloadHash)throw new StoreError('IDEMPOTENCY_CONFLICT','Этот requestId уже использован с другим содержимым.');
        return {...duplicate.rows[0].response,replayed:true};
      }
      if(['startProjectWork','startExecution','authorizeRemediation'].includes(command.type)){
        const binding=workspaceBinding(await readWorkspaceProject(tx,projectId));
        if(command.type==='startProjectWork'&&!binding)throw new StoreError('INVALID_TRANSITION','Начать работу можно только в зарегистрированной папке-проекте.');
        if(binding)await assertWorkspaceFolder(binding);
      }
      await assertAssignmentActive(tx,command,projectId);
      const state=replay(await projectEvents(tx),projectId);
      let revokedAgent:{id:string;revokedAt:string;revokedBy:string}|undefined;
      if(command.type==='forceCancelRevokedExecution'){
        await scopedHuman(tx,actor);
        const execution=state.executions.find(e=>e.id===command.executionId);
        if(!execution)throw new StoreError('NOT_FOUND','Исполнение не найдено.');
        const proof=await tx.query<{id:string;revoked_at:Date|string;revoked_by:string}>(`SELECT r.id,v.revoked_at,v.revoked_by FROM ouro_agent_registrations r JOIN ouro_agent_revocations v ON v.agent_id=r.id WHERE r.id=$1 AND r.project_id=$2`,[execution.agentId,projectId]);
        if(!proof.rows[0])throw new StoreError('AGENT_NOT_REVOKED','Назначенный агент должен иметь подтверждённый отзыв в реестре проекта.');
        revokedAgent={id:proof.rows[0].id,revokedAt:dateString(proof.rows[0].revoked_at),revokedBy:proof.rows[0].revoked_by};
      }
      let meridianImport:{rawDocument:string;documentSha256:string}|undefined;
      if(command.type==='importMeridianScope'){
        parseMeridianScope(command.rawDocument);
        meridianImport={rawDocument:command.rawDocument,documentSha256:createHash('sha256').update(command.rawDocument,'utf8').digest('hex')};
      }
      let applied:ReturnType<typeof applyCommand>;
      try{applied=applyCommand(state,command,actor,{revokedAgent,meridianImport});}
      catch(error){
        // A typed conflict here occurs only after this actor's receipt lookup.
        if(command.type==='importMeridianScope'&&error instanceof DomainError&&error.code==='VERSION_CONFLICT')throw new StoreError(error.code,error.message,{...error.details,meridianReceipt:'absent'});
        throw error;
      }
      await append(tx,applied.events,applied.state);
      const response={state:applied.state,events:applied.events,cursor:applied.state.version};
      await tx.query(`INSERT INTO ouro_command_receipts (actor_id,project_id,request_id,payload_hash,response,cursor) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,[actor.id,projectId,command.requestId,payloadHash,JSON.stringify(response),response.cursor]);
      return {...response,replayed:false};
  }
  function commitCommand(body:unknown,actor:Actor,internal=false):Promise<CommandResult>{return serialize(()=>db.transaction(tx=>commitCommandInTransaction(tx,body,actor,internal)));}
  const lockProject=(tx:Connection)=>tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[projectId]);
  const jobById=async(tx:Connection,id:string)=>{
    const result=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE d.project_id=$1 AND d.id=$2`,[projectId,id]);
    return result.rows[0]??null;
  };
  const assertLease=(row:GitHubJobRow|null,leaseToken:string)=>{
    if(!row||row.status!=='processing'||row.lease_token!==leaseToken)throw new StoreError('LEASE_LOST','Попытка обработки очереди больше не владеет lease.');
    if(!row.lease_until||!(new Date(row.lease_until).getTime()>Date.now()))throw new StoreError('LEASE_LOST','Срок обработки очереди истёк; нужен новый lease.');
    return row;
  };
  const participants=createParticipantRegistry({projectId,db,serialize,lockProject:tx=>lockProject(tx as Connection),assertHuman:(tx,actor)=>scopedHuman(tx as Connection,actor)});
  const drafts=createCollaborativeDraftService({projectId,db,serialize,lockProject:tx=>lockProject(tx as Connection),assertHuman:(tx,actor)=>scopedHuman(tx as Connection,actor),state:async tx=>replay(await projectEvents(tx as Connection),projectId),commit:(tx,body,actor)=>commitCommandInTransaction(tx as Connection,body,actor),hash});
  return {
    ...participants,...drafts,
    projectId,
    storage:owner.storage,
    getWorkspaceProject:(id:string):Promise<WorkspaceProject|null>=>serialize(()=>readWorkspaceProject(db,projectIdValue(id))),
    getWorkspaceBinding:():Promise<WorkspaceBinding|null>=>serialize(async()=>workspaceBinding(await readWorkspaceProject(db,projectId))),
    listWorkspaceProjects:(actor:Actor):Promise<WorkspaceProject[]>=>serialize(()=>db.transaction(async tx=>{
      await assertCatalogOperator(tx,actor);
      const result=await tx.query<WorkspaceProjectRow>('SELECT * FROM ouro_workspace_projects ORDER BY created_at,id');
      return result.rows.map(workspaceProject);
    })),
    createWorkspaceProject:(input:{requestId:string;name?:string;rootPath:string},actor:Actor):Promise<{project:WorkspaceProject;created:boolean;replayed:boolean}>=>serialize(()=>db.transaction(async tx=>{
      await assertCatalogOperator(tx,actor);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['requestId','name','rootPath'].includes(key))||typeof input.requestId!=='string'||input.requestId.length<8||input.requestId.length>200||!isWellFormedUnicode(input.requestId)||/[\x00-\x1f\x7f]/.test(input.requestId)||typeof input.rootPath!=='string')throw new StoreError('VALIDATION_ERROR','Нужны requestId и абсолютный путь папки без посторонних полей.');
      if(input.name!==undefined&&(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>200||!isWellFormedUnicode(input.name)||/[\x00-\x1f\x7f]/.test(input.name)))throw new StoreError('VALIDATION_ERROR','Название проекта должно содержать 1–200 корректных символов.');
      const payloadHash=hash(input);
      await tx.query('SELECT id FROM ouro_workspace_catalog_lock WHERE id=1 FOR UPDATE');
      const duplicate=await tx.query<{payload_hash:string;response:{project:WorkspaceProject;created:boolean}}>('SELECT payload_hash,response FROM ouro_workspace_receipts WHERE actor_id=$1 AND request_id=$2',[actor.id,input.requestId]);
      if(duplicate.rows[0]){
        if(duplicate.rows[0].payload_hash!==payloadHash)throw new StoreError('IDEMPOTENCY_CONFLICT','Этот requestId уже использован для другой регистрации проекта.');
        return {...duplicate.rows[0].response,replayed:true};
      }
      const folder=await resolveWorkspaceFolder(input.rootPath);
      const existing=await tx.query<WorkspaceProjectRow>('SELECT * FROM ouro_workspace_projects WHERE root_path=$1',[folder.canonicalPath]);
      let project:WorkspaceProject,created=false;
      if(existing.rows[0]){
        project=workspaceProject(existing.rows[0]);
        await assertWorkspaceFolder(workspaceBinding(project)!);
      }else{
        const id=randomUUID(),bindingId=randomUUID(),name=input.name?.trim()||folder.displayName;
        if(!name||name.length>200||!isWellFormedUnicode(name)||/[\x00-\x1f\x7f]/.test(name))throw new StoreError('VALIDATION_ERROR','Укажите допустимое название проекта.');
        await tx.query('INSERT INTO ouro_projects(id,version) VALUES($1,0)',[id]);
        const initialized=applyCommand(replay([],id),{type:'initializeProject',name,requestId:`workspace-init:${id}`,expectedVersion:0},{...actor,projectIds:[id]});
        await append(tx,initialized.events,initialized.state);
        const row=await tx.query<WorkspaceProjectRow>(`INSERT INTO ouro_workspace_projects(id,name,root_path,kind,binding_id,root_dev,root_ino,created_by) VALUES($1,$2,$3,'folder',$4,$5,$6,$7) RETURNING *`,[id,name,folder.canonicalPath,bindingId,folder.identity.dev,folder.identity.ino,actor.id]);
        project=workspaceProject(row.rows[0]);created=true;
      }
      const response={project,created};
      await tx.query('INSERT INTO ouro_workspace_receipts(actor_id,request_id,payload_hash,response) VALUES($1,$2,$3,$4::jsonb)',[actor.id,input.requestId,payloadHash,JSON.stringify(response)]);
      return {...response,replayed:false};
    })),
    importMeridianScope:(input:unknown,actor:Actor):Promise<CommandResult>=>{
      scopedActor(actor);
      if(actor.kind!=='human')return Promise.reject(new StoreError('FORBIDDEN','Импорт черновика подтверждает человек.'));
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['requestId','expectedVersion','rawDocument','content'].includes(key)))return Promise.reject(new StoreError('VALIDATION_ERROR','Импорт принимает исходный документ, содержание и версию без посторонних полей.'));
      return commitCommand({...structuredClone(input),type:'importMeridianScope'},actor,true);
    },
    createGitHubBinding: (input:{executionId:string;repositoryId:number;repositoryFullName:string;ref:string;requestId:string;expectedVersion:number},actor:Actor)=>commitCommand({...input,type:'createGitHubBinding'},actor,true),
    enqueueGitHubDelivery: (deliveryId:string,input:NormalizedGitHubPush):Promise<{delivery:PublicGitHubDelivery;duplicate:boolean}>=>serialize(()=>db.transaction(async tx=>{
      if(typeof deliveryId!=='string'||!deliveryId.trim()||deliveryId.length>200||!input||!/^[a-f0-9]{64}$/.test(input.payloadDigest)||!Number.isSafeInteger(input.repositoryId)||input.repositoryId<1||typeof input.repositoryFullName!=='string'||typeof input.ref!=='string'||!Array.isArray(input.commitShas)||input.commitShas.length>2048||input.commitShas.some(sha=>typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha))||!['pending','ignored','needs_review'].includes(input.disposition))throw new StoreError('VALIDATION_ERROR','Некорректная нормализованная доставка GitHub.');
      // Copy only compact known fields. Raw body, signatures and credentials never enter SQL.
      const payload:NormalizedGitHubPush={repositoryId:input.repositoryId,repositoryFullName:input.repositoryFullName,ref:input.ref,before:input.before,after:input.after,commitShas:[...input.commitShas],payloadDigest:input.payloadDigest,disposition:input.disposition,...(input.reason?{reason:input.reason.slice(0,1000)}:{})};
      await lockProject(tx);
      const duplicate=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE d.project_id=$1 AND d.delivery_id=$2`,[projectId,deliveryId]);
      if(duplicate.rows[0]){
        if(duplicate.rows[0].payload.payloadDigest!==payload.payloadDigest)throw new StoreError('IDEMPOTENCY_CONFLICT','GitHub deliveryId уже принят с другим телом.');
        return {delivery:publicGitHubJob(duplicate.rows[0]),duplicate:true};
      }
      const state=replay(await projectEvents(tx),projectId),bindingIds=state.githubBindings.filter(binding=>!binding.revokedAt&&binding.repositoryId===payload.repositoryId&&binding.ref===payload.ref).map(binding=>binding.id);
      const status:PublicGitHubDelivery['status']=payload.disposition==='needs_review'?'needs_review':payload.disposition==='ignored'||!bindingIds.length||!payload.commitShas.length?'processed':'pending';
      const reason=payload.reason??(!bindingIds.length?'NO_ACTIVE_BINDING':!payload.commitShas.length?'NO_COMMITS':null),id=randomUUID();
      await tx.query(`INSERT INTO ouro_github_deliveries(id,project_id,delivery_id,payload_digest,payload,binding_ids) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,[id,projectId,deliveryId,payload.payloadDigest,JSON.stringify(payload),JSON.stringify(bindingIds)]);
      await tx.query(`INSERT INTO ouro_github_jobs(delivery_id,status,reason) VALUES($1,$2,$3)`,[id,status,reason]);
      return {delivery:publicGitHubJob((await jobById(tx,id))!),duplicate:false};
    })),
    listGitHubDeliveries: (actor:Actor):Promise<PublicGitHubDelivery[]>=>serialize(()=>db.transaction(async tx=>{
      await scopedHuman(tx,actor);
      const rows=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE d.project_id=$1 ORDER BY d.received_at DESC,d.id LIMIT 100`,[projectId]);
      return rows.rows.map(publicGitHubJob);
    })),
    claimGitHubDelivery: (claimOptions:{now?:number;leaseMs?:number}={}):Promise<ClaimedGitHubDelivery|null>=>serialize(()=>db.transaction(async tx=>{
      const now=claimOptions.now??Date.now(),leaseMs=claimOptions.leaseMs??30_000;
      if(!Number.isFinite(now)||!Number.isFinite(leaseMs)||leaseMs<100||leaseMs>300_000)throw new StoreError('VALIDATION_ERROR','Некорректная длительность lease.');
      await lockProject(tx);
      await tx.query(`UPDATE ouro_github_jobs SET status='retryable',last_error='ATTEMPT_LIMIT',lease_token=NULL,lease_until=NULL,updated_at=$1 WHERE status='processing' AND lease_until<=$1 AND attempts>=5 AND delivery_id IN(SELECT id FROM ouro_github_deliveries WHERE project_id=$2)`,[new Date(now).toISOString(),projectId]);
      const candidates=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE d.project_id=$1 AND j.attempts<5 AND ((j.status IN ('pending','retryable') AND j.next_attempt_at<=$2) OR (j.status='processing' AND j.lease_until<=$2)) ORDER BY d.received_at,d.id LIMIT 1`,[projectId,new Date(now).toISOString()]);
      const row=candidates.rows[0];if(!row)return null;
      const leaseToken=randomUUID();await tx.query(`UPDATE ouro_github_jobs SET status='processing',attempts=attempts+1,lease_token=$2,lease_until=$3,updated_at=$4 WHERE delivery_id=$1`,[row.id,leaseToken,new Date(now+leaseMs).toISOString(),new Date(now).toISOString()]);
      return {id:row.id,deliveryId:row.delivery_id,payload:row.payload,bindingIds:row.binding_ids,leaseToken,attempts:row.attempts+1};
    })),
    ingestVerifiedGitHubCommit: (input:{jobId:string;leaseToken:string;bindingId:string;commit:GitHubVerifiedCommit}):Promise<{event:DomainEvent;cursor:number;replayed:boolean}>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx);
      if(!input||!input.commit||typeof input.bindingId!=='string'||typeof input.commit.fullSha!=='string'||!Number.isSafeInteger(input.commit.repositoryId))throw new StoreError('VALIDATION_ERROR','Некорректный проверенный коммит.');
      const envelope={bindingId:input.bindingId,repositoryId:input.commit.repositoryId,fullSha:input.commit.fullSha},payloadHash=hash(envelope);
      // Semantic receipt is independent of delivery ID, verification time and current version.
      const duplicate=await tx.query<{payload_hash:string;response:{event:DomainEvent;cursor:number}}>('SELECT payload_hash,response FROM ouro_github_commit_receipts WHERE project_id=$1 AND binding_id=$2 AND repository_id=$3 AND full_sha=$4',[projectId,envelope.bindingId,envelope.repositoryId,envelope.fullSha]);
      if(duplicate.rows[0]){
        if(duplicate.rows[0].payload_hash!==payloadHash)throw new StoreError('IDEMPOTENCY_CONFLICT','Конфликт происхождения коммита.');
        // A retry may revisit already imported SHAs before reaching the remainder.
        // Renew only a still-current, unexpired lease. Reading an old receipt
        // remains idempotent, but it cannot revive ownership after its deadline.
        const now=Date.now();
        await tx.query(`UPDATE ouro_github_jobs SET lease_until=$3,updated_at=now() WHERE delivery_id=$1 AND status='processing' AND lease_token=$2 AND lease_until>$4 AND delivery_id IN(SELECT id FROM ouro_github_deliveries WHERE project_id=$5)`,[input.jobId,input.leaseToken,new Date(now+60_000).toISOString(),new Date(now).toISOString(),projectId]);
        return {...duplicate.rows[0].response,replayed:true};
      }
      const row=assertLease(await jobById(tx,input.jobId),input.leaseToken);
      if(!row.binding_ids.includes(input.bindingId)||row.payload.repositoryId!==input.commit.repositoryId||!row.payload.commitShas.includes(input.commit.fullSha))throw new StoreError('FORBIDDEN','Коммит не относится к принятой доставке и её назначению.');
      const state=replay(await projectEvents(tx),projectId),actor:Actor={id:GITHUB_SERVICE_ID,kind:'service',name:'GitHub · проверенный источник',projectIds:[projectId]};
      const applied=applyCommand(state,{type:'recordGitHubCommit',requestId:`github:${payloadHash}`,expectedVersion:state.version,bindingId:input.bindingId,deliveryId:row.delivery_id,payloadDigest:row.payload.payloadDigest,commit:input.commit},actor);
      await append(tx,applied.events,applied.state);
      const response={event:applied.events[0],cursor:applied.state.version};
      await tx.query(`INSERT INTO ouro_github_commit_receipts(project_id,binding_id,repository_id,full_sha,payload_hash,event_id,response) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[projectId,envelope.bindingId,envelope.repositoryId,envelope.fullSha,payloadHash,response.event.id,JSON.stringify(response)]);
      await tx.query('UPDATE ouro_github_jobs SET lease_until=$2,updated_at=now() WHERE delivery_id=$1',[row.id,new Date(Date.now()+60_000).toISOString()]);
      return {...response,replayed:false};
    })),
    finishGitHubDelivery: (jobId:string,leaseToken:string,reason?:string):Promise<void>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx);assertLease(await jobById(tx,jobId),leaseToken);
      await tx.query(`UPDATE ouro_github_jobs SET status='processed',reason=$2,last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE delivery_id=$1`,[jobId,reason?.slice(0,1000)??null]);
    })),
    failGitHubDelivery: (jobId:string,leaseToken:string,error:{code:string;retryAfterMs?:number;permanent?:boolean}):Promise<void>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx);const row=assertLease(await jobById(tx,jobId),leaseToken);
      const safeCodes=new Set(['GITHUB_UNAVAILABLE','VERIFICATION_FAILED','LEASE_LOST','INTERNAL_ERROR','NOT_FOUND','FORBIDDEN','VALIDATION_ERROR']);
      const safeCode=safeCodes.has(error.code)?error.code:'INTERNAL_ERROR';
      const delay=Math.max(1000,Math.min(3_600_000,Number.isFinite(error.retryAfterMs)?error.retryAfterMs!:1000*2**row.attempts));
      await tx.query(`UPDATE ouro_github_jobs SET status=$2,last_error=$3,lease_token=NULL,lease_until=NULL,next_attempt_at=$4,updated_at=now() WHERE delivery_id=$1`,[jobId,error.permanent?'needs_review':'retryable',safeCode,new Date(Date.now()+delay).toISOString()]);
    })),
    retryGitHubDelivery: (jobId:string,actor:Actor):Promise<PublicGitHubDelivery>=>serialize(()=>db.transaction(async tx=>{
      await scopedHuman(tx,actor);await lockProject(tx);const row=await jobById(tx,jobId);
      if(!row)throw new StoreError('NOT_FOUND','Доставка GitHub не найдена.');
      if(row.status!=='retryable')throw new StoreError('INVALID_TRANSITION','Повтор доступен только после временной ошибки; неполный push требует проверки.');
      await tx.query(`UPDATE ouro_github_jobs SET status='pending',attempts=0,last_error=NULL,next_attempt_at=now(),lease_token=NULL,lease_until=NULL,updated_at=now() WHERE delivery_id=$1`,[jobId]);
      return publicGitHubJob((await jobById(tx,jobId))!);
    })),
    createAgent: (name:string,actor:Actor):Promise<{agent:AgentRegistration;token:string}> => serialize(async()=>{
      scopedActor(actor);
      if(actor.kind!=='human')throw new StoreError('FORBIDDEN','Регистрацией агентов управляет человек.');
      if(typeof name!=='string'||!name.trim()||name.length>120||name.includes('\0')||!isWellFormedUnicode(name))throw new StoreError('VALIDATION_ERROR','Имя агента должно содержать от 1 до 120 корректных символов.');
      return db.transaction(async tx=>{
        await scopedHuman(tx,actor);
        const id=randomUUID();
        const token=`ouro_agent_${randomBytes(32).toString('base64url')}`;
        await registerActor(tx,{id,kind:'agent',name:name.trim(),projectIds:[projectId]});
        await tx.query('INSERT INTO ouro_agent_registrations (id,project_id,name,created_by) VALUES ($1,$2,$3,$4)',[id,projectId,name.trim(),actor.id]);
        await tx.query('INSERT INTO ouro_agent_credentials (agent_id,token_hash) VALUES ($1,$2)',[id,tokenHash(token)]);
        const result=await tx.query<AgentRow>(`${agentSelection} WHERE r.id=$1 AND r.project_id=$2`,[id,projectId]);
        return {agent:publicAgent(result.rows[0]),token};
      });
    }),
    listAgents: (actor:Actor):Promise<AgentRegistration[]> => serialize(()=>db.transaction(async tx=>{
      await scopedHuman(tx,actor);
      const result=await tx.query<AgentRow>(`${agentSelection} WHERE r.project_id=$1 ORDER BY r.created_at,r.id`,[projectId]);
      return result.rows.map(publicAgent);
    })),
    revokeAgent: (id:string,actor:Actor):Promise<AgentRegistration> => serialize(()=>db.transaction(async tx=>{
      await scopedHuman(tx,actor);
      await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[projectId]);
      const found=await tx.query<AgentRow>(`${agentSelection} WHERE r.id=$1 AND r.project_id=$2`,[id,projectId]);
      if(!found.rows.length)throw new StoreError('NOT_FOUND','Агент не найден.');
      await tx.query('INSERT INTO ouro_agent_revocations (agent_id,revoked_by) VALUES ($1,$2) ON CONFLICT DO NOTHING',[id,actor.id]);
      const result=await tx.query<AgentRow>(`${agentSelection} WHERE r.id=$1 AND r.project_id=$2`,[id,projectId]);
      return publicAgent(result.rows[0]);
    })),
    authenticateAgentToken: (token:string):Promise<Actor|null> => serialize(async()=>{
      if(typeof token!=='string'||!/^ouro_agent_[A-Za-z0-9_-]{43}$/.test(token))return null;
      return db.transaction(async tx=>{
        await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR SHARE',[projectId]);
        const result=await tx.query<{id:string;name:string;project_id:string}>(`SELECT r.id,r.name,r.project_id FROM ouro_agent_credentials c
          JOIN ouro_agent_registrations r ON r.id=c.agent_id
          LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id
          WHERE c.token_hash=$1 AND r.project_id=$2 AND v.agent_id IS NULL`,[tokenHash(token),projectId]);
        const found=result.rows[0];if(!found)return null;
        await tx.query('INSERT INTO ouro_agent_presence (agent_id,last_seen_at) VALUES ($1,now()) ON CONFLICT (agent_id) DO UPDATE SET last_seen_at=excluded.last_seen_at',[found.id]);
        return {id:found.id,kind:'agent',name:found.name,projectIds:[found.project_id]};
      });
    }),
    getProject: () => serialize(async () => replay(await projectEvents(db), projectId)),
    getEvents: (after = 0) => serialize(async () => {
      if (!Number.isSafeInteger(after) || after < 0) throw new StoreError('VALIDATION_ERROR', 'Некорректный курсор событий.');
      return db.transaction(async tx => {
        const row = await tx.query<{ version: string | number }>('SELECT version FROM ouro_projects WHERE id=$1 FOR SHARE', [projectId]);
        const cursor = Number(row.rows[0]?.version ?? 0);
        if (after > cursor) throw new StoreError('CURSOR_AHEAD', 'Курсор клиента опережает историю проекта.', { cursor });
        return { events: await projectEvents(tx,after), cursor };
      });
    }),
    executeCommand: (body:unknown,actor:Actor)=>commitCommand(body,actor),
    /** Used by database checks/tests; application routes never expose raw SQL. */
    inspect: <T = Row>(sql: string, params?: unknown[]) => serialize(() => db.query<T>(sql, params)),
    close:owner.close,
  };
}

export type Store = ReturnType<typeof createProjectStore>&{forProject:(id:string)=>Promise<Store>};
export type GitHubStore=Store;
const globalStore = globalThis as typeof globalThis & { __ouroStore?: Promise<Store> };
function currentStore(): Promise<Store> {
  return globalStore.__ouroStore ??= createStore({ databaseUrl: process.env.DATABASE_URL, dataDir: process.env.OURO_DATA_DIR });
}
export const getGitHubStore=currentStore;
export const getWorkspaceStore=currentStore;
export const getParticipantRegistry=currentStore;
export const getCollaborativeDraftStore=currentStore;
export async function resolveParticipantIdentity(id:string){return (await currentStore()).resolveParticipantIdentity(id);}
export async function authenticateParticipantCredential(credential:string){return (await currentStore()).authenticateParticipantCredential(credential);}
export const getStorageMode = () => process.env.DATABASE_URL ? 'postgres' as const : 'embedded-postgres' as const;
export async function getProject() { return (await currentStore()).getProject(); }
export async function getEvents(after = 0) { return (await currentStore()).getEvents(after); }
export async function executeCommand(command: unknown, actor: Actor) { return (await currentStore()).executeCommand(command, actor); }
export async function importMeridianScope(input:unknown,actor:Actor){return (await currentStore()).importMeridianScope(input,actor);}
export async function createAgent(name:string,actor:Actor) {return (await currentStore()).createAgent(name,actor);}
export async function listAgents(actor:Actor) {return (await currentStore()).listAgents(actor);}
export async function revokeAgent(agentId:string,actor:Actor) {return (await currentStore()).revokeAgent(agentId,actor);}
export async function authenticateAgentToken(token:string) {return (await currentStore()).authenticateAgentToken(token);}
