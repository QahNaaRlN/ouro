import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createStore } from '../lib/store';
import { PROJECT_ID, type Actor, type ProjectState } from '../packages/core/src';
import { createProjectStreamHandler, type ProjectStreamClock, type ProjectStreamStore } from '../lib/project-stream';

const humanToken = 'stream-human-fixture-credential';
const agentToken = 'stream-legacy-agent-fixture-credential';
const human: Actor = { id: 'stream-test-human', kind: 'human', projectIds: [PROJECT_ID] };
const request = (path = '', headers: HeadersInit = {}, signal?: AbortSignal) => {
  const result = new Headers({ Authorization: `Bearer ${humanToken}` });
  new Headers(headers).forEach((value, key) => result.set(key, value));
  return new Request(`http://127.0.0.1/api/stream${path}`, { headers: result, signal });
};
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

class Clock implements ProjectStreamClock {
  time = 0;
  tasks = new Map<object, { at: number; callback: () => void }>();
  now = () => this.time;
  schedule = (callback: () => void, milliseconds: number) => {
    const id = {};
    this.tasks.set(id, { at: this.time + milliseconds, callback });
    return () => { this.tasks.delete(id); };
  };
  async tick(milliseconds: number) {
    this.time += milliseconds;
    const due = [...this.tasks].filter(([, task]) => task.at <= this.time);
    for (const [id, task] of due) if (this.tasks.delete(id)) task.callback();
    await settle();
  }
}

async function fixture() {
  const store = await createStore({ dataDir: 'memory://' });
  const previousHuman = process.env.OURO_HUMAN_TOKEN, previousAgent = process.env.OURO_AGENT_TOKEN;
  process.env.OURO_HUMAN_TOKEN = humanToken;
  process.env.OURO_AGENT_TOKEN = agentToken;
  const clock = new Clock();
  let eventReads = 0, snapshotReads = 0;
  const observed: ProjectStreamStore = {
    getProject: async () => { snapshotReads++; return store.getProject(); },
    getEvents: async after => { eventReads++; return store.getEvents(after); },
  };
  const handler = createProjectStreamHandler({ store: observed, storage: store.storage, clock, pollIntervalMs: 500, heartbeatMs: 15_000, lifetimeMs: 55_000 });
  const command = async (title: string) => {
    const body = {
      type: 'createSpec', expectedVersion: (await store.getProject()).version, requestId: randomUUID(),
      content: { title, goal: 'Проверить поток подтверждённых снимков.', dod: [{ id: randomUUID(), text: 'Снимок содержит committed событие.', required: true }], constraints: '', assumptions: '', risks: '', inputs: '', comment: '' },
    };
    return { ...await store.executeCommand(body, human), command: body };
  };
  return {
    store, clock, handler, command, observed,
    reads: () => ({ events: eventReads, snapshots: snapshotReads }),
    close: async () => {
      if (previousHuman === undefined) delete process.env.OURO_HUMAN_TOKEN; else process.env.OURO_HUMAN_TOKEN = previousHuman;
      if (previousAgent === undefined) delete process.env.OURO_AGENT_TOKEN; else process.env.OURO_AGENT_TOKEN = previousAgent;
      await store.close();
    },
  };
}

const frames = new WeakMap<ReadableStreamDefaultReader<Uint8Array>, { decoder: TextDecoder; buffer: string }>();
async function frame(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let state = frames.get(reader);
  if (!state) { state = { decoder: new TextDecoder(), buffer: '' }; frames.set(reader, state); }
  while (true) {
    const end = state.buffer.indexOf('\n\n');
    if (end !== -1) {
      const result = state.buffer.slice(0, end + 2);
      state.buffer = state.buffer.slice(end + 2);
      return result;
    }
    const item = await reader.read();
    assert.equal(item.done, false, 'A live stream must yield a complete frame');
    state.buffer += state.decoder.decode(item.value, { stream: true });
  }
}
function snapshot(text: string) {
  assert.match(text, /^id: \d+\nevent: snapshot\ndata: /);
  const data = JSON.parse(text.split('\ndata: ')[1].trim()) as { state: ProjectState; cursor: number; storage: string };
  assert.equal(text.split('\n')[0], `id: ${data.cursor}`);
  assert.equal(data.state.version, data.cursor);
  return data;
}

test('R01 human-only SSE rejects absent, legacy and registered agent credentials, foreign Host/Origin and unsafe cursor', async () => {
  const f = await fixture();
  try {
    const agent = await f.store.createAgent('Private stream agent', human);
    const denied: Array<[Request, number]> = [
      [request('', { Authorization: '' }), 401],
      [request('', { Authorization: `Bearer ${agentToken}` }), 403],
      [request('', { Authorization: `Bearer ${agent.token}` }), 401],
      [request('', { Origin: 'https://foreign.invalid' }), 403],
      [request('', { Host: 'foreign.invalid' }), 403],
      [request('?token=credential-must-not-be-in-url'), 422],
      ...['-1', '1.5', 'Infinity', '9007199254740992', '', '1e3'].map(value => [request(`?after=${value}`), 422] as [Request, number]),
      [request('?after=0', { 'Last-Event-ID': 'invalid' }), 422],
    ];
    for (const [input, status] of denied) {
      const response = await f.handler(input);
      assert.equal(response.status, status, input.url);
      assert(!response.headers.has('access-control-allow-origin'));
      await response.body?.cancel();
    }
    assert.deepEqual(f.reads(), { events: 0, snapshots: 0 }, 'Rejected requests must not read project content');
  } finally { await f.close(); }
});

test('R01/03 Last-Event-ID precedes after; equal cursor starts with a committed complete snapshot and safe headers', async () => {
  const f = await fixture();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const state = await f.store.getProject();
    const response = await f.handler(request(`?after=${state.version + 100}`, { 'Last-Event-ID': String(state.version) }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store, no-transform');
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    reader = response.body!.getReader();
    const first = snapshot(await frame(reader));
    assert.deepEqual(first.state, state);
    assert.equal(first.storage, f.store.storage);
    const ahead = await f.handler(request(`?after=${state.version + 1}`));
    assert.equal(ahead.status, 409);
    assert.equal((await ahead.json()).error.code, 'CURSOR_AHEAD');
  } finally { await reader?.cancel(); await f.close(); }
});

test('R02 commit creates the next snapshot; failed outbox transaction and idempotent receipt create no false frame', async () => {
  const f = await fixture();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await f.handler(request());
    reader = response.body!.getReader();
    const initial = snapshot(await frame(reader));
    await f.store.inspect(`CREATE FUNCTION ouro_stream_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'stream injected rollback'; END $$`);
    await f.store.inspect('CREATE TRIGGER ouro_stream_fail_outbox BEFORE INSERT ON ouro_outbox FOR EACH ROW EXECUTE FUNCTION ouro_stream_fail_outbox()');
    await assert.rejects(f.command('Не должен попасть в stream'), /stream injected rollback/);
    await f.store.inspect('DROP TRIGGER ouro_stream_fail_outbox ON ouro_outbox');
    let delivered = false;
    const pending = frame(reader).then(value => { delivered = true; return value; });
    await f.clock.tick(500);
    assert.equal(delivered, false);
    const committed = await f.command('Только committed результат');
    await f.clock.tick(500);
    const next = snapshot(await pending);
    assert.equal(next.cursor, committed.cursor);
    assert.equal(next.state.version, initial.cursor + 1);
    assert.equal(next.state.specs.at(-1)?.title, 'Только committed результат');
    const replayed = await f.store.executeCommand(committed.command, human);
    assert.equal(replayed.replayed, true);
    assert.equal((await f.store.getProject()).version, committed.cursor);
    let secondDelivered = false;
    const waiting = reader.read().then(value => { secondDelivered = true; return value; });
    await f.clock.tick(500);
    assert.equal(secondDelivered, false);
    await reader.cancel();
    await waiting;
  } finally { await reader?.cancel(); await f.close(); }
});

test('R03 reconnect snapshot includes every event committed while disconnected exactly once', async () => {
  const f = await fixture();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const first = await f.handler(request());
    reader = first.body!.getReader();
    const initial = snapshot(await frame(reader));
    await reader.cancel();
    await f.command('Первое изменение без подписчика');
    await f.command('Второе изменение без подписчика');
    const response = await f.handler(request('?after=0', { 'Last-Event-ID': String(initial.cursor) }));
    reader = response.body!.getReader();
    const recovered = snapshot(await frame(reader));
    assert.equal(recovered.cursor, initial.cursor + 2);
    const newEvents = recovered.state.events.filter(event => event.version > initial.cursor);
    assert.equal(newEvents.length, 2);
    assert.equal(new Set(recovered.state.events.map(event => event.id)).size, recovered.state.events.length);
  } finally { await reader?.cancel(); await f.close(); }
});

test('R04 backpressure prevents extra SQL reads until demand, and cancel clears every scheduled task', async () => {
  const f = await fixture();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await f.handler(request());
    await f.clock.tick(5_000);
    const atRest = f.reads();
    await f.clock.tick(5_000);
    assert.deepEqual(f.reads(), atRest, 'No consumer demand means no additional SQL queries');
    reader = response.body!.getReader();
    snapshot(await frame(reader));
    const pending = reader.read();
    await settle();
    assert(f.clock.tasks.size > 0);
    await reader.cancel();
    assert.deepEqual(await pending, { done: true, value: undefined });
    assert.equal(f.clock.tasks.size, 0);
    const stopped = f.reads();
    await f.clock.tick(100_000);
    assert.deepEqual(f.reads(), stopped);
  } finally { await reader?.cancel(); await f.close(); }
});

test('R04 heartbeat never advances event ID and a 55-second lifetime closes the subscription for re-authentication', async () => {
  const f = await fixture();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = (await f.handler(request())).body!.getReader();
    snapshot(await frame(reader));
    const next = frame(reader);
    await f.clock.tick(15_000);
    const heartbeat = await next;
    assert.match(heartbeat, /^: heartbeat\n\n$/);
    assert(!heartbeat.includes('id:'));
    const end = reader.read();
    await f.clock.tick(40_000);
    assert.deepEqual(await end, { done: true, value: undefined });
    assert.equal(f.clock.tasks.size, 0);
  } finally { await reader?.cancel(); await f.close(); }
});

test('R04 abort discards an in-flight SQL result without publishing it or starting another read', async () => {
  const f = await fixture();
  const aborter = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let release: (() => void) | undefined;
  try {
    let readStarted = false, queries = 0;
    const blockedStore: ProjectStreamStore = {
      getProject: f.store.getProject,
      getEvents: async after => {
        queries++; readStarted = true;
        await new Promise<void>(resolve => { release = resolve; });
        return f.store.getEvents(after);
      },
    };
    const handler = createProjectStreamHandler({ store: blockedStore, clock: f.clock });
    reader = (await handler(request('', {}, aborter.signal))).body!.getReader();
    snapshot(await frame(reader));
    const next = reader.read();
    await f.clock.tick(500);
    assert.equal(readStarted, true);
    aborter.abort();
    assert.deepEqual(await next, { done: true, value: undefined });
    release!();
    await settle();
    await f.clock.tick(2_000);
    assert.equal(queries, 1);
    assert.equal(f.clock.tasks.size, 0);
  } finally { release?.(); await reader?.cancel(); await f.close(); }
});

test('R02/08 independent HTTP fetch client sees a real SQL commit as an SSE snapshot', async () => {
  const f = await fixture();
  const handler = createProjectStreamHandler({ store: f.store, storage: f.store.storage, pollIntervalMs: 5, heartbeatMs: 1_000, lifetimeMs: 5_000 });
  const server = createServer(async (incoming, outgoing) => {
    const aborter = new AbortController();
    outgoing.on('close', () => aborter.abort());
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    const response = await handler(new Request(`http://${incoming.headers.host}${incoming.url}`, { headers, signal: aborter.signal }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    const reader = response.body?.getReader();
    try {
      while (reader && !aborter.signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        outgoing.write(chunk.value);
      }
    } finally { await reader?.cancel(); outgoing.end(); }
  });
  const aborter = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/stream`, { headers: { Authorization: `Bearer ${humanToken}` }, signal: aborter.signal });
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    reader = response.body!.getReader();
    snapshot(await frame(reader));
    const committed = await f.command('Реальный HTTP подписчик');
    const changed = snapshot(await frame(reader));
    assert.equal(changed.cursor, committed.cursor);
    assert.equal(changed.state.specs.at(-1)?.title, 'Реальный HTTP подписчик');
  } finally {
    aborter.abort();
    await reader?.cancel().catch(() => undefined);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await f.close();
  }
});
