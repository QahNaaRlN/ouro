import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import {acquireProfileOwner} from './storage/profile-owner';
import { applyCommand, createSeedEvents, replay, AGENT_ID, GITHUB_SERVICE_ID, PROJECT_ID,DomainError } from '../packages/core/src';
import type { Actor, Command, DomainEvent, GitHubVerifiedCommit, ProjectState } from '../packages/core/src';
import type { NormalizedGitHubPush } from './github/verification';
import { createParticipantRegistry,assertRegisteredHumanActive } from './participant-registry';
import { createUserAuth } from './user-auth';
import { createProjectService, resolveAccountProjectIds, requireProjectRole, type OuroMailer } from './projects';
import { createSmtpMailerFromEnv } from './mailer';
import { createCollaborativeDraftService } from './collaborative-drafts';
import { isWellFormedUnicode } from '../packages/core/src/unicode';
import {parseMeridianScope} from '../packages/meridian/src/context';
import {resolveWorkspaceFolder,assertWorkspaceFolder} from './workspace-files';
import {importPlaywrightReport,type PlaywrightImportProof} from './verification/playwright';
import {observeVerificationWorkspace,observationHash,runnerCapabilities,type ObservationConfig} from './verification/observation';
import {runLocalVerification,type LocalRunnerProof} from './verification/local-runner';
import {verificationObserveInputSchema,verificationRunnerInputSchema} from '@ouro/protocol';
import {createWorkspaceBindingRecovery,parseRecoveryInput,type BindingRecoveryInspection,type VerifiedBindingRecovery} from './workspace-binding-recovery';

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
/** Конфигурация storage owner и его ресурсов; service передаёт пути и режим явно. */
export type StoreOptions = { dataDir?: string; databaseUrl?: string; seedEvents?: DomainEvent[]; projectId?:string; mailer?: OuroMailer;workspaceBindingRecovery?:ReturnType<typeof createWorkspaceBindingRecovery>;migrationsDir?:string;verificationRuntimeDir?:string;playwrightPackageRoot?:string;deploymentMode?:string;startObservers?:boolean };
export type WorkspaceBinding={id:string;canonicalPath:string;identity:{dev:string;ino:string}};
export type WorkspaceProject={id:string;name:string;rootPath:string|null;kind:'folder'|'demo';createdAt:string;createdBy:string;bindingId:string|null;rootIdentity:{dev:string;ino:string}|null};
type WorkspaceProjectRow={id:string;name:string;root_path:string|null;kind:'folder'|'demo';created_at:Date|string;created_by:string;binding_id:string|null;root_dev:string|null;root_ino:string|null};
type StoreOwner={registerObserver:(id:string,poll:()=>Promise<unknown>)=>void;db:Database;storage:'postgres'|'embedded-postgres';serialize:<T>(fn:()=>Promise<T>)=>Promise<T>;close:()=>Promise<void>;mailer?:OuroMailer;bindingRecovery:ReturnType<typeof createWorkspaceBindingRecovery>;signal:AbortSignal;runtimeOperations:Set<Promise<unknown>>;startBackgroundWork:()=>void;stopBackgroundWork:()=>Promise<void>;deploymentMode:()=>string|undefined;capabilities:()=>Record<string,string>;verificationRuntimeDir?:string;playwrightPackageRoot?:string};
export type WorkspaceCommandRejection={phase:'workspace-binding-guard';outcome:'rejected';receipt:'absent';projectId:string;actorId:string;requestId:string;commandType:'startExecution'|'startProjectWork'|'authorizeRemediation';bodySha256:string};
export type WorkspaceBindingRecoveryAudit={recoveryId:string;projectId:string;actorId:string;reason:string;acknowledgeUnknownContinuity:true;oldBinding:WorkspaceBinding;newBinding:WorkspaceBinding;runtime:VerifiedBindingRecovery['runtime'];issuedAt:string;expiresAt:string;createdAt:string;origin:'unknown'};
export type WorkspaceBindingRecoveryResult={project:WorkspaceProject;recovery:WorkspaceBindingRecoveryAudit;replayed:boolean};
export type WorkspaceBindingRecoveryInspection={saved:WorkspaceBinding|null;observed?:WorkspaceBinding;eligible:boolean;reason:string;ticket?:string;expiresAt?:string;audit:WorkspaceBindingRecoveryAudit[];runtime:BindingRecoveryInspection['runtime'];status:BindingRecoveryInspection['status'];origin:'unknown'};
class WorkspaceGuardRejected extends StoreError{constructor(error:{message:string},public proof:WorkspaceCommandRejection){super('WORKSPACE_BINDING_CONFLICT',error.message);}}
export type AgentRegistration = { id:string; projectId:string; name:string; createdAt:string; createdBy:string; lastSeenAt:string|null; revokedAt:string|null };
export type PublicGitHubDelivery = {id:string;deliveryId:string;repositoryId:number;repositoryFullName:string;ref:string;status:'pending'|'processing'|'retryable'|'processed'|'needs_review';attempts:number;reason:string|null;lastError:string|null;receivedAt:string;updatedAt:string;nextAttemptAt:string;commitCount:number};
export type ClaimedGitHubDelivery = {id:string;deliveryId:string;projectId:string;payload:NormalizedGitHubPush;bindingIds:string[];leaseToken:string;attempts:number};
type GitHubJobRow={id:string;delivery_id:string;project_id:string;payload:NormalizedGitHubPush;binding_ids:string[];received_at:Date|string;status:PublicGitHubDelivery['status'];attempts:number;reason:string|null;last_error:string|null;updated_at:Date|string;next_attempt_at:Date|string;lease_token:string|null;lease_until:Date|string|null};
const githubJobSelection=`SELECT d.id,d.delivery_id,d.project_id,d.payload,d.binding_ids,d.received_at,j.status,j.attempts,j.reason,j.last_error,j.updated_at,j.next_attempt_at,j.lease_token,j.lease_until FROM ouro_github_deliveries d JOIN ouro_github_jobs j ON j.delivery_id=d.id`;
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
  const profile=await acquireProfileOwner(dataDir);
  let database:PGlite|undefined;
  try{
    const pg=database=new PGlite(dataDir);await pg.waitReady;
    return {
      query: (sql, values) => pg.query(sql, values),
      exec: sql => pg.exec(sql),
      transaction: fn => pg.transaction(tx => fn({ query: (sql, values) => tx.query(sql, values), exec: sql => tx.exec(sql) })),
      close: async() => {await pg.close();await profile.release();},
    };
  }catch(error){await database?.close();await profile.release();throw error;}
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
  await requireProjectRole(tx,actor,projectId);
  await registerActor(tx,actor);
}

async function assertRegisteredAgentActive(tx:Connection,actor:Actor,projectId=PROJECT_ID) {
  if(actor.kind!=='agent')return;
  const revoked=await tx.query('SELECT agent_id FROM ouro_agent_revocations WHERE agent_id=$1',[actor.id]);
  if(revoked.rows.length)throw new StoreError('FORBIDDEN','Доступ агента отозван человеком.');
  const registered=await tx.query('SELECT id FROM ouro_agent_registrations WHERE id=$1',[actor.id]);
  if(registered.rows.length){
    const assigned=await tx.query('SELECT a.agent_id FROM ouro_agent_assignments a LEFT JOIN ouro_agent_assignment_revocations r ON r.agent_id=a.agent_id AND r.project_id=a.project_id WHERE a.agent_id=$1 AND a.project_id=$2 AND r.agent_id IS NULL',[actor.id,projectId]);
    if(!assigned.rows.length)throw new StoreError('FORBIDDEN','Назначение агента в этом проекте недействительно или отозвано.');
  }else if(actor.id!==AGENT_ID)throw new StoreError('FORBIDDEN','Внешний агент должен быть зарегистрирован.');
}

async function assertAssignmentActive(tx:Connection,command:Command,projectId=PROJECT_ID) {
  if(command.type!=='startExecution'&&command.type!=='authorizeRemediation'&&command.type!=='startProjectWork')return;
  if(typeof command.agentId!=='string'||!command.agentId)throw new StoreError('VALIDATION_ERROR','Нужен agentId исполнителя.');
  // The seed simulator remains an explicit separate choice. All external
  // assignments require a live registration in the current project.
  if(projectId===PROJECT_ID&&command.agentId===AGENT_ID&&command.type!=='startProjectWork')return;
  const found=await tx.query<{agent_id:string}>(`SELECT a.agent_id FROM ouro_agent_assignments a
    JOIN ouro_agent_registrations r ON r.id=a.agent_id LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id
    LEFT JOIN ouro_agent_assignment_revocations ar ON ar.agent_id=a.agent_id AND ar.project_id=a.project_id
    WHERE a.agent_id=$1 AND a.project_id=$2 AND v.agent_id IS NULL AND ar.agent_id IS NULL`,[command.agentId,projectId]);
  if(!found.rows.length)throw new StoreError('FORBIDDEN','Назначение требует действующего зарегистрированного агента этого проекта.');
}

async function readEvents(tx: Connection, after = 0, projectId = PROJECT_ID): Promise<DomainEvent[]> {
  const result = await tx.query<{ event: DomainEvent }>('SELECT event FROM ouro_domain_events WHERE project_id=$1 AND version>$2 ORDER BY version', [projectId, after]);
  return result.rows.map(row => row.event);
}

async function append(tx: Connection, events: DomainEvent[], state: ProjectState, projectId = PROJECT_ID) {
  if(state.projectId!==projectId||events.some(event=>event.projectId!==projectId))throw new StoreError('FORBIDDEN','Событие принадлежит другому проекту.');
  for (const event of events) {
    await registerActor(tx, event.actor);
    await tx.query(`INSERT INTO ouro_domain_events
      (id,project_id,version,event_type,schema_version,actor_id,occurred_at,event)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [event.id, event.projectId, event.version, event.type, event.schemaVersion, event.actor.id, event.occurredAt, JSON.stringify(event)]);
    await tx.query('INSERT INTO ouro_outbox (event_id,project_id,cursor) VALUES ($1,$2,$3)', [event.id, event.projectId, event.version]);
  }
  for (const spec of state.specs) {
    await tx.query('INSERT INTO ouro_specs (id,project_id,human_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [spec.id, projectId, spec.humanId]);
  }
  for (const revision of state.revisions) {
    await tx.query(`INSERT INTO ouro_spec_revisions (id,spec_id,revision,content,content_hash)
      VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT DO NOTHING`, [revision.id, revision.specId, revision.revision, JSON.stringify(revision), hash(revision)]);
    const persisted = await tx.query<{ content_hash: string }>('SELECT content_hash FROM ouro_spec_revisions WHERE id=$1', [revision.id]);
    if (persisted.rows[0]?.content_hash !== hash(revision)) throw new StoreError('IMMUTABLE_REVISION_CONFLICT', 'Содержание сохранённой ревизии изменилось.');
  }
  for(const event of events.filter(item=>item.type==='VerificationRunRecorded')){
    const run=state.verificationRuns.find(item=>item.id===(event.payload.run as {id:string}).id)!;
    await tx.query('INSERT INTO ouro_verification_runs(id,project_id,event_id,verification_revision_id,target_revision_id,content,content_hash) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)',[run.id,projectId,event.id,run.verificationRevisionId,run.targetRevisionId,JSON.stringify(run),hash(run)]);
  }
  await tx.query('UPDATE ouro_projects SET version=$2 WHERE id=$1', [projectId, state.version]);
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
  if(!found.rows[0])return null;
  const project=workspaceProject(found.rows[0]);
  const overlay=await tx.query<{content:WorkspaceBindingRecoveryAudit}>('SELECT content FROM ouro_workspace_binding_recoveries WHERE project_id=$1 ORDER BY sequence DESC LIMIT 1',[projectId]);
  const current=overlay.rows[0]?.content.newBinding;
  return current?{...project,bindingId:current.id,rootPath:current.canonicalPath,rootIdentity:current.identity}:project;
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
    const migrations=await Promise.all(['001_initial.sql','002_agents.sql','003_github.sql','004_participants.sql','005_drafts.sql','006_workspace_projects.sql','007_identity.sql','008_projects_memberships.sql','009_membership_regrants.sql','010_verification.sql','011_verification_runtime.sql','012_workspace_binding_recovery.sql'].map(file=>readFile(path.join(options.migrationsDir??path.join(process.cwd(),'db','migrations'),file),'utf8')));
    await db.transaction(async tx=>{
      // External PostgreSQL may have multiple app processes initializing together.
      if(options.databaseUrl)await tx.query('SELECT pg_advisory_xact_lock(187652019)');
      for(const migration of migrations)await tx.exec(migration);
      // Migration 008 has already run: new rows must have its metadata now,
      // otherwise the next startup/restore would backfill and change them.
      await tx.query("INSERT INTO ouro_projects(id,version,name,slug,created_at) VALUES($1,0,'Project '||left($1::text,8),$1,now()) ON CONFLICT DO NOTHING",[PROJECT_ID]);
      const legacy=await tx.query<{version:string|number}>('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[PROJECT_ID]);
      if(Number(legacy.rows[0]?.version)===0){
        const events=selectedProjectId===PROJECT_ID?(options.seedEvents??createSeedEvents()):createSeedEvents();
        if(events.length)await append(tx,events,replay(events,PROJECT_ID));
      }
      await tx.query(`INSERT INTO ouro_workspace_projects(id,name,kind,created_by) VALUES($1,$2,'demo','ouro-bootstrap') ON CONFLICT(id) DO NOTHING`,[PROJECT_ID,'Учебный проект Ouro']);
      if(selectedProjectId!==PROJECT_ID){
        await tx.query("INSERT INTO ouro_projects(id,version,name,slug,created_at) VALUES($1,0,'Project '||left($1::text,8),$1,now()) ON CONFLICT DO NOTHING",[selectedProjectId]);
        const selected=await tx.query<{version:string|number}>('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[selectedProjectId]);
        if(Number(selected.rows[0]?.version)===0&&options.seedEvents?.length)await append(tx,options.seedEvents,replay(options.seedEvents,selectedProjectId));
      }
    });
    // PGlite serves one process. Its transaction queue and this queue ensure reads
    // never interleave with an unfinished command. PostgreSQL also locks the project
    // row, providing the same guarantee between separate server processes.
    let tail:Promise<unknown>=Promise.resolve(),closing=false,closePromise:Promise<void>|undefined;
    const shutdown=new AbortController(),runtimeOperations=new Set<Promise<unknown>>();
    const serialize=<T>(fn:()=>Promise<T>):Promise<T>=>{
      if(closing)return Promise.reject(new StoreError('STORE_CLOSED','Хранилище закрыто.'));
      const run=tail.then(fn,fn);tail=run.catch(()=>undefined);return run;
    };
    const observerPolls=new Map<string,()=>Promise<unknown>>();
    let observerTimer:ReturnType<typeof setInterval>|undefined,observerCycle:Promise<unknown>|undefined;
    const startBackgroundWork=()=>{
      if(observerTimer||shutdown.signal.aborted||closing)return;
      observerTimer=setInterval(()=>{if(closing||observerCycle||shutdown.signal.aborted)return;observerCycle=Promise.allSettled([...observerPolls.values()].map(poll=>poll())).finally(()=>{observerCycle=undefined;});},1000);observerTimer.unref();
    };
    const stopBackgroundWork=async()=>{
      shutdown.abort();if(observerTimer){clearInterval(observerTimer);observerTimer=undefined;}
      await Promise.allSettled([...(observerCycle?[observerCycle]:[]),...runtimeOperations]);
    };
    const owner:StoreOwner={registerObserver:(id,poll)=>{observerPolls.set(id,poll);},db,storage:options.databaseUrl?'postgres':'embedded-postgres',serialize,mailer:options.mailer,bindingRecovery:options.workspaceBindingRecovery??createWorkspaceBindingRecovery(),close:()=>{
      if(!closePromise)closePromise=(async()=>{await stopBackgroundWork();observerPolls.clear();closing=true;await tail;await db.close();})();
      return closePromise;
    },signal:shutdown.signal,runtimeOperations,startBackgroundWork,stopBackgroundWork,deploymentMode:()=>options.deploymentMode??process.env.OURO_DEPLOYMENT_MODE,capabilities:()=>runnerCapabilities(options.playwrightPackageRoot),verificationRuntimeDir:options.verificationRuntimeDir,playwrightPackageRoot:options.playwrightPackageRoot};
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
    const selected=await forProject(selectedProjectId);
    const allProjects=await serialize(()=>db.query<{id:string}>('SELECT id FROM ouro_projects'));
    for(const item of allProjects.rows)await forProject(item.id);
    if(options.startObservers!==false)startBackgroundWork();
    return selected;
  }catch(error){await db.close();throw error;}
}

function createProjectStore(projectId:string,owner:StoreOwner){
  const {db,serialize}=owner;
  const scopedActor=(actor:Actor)=>assertActor(actor,projectId);
  const scopedHuman=(tx:Connection,actor:Actor)=>assertHumanActor(tx,actor,projectId);
  const projectEvents=(tx:Connection,after=0)=>readEvents(tx,after,projectId);
  async function commitCommandInTransaction(tx:Connection,body:unknown,actor:Actor,internal=false,selectedProjectId=projectId,verificationOverride?:LocalRunnerProof):Promise<CommandResult>{
    assertActor(actor,selectedProjectId);
    if(!body||typeof body!=='object'||Array.isArray(body))throw new StoreError('VALIDATION_ERROR','Ожидается JSON-команда.');
    if('projectId' in body&&(body as {projectId?:unknown}).projectId!==selectedProjectId)throw new StoreError('FORBIDDEN','Команда не может изменить projectId, выбранный сервером.');
    const command=body as Command;
    if(!internal&&['createGitHubBinding','recordGitHubCommit','importMeridianScope','initializeProject','observeVerificationWorkspace'].includes(command.type))throw new StoreError('FORBIDDEN','Команда доступна только соответствующему серверному адаптеру.');
    if(typeof command.requestId!=='string'||command.requestId.length<8||command.requestId.length>200||!isWellFormedUnicode(command.requestId)||command.requestId.includes('\u0000')||!Number.isSafeInteger(command.expectedVersion)||command.expectedVersion<0)throw new StoreError('VALIDATION_ERROR','Нужны допустимый requestId и неотрицательная expectedVersion.');
    const payloadHash=hash(body);
      await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[selectedProjectId]);
      await registerActor(tx,actor);await assertRegisteredAgentActive(tx,actor,selectedProjectId);
      if(actor.kind==='human'){
        await assertRegisteredHumanActive(tx,actor,selectedProjectId);
        await requireProjectRole(tx,actor,selectedProjectId,['Owner','Contributor']);
      }
      if(command.type==='configureVerificationObservation'&&(owner.deploymentMode()==='cloud'||!['local-human','human-token'].includes(actor.id)))throw new StoreError('FORBIDDEN','Наблюдение файлов и локальный раннер настраивает только оператор локальной папки.');
      const duplicate=await tx.query<{payload_hash:string;response:Omit<CommandResult,'replayed'>}>('SELECT payload_hash,response FROM ouro_command_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[selectedProjectId,actor.id,command.requestId]);
      if(duplicate.rows[0]){
        if(duplicate.rows[0].payload_hash!==payloadHash)throw new StoreError('IDEMPOTENCY_CONFLICT','Этот requestId уже использован с другим содержимым.');
        return {...duplicate.rows[0].response,replayed:true};
      }
      if(!internal){
        const reserved=await tx.query('SELECT request_id FROM ouro_verification_runner_requests WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[selectedProjectId,actor.id,command.requestId]);
        if(reserved.rows.length)throw new StoreError('IDEMPOTENCY_CONFLICT','Этот requestId уже принадлежит другой операции verification.');
      }
      if(['startProjectWork','startExecution','authorizeRemediation'].includes(command.type)){
        const binding=workspaceBinding(await readWorkspaceProject(tx,selectedProjectId));
        // Folder work still validates its anchored path. Hosted work relies on
        // the same current membership, role and agent-assignment guards, without
        // pretending the server can read the user's computer.
        if(command.type==='startProjectWork'&&!binding){
          const workspace=await readWorkspaceProject(tx,selectedProjectId);
          if(workspace||['local-human','human-token'].includes(actor.id))throw new StoreError('INVALID_TRANSITION','Для локального назначения выберите зарегистрированную папку-проект.');
        }
        if(binding){
          try{await assertWorkspaceFolder(binding);}
          catch(error){
            if(actor.kind==='human'&&(error as {code?:string}).code==='WORKSPACE_BINDING_CONFLICT')throw new WorkspaceGuardRejected(error as Error,{phase:'workspace-binding-guard',outcome:'rejected',receipt:'absent',projectId:selectedProjectId,actorId:actor.id,requestId:command.requestId,commandType:command.type as WorkspaceCommandRejection['commandType'],bodySha256:payloadHash});
            throw error;
          }
        }
      }
      await assertAssignmentActive(tx,command,selectedProjectId);
      const state=replay(await readEvents(tx,0,selectedProjectId),selectedProjectId);
      let revokedAgent:{id:string;revokedAt:string;revokedBy:string}|undefined;
      if(command.type==='forceCancelRevokedExecution'){
        await assertHumanActor(tx,actor,selectedProjectId);
        const execution=state.executions.find(e=>e.id===command.executionId);
        if(!execution)throw new StoreError('NOT_FOUND','Исполнение не найдено.');
        const proof=await tx.query<{id:string;revoked_at:Date|string;revoked_by:string}>(`SELECT r.id,COALESCE(v.revoked_at,ar.revoked_at) AS revoked_at,COALESCE(v.revoked_by,ar.revoked_by) AS revoked_by FROM ouro_agent_registrations r JOIN ouro_agent_assignments a ON a.agent_id=r.id LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id LEFT JOIN ouro_agent_assignment_revocations ar ON ar.agent_id=r.id AND ar.project_id=a.project_id WHERE r.id=$1 AND a.project_id=$2`,[execution.agentId,selectedProjectId]);
        if(!proof.rows[0]?.revoked_at)throw new StoreError('AGENT_NOT_REVOKED','Назначенный агент должен иметь подтверждённый отзыв в реестре проекта.');
        revokedAgent={id:proof.rows[0].id,revokedAt:dateString(proof.rows[0].revoked_at),revokedBy:proof.rows[0].revoked_by};
      }
      let meridianImport:{rawDocument:string;documentSha256:string}|undefined;
      if(command.type==='importMeridianScope'){
        parseMeridianScope(command.rawDocument);
        meridianImport={rawDocument:command.rawDocument,documentSha256:createHash('sha256').update(command.rawDocument,'utf8').digest('hex')};
      }
      let applied:ReturnType<typeof applyCommand>;
      let verificationImport:PlaywrightImportProof|LocalRunnerProof|undefined;
      if(command.type==='reportVerificationRun'){
        const execution=state.executions.find(item=>item.id===command.executionId);
        if(!execution||actor.kind==='agent'&&execution.agentId!==actor.id)throw new StoreError('FORBIDDEN','Прогон не соответствует назначению.');
        const contract=state.revisions.find(item=>item.id===execution.specRevisionId)?.verification;
        if(!contract)throw new StoreError('VALIDATION_ERROR','Назначенная ревизия не содержит проверочного контракта.');
        verificationImport=verificationOverride??importPlaywrightReport(command.report,contract);
      }
      try{applied=applyCommand(state,command,actor,{revokedAgent,meridianImport,verificationImport});}
      catch(error){
        if(command.type==='importMeridianScope'&&error instanceof DomainError&&error.code==='VERSION_CONFLICT')throw new StoreError(error.code,error.message,{...error.details,meridianReceipt:'absent'});
        throw error;
      }
      await append(tx,applied.events,applied.state,selectedProjectId);
      const response={state:applied.state,events:applied.events,cursor:applied.state.version};
      await tx.query(`INSERT INTO ouro_command_receipts (actor_id,project_id,request_id,payload_hash,response,cursor) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,[actor.id,selectedProjectId,command.requestId,payloadHash,JSON.stringify(response),response.cursor]);
      return {...response,replayed:false};
  }
  function commitCommand(body:unknown,actor:Actor,internal=false,selectedProjectId=projectId):Promise<CommandResult>{return serialize(async()=>{
    try{return await db.transaction(tx=>commitCommandInTransaction(tx,body,actor,internal,selectedProjectId));}
    catch(error){
      if(!(error instanceof WorkspaceGuardRejected))throw error;
      // The failed transaction has completed its rollback. Recheck current
      // authority and the exact receipt under lock before exposing a negative proof.
      return db.transaction(async tx=>{
        assertActor(actor,selectedProjectId);
        await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[selectedProjectId]);
        await assertRegisteredHumanActive(tx,actor,selectedProjectId);
        await requireProjectRole(tx,actor,selectedProjectId,['Owner','Contributor']);
        const receipt=await tx.query<{payload_hash:string;response:Omit<CommandResult,'replayed'>}>('SELECT payload_hash,response FROM ouro_command_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[selectedProjectId,actor.id,error.proof.requestId]);
        if(receipt.rows[0]){
          if(receipt.rows[0].payload_hash!==error.proof.bodySha256)throw new StoreError('IDEMPOTENCY_CONFLICT','Этот requestId уже использован с другим содержимым.');
          return {...receipt.rows[0].response,replayed:true};
        }
        throw new StoreError(error.code,error.message,{commandRejection:error.proof});
      });
    }
  });}
  const lockProject=(tx:Connection,selectedProjectId=projectId)=>tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[selectedProjectId]);
  const jobById=async(tx:Connection,id:string,selectedProjectId=projectId)=>{
    const result=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE d.project_id=$1 AND d.id=$2`,[selectedProjectId,id]);
    return result.rows[0]??null;
  };
  const assertLease=(row:GitHubJobRow|null,leaseToken:string)=>{
    if(!row||row.status!=='processing'||row.lease_token!==leaseToken)throw new StoreError('LEASE_LOST','Попытка обработки очереди больше не владеет lease.');
    if(!row.lease_until||!(new Date(row.lease_until).getTime()>Date.now()))throw new StoreError('LEASE_LOST','Срок обработки очереди истёк; нужен новый lease.');
    return row;
  };
  const participants=createParticipantRegistry({projectId,db,serialize,lockProject:tx=>lockProject(tx as Connection),assertHuman:(tx,actor)=>scopedHuman(tx as Connection,actor)});
  const drafts=createCollaborativeDraftService({projectId,db,serialize,lockProject:(tx,id)=>lockProject(tx as Connection,id),assertHuman:(tx,actor,id)=>assertHumanActor(tx as Connection,actor,id),assertWrite:async(tx,actor,id)=>{await assertHumanActor(tx as Connection,actor,id);await requireProjectRole(tx as Connection,actor,id,['Owner','Contributor']);},state:async(tx,id)=>replay(await readEvents(tx as Connection,0,id),id),commit:(tx,body,actor,id)=>commitCommandInTransaction(tx as Connection,body,actor,false,id),hash});
  const projects=createProjectService({db,serialize,mailer:owner.mailer});
  const userAuth=createUserAuth({db,serialize,resolveProjectIds:resolveAccountProjectIds});

  const observerActor:Actor={id:'ouro-verification-observer',kind:'service',name:'Наблюдатель проверки Ouro',projectIds:[projectId]};
  const readState=()=>serialize(()=>db.transaction(async tx=>replay(await readEvents(tx,0,projectId),projectId)));
  const observerBinding=()=>serialize(async()=>workspaceBinding(await readWorkspaceProject(db,projectId)));
  const recordObservation=async(verificationRevisionId:string,configId:string,config:ObservationConfig)=>{
    const binding=await observerBinding();
    if(!binding)throw new StoreError('INVALID_TRANSITION','Наблюдение требует привязку к папке проекта.');
    const observation=await observeVerificationWorkspace(binding,config,owner.capabilities),state=await readState();
    const previous=state.verificationObservations.findLast(item=>item.verificationRevisionId===verificationRevisionId&&item.configId===configId);
    if(previous?.observation.digest===observation.digest)return {state,events:[],cursor:state.version,replayed:true} satisfies CommandResult;
    const requestId='verification-observer-'+observationHash({configId,previous:previous?.id??null,digest:observation.digest});
    return commitCommand({type:'observeVerificationWorkspace',verificationRevisionId,configId,observation,requestId,expectedVersion:state.version},observerActor,true);
  };
  owner.registerObserver(projectId,async()=>{
    if(owner.signal.aborted)return;
    const state=await readState();
    const active=state.specs.filter(spec=>spec.activeRevisionId&&spec.state!=='invalidated').map(spec=>spec.activeRevisionId);
    const configurations=state.verificationObservationConfigs.filter((item,index,all)=>active.includes(item.verificationRevisionId)&&!all.slice(index+1).some(later=>later.verificationRevisionId===item.verificationRevisionId));
    for(const configuration of configurations){if(owner.signal.aborted)return;try{await recordObservation(configuration.verificationRevisionId,configuration.id,configuration.config);}catch(error){if((error as {code?:string}).code==='STORE_CLOSED')return;/* A concurrent revision/CAS change is retried by the next bounded tick. */}}
  });
  type RuntimeInput={requestId:string;expectedVersion:number};
  const runtimeInFlight=new Map<string,{digest:string;promise:Promise<CommandResult>}>();
  const runtimeOperation=(kind:string,input:RuntimeInput,actor:Actor,work:(state:ProjectState)=>Promise<CommandResult>):Promise<CommandResult>=>{
    if(owner.signal.aborted)return Promise.reject(new StoreError('STORE_CLOSED','Хранилище останавливается.'));
    const key=actor.id+':'+input.requestId,payloadHash=hash({kind,input}),existing=runtimeInFlight.get(key);
    if(existing)return serialize(()=>db.transaction(async tx=>{
      assertActor(actor,projectId);await assertHumanActor(tx,actor,projectId);await requireProjectRole(tx,actor,projectId,['Owner','Contributor']);
      if(existing.digest!==payloadHash)throw new StoreError('IDEMPOTENCY_CONFLICT','Этот requestId уже используется с другим содержимым.');
    })).then(()=>existing.promise);
    const promise=(async()=>{
      const prepared=await serialize(()=>db.transaction(async tx=>{
        assertActor(actor,projectId);await assertHumanActor(tx,actor,projectId);await requireProjectRole(tx,actor,projectId,['Owner','Contributor']);
        await registerActor(tx,actor);await lockProject(tx);
        const commandReceipt=await tx.query('SELECT request_id FROM ouro_command_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[projectId,actor.id,input.requestId]);
        if(commandReceipt.rows.length)throw new StoreError('IDEMPOTENCY_CONFLICT','Этот requestId уже принадлежит доменной команде.');
        const duplicate=await tx.query<{payload_hash:string;status:string;response:CommandResult|null;failure:{code:string;message:string;details?:Record<string,unknown>}|null}>('SELECT payload_hash,status,response,failure FROM ouro_verification_runner_requests WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[projectId,actor.id,input.requestId]);
        if(duplicate.rows[0]){
          const row=duplicate.rows[0];if(row.payload_hash!==payloadHash)throw new StoreError('IDEMPOTENCY_CONFLICT','Этот requestId уже использован с другим содержимым.');
          if(row.status==='completed'&&row.response)return {response:{...row.response,replayed:true}};
          if(row.status==='pending'||row.status==='failed'){
            const resultKey=(kind==='runVerification'?'verification-local-result-':'verification-observe-result-')+hash({actor:actor.id,requestId:input.requestId});
            const recovered=await tx.query<{response:CommandResult}>('SELECT response FROM ouro_command_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[projectId,observerActor.id,resultKey]);
            if(recovered.rows[0]){await tx.query("UPDATE ouro_verification_runner_requests SET status='completed',response=$4::jsonb,failure=NULL,finished_at=now() WHERE project_id=$1 AND actor_id=$2 AND request_id=$3 AND status IN ('pending','failed')",[projectId,actor.id,input.requestId,JSON.stringify(recovered.rows[0].response)]);return {response:{...recovered.rows[0].response,replayed:true}};}
          }
          if(row.status==='failed'&&row.failure)throw new StoreError(row.failure.code,row.failure.message,row.failure.details);
          throw new StoreError('RUNNER_OUTCOME_UNKNOWN','Операция уже зарезервирована. Сохраните прежний requestId/body и проверьте исход; новый процесс автоматически не запускается.',{outcomeUnknown:true,requestId:input.requestId});
        }
        const state=replay(await readEvents(tx,0,projectId),projectId);
        if(state.version!==input.expectedVersion)throw new StoreError('VERSION_CONFLICT','Состояние изменилось. Перечитайте проект.',{currentVersion:state.version});
        await tx.query("INSERT INTO ouro_verification_runner_requests(project_id,actor_id,request_id,payload_hash,request,status) VALUES($1,$2,$3,$4,$5::jsonb,'pending')",[projectId,actor.id,input.requestId,payloadHash,JSON.stringify({kind,input})]);
        return {state};
      }));
      if('response'in prepared)return prepared.response!;
      let response:CommandResult;
      try{response=await work(prepared.state!);}catch(error){
        const failure={code:(error as {code?:string}).code??'VERIFICATION_RUNTIME_ERROR',message:(error as Error).message,details:(error as {details?:Record<string,unknown>}).details};
        await serialize(()=>db.query("UPDATE ouro_verification_runner_requests SET status='failed',failure=$4::jsonb,finished_at=now() WHERE project_id=$1 AND actor_id=$2 AND request_id=$3 AND status='pending'",[projectId,actor.id,input.requestId,JSON.stringify(failure)]));
        throw error;
      }
      try{
        await serialize(()=>db.query("UPDATE ouro_verification_runner_requests SET status='completed',response=$4::jsonb,finished_at=now() WHERE project_id=$1 AND actor_id=$2 AND request_id=$3 AND status='pending'",[projectId,actor.id,input.requestId,JSON.stringify(response)]));
      }catch{
        // The immutable receipt already committed. Never turn that success into a failed admission.
        throw new StoreError('RUNNER_OUTCOME_UNKNOWN','Доменный результат сохранён; подтверждение ответа не завершено. Повторите прежний requestId и тело для получения сохранённой квитанции.',{outcomeUnknown:true,requestId:input.requestId});
      }
      return response;
    })();
    runtimeInFlight.set(key,{digest:payloadHash,promise});owner.runtimeOperations.add(promise);void promise.finally(()=>{runtimeInFlight.delete(key);owner.runtimeOperations.delete(promise);}).catch(()=>undefined);return promise;
  };
  const observeVerification=(body:unknown,actor:Actor):Promise<CommandResult>=>{
    if(owner.deploymentMode()==='cloud')return Promise.reject(new StoreError('FORBIDDEN','Облачный проект не читает папки и не запускает тесты на сервере.'));
    const parsed=verificationObserveInputSchema.safeParse(body);if(!parsed.success)return Promise.reject(new StoreError('VALIDATION_ERROR','Некорректная конфигурация наблюдения.'));
    const input=parsed.data;
    return runtimeOperation('observeVerification',input,actor,async initial=>{
      const existing=initial.verificationObservationConfigs.findLast(item=>item.verificationRevisionId===input.verificationRevisionId);
      const config=input.config??existing?.config,binding=await observerBinding();
      if(!config||!binding)throw new StoreError('INVALID_TRANSITION','Нужно определить наблюдаемые файлы и папку проекта.');
      const observation=await observeVerificationWorkspace(binding,config,owner.capabilities);
      // Configuration admission and its first observation are one atomic transaction.
      return serialize(()=>db.transaction(async tx=>{
        await lockProject(tx);
        let state=replay(await readEvents(tx,0,projectId),projectId);
        if(state.version!==initial.version)throw new StoreError('VERSION_CONFLICT','Состояние изменилось во время наблюдения.',{currentVersion:state.version});
        if(input.config){
          const configured=await commitCommandInTransaction(tx,{type:'configureVerificationObservation',verificationRevisionId:input.verificationRevisionId,config:input.config,reason:input.reason!,requestId:'verification-configure-'+hash({actor:actor.id,requestId:input.requestId}),expectedVersion:state.version},actor);
          state=configured.state;
        }
        const current=state.verificationObservationConfigs.findLast(item=>item.verificationRevisionId===input.verificationRevisionId);
        if(!current)throw new StoreError('NOT_FOUND','Конфигурация наблюдения не найдена.');
        return commitCommandInTransaction(tx,{type:'observeVerificationWorkspace',verificationRevisionId:input.verificationRevisionId,configId:current.id,observation,requestId:'verification-observe-result-'+hash({actor:actor.id,requestId:input.requestId}),expectedVersion:state.version},observerActor,true);
      }));
    });
  };
  const runVerification=(body:unknown,actor:Actor):Promise<CommandResult>=>{
    if(owner.deploymentMode()==='cloud')return Promise.reject(new StoreError('FORBIDDEN','Облачный проект не читает папки и не запускает тесты на сервере.'));
    const parsed=verificationRunnerInputSchema.safeParse(body);if(!parsed.success)return Promise.reject(new StoreError('VALIDATION_ERROR','Запуск принимает только назначение, границу и ключ повторного запроса.'));
    const input=parsed.data;
    return runtimeOperation('runVerification',input,actor,async state=>{
      const execution=state.executions.find(item=>item.id===input.executionId),revision=state.revisions.find(item=>item.id===execution?.specRevisionId);
      if(!execution||!revision?.verification)throw new StoreError('NOT_FOUND','Назначение проверочной ревизии не найдено.');
      const config=state.verificationObservationConfigs.findLast(item=>item.verificationRevisionId===revision.id),binding=await observerBinding();
      if(!config||!binding)throw new StoreError('INVALID_TRANSITION','Нужно сначала определить наблюдаемый срез в папке проекта.');
      await serialize(()=>assertRegisteredAgentActive(db,{id:execution.agentId,kind:'agent',projectIds:[projectId]},projectId));
      // Reuse ordinary report guards as a discarded preflight, rather than a second authority machine.
      const probeReport={slice:{productRevision:'preflight',testRevision:'preflight',fixtureRevision:'preflight',environmentDigest:'0'.repeat(64)},scopeCaseIds:input.scopeCaseIds,artifactRef:'preflight://not-a-run',rawReport:JSON.stringify({suites:[],errors:[],stats:{expected:0,unexpected:0,flaky:0,skipped:0}}),startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),...(execution.flowRuntime?.currentRunId?{flowStepRunId:execution.flowRuntime.currentRunId}:{})};
      applyCommand(state,{type:'reportVerificationRun',executionId:execution.id,report:probeReport,requestId:'verification-runtime-preflight',expectedVersion:state.version},actor,{verificationImport:importPlaywrightReport(probeReport,revision.verification)});
      const result=await runLocalVerification({binding,config:config.config,contract:revision.verification,scopeCaseIds:input.scopeCaseIds,submittedBy:actor.id,signal:owner.signal,runtimeDirectory:owner.verificationRuntimeDir,packageRoot:owner.playwrightPackageRoot,...(execution.flowRuntime?.currentRunId?{flowStepRunId:execution.flowRuntime.currentRunId}:{}),shouldStop:async()=>{
        if(owner.signal.aborted)return true;
        const current=await readState(),attempt=current.executions.find(item=>item.id===execution.id),spec=current.specs.find(item=>item.id===execution.specId),target=current.specs.find(item=>item.id===revision.verification!.targetSpecId);
        if(!attempt||attempt.state!=='running'||attempt.stopRequested||spec?.activeRevisionId!==revision.id||target?.activeRevisionId!==revision.verification!.targetRevisionId||current.roadmap.state!=='active')return true;
        try{await serialize(async()=>{await assertHumanActor(db,actor,projectId);await requireProjectRole(db,actor,projectId,['Owner','Contributor']);await assertRegisteredAgentActive(db,{id:execution.agentId,kind:'agent',projectIds:[projectId]},projectId);});return false;}catch{return true;}
      }});
      try{await recordObservation(revision.id,config.id,config.config);}catch(error){if(!['REVISION_CONFLICT','INVALID_TRANSITION','VERSION_CONFLICT'].includes((error as {code:string}).code))throw error;}
      return serialize(()=>db.transaction(async tx=>{
        await lockProject(tx);
        const latest=replay(await readEvents(tx,0,projectId),projectId);
        return commitCommandInTransaction(tx,{type:'reportVerificationRun',executionId:execution.id,report:result.proof.report,requestId:'verification-local-result-'+hash({actor:actor.id,requestId:input.requestId}),expectedVersion:latest.version},observerActor,true,projectId,result.proof);
      }));
    });
  };
  const assertRecoveryOwner=async(tx:Connection,actor:Actor)=>{
    if(owner.deploymentMode()==='cloud')throw new StoreError('FORBIDDEN','Восстановление локальной привязки недоступно в облачном режиме.');
    assertActor(actor,projectId);
    if(actor.kind!=='human'||!['local-human','human-token'].includes(actor.id))throw new StoreError('FORBIDDEN','Восстановление подтверждает доверенный локальный оператор с ролью Owner.');
    await assertRegisteredHumanActive(tx,actor,projectId);
    await requireProjectRole(tx,actor,projectId,['Owner']);
  };
  const recoveryHistory=async(tx:Connection)=>(await tx.query<{content:WorkspaceBindingRecoveryAudit}>('SELECT content FROM ouro_workspace_binding_recoveries WHERE project_id=$1 ORDER BY sequence',[projectId])).rows.map(row=>row.content);
  const hasNonterminalWork=async(tx:Connection)=>replay(await readEvents(tx,0,projectId),projectId).executions.some(execution=>['queued','running','waiting_for_human','paused'].includes(execution.state));
  return {
    ...participants,...drafts,...projects,...userAuth,
    observeVerification,runVerification,
    projectId,
    storage:owner.storage,
    getWorkspaceProject:(id:string):Promise<WorkspaceProject|null>=>serialize(()=>readWorkspaceProject(db,projectIdValue(id))),
    getWorkspaceBinding:():Promise<WorkspaceBinding|null>=>serialize(async()=>workspaceBinding(await readWorkspaceProject(db,projectId))),
    listWorkspaceProjects:(actor:Actor):Promise<WorkspaceProject[]>=>serialize(()=>db.transaction(async tx=>{
      await assertCatalogOperator(tx,actor);
      const result=await tx.query<WorkspaceProjectRow>('SELECT * FROM ouro_workspace_projects ORDER BY created_at,id');
      const projects:WorkspaceProject[]=[];
      for(const row of result.rows)projects.push((await readWorkspaceProject(tx,row.id))!);
      return projects;
    })),
    inspectWorkspaceBindingRecovery:(actor:Actor):Promise<WorkspaceBindingRecoveryInspection>=>serialize(()=>db.transaction(async tx=>{
      // Inspection intentionally performs no registration or other SQL mutation.
      await assertRecoveryOwner(tx,actor);
      const saved=workspaceBinding(await readWorkspaceProject(tx,projectId)),audit=await recoveryHistory(tx);
      if(!saved)return {saved:null,eligible:false,status:'unavailable',origin:'unknown',reason:'У проекта нет привязки к папке.',audit,runtime:{platform:process.platform,node:process.version,uv:process.versions.uv,architecture:process.arch}};
      const inspected=await owner.bindingRecovery.inspect({actorId:actor.id,projectId,binding:saved});
      const {savedBinding,observedBinding,...details}=inspected;
      if(await hasNonterminalWork(tx))return {...details,saved:savedBinding,...(observedBinding?{observed:observedBinding}:{}),eligible:false,status:'conflict',ticket:undefined,expiresAt:undefined,reason:'Восстановление запрещено, пока есть незавершённые исполнения, включая ожидание и паузу.',audit};
      return {...details,saved:savedBinding,...(observedBinding?{observed:observedBinding}:{}),audit};
    })),
    recoverWorkspaceBinding:(body:unknown,actor:Actor):Promise<WorkspaceBindingRecoveryResult>=>serialize(()=>db.transaction(async tx=>{
      await assertRecoveryOwner(tx,actor);
      const input=parseRecoveryInput(body),payloadHash=hash(input);
      await tx.query('SELECT id FROM ouro_workspace_catalog_lock WHERE id=1 FOR UPDATE');
      await lockProject(tx);
      await assertRecoveryOwner(tx,actor);
      // Current authority precedes immutable receipt replay; expiry and binding
      // checks follow it so a committed exact response remains recoverable.
      const duplicate=await tx.query<{payload_hash:string;response:Omit<WorkspaceBindingRecoveryResult,'replayed'>}>('SELECT payload_hash,response FROM ouro_workspace_binding_recovery_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[projectId,actor.id,input.requestId]);
      if(duplicate.rows[0]){
        if(duplicate.rows[0].payload_hash!==payloadHash)throw new StoreError('IDEMPOTENCY_CONFLICT','Этот requestId уже использован для другого восстановления.');
        return {...duplicate.rows[0].response,replayed:true};
      }
      const saved=workspaceBinding(await readWorkspaceProject(tx,projectId));
      if(!saved)throw new StoreError('WORKSPACE_BINDING_CONFLICT','У проекта нет восстанавливаемой привязки папки.');
      if(await hasNonterminalWork(tx))throw new StoreError('WORKSPACE_BINDING_CONFLICT','Сначала завершите незавершённые исполнения; ожидание и пауза также блокируют восстановление.');
      const verified=await owner.bindingRecovery.verify({actorId:actor.id,projectId,binding:saved,ticket:input.ticket});
      const newBinding:WorkspaceBinding={...verified.observedBinding,id:randomUUID()};
      const recovery:WorkspaceBindingRecoveryAudit={recoveryId:randomUUID(),projectId,actorId:actor.id,reason:input.reason,acknowledgeUnknownContinuity:true,oldBinding:saved,newBinding,runtime:verified.runtime,issuedAt:verified.issuedAt,expiresAt:verified.expiresAt,createdAt:new Date().toISOString(),origin:'unknown'};
      await registerActor(tx,actor);
      await tx.query('INSERT INTO ouro_workspace_binding_recoveries(id,project_id,old_binding_id,new_binding_id,content) VALUES($1,$2,$3,$4,$5::jsonb)',[recovery.recoveryId,projectId,saved.id,newBinding.id,JSON.stringify(recovery)]);
      const project=(await readWorkspaceProject(tx,projectId))!;
      const response={project,recovery};
      await tx.query('INSERT INTO ouro_workspace_binding_recovery_receipts(project_id,actor_id,request_id,payload_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)',[projectId,actor.id,input.requestId,payloadHash,JSON.stringify(response)]);
      // A final anchored probe can still abort all operational facts atomically.
      await owner.bindingRecovery.verify({actorId:actor.id,projectId,binding:saved,ticket:input.ticket});
      return {...response,replayed:false};
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
        project=(await readWorkspaceProject(tx,existing.rows[0].id))!;
        await assertWorkspaceFolder(workspaceBinding(project)!);
      }else{
        const id=randomUUID(),bindingId=randomUUID(),name=input.name?.trim()||folder.displayName;
        if(!name||name.length>200||!isWellFormedUnicode(name)||/[\x00-\x1f\x7f]/.test(name))throw new StoreError('VALIDATION_ERROR','Укажите допустимое название проекта.');
        await tx.query("INSERT INTO ouro_projects(id,version,name,slug,created_at) VALUES($1,0,'Project '||left($1::text,8),$1,now())",[id]);
        const initialized=applyCommand(replay([],id),{type:'initializeProject',name,requestId:`workspace-init:${id}`,expectedVersion:0},{...actor,projectIds:[id]});
        await append(tx,initialized.events,initialized.state,id);
        const row=await tx.query<WorkspaceProjectRow>(`INSERT INTO ouro_workspace_projects(id,name,root_path,kind,binding_id,root_dev,root_ino,created_by) VALUES($1,$2,$3,'folder',$4,$5,$6,$7) RETURNING *`,[id,name,folder.canonicalPath,bindingId,folder.identity.dev,folder.identity.ino,actor.id]);
        project=workspaceProject(row.rows[0]);created=true;
      }
      const response={project,created};
      await tx.query('INSERT INTO ouro_workspace_receipts(actor_id,request_id,payload_hash,response) VALUES($1,$2,$3,$4::jsonb)',[actor.id,input.requestId,payloadHash,JSON.stringify(response)]);
      return {...response,replayed:false};
    })),
    importMeridianScope:(input:unknown,actor:Actor,selectedProjectId=projectId):Promise<CommandResult>=>{
      assertActor(actor,selectedProjectId);
      if(actor.kind!=='human')return Promise.reject(new StoreError('FORBIDDEN','Импорт черновика подтверждает человек.'));
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['requestId','expectedVersion','rawDocument','content'].includes(key)))return Promise.reject(new StoreError('VALIDATION_ERROR','Импорт принимает исходный документ, содержание и версию без посторонних полей.'));
      return commitCommand({...structuredClone(input),type:'importMeridianScope'},actor,true,selectedProjectId);
    },
    createGitHubBinding: (input:{executionId:string;repositoryId:number;repositoryFullName:string;ref:string;requestId:string;expectedVersion:number},actor:Actor,selectedProjectId=projectId)=>commitCommand({...input,type:'createGitHubBinding'},actor,true,selectedProjectId),
    enqueueGitHubDelivery: (deliveryId:string,input:NormalizedGitHubPush,selectedProjectId=projectId):Promise<{delivery:PublicGitHubDelivery;duplicate:boolean}>=>serialize(()=>db.transaction(async tx=>{
      if(typeof deliveryId!=='string'||!deliveryId.trim()||deliveryId.length>200||!input||!/^[a-f0-9]{64}$/.test(input.payloadDigest)||!Number.isSafeInteger(input.repositoryId)||input.repositoryId<1||typeof input.repositoryFullName!=='string'||typeof input.ref!=='string'||!Array.isArray(input.commitShas)||input.commitShas.length>2048||input.commitShas.some(sha=>typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha))||!['pending','ignored','needs_review'].includes(input.disposition))throw new StoreError('VALIDATION_ERROR','Некорректная нормализованная доставка GitHub.');
      const payload:NormalizedGitHubPush={repositoryId:input.repositoryId,repositoryFullName:input.repositoryFullName,ref:input.ref,before:input.before,after:input.after,commitShas:[...input.commitShas],payloadDigest:input.payloadDigest,disposition:input.disposition,...(input.reason?{reason:input.reason.slice(0,1000)}:{})};
      await lockProject(tx,selectedProjectId);
      const duplicate=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE d.project_id=$1 AND d.delivery_id=$2`,[selectedProjectId,deliveryId]);
      if(duplicate.rows[0]){
        if(duplicate.rows[0].payload.payloadDigest!==payload.payloadDigest)throw new StoreError('IDEMPOTENCY_CONFLICT','GitHub deliveryId уже принят с другим телом.');
        return {delivery:publicGitHubJob(duplicate.rows[0]),duplicate:true};
      }
      const state=replay(await readEvents(tx,0,selectedProjectId),selectedProjectId),bindingIds=state.githubBindings.filter(binding=>!binding.revokedAt&&binding.repositoryId===payload.repositoryId&&binding.ref===payload.ref).map(binding=>binding.id);
      const status:PublicGitHubDelivery['status']=payload.disposition==='needs_review'?'needs_review':payload.disposition==='ignored'||!bindingIds.length||!payload.commitShas.length?'processed':'pending';
      const reason=payload.reason??(!bindingIds.length?'NO_ACTIVE_BINDING':!payload.commitShas.length?'NO_COMMITS':null),id=randomUUID();
      await tx.query(`INSERT INTO ouro_github_deliveries(id,project_id,delivery_id,payload_digest,payload,binding_ids) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,[id,selectedProjectId,deliveryId,payload.payloadDigest,JSON.stringify(payload),JSON.stringify(bindingIds)]);
      await tx.query(`INSERT INTO ouro_github_jobs(delivery_id,status,reason) VALUES($1,$2,$3)`,[id,status,reason]);
      return {delivery:publicGitHubJob((await jobById(tx,id,selectedProjectId))!),duplicate:false};
    })),
    listGitHubDeliveries: (actor:Actor,selectedProjectId=projectId):Promise<PublicGitHubDelivery[]>=>serialize(()=>db.transaction(async tx=>{
      await assertHumanActor(tx,actor,selectedProjectId);
      const rows=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE d.project_id=$1 ORDER BY d.received_at DESC,d.id LIMIT 100`,[selectedProjectId]);
      return rows.rows.map(publicGitHubJob);
    })),
    claimGitHubDelivery: (claimOptions:{now?:number;leaseMs?:number;projectId?:string}={}):Promise<ClaimedGitHubDelivery|null>=>serialize(()=>db.transaction(async tx=>{
      // The legacy worker retains its global queue; scoped stores stay pinned.
      const now=claimOptions.now??Date.now(),leaseMs=claimOptions.leaseMs??30_000,selectedProjectId=claimOptions.projectId??(projectId===PROJECT_ID?null:projectId);
      if(!Number.isFinite(now)||!Number.isFinite(leaseMs)||leaseMs<100||leaseMs>300_000)throw new StoreError('VALIDATION_ERROR','Некорректная длительность lease.');
      if(selectedProjectId)await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[selectedProjectId]);
      await tx.query(`UPDATE ouro_github_jobs SET status='retryable',last_error='ATTEMPT_LIMIT',lease_token=NULL,lease_until=NULL,updated_at=$1 FROM ouro_github_deliveries d WHERE d.id=ouro_github_jobs.delivery_id AND ($2::text IS NULL OR d.project_id=$2) AND status='processing' AND lease_until<=$1 AND attempts>=5`,[new Date(now).toISOString(),selectedProjectId]);
      const candidates=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE ($1::text IS NULL OR d.project_id=$1) AND j.attempts<5 AND ((j.status IN ('pending','retryable') AND j.next_attempt_at<=$2) OR (j.status='processing' AND j.lease_until<=$2)) ORDER BY d.received_at,d.id LIMIT 1`,[selectedProjectId,new Date(now).toISOString()]);
      const row=candidates.rows[0];if(!row)return null;
      const leaseToken=randomUUID();await tx.query(`UPDATE ouro_github_jobs SET status='processing',attempts=attempts+1,lease_token=$2,lease_until=$3,updated_at=$4 WHERE delivery_id=$1`,[row.id,leaseToken,new Date(now+leaseMs).toISOString(),new Date(now).toISOString()]);
      return {id:row.id,deliveryId:row.delivery_id,projectId:row.project_id,payload:row.payload,bindingIds:row.binding_ids,leaseToken,attempts:row.attempts+1};
    })),
    ingestVerifiedGitHubCommit: (input:{jobId:string;leaseToken:string;bindingId:string;commit:GitHubVerifiedCommit},selectedProjectId=projectId):Promise<{event:DomainEvent;cursor:number;replayed:boolean}>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx,selectedProjectId);
      if(!input||!input.commit||typeof input.bindingId!=='string'||typeof input.commit.fullSha!=='string'||!Number.isSafeInteger(input.commit.repositoryId))throw new StoreError('VALIDATION_ERROR','Некорректный проверенный коммит.');
      const envelope={bindingId:input.bindingId,repositoryId:input.commit.repositoryId,fullSha:input.commit.fullSha},payloadHash=hash(envelope);
      // Semantic receipt is independent of delivery ID, verification time and current version.
      const duplicate=await tx.query<{payload_hash:string;response:{event:DomainEvent;cursor:number}}>('SELECT payload_hash,response FROM ouro_github_commit_receipts WHERE project_id=$1 AND binding_id=$2 AND repository_id=$3 AND full_sha=$4',[selectedProjectId,envelope.bindingId,envelope.repositoryId,envelope.fullSha]);
      if(duplicate.rows[0]){
        if(duplicate.rows[0].payload_hash!==payloadHash)throw new StoreError('IDEMPOTENCY_CONFLICT','Конфликт происхождения коммита.');
        const now=Date.now();
        await tx.query(`UPDATE ouro_github_jobs SET lease_until=$3,updated_at=now() WHERE delivery_id=$1 AND status='processing' AND lease_token=$2 AND lease_until>$4 AND delivery_id IN(SELECT id FROM ouro_github_deliveries WHERE project_id=$5)`,[input.jobId,input.leaseToken,new Date(now+60_000).toISOString(),new Date(now).toISOString(),selectedProjectId]);
        return {...duplicate.rows[0].response,replayed:true};
      }
      const row=assertLease(await jobById(tx,input.jobId,selectedProjectId),input.leaseToken);
      if(!row.binding_ids.includes(input.bindingId)||row.payload.repositoryId!==input.commit.repositoryId||!row.payload.commitShas.includes(input.commit.fullSha))throw new StoreError('FORBIDDEN','Коммит не относится к принятой доставке и её назначению.');
      const state=replay(await readEvents(tx,0,selectedProjectId),selectedProjectId),actor:Actor={id:GITHUB_SERVICE_ID,kind:'service',name:'GitHub · проверенный источник',projectIds:[selectedProjectId]};
      const applied=applyCommand(state,{type:'recordGitHubCommit',requestId:`github:${payloadHash}`,expectedVersion:state.version,bindingId:input.bindingId,deliveryId:row.delivery_id,payloadDigest:row.payload.payloadDigest,commit:input.commit},actor);
      await append(tx,applied.events,applied.state,selectedProjectId);
      const response={event:applied.events[0],cursor:applied.state.version};
      await tx.query(`INSERT INTO ouro_github_commit_receipts(project_id,binding_id,repository_id,full_sha,payload_hash,event_id,response) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[selectedProjectId,envelope.bindingId,envelope.repositoryId,envelope.fullSha,payloadHash,response.event.id,JSON.stringify(response)]);
      await tx.query('UPDATE ouro_github_jobs SET lease_until=$2,updated_at=now() WHERE delivery_id=$1',[row.id,new Date(Date.now()+60_000).toISOString()]);
      return {...response,replayed:false};
    })),
    finishGitHubDelivery: (jobId:string,leaseToken:string,reason?:string,selectedProjectId=projectId):Promise<void>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx,selectedProjectId);assertLease(await jobById(tx,jobId,selectedProjectId),leaseToken);
      await tx.query(`UPDATE ouro_github_jobs SET status='processed',reason=$2,last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE delivery_id=$1`,[jobId,reason?.slice(0,1000)??null]);
    })),
    failGitHubDelivery: (jobId:string,leaseToken:string,error:{code:string;retryAfterMs?:number;permanent?:boolean},selectedProjectId=projectId):Promise<void>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx,selectedProjectId);const row=assertLease(await jobById(tx,jobId,selectedProjectId),leaseToken);
      const safeCodes=new Set(['GITHUB_UNAVAILABLE','VERIFICATION_FAILED','LEASE_LOST','INTERNAL_ERROR','NOT_FOUND','FORBIDDEN','VALIDATION_ERROR']);
      const safeCode=safeCodes.has(error.code)?error.code:'INTERNAL_ERROR';
      const delay=Math.max(1000,Math.min(3_600_000,Number.isFinite(error.retryAfterMs)?error.retryAfterMs!:1000*2**row.attempts));
      await tx.query(`UPDATE ouro_github_jobs SET status=$2,last_error=$3,lease_token=NULL,lease_until=NULL,next_attempt_at=$4,updated_at=now() WHERE delivery_id=$1`,[jobId,error.permanent?'needs_review':'retryable',safeCode,new Date(Date.now()+delay).toISOString()]);
    })),
    retryGitHubDelivery: (jobId:string,actor:Actor,selectedProjectId=projectId):Promise<PublicGitHubDelivery>=>serialize(()=>db.transaction(async tx=>{
      await assertHumanActor(tx,actor,selectedProjectId);await requireProjectRole(tx,actor,selectedProjectId,['Owner','Contributor']);await lockProject(tx,selectedProjectId);const row=await jobById(tx,jobId,selectedProjectId);
      if(!row)throw new StoreError('NOT_FOUND','Доставка GitHub не найдена.');
      if(row.status!=='retryable')throw new StoreError('INVALID_TRANSITION','Повтор доступен только после временной ошибки; неполный push требует проверки.');
      await tx.query(`UPDATE ouro_github_jobs SET status='pending',attempts=0,last_error=NULL,next_attempt_at=now(),lease_token=NULL,lease_until=NULL,updated_at=now() WHERE delivery_id=$1`,[jobId]);
      return publicGitHubJob((await jobById(tx,jobId,selectedProjectId))!);
    })),
    createAgent: (name:string,actor:Actor,selectedProjectId=projectId):Promise<{agent:AgentRegistration;token:string}> => serialize(async()=>{
      assertActor(actor,selectedProjectId);
      if(actor.kind!=='human')throw new StoreError('FORBIDDEN','Регистрацией агентов управляет человек.');
      if(typeof name!=='string'||!name.trim()||name.length>120||name.includes('\0')||!isWellFormedUnicode(name))throw new StoreError('VALIDATION_ERROR','Имя агента должно содержать от 1 до 120 корректных символов.');
      return db.transaction(async tx=>{
        await assertHumanActor(tx,actor,selectedProjectId);await requireProjectRole(tx,actor,selectedProjectId,['Owner']);
        const id=randomUUID();
        const token=`ouro_agent_${randomBytes(32).toString('base64url')}`;
        await registerActor(tx,{id,kind:'agent',name:name.trim(),projectIds:[selectedProjectId]});
        await tx.query('INSERT INTO ouro_agent_registrations (id,project_id,name,created_by) VALUES ($1,$2,$3,$4)',[id,selectedProjectId,name.trim(),actor.id]);
        await tx.query('INSERT INTO ouro_agent_credentials (agent_id,token_hash) VALUES ($1,$2)',[id,tokenHash(token)]);
        await tx.query('INSERT INTO ouro_agent_assignments(agent_id,project_id,assigned_by) VALUES($1,$2,$3)',[id,selectedProjectId,actor.id]);
        const result=await tx.query<AgentRow>(`${agentSelection} WHERE r.id=$1 AND r.project_id=$2`,[id,selectedProjectId]);
        return {agent:publicAgent(result.rows[0]),token};
      });
    }),
    assignAgent: (id:string,projectId:string,actor:Actor):Promise<AgentRegistration>=>serialize(()=>db.transaction(async tx=>{
      await assertHumanActor(tx,actor,projectId);await requireProjectRole(tx,actor,projectId,['Owner']);
      const registered=await tx.query('SELECT id FROM ouro_agent_registrations WHERE id=$1',[id]);
      if(!registered.rows.length)throw new StoreError('NOT_FOUND','Агент не найден.');
      const revoked=await tx.query('SELECT agent_id FROM ouro_agent_assignment_revocations WHERE agent_id=$1 AND project_id=$2',[id,projectId]);
      if(revoked.rows.length)throw new StoreError('FORBIDDEN','Отозванное назначение нельзя восстановить; зарегистрируйте нового агента.');
      await tx.query('INSERT INTO ouro_agent_assignments(agent_id,project_id,assigned_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,projectId,actor.id]);
      await tx.query('INSERT INTO ouro_administrative_facts(id,project_id,actor_id,action,target_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),projectId,actor.id,'agent.assigned',id]);
      const result=await tx.query<AgentRow>(`SELECT r.id,a.project_id,r.name,r.created_at,r.created_by,p.last_seen_at,v.revoked_at FROM ouro_agent_assignments a JOIN ouro_agent_registrations r ON r.id=a.agent_id LEFT JOIN ouro_agent_presence p ON p.agent_id=r.id LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id WHERE r.id=$1 AND a.project_id=$2`,[id,projectId]);
      return publicAgent(result.rows[0]);
    })),
    listAgents: (actor:Actor,selectedProjectId=projectId):Promise<AgentRegistration[]> => serialize(()=>db.transaction(async tx=>{
      await assertHumanActor(tx,actor,selectedProjectId);
      const result=await tx.query<AgentRow>(`SELECT r.id,a.project_id,r.name,r.created_at,r.created_by,p.last_seen_at,COALESCE(v.revoked_at,ar.revoked_at) AS revoked_at FROM ouro_agent_assignments a JOIN ouro_agent_registrations r ON r.id=a.agent_id LEFT JOIN ouro_agent_presence p ON p.agent_id=r.id LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id LEFT JOIN ouro_agent_assignment_revocations ar ON ar.agent_id=r.id AND ar.project_id=a.project_id WHERE a.project_id=$1 ORDER BY r.created_at,r.id`,[selectedProjectId]);
      return result.rows.map(publicAgent);
    })),
    revokeAgent: (id:string,actor:Actor,selectedProjectId=projectId):Promise<AgentRegistration> => serialize(()=>db.transaction(async tx=>{
      await assertHumanActor(tx,actor,selectedProjectId);await requireProjectRole(tx,actor,selectedProjectId,['Owner']);
      await lockProject(tx,selectedProjectId);
      const found=await tx.query<AgentRow>(`SELECT r.id,a.project_id,r.name,r.created_at,r.created_by,p.last_seen_at,v.revoked_at FROM ouro_agent_assignments a JOIN ouro_agent_registrations r ON r.id=a.agent_id LEFT JOIN ouro_agent_presence p ON p.agent_id=r.id LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id WHERE r.id=$1 AND a.project_id=$2`,[id,selectedProjectId]);
      if(!found.rows.length)throw new StoreError('NOT_FOUND','Агент не найден.');
      await tx.query('INSERT INTO ouro_agent_assignment_revocations(agent_id,project_id,revoked_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,selectedProjectId,actor.id]);
      await tx.query('INSERT INTO ouro_administrative_facts(id,project_id,actor_id,action,target_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),selectedProjectId,actor.id,'agent.assignment_revoked',id]);
      const result=await tx.query<AgentRow>(`SELECT r.id,a.project_id,r.name,r.created_at,r.created_by,p.last_seen_at,COALESCE(v.revoked_at,ar.revoked_at) AS revoked_at FROM ouro_agent_assignments a JOIN ouro_agent_registrations r ON r.id=a.agent_id LEFT JOIN ouro_agent_presence p ON p.agent_id=r.id LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id LEFT JOIN ouro_agent_assignment_revocations ar ON ar.agent_id=r.id AND ar.project_id=a.project_id WHERE r.id=$1 AND a.project_id=$2`,[id,selectedProjectId]);
      return publicAgent(result.rows[0]);
    })),
    authenticateAgentToken: (token:string):Promise<Actor|null> => serialize(async()=>{
      if(typeof token!=='string'||!/^ouro_agent_[A-Za-z0-9_-]{43}$/.test(token))return null;
      return db.transaction(async tx=>{
        const result=await tx.query<{id:string;name:string}>(`SELECT r.id,r.name FROM ouro_agent_credentials c
          JOIN ouro_agent_registrations r ON r.id=c.agent_id LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id
          WHERE c.token_hash=$1 AND v.agent_id IS NULL`,[tokenHash(token)]);
        const found=result.rows[0];if(!found)return null;
        // Scoped stores resolve only their own assignment. The legacy root can
        // resolve shared hosted agents, but never implicitly folder projects.
        const assignments=await tx.query<{project_id:string}>(`SELECT a.project_id FROM ouro_agent_assignments a LEFT JOIN ouro_agent_assignment_revocations r ON r.agent_id=a.agent_id AND r.project_id=a.project_id LEFT JOIN ouro_workspace_projects w ON w.id=a.project_id WHERE a.agent_id=$1 AND r.agent_id IS NULL AND (a.project_id=$2 OR ($2=$3 AND (a.project_id=$3 OR w.id IS NULL))) ORDER BY a.project_id`,[found.id,projectId,PROJECT_ID]);
        if(!assignments.rows.length)return null;
        await tx.query('INSERT INTO ouro_agent_presence (agent_id,last_seen_at) VALUES ($1,now()) ON CONFLICT (agent_id) DO UPDATE SET last_seen_at=excluded.last_seen_at',[found.id]);
        return {id:found.id,kind:'agent',name:found.name,projectIds:assignments.rows.map(row=>row.project_id)};
      });
    }),
    getProject: (selectedProjectId=projectId,actor?:Actor) => serialize(async () => db.transaction(async tx=>{
      if(actor){assertActor(actor,selectedProjectId);if(actor.kind==='human')await requireProjectRole(tx,actor,selectedProjectId);else if(actor.kind==='agent')await assertRegisteredAgentActive(tx,actor,selectedProjectId);}
      return replay(await readEvents(tx,0,selectedProjectId),selectedProjectId);
    })),
    getEvents: (after = 0,selectedProjectId=projectId,actor?:Actor) => serialize(async () => {
      if (!Number.isSafeInteger(after) || after < 0) throw new StoreError('VALIDATION_ERROR', 'Некорректный курсор событий.');
      return db.transaction(async tx => {
        if(actor){assertActor(actor,selectedProjectId);if(actor.kind==='human')await requireProjectRole(tx,actor,selectedProjectId);else if(actor.kind==='agent')await assertRegisteredAgentActive(tx,actor,selectedProjectId);}
        const row = await tx.query<{ version: string | number }>('SELECT version FROM ouro_projects WHERE id=$1 FOR SHARE', [selectedProjectId]);
        const cursor = Number(row.rows[0]?.version ?? 0);
        if (after > cursor) throw new StoreError('CURSOR_AHEAD', 'Курсор клиента опережает историю проекта.', { cursor });
        return { events: await readEvents(tx,after,selectedProjectId), cursor };
      });
    }),
    executeCommand: (body:unknown,actor:Actor,selectedProjectId=projectId)=>commitCommand(body,actor,false,selectedProjectId),
    /** Used by database checks/tests; application routes never expose raw SQL. */
    inspect: <T = Row>(sql: string, params?: unknown[]) => serialize(() => db.query<T>(sql, params)),
    close:owner.close,
    /** Запускает единственный observer timer после успешного bootstrap. */
    startBackgroundWork:owner.startBackgroundWork,
    /** Отменяет новые фоновые циклы и ждёт уже выполняющиеся операции до DB close. */
    stopBackgroundWork:owner.stopBackgroundWork,
  };
}

export type Store = ReturnType<typeof createProjectStore>&{forProject:(id:string)=>Promise<Store>};
export type GitHubStore=Store;
const globalStore = globalThis as typeof globalThis & { __ouroStore?: Promise<Store> };
function currentStore(): Promise<Store> {
  return globalStore.__ouroStore ??= createStore({ databaseUrl: process.env.DATABASE_URL, dataDir: process.env.OURO_DATA_DIR, mailer: createSmtpMailerFromEnv() });
}
export const getGitHubStore=currentStore;
export const getWorkspaceStore=currentStore;
export const getParticipantRegistry=currentStore;
export const getCollaborativeDraftStore=currentStore;
export const getUserAuth=currentStore;
export async function resolveParticipantIdentity(id:string){return (await currentStore()).resolveParticipantIdentity(id);}
export async function authenticateParticipantCredential(credential:string){return (await currentStore()).authenticateParticipantCredential(credential);}
export const getStorageMode = () => process.env.DATABASE_URL ? 'postgres' as const : 'embedded-postgres' as const;
export async function getProject(projectId=PROJECT_ID,actor?:Actor) { return (await currentStore()).getProject(projectId,actor); }
export async function getEvents(after = 0,projectId=PROJECT_ID,actor?:Actor) { return (await currentStore()).getEvents(after,projectId,actor); }
export async function executeCommand(command: unknown, actor: Actor,projectId=PROJECT_ID) { return (await currentStore()).executeCommand(command, actor,projectId); }
export async function importMeridianScope(input:unknown,actor:Actor,projectId=PROJECT_ID){return (await currentStore()).importMeridianScope(input,actor,projectId);}
export async function createAgent(name:string,actor:Actor,projectId=PROJECT_ID) {return (await currentStore()).createAgent(name,actor,projectId);}
export async function listAgents(actor:Actor,projectId=PROJECT_ID) {return (await currentStore()).listAgents(actor,projectId);}
export async function revokeAgent(agentId:string,actor:Actor,projectId=PROJECT_ID) {return (await currentStore()).revokeAgent(agentId,actor,projectId);}
export async function authenticateAgentToken(token:string) {return (await currentStore()).authenticateAgentToken(token);}
