import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore } from '../lib/store';
import { PROJECT_ID } from '../packages/core/src';
import type { Actor, Command, RevisionContent } from '../packages/core/src';

const human: Actor = { id: 'f1527577-a891-4f2a-b36f-87a47c125001', kind: 'human', projectIds: [PROJECT_ID], name: 'Тестовый человек' };
const content = (title: string): RevisionContent => ({ title, goal: 'Проверить неизменяемость истории и последовательность команд.', dod: [{ id: randomUUID(), text: 'События сохранены и доступны после перезапуска.', required: true }], constraints: 'Не применимо', assumptions: 'Не применимо', risks: 'Не применимо', inputs: 'Не применимо', comment: 'Сценарий проверки хранилища.' });
const command = (expectedVersion: number, title = 'Проверка хранения'): Extract<Command, {type: 'createSpec'}> => ({ type: 'createSpec', requestId: randomUUID(), expectedVersion, content: content(title) });

test('durable PostgreSQL store: idempotency, race, rollback, append-only and reopen', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ouro-storage-test-'));
  let store: Awaited<ReturnType<typeof createStore>> | undefined;
  try {
    store = await createStore({ dataDir: directory });
    const initial = await store.getProject();
    assert(initial.specs.length > 0);
    const firstCommand = command(initial.version);
    const first = await store.executeCommand(firstCommand, human);
    assert.equal(first.replayed, false);
    assert(first.cursor > initial.version);
    const second = await store.executeCommand(command(first.cursor, 'Более новое изменение'), human);
    // Original receipt precedes expectedVersion checks, including after other writes.
    const duplicate = await store.executeCommand({ expectedVersion: firstCommand.expectedVersion, requestId: firstCommand.requestId, content: firstCommand.content, type: firstCommand.type }, human);
    assert.equal(duplicate.replayed, true);
    assert.deepEqual(duplicate.events, first.events);
    assert.deepEqual(duplicate.state, first.state);
    assert.equal((await store.getProject()).version, second.cursor);
    await assert.rejects(store.executeCommand({ ...firstCommand, content: content('Подмена команды') }, human), error => (error as { code: string }).code === 'IDEMPOTENCY_CONFLICT');
    await assert.rejects(store.executeCommand(command(second.cursor), { ...human, projectIds: ['another-project'] }), error => (error as { code: string }).code === 'FORBIDDEN');

    const raced = await Promise.allSettled([
      store.executeCommand(command(second.cursor, 'Конкурирующая команда А'), human),
      store.executeCommand(command(second.cursor, 'Конкурирующая команда Б'), human),
    ]);
    assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(raced.filter(result => result.status === 'rejected' && result.reason.code === 'VERSION_CONFLICT').length, 1);

    const beforeFailure = await store.getProject();
    const beforeReceipts = await store.inspect<{ count: string }>('SELECT count(*) FROM ouro_command_receipts');
    await store.inspect(`CREATE FUNCTION ouro_test_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected outbox failure'; END $$`);
    await store.inspect('CREATE TRIGGER ouro_test_fail_outbox BEFORE INSERT ON ouro_outbox FOR EACH ROW EXECUTE FUNCTION ouro_test_fail_outbox()');
    const failed = command(beforeFailure.version, 'Команда с отказом outbox');
    await assert.rejects(store.executeCommand(failed, human), /injected outbox failure/);
    assert.deepEqual(await store.getProject(), beforeFailure, 'No partial event may survive failed outbox append');
    assert.deepEqual(await store.inspect('SELECT count(*) FROM ouro_command_receipts'), beforeReceipts);
    await store.inspect('DROP TRIGGER ouro_test_fail_outbox ON ouro_outbox');
    await store.inspect('DROP FUNCTION ouro_test_fail_outbox()');
    const retried = await store.executeCommand(failed, human);
    assert.equal(retried.replayed, false, 'Failed transactions do not reserve a requestId');

    await assert.rejects(store.inspect('UPDATE ouro_domain_events SET event_type=event_type'), /append-only/);
    await assert.rejects(store.inspect('DELETE FROM ouro_command_receipts'), /append-only/);
    await assert.rejects(store.inspect('TRUNCATE ouro_spec_revisions CASCADE'), /append-only/);
    const committed = await store.getProject();
    const outbox = await store.inspect<{ count: string }>('SELECT count(*) FROM ouro_outbox');
    assert.equal(Number(outbox.rows[0].count), committed.version);
    const replayed = await store.getEvents(initial.version);
    assert.equal(replayed.cursor, committed.version);
    assert.deepEqual(replayed.events.map(event => event.version), Array.from({ length: committed.version - initial.version }, (_, i) => initial.version + i + 1));
    await assert.rejects(store.getEvents(committed.version + 1), error => (error as { code: string }).code === 'CURSOR_AHEAD');
    await store.close();
    store = await createStore({ dataDir: directory });
    assert.deepEqual(await store.getProject(), committed, 'Durable replay is identical after database reopen');
    const receiptAfterReopen = await store.executeCommand(firstCommand, human);
    assert.equal(receiptAfterReopen.replayed, true);
    assert.deepEqual(receiptAfterReopen.events, first.events);
  } finally {
    if (store) await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('principal identity cannot be upgraded from agent to human', async () => {
  const store = await createStore({ dataDir: 'memory://' });
  try {
    const state = await store.getProject();
    const agent = state.events.find(event => event.actor.kind === 'agent')!.actor;
    await assert.rejects(store.executeCommand(command(state.version), { ...agent, kind: 'human' }), error => (error as { code: string }).code === 'FORBIDDEN');
    assert.equal((await store.getProject()).version, state.version);
  } finally { await store.close(); }
});
