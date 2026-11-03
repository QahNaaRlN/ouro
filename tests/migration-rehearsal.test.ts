import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { canonicalJSON, createStore } from '../lib/store';
import { AGENT_ID, PROJECT_ID, createSeedEvents, replay, type Actor, type Command } from '../packages/core/src';

const hash = (value: unknown) => createHash('sha256').update(canonicalJSON(value)).digest('hex');
const password = 'correct horse battery staple';
const legacyAgentToken = `ouro_agent_${'a'.repeat(43)}`;

test('AA11/AA12 file-backed 001–005 database migrates without changing events, revisions, receipts or agent access', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'ouro-migration-rehearsal-'));
  const legacy = new PGlite(dataDir);
  let store: Awaited<ReturnType<typeof createStore>> | undefined;
  try {
    await legacy.waitReady;
    for (const file of ['001_initial.sql', '002_agents.sql', '003_github.sql', '004_participants.sql', '005_drafts.sql']) {
      await legacy.exec(await readFile(path.join(process.cwd(), 'db', 'migrations', file), 'utf8'));
    }
    const events = createSeedEvents();
    const before = JSON.parse(JSON.stringify(replay(events, PROJECT_ID))) as ReturnType<typeof replay>;
    const legacyHuman = events[0].actor;
    await legacy.transaction(async tx => {
      await tx.query('INSERT INTO ouro_projects(id,version) VALUES($1,$2)', [PROJECT_ID, before.version]);
      for (const actor of new Map(events.map(event => [event.actor.id, event.actor])).values()) {
        await tx.query('INSERT INTO ouro_principals(id,kind) VALUES($1,$2)', [actor.id, actor.kind]);
      }
      for (const spec of before.specs) {
        await tx.query('INSERT INTO ouro_specs(id,project_id,human_id) VALUES($1,$2,$3)', [spec.id, PROJECT_ID, spec.humanId]);
      }
      for (const revision of before.revisions) {
        await tx.query('INSERT INTO ouro_spec_revisions(id,spec_id,revision,content,content_hash) VALUES($1,$2,$3,$4::jsonb,$5)', [revision.id, revision.specId, revision.revision, JSON.stringify(revision), hash(revision)]);
      }
      for (const event of events) {
        await tx.query('INSERT INTO ouro_domain_events(id,project_id,version,event_type,schema_version,actor_id,occurred_at,event) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [event.id, PROJECT_ID, event.version, event.type, event.schemaVersion, event.actor.id, event.occurredAt, JSON.stringify(event)]);
        await tx.query('INSERT INTO ouro_outbox(event_id,project_id,cursor) VALUES($1,$2,$3)', [event.id, PROJECT_ID, event.version]);
      }
      const command: Command = { type: 'createSpec', requestId: 'legacy-receipt', expectedVersion: before.version, content: before.revisions[0] };
      const response = { state: before, events: [], cursor: before.version };
      await tx.query('INSERT INTO ouro_command_receipts(actor_id,project_id,request_id,payload_hash,response,cursor) VALUES($1,$2,$3,$4,$5::jsonb,$6)', [legacyHuman.id, PROJECT_ID, command.requestId, hash(command), JSON.stringify(response), before.version]);
      await tx.query('INSERT INTO ouro_agent_registrations(id,project_id,name,created_by) VALUES($1,$2,$3,$4)', [AGENT_ID, PROJECT_ID, 'Legacy agent', legacyHuman.id]);
      await tx.query('INSERT INTO ouro_agent_credentials(agent_id,token_hash) VALUES($1,$2)', [AGENT_ID, createHash('sha256').update(legacyAgentToken).digest('hex')]);
    });
    const originalEvents = await legacy.query<{ id: string; event: unknown }>('SELECT id,event FROM ouro_domain_events ORDER BY version');
    const originalRevisions = await legacy.query<{ id: string; content_hash: string }>('SELECT id,content_hash FROM ouro_spec_revisions ORDER BY id');
    const originalReceipts = await legacy.query<{ request_id: string; payload_hash: string; response: unknown }>('SELECT request_id,payload_hash,response FROM ouro_command_receipts ORDER BY request_id');
    await legacy.close();

    store = await createStore({ dataDir, seedEvents: [] });
    const operator: Actor = { id: 'local-human', kind: 'human', name: 'Оператор', projectIds: [PROJECT_ID] };
    const account = (await store.createAccount({ email: 'migration-owner@example.com', name: 'Migration Owner', password }, operator)).account;
    await store.bootstrapProjectOwner(account.id, operator);
    const owner: Actor = { id: account.id, kind: 'human', name: account.name, projectIds: [PROJECT_ID] };

    assert.deepEqual(await store.getProject(PROJECT_ID, owner), before);
    assert.deepEqual((await store.inspect('SELECT id,event FROM ouro_domain_events ORDER BY version')).rows, originalEvents.rows);
    assert.deepEqual((await store.inspect('SELECT id,content_hash FROM ouro_spec_revisions ORDER BY id')).rows, originalRevisions.rows);
    assert.deepEqual((await store.inspect('SELECT request_id,payload_hash,response FROM ouro_command_receipts ORDER BY request_id')).rows, originalReceipts.rows);
    const replayedReceipt = await store.executeCommand({ type: 'createSpec', requestId: 'legacy-receipt', expectedVersion: before.version, content: before.revisions[0] }, legacyHuman);
    assert.equal(replayedReceipt.replayed, true);
    assert.deepEqual(replayedReceipt.state, before);
    assert.equal((await store.listAgents(owner)).find(agent => agent.id === AGENT_ID)?.revokedAt, null);
    assert.deepEqual((await store.authenticateAgentToken(legacyAgentToken))?.projectIds, [PROJECT_ID]);
    assert.deepEqual((await store.inspect<{ version: number }>('SELECT version FROM ouro_schema_migrations ORDER BY version')).rows.map(row => row.version), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  } finally {
    if (store) await store.close();
    else await legacy.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
