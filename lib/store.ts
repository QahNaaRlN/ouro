import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { applyCommand, createSeedEvents, replay, AGENT_ID, GITHUB_SERVICE_ID, PROJECT_ID } from '../packages/core/src';
import type { Actor, Command, DomainEvent, GitHubVerifiedCommit, ProjectState } from '../packages/core/src';
import type { NormalizedGitHubPush } from './github/verification';

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
export type StoreOptions = { dataDir?: string; databaseUrl?: string; seedEvents?: DomainEvent[] };
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

function assertActor(actor: Actor) {
  if (!actor || !['human', 'agent', 'service'].includes(actor.kind) || typeof actor.id !== 'string' || !actor.id || !Array.isArray(actor.projectIds) || !actor.projectIds.includes(PROJECT_ID)) {
    throw new StoreError('FORBIDDEN', 'Участник не имеет доступа к этому проекту.');
  }
}

async function registerActor(tx: Connection, actor: Actor) {
  await tx.query('INSERT INTO ouro_principals (id, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING', [actor.id, actor.kind]);
  const found = await tx.query<{ kind: string }>('SELECT kind FROM ouro_principals WHERE id=$1', [actor.id]);
  if (found.rows[0]?.kind !== actor.kind) throw new StoreError('FORBIDDEN', 'Нельзя изменить тип зарегистрированного участника.');
}

async function assertHumanActor(tx:Connection,actor:Actor) {
  assertActor(actor);
  if(actor.kind!=='human')throw new StoreError('FORBIDDEN','Регистрацией и доступом агентов управляет человек.');
  await registerActor(tx,actor);
}

async function assertRegisteredAgentActive(tx:Connection,actor:Actor) {
  if(actor.kind!=='agent')return;
  const revoked=await tx.query('SELECT agent_id FROM ouro_agent_revocations WHERE agent_id=$1',[actor.id]);
  if(revoked.rows.length)throw new StoreError('FORBIDDEN','Доступ агента отозван человеком.');
}

async function assertAssignmentActive(tx:Connection,command:Command) {
  if(command.type!=='startExecution'&&command.type!=='authorizeRemediation')return;
  if(typeof command.agentId!=='string'||!command.agentId)throw new StoreError('VALIDATION_ERROR','Нужен agentId исполнителя.');
  // The seed simulator remains an explicit separate choice. All external
  // assignments require a live registration in the current project.
  if(command.agentId===AGENT_ID)return;
  const found=await tx.query<{id:string}>(`SELECT r.id FROM ouro_agent_registrations r
    LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id
    WHERE r.id=$1 AND r.project_id=$2 AND v.agent_id IS NULL`,[command.agentId,PROJECT_ID]);
  if(!found.rows.length)throw new StoreError('FORBIDDEN','Назначение требует действующего зарегистрированного агента этого проекта.');
}

async function readEvents(tx: Connection, after = 0): Promise<DomainEvent[]> {
  const result = await tx.query<{ event: DomainEvent }>('SELECT event FROM ouro_domain_events WHERE project_id=$1 AND version>$2 ORDER BY version', [PROJECT_ID, after]);
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
    await tx.query('INSERT INTO ouro_specs (id,project_id,human_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [spec.id, PROJECT_ID, spec.humanId]);
  }
  for (const revision of state.revisions) {
    await tx.query(`INSERT INTO ouro_spec_revisions (id,spec_id,revision,content,content_hash)
      VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT DO NOTHING`, [revision.id, revision.specId, revision.revision, JSON.stringify(revision), hash(revision)]);
    const persisted = await tx.query<{ content_hash: string }>('SELECT content_hash FROM ouro_spec_revisions WHERE id=$1', [revision.id]);
    if (persisted.rows[0]?.content_hash !== hash(revision)) throw new StoreError('IMMUTABLE_REVISION_CONFLICT', 'Содержание сохранённой ревизии изменилось.');
  }
  await tx.query('UPDATE ouro_projects SET version=$2 WHERE id=$1', [PROJECT_ID, state.version]);
}

export async function createStore(options: StoreOptions = {}) {
  const db = await openDatabase(options);
  const migrations = await Promise.all(['001_initial.sql','002_agents.sql','003_github.sql'].map(file=>readFile(path.join(process.cwd(),'db','migrations',file),'utf8')));
  await db.transaction(async tx => {
    // External PostgreSQL may have multiple app processes initializing together.
    if (options.databaseUrl) await tx.query('SELECT pg_advisory_xact_lock(187652019)');
    for(const migration of migrations)await tx.exec(migration);
    await tx.query('INSERT INTO ouro_projects (id,version) VALUES ($1,0) ON CONFLICT DO NOTHING', [PROJECT_ID]);
    const row = await tx.query<{ version: string | number }>('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE', [PROJECT_ID]);
    if (Number(row.rows[0]?.version) === 0) {
      const events = options.seedEvents ?? createSeedEvents();
      if (events.length) await append(tx, events, replay(events, PROJECT_ID));
    }
  });

  // PGlite serves one process. Its transaction queue and this queue ensure reads
  // never interleave with an unfinished command. PostgreSQL also locks the project
  // row, providing the same guarantee between separate server processes.
  let tail: Promise<unknown> = Promise.resolve();
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn); tail = run.catch(() => undefined); return run;
  }
  function commitCommand(body:unknown,actor:Actor,internal=false):Promise<CommandResult>{return serialize(async()=>{
    assertActor(actor);
    if(!body||typeof body!=='object'||Array.isArray(body))throw new StoreError('VALIDATION_ERROR','Ожидается JSON-команда.');
    const command=body as Command;
    if(!internal&&['createGitHubBinding','recordGitHubCommit'].includes(command.type))throw new StoreError('FORBIDDEN','Проверяемые GitHub-команды доступны только серверному адаптеру.');
    if(typeof command.requestId!=='string'||command.requestId.length<8||command.requestId.length>200||!Number.isSafeInteger(command.expectedVersion)||command.expectedVersion<0)throw new StoreError('VALIDATION_ERROR','Нужны requestId и неотрицательная expectedVersion.');
    const payloadHash=hash(body);
    return db.transaction(async tx=>{
      await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[PROJECT_ID]);
      await registerActor(tx,actor);await assertRegisteredAgentActive(tx,actor);
      const duplicate=await tx.query<{payload_hash:string;response:Omit<CommandResult,'replayed'>}>('SELECT payload_hash,response FROM ouro_command_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[PROJECT_ID,actor.id,command.requestId]);
      if(duplicate.rows[0]){
        if(duplicate.rows[0].payload_hash!==payloadHash)throw new StoreError('IDEMPOTENCY_CONFLICT','Этот requestId уже использован с другим содержимым.');
        return {...duplicate.rows[0].response,replayed:true};
      }
      await assertAssignmentActive(tx,command);
      const state=replay(await readEvents(tx),PROJECT_ID),applied=applyCommand(state,command,actor);
      await append(tx,applied.events,applied.state);
      const response={state:applied.state,events:applied.events,cursor:applied.state.version};
      await tx.query(`INSERT INTO ouro_command_receipts (actor_id,project_id,request_id,payload_hash,response,cursor) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,[actor.id,PROJECT_ID,command.requestId,payloadHash,JSON.stringify(response),response.cursor]);
      return {...response,replayed:false};
    });
  });}
  const lockProject=(tx:Connection)=>tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[PROJECT_ID]);
  const jobById=async(tx:Connection,id:string)=>{
    const result=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE d.project_id=$1 AND d.id=$2`,[PROJECT_ID,id]);
    return result.rows[0]??null;
  };
  const assertLease=(row:GitHubJobRow|null,leaseToken:string)=>{
    if(!row||row.status!=='processing'||row.lease_token!==leaseToken)throw new StoreError('LEASE_LOST','Попытка обработки очереди больше не владеет lease.');
    if(!row.lease_until||!(new Date(row.lease_until).getTime()>Date.now()))throw new StoreError('LEASE_LOST','Срок обработки очереди истёк; нужен новый lease.');
    return row;
  };
  return {
    storage: options.databaseUrl ? 'postgres' as const : 'embedded-postgres' as const,
    createGitHubBinding: (input:{executionId:string;repositoryId:number;repositoryFullName:string;ref:string;requestId:string;expectedVersion:number},actor:Actor)=>commitCommand({...input,type:'createGitHubBinding'},actor,true),
    enqueueGitHubDelivery: (deliveryId:string,input:NormalizedGitHubPush):Promise<{delivery:PublicGitHubDelivery;duplicate:boolean}>=>serialize(()=>db.transaction(async tx=>{
      if(typeof deliveryId!=='string'||!deliveryId.trim()||deliveryId.length>200||!input||!/^[a-f0-9]{64}$/.test(input.payloadDigest)||!Number.isSafeInteger(input.repositoryId)||input.repositoryId<1||typeof input.repositoryFullName!=='string'||typeof input.ref!=='string'||!Array.isArray(input.commitShas)||input.commitShas.length>2048||input.commitShas.some(sha=>typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha))||!['pending','ignored','needs_review'].includes(input.disposition))throw new StoreError('VALIDATION_ERROR','Некорректная нормализованная доставка GitHub.');
      // Copy only compact known fields. Raw body, signatures and credentials never enter SQL.
      const payload:NormalizedGitHubPush={repositoryId:input.repositoryId,repositoryFullName:input.repositoryFullName,ref:input.ref,before:input.before,after:input.after,commitShas:[...input.commitShas],payloadDigest:input.payloadDigest,disposition:input.disposition,...(input.reason?{reason:input.reason.slice(0,1000)}:{})};
      await lockProject(tx);
      const duplicate=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE d.project_id=$1 AND d.delivery_id=$2`,[PROJECT_ID,deliveryId]);
      if(duplicate.rows[0]){
        if(duplicate.rows[0].payload.payloadDigest!==payload.payloadDigest)throw new StoreError('IDEMPOTENCY_CONFLICT','GitHub deliveryId уже принят с другим телом.');
        return {delivery:publicGitHubJob(duplicate.rows[0]),duplicate:true};
      }
      const state=replay(await readEvents(tx),PROJECT_ID),bindingIds=state.githubBindings.filter(binding=>!binding.revokedAt&&binding.repositoryId===payload.repositoryId&&binding.ref===payload.ref).map(binding=>binding.id);
      const status:PublicGitHubDelivery['status']=payload.disposition==='needs_review'?'needs_review':payload.disposition==='ignored'||!bindingIds.length||!payload.commitShas.length?'processed':'pending';
      const reason=payload.reason??(!bindingIds.length?'NO_ACTIVE_BINDING':!payload.commitShas.length?'NO_COMMITS':null),id=randomUUID();
      await tx.query(`INSERT INTO ouro_github_deliveries(id,project_id,delivery_id,payload_digest,payload,binding_ids) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,[id,PROJECT_ID,deliveryId,payload.payloadDigest,JSON.stringify(payload),JSON.stringify(bindingIds)]);
      await tx.query(`INSERT INTO ouro_github_jobs(delivery_id,status,reason) VALUES($1,$2,$3)`,[id,status,reason]);
      return {delivery:publicGitHubJob((await jobById(tx,id))!),duplicate:false};
    })),
    listGitHubDeliveries: (actor:Actor):Promise<PublicGitHubDelivery[]>=>serialize(()=>db.transaction(async tx=>{
      await assertHumanActor(tx,actor);
      const rows=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE d.project_id=$1 ORDER BY d.received_at DESC,d.id LIMIT 100`,[PROJECT_ID]);
      return rows.rows.map(publicGitHubJob);
    })),
    claimGitHubDelivery: (claimOptions:{now?:number;leaseMs?:number}={}):Promise<ClaimedGitHubDelivery|null>=>serialize(()=>db.transaction(async tx=>{
      const now=claimOptions.now??Date.now(),leaseMs=claimOptions.leaseMs??30_000;
      if(!Number.isFinite(now)||!Number.isFinite(leaseMs)||leaseMs<100||leaseMs>300_000)throw new StoreError('VALIDATION_ERROR','Некорректная длительность lease.');
      await lockProject(tx);
      await tx.query(`UPDATE ouro_github_jobs SET status='retryable',last_error='ATTEMPT_LIMIT',lease_token=NULL,lease_until=NULL,updated_at=$1 WHERE status='processing' AND lease_until<=$1 AND attempts>=5`,[new Date(now).toISOString()]);
      const candidates=await tx.query<GitHubJobRow>(`${githubJobSelection} WHERE d.project_id=$1 AND j.attempts<5 AND ((j.status IN ('pending','retryable') AND j.next_attempt_at<=$2) OR (j.status='processing' AND j.lease_until<=$2)) ORDER BY d.received_at,d.id LIMIT 1`,[PROJECT_ID,new Date(now).toISOString()]);
      const row=candidates.rows[0];if(!row)return null;
      const leaseToken=randomUUID();await tx.query(`UPDATE ouro_github_jobs SET status='processing',attempts=attempts+1,lease_token=$2,lease_until=$3,updated_at=$4 WHERE delivery_id=$1`,[row.id,leaseToken,new Date(now+leaseMs).toISOString(),new Date(now).toISOString()]);
      return {id:row.id,deliveryId:row.delivery_id,payload:row.payload,bindingIds:row.binding_ids,leaseToken,attempts:row.attempts+1};
    })),
    ingestVerifiedGitHubCommit: (input:{jobId:string;leaseToken:string;bindingId:string;commit:GitHubVerifiedCommit}):Promise<{event:DomainEvent;cursor:number;replayed:boolean}>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx);
      if(!input||!input.commit||typeof input.bindingId!=='string'||typeof input.commit.fullSha!=='string'||!Number.isSafeInteger(input.commit.repositoryId))throw new StoreError('VALIDATION_ERROR','Некорректный проверенный коммит.');
      const envelope={bindingId:input.bindingId,repositoryId:input.commit.repositoryId,fullSha:input.commit.fullSha},payloadHash=hash(envelope);
      // Semantic receipt is independent of delivery ID, verification time and current version.
      const duplicate=await tx.query<{payload_hash:string;response:{event:DomainEvent;cursor:number}}>('SELECT payload_hash,response FROM ouro_github_commit_receipts WHERE project_id=$1 AND binding_id=$2 AND repository_id=$3 AND full_sha=$4',[PROJECT_ID,envelope.bindingId,envelope.repositoryId,envelope.fullSha]);
      if(duplicate.rows[0]){
        if(duplicate.rows[0].payload_hash!==payloadHash)throw new StoreError('IDEMPOTENCY_CONFLICT','Конфликт происхождения коммита.');
        // A retry may revisit already imported SHAs before reaching the remainder.
        // Renew only a still-current, unexpired lease. Reading an old receipt
        // remains idempotent, but it cannot revive ownership after its deadline.
        const now=Date.now();
        await tx.query(`UPDATE ouro_github_jobs SET lease_until=$3,updated_at=now() WHERE delivery_id=$1 AND status='processing' AND lease_token=$2 AND lease_until>$4`,[input.jobId,input.leaseToken,new Date(now+60_000).toISOString(),new Date(now).toISOString()]);
        return {...duplicate.rows[0].response,replayed:true};
      }
      const row=assertLease(await jobById(tx,input.jobId),input.leaseToken);
      if(!row.binding_ids.includes(input.bindingId)||row.payload.repositoryId!==input.commit.repositoryId||!row.payload.commitShas.includes(input.commit.fullSha))throw new StoreError('FORBIDDEN','Коммит не относится к принятой доставке и её назначению.');
      const state=replay(await readEvents(tx),PROJECT_ID),actor:Actor={id:GITHUB_SERVICE_ID,kind:'service',name:'GitHub · проверенный источник',projectIds:[PROJECT_ID]};
      const applied=applyCommand(state,{type:'recordGitHubCommit',requestId:`github:${payloadHash}`,expectedVersion:state.version,bindingId:input.bindingId,deliveryId:row.delivery_id,payloadDigest:row.payload.payloadDigest,commit:input.commit},actor);
      await append(tx,applied.events,applied.state);
      const response={event:applied.events[0],cursor:applied.state.version};
      await tx.query(`INSERT INTO ouro_github_commit_receipts(project_id,binding_id,repository_id,full_sha,payload_hash,event_id,response) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[PROJECT_ID,envelope.bindingId,envelope.repositoryId,envelope.fullSha,payloadHash,response.event.id,JSON.stringify(response)]);
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
      await assertHumanActor(tx,actor);await lockProject(tx);const row=await jobById(tx,jobId);
      if(!row)throw new StoreError('NOT_FOUND','Доставка GitHub не найдена.');
      if(row.status!=='retryable')throw new StoreError('INVALID_TRANSITION','Повтор доступен только после временной ошибки; неполный push требует проверки.');
      await tx.query(`UPDATE ouro_github_jobs SET status='pending',attempts=0,last_error=NULL,next_attempt_at=now(),lease_token=NULL,lease_until=NULL,updated_at=now() WHERE delivery_id=$1`,[jobId]);
      return publicGitHubJob((await jobById(tx,jobId))!);
    })),
    createAgent: (name:string,actor:Actor):Promise<{agent:AgentRegistration;token:string}> => serialize(async()=>{
      assertActor(actor);
      if(actor.kind!=='human')throw new StoreError('FORBIDDEN','Регистрацией агентов управляет человек.');
      if(typeof name!=='string'||!name.trim()||name.length>120)throw new StoreError('VALIDATION_ERROR','Имя агента должно содержать от 1 до 120 символов.');
      return db.transaction(async tx=>{
        await assertHumanActor(tx,actor);
        const id=randomUUID();
        const token=`ouro_agent_${randomBytes(32).toString('base64url')}`;
        await registerActor(tx,{id,kind:'agent',name:name.trim(),projectIds:[PROJECT_ID]});
        await tx.query('INSERT INTO ouro_agent_registrations (id,project_id,name,created_by) VALUES ($1,$2,$3,$4)',[id,PROJECT_ID,name.trim(),actor.id]);
        await tx.query('INSERT INTO ouro_agent_credentials (agent_id,token_hash) VALUES ($1,$2)',[id,tokenHash(token)]);
        const result=await tx.query<AgentRow>(`${agentSelection} WHERE r.id=$1 AND r.project_id=$2`,[id,PROJECT_ID]);
        return {agent:publicAgent(result.rows[0]),token};
      });
    }),
    listAgents: (actor:Actor):Promise<AgentRegistration[]> => serialize(()=>db.transaction(async tx=>{
      await assertHumanActor(tx,actor);
      const result=await tx.query<AgentRow>(`${agentSelection} WHERE r.project_id=$1 ORDER BY r.created_at,r.id`,[PROJECT_ID]);
      return result.rows.map(publicAgent);
    })),
    revokeAgent: (id:string,actor:Actor):Promise<AgentRegistration> => serialize(()=>db.transaction(async tx=>{
      await assertHumanActor(tx,actor);
      await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[PROJECT_ID]);
      const found=await tx.query<AgentRow>(`${agentSelection} WHERE r.id=$1 AND r.project_id=$2`,[id,PROJECT_ID]);
      if(!found.rows.length)throw new StoreError('NOT_FOUND','Агент не найден.');
      await tx.query('INSERT INTO ouro_agent_revocations (agent_id,revoked_by) VALUES ($1,$2) ON CONFLICT DO NOTHING',[id,actor.id]);
      const result=await tx.query<AgentRow>(`${agentSelection} WHERE r.id=$1 AND r.project_id=$2`,[id,PROJECT_ID]);
      return publicAgent(result.rows[0]);
    })),
    authenticateAgentToken: (token:string):Promise<Actor|null> => serialize(async()=>{
      if(typeof token!=='string'||!/^ouro_agent_[A-Za-z0-9_-]{43}$/.test(token))return null;
      return db.transaction(async tx=>{
        await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR SHARE',[PROJECT_ID]);
        const result=await tx.query<{id:string;name:string;project_id:string}>(`SELECT r.id,r.name,r.project_id FROM ouro_agent_credentials c
          JOIN ouro_agent_registrations r ON r.id=c.agent_id
          LEFT JOIN ouro_agent_revocations v ON v.agent_id=r.id
          WHERE c.token_hash=$1 AND r.project_id=$2 AND v.agent_id IS NULL`,[tokenHash(token),PROJECT_ID]);
        const found=result.rows[0];if(!found)return null;
        await tx.query('INSERT INTO ouro_agent_presence (agent_id,last_seen_at) VALUES ($1,now()) ON CONFLICT (agent_id) DO UPDATE SET last_seen_at=excluded.last_seen_at',[found.id]);
        return {id:found.id,kind:'agent',name:found.name,projectIds:[found.project_id]};
      });
    }),
    getProject: () => serialize(async () => replay(await readEvents(db), PROJECT_ID)),
    getEvents: (after = 0) => serialize(async () => {
      if (!Number.isSafeInteger(after) || after < 0) throw new StoreError('VALIDATION_ERROR', 'Некорректный курсор событий.');
      return db.transaction(async tx => {
        const row = await tx.query<{ version: string | number }>('SELECT version FROM ouro_projects WHERE id=$1 FOR SHARE', [PROJECT_ID]);
        const cursor = Number(row.rows[0]?.version ?? 0);
        if (after > cursor) throw new StoreError('CURSOR_AHEAD', 'Курсор клиента опережает историю проекта.', { cursor });
        return { events: await readEvents(tx, after), cursor };
      });
    }),
    executeCommand: (body:unknown,actor:Actor)=>commitCommand(body,actor),
    /** Used by database checks/tests; application routes never expose raw SQL. */
    inspect: <T = Row>(sql: string, params?: unknown[]) => serialize(() => db.query<T>(sql, params)),
    close: () => serialize(() => db.close()),
  };
}

type Store = Awaited<ReturnType<typeof createStore>>;
export type GitHubStore=Store;
const globalStore = globalThis as typeof globalThis & { __ouroStore?: Promise<Store> };
function currentStore(): Promise<Store> {
  return globalStore.__ouroStore ??= createStore({ databaseUrl: process.env.DATABASE_URL, dataDir: process.env.OURO_DATA_DIR });
}
export const getGitHubStore=currentStore;
export const getStorageMode = () => process.env.DATABASE_URL ? 'postgres' as const : 'embedded-postgres' as const;
export async function getProject() { return (await currentStore()).getProject(); }
export async function getEvents(after = 0) { return (await currentStore()).getEvents(after); }
export async function executeCommand(command: unknown, actor: Actor) { return (await currentStore()).executeCommand(command, actor); }
export async function createAgent(name:string,actor:Actor) {return (await currentStore()).createAgent(name,actor);}
export async function listAgents(actor:Actor) {return (await currentStore()).listAgents(actor);}
export async function revokeAgent(agentId:string,actor:Actor) {return (await currentStore()).revokeAgent(agentId,actor);}
export async function authenticateAgentToken(token:string) {return (await currentStore()).authenticateAgentToken(token);}
