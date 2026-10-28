import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { applyCommand, createSeedEvents, replay, PROJECT_ID } from '../packages/core/src';
import type { Actor, Command, DomainEvent, ProjectState } from '../packages/core/src';

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
  const migration = await readFile(path.join(process.cwd(), 'db', 'migrations', '001_initial.sql'), 'utf8');
  await db.transaction(async tx => {
    // External PostgreSQL may have multiple app processes initializing together.
    if (options.databaseUrl) await tx.query('SELECT pg_advisory_xact_lock(187652019)');
    await tx.exec(migration);
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
  return {
    storage: options.databaseUrl ? 'postgres' as const : 'embedded-postgres' as const,
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
    executeCommand: (body: unknown, actor: Actor): Promise<CommandResult> => serialize(async () => {
      assertActor(actor);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new StoreError('VALIDATION_ERROR', 'Ожидается JSON-команда.');
      const command = body as Command;
      if (typeof command.requestId !== 'string' || command.requestId.length < 8 || command.requestId.length > 200 || !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) {
        throw new StoreError('VALIDATION_ERROR', 'Нужны requestId и неотрицательная expectedVersion.');
      }
      const payloadHash = hash(body);
      return db.transaction(async tx => {
        await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE', [PROJECT_ID]);
        await registerActor(tx, actor);
        const duplicate = await tx.query<{ payload_hash: string; response: Omit<CommandResult, 'replayed'> }>(
          'SELECT payload_hash,response FROM ouro_command_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3', [PROJECT_ID, actor.id, command.requestId]);
        if (duplicate.rows[0]) {
          if (duplicate.rows[0].payload_hash !== payloadHash) throw new StoreError('IDEMPOTENCY_CONFLICT', 'Этот requestId уже использован с другим содержимым.');
          return { ...duplicate.rows[0].response, replayed: true };
        }
        const state = replay(await readEvents(tx), PROJECT_ID);
        const applied = applyCommand(state, command, actor);
        await append(tx, applied.events, applied.state);
        const response = { state: applied.state, events: applied.events, cursor: applied.state.version };
        await tx.query(`INSERT INTO ouro_command_receipts (actor_id,project_id,request_id,payload_hash,response,cursor)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6)`, [actor.id, PROJECT_ID, command.requestId, payloadHash, JSON.stringify(response), response.cursor]);
        return { ...response, replayed: false };
      });
    }),
    /** Used by database checks/tests; application routes never expose raw SQL. */
    inspect: <T = Row>(sql: string, params?: unknown[]) => serialize(() => db.query<T>(sql, params)),
    close: () => serialize(() => db.close()),
  };
}

type Store = Awaited<ReturnType<typeof createStore>>;
const globalStore = globalThis as typeof globalThis & { __ouroStore?: Promise<Store> };
function currentStore(): Promise<Store> {
  return globalStore.__ouroStore ??= createStore({ databaseUrl: process.env.DATABASE_URL, dataDir: process.env.OURO_DATA_DIR });
}
export const getStorageMode = () => process.env.DATABASE_URL ? 'postgres' as const : 'embedded-postgres' as const;
export async function getProject() { return (await currentStore()).getProject(); }
export async function getEvents(after = 0) { return (await currentStore()).getEvents(after); }
export async function executeCommand(command: unknown, actor: Actor) { return (await currentStore()).executeCommand(command, actor); }
