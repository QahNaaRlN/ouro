import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createStore } from '../lib/store';

async function main() {
 const directory = await mkdtemp(path.join(os.tmpdir(), 'ouro-db-check-'));
 try {
  const store = await createStore({ dataDir: directory });
  const state = await store.getProject();
  assert(state.specs.length > 0);
  const count = await store.inspect<{ count: string }>('SELECT count(*) FROM ouro_domain_events');
  assert.equal(Number(count.rows[0].count), state.version);
  await assert.rejects(store.inspect('UPDATE ouro_domain_events SET event_type=event_type'), /append-only/);
  await assert.rejects(store.inspect('TRUNCATE ouro_spec_revisions CASCADE'), /append-only/);
  await store.close();
  const reopened = await createStore({ dataDir: directory });
  assert.deepEqual(await reopened.getProject(), state);
  await reopened.close();
  process.stdout.write(`PostgreSQL migration, append-only guards and durable replay: passed (${state.version} events).\n`);
 } finally { await rm(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
