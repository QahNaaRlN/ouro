import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';
import { createConnection } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createBackendRoutes } from '../src/backend/create-backend.js';
import { startHttpServer } from '../src/bootstrap/start-http-server.js';
import { tcpRequest } from './http-fixtures.js';

const rootRequire = createRequire(import.meta.url);
const { createStore }: typeof import('../../../lib/store') = rootRequire('../../../lib/store');
const { PROJECT_ID }: typeof import('../../../packages/core/src') = rootRequire(
  '../../../packages/core/src',
);
const resourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const environment = { OURO_LOCAL_DEMO: '1', OURO_HUMAN_TOKEN: 'isolated-human' };

test('full route manifest preserves all 47 patterns and 59 explicit methods', async () => {
  const store = await createStore({
    dataDir: 'memory://',
    migrationsDir: join(resourceRoot, 'db/migrations'),
  });
  try {
    const routes = createBackendRoutes({ store, environment, resourceRoot });
    assert.equal(routes.length, 47);
    assert.equal(
      routes.reduce((count, route) => count + Object.keys(route.methods).length, 0),
      59,
    );
    assert.equal(new Set(routes.map((route) => route.path)).size, 47);
  } finally {
    await store.close();
  }
});

test('disconnect does not finish shutdown before an in-flight application handler settles', async () => {
  let started = false,
    stopped = false,
    release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = await startHttpServer({
    shutdownTimeoutMs: 1000,
    routes: [
      {
        path: '/slow',
        methods: {
          GET: async () => {
            started = true;
            await pending;
            return Response.json({ ok: true });
          },
        },
      },
    ],
  });
  const request = httpRequest(server.url + '/slow');
  request.on('error', () => undefined);
  request.end();
  try {
    while (!started) await delay(5);
    request.destroy();
    const stopping = server.stop().then(() => {
      stopped = true;
    });
    await delay(30);
    assert.equal(stopped, false, 'socket close must not imply handler completion');
    release();
    await stopping;
    assert.equal(stopped, true);
  } finally {
    release();
    request.destroy();
    await server.stop();
  }
});

test('store startup resolves explicitly supplied SQL resources outside repository cwd', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'ouro-service-resources-')),
    original = process.cwd();
  const configuration = {
    dataDir: 'memory://',
    migrationsDir: join(resourceRoot, 'db/migrations'),
  };
  let store: Awaited<ReturnType<typeof createStore>> | undefined;
  try {
    process.chdir(fixture);
    store = await createStore(configuration);
    assert.equal((await store.getProject()).projectId, PROJECT_ID);
  } finally {
    process.chdir(original);
    await store?.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test('shutdown closes owned idle TCP preconnects with no application request', async () => {
  const server = await startHttpServer({ shutdownTimeoutMs: 200, routes: [] }),
    url = new URL(server.url);
  const socket = createConnection({ host: url.hostname, port: Number(url.port) });
  socket.on('error', () => undefined);
  try {
    await new Promise<void>((resolve) => socket.once('connect', resolve));
    await server.stop();
  } finally {
    socket.destroy();
    await server.stop();
  }
});

test('real TCP legacy and project reads share the injected owner and preserve auth priority', async () => {
  const store = await createStore({
    dataDir: 'memory://',
    migrationsDir: join(resourceRoot, 'db/migrations'),
  });
  const server = await startHttpServer({
    routes: createBackendRoutes({ store, environment, resourceRoot }),
  });
  try {
    const headers = { Authorization: 'Bearer isolated-human' };
    const project = await tcpRequest(server.url + '/api/project', 'GET', [], headers);
    assert.equal(project.status, 200);
    assert.equal(JSON.parse(project.body.toString()).state.projectId, PROJECT_ID);
    assert.equal(
      (await tcpRequest(server.url + '/api/projects/' + PROJECT_ID, 'GET', [], headers)).status,
      200,
    );
    const denied = await tcpRequest(server.url + '/api/commands', 'POST', [Buffer.from('{')], {
      Authorization: 'Bearer invalid',
      'Content-Type': 'text/plain',
    });
    assert.equal(denied.status, 401);
    assert.equal((await tcpRequest(server.url + '/api/mcp', 'GET')).headers.allow, 'POST');
    assert.equal((await tcpRequest(server.url + '/api/health')).status, 200);
  } finally {
    await server.stop();
    await store.close();
  }
});
