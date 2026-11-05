import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir, access } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tcpRequest, openResponse, waitFor, type HttpResult } from './http-fixtures.js';
import {
  createServiceWebFixture,
  serviceWebStaticRoot,
  serviceWebRoot,
  serviceWebHumanToken,
} from './service-web-fixture.js';
import { createStaticHandler } from '../src/runtime/static-handler.js';
import { createServiceApp } from '../src/http/create-service-app.js';

const headers = {
  Authorization: 'Bearer ' + serviceWebHumanToken,
  'Content-Type': 'application/json',
};
const json = <T>(response: HttpResult): T => JSON.parse(response.body.toString()) as T;
type Snapshot = {
  state: { projectId: string; version: number; specs: { id: string; title: string }[] };
  cursor: number;
};
type Receipt = Snapshot & { events: unknown[]; replayed: boolean };

/** Сохраняет исходный request-target, чтобы URL-клиент не нормализовал traversal до проверки. */
function raw(url: string, target: string, method: string, accept: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const origin = new URL(url),
      pending = request(
        {
          host: origin.hostname,
          port: origin.port,
          path: target,
          method,
          headers: { Accept: accept },
          agent: false,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.once('error', reject);
          response.once('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              rawHeaders: response.rawHeaders,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
    pending.setTimeout(5000, () => pending.destroy(new Error('Raw static qualification deadline')));
    pending.once('error', reject);
    pending.end();
  });
}

/** Читает только полностью доставленные progressive snapshot frames. */
function snapshots(text: string): Snapshot[] {
  const complete = text.split(/\r?\n\r?\n/);
  complete.pop();
  return complete.flatMap((frame) => {
    if (!/^event: snapshot$/m.test(frame)) return [];
    const data = frame.match(/^data: (.+)$/m),
      id = frame.match(/^id: (\d+)$/m);
    if (!data || !id) return [];
    const snapshot = JSON.parse(data[1]) as Snapshot;
    assert.equal(snapshot.cursor, Number(id[1]));
    assert.equal(snapshot.cursor, snapshot.state.version);
    return [snapshot];
  });
}

test('SWD02 direct handler and Web pipeline retain exact HTML bytes before TCP', async () => {
  const index = await readFile(path.join(serviceWebStaticRoot, 'index.html')),
    fallback = await createStaticHandler(serviceWebStaticRoot);
  const direct = await fallback(
    new Request('http://127.0.0.1/projects', { headers: { Accept: 'text/html' } }),
  );
  assert.equal(direct.status, 200);
  assert(Buffer.from(await direct.arrayBuffer()).equals(index));
  const directHead = await fallback(
    new Request('http://127.0.0.1/projects', { method: 'HEAD', headers: { Accept: 'text/html' } }),
  );
  assert.equal(Number(directHead.headers.get('content-length')), index.length);
  assert.equal((await directHead.arrayBuffer()).byteLength, 0);
  const pipeline = createServiceApp({ routes: [], fallback });
  const bindings = {
    outgoing: {
      writableFinished: true,
      once() {
        return this;
      },
      off() {
        return this;
      },
    },
  };
  try {
    const response = await pipeline.fetch(
      new Request('http://127.0.0.1/projects', { headers: { Accept: 'text/html' } }),
      bindings,
    );
    assert.equal(response.status, 200);
    assert(Buffer.from(await response.arrayBuffer()).equals(index));
    const head = await pipeline.fetch(
      new Request('http://127.0.0.1/projects', {
        method: 'HEAD',
        headers: { Accept: 'text/html' },
      }),
      bindings,
    );
    assert.equal(Number(head.headers.get('content-length')), index.length);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  } finally {
    pipeline.stopAdmission();
    await pipeline.drain();
  }
});

test('SWD02 strict TCP HTML byte and length integrity is mandatory on every platform', async () => {
  const fixture = await createServiceWebFixture();
  try {
    const running = await fixture.start(),
      index = await readFile(path.join(serviceWebStaticRoot, 'index.html')),
      response = await raw(running.url, '/projects', 'GET', 'text/html'),
      head = await raw(running.url, '/projects', 'HEAD', 'text/html');
    assert.equal(response.status, 200);
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert(
      response.body.equals(index) && Number(head.headers['content-length']) === index.length,
      JSON.stringify({
        scope: 'strict-html-tcp',
        expectedBytes: index.length,
        actualBytes: response.body.length,
        foreignAdguardInjection: response.body.includes(Buffer.from('local.adguard.org')),
        getContentLength: response.headers['content-length'] ?? null,
        headContentLength: head.headers['content-length'] ?? null,
        transferEncoding: response.headers['transfer-encoding'] ?? null,
      }),
    );
  } finally {
    await fixture.close();
  }
});

test('SWD02 actual built UI has bounded same-origin static, API, HEAD and raw traversal behavior', async (t) => {
  const fixture = await createServiceWebFixture();
  try {
    const running = await fixture.start(),
      index = await readFile(path.join(serviceWebStaticRoot, 'index.html')),
      html = index.toString(),
      script = html.match(/<script[^>]+src="([^"]+)"/),
      stylesheet = html.match(/<link[^>]+href="([^"]+\.css)"/);
    assert(script);
    assert(stylesheet);
    await t.test('UI composition, module refs and HEAD semantics', async () => {
      for (const route of [
        '/',
        '/projects',
        '/projects/help',
        '/projects/owned-project',
        '/projects/owned-project/members',
      ]) {
        const get = await raw(running.url, route, 'GET', 'text/html');
        assert.equal(get.status, 200, route);
        assert(get.body.includes(Buffer.from('<div id="root"></div>')));
        assert(get.body.includes(Buffer.from('src="' + script[1] + '"')));
        assert(get.body.includes(Buffer.from('href="' + stylesheet[1] + '"')));
        assert.match(String(get.headers['content-type']), /^text\/html/);
        assert.equal(get.headers['cache-control'], 'no-cache');
        const head = await raw(running.url, route, 'HEAD', 'text/html');
        assert.equal(head.status, 200, route);
        assert.equal(head.body.length, 0);
        assert.match(String(head.headers['content-type']), /^text\/html/);
      }
    });
    const font = (await readdir(path.join(serviceWebStaticRoot, 'assets'))).find((file) =>
      file.endsWith('.woff2'),
    );
    assert(font);
    for (const [asset, mime] of [
      [script[1], /^text\/javascript/],
      [stylesheet[1], /^text\/css/],
      ['/assets/' + font, /^font\/woff2/],
    ] as const)
      await t.test('exact TCP asset ' + asset, async () => {
        const get = await raw(running.url, asset, 'GET', '*/*'),
          expected = await readFile(path.join(serviceWebStaticRoot, asset));
        assert.equal(get.status, 200, asset);
        assert.match(String(get.headers['content-type']), mime);
        assert.deepEqual(get.body, expected);
        assert.equal(get.headers['x-content-type-options'], 'nosniff');
        const head = await raw(running.url, asset, 'HEAD', '*/*');
        assert.equal(head.status, 200);
        assert.equal(head.body.length, 0);
        assert.equal(Number(head.headers['content-length']), expected.length);
      });
    await t.test('API/assets, methods, Accept and raw traversal remain negative', async () => {
      for (const route of [
        '/api',
        '/api/unknown',
        '/assets/missing.json',
        '/assets/missing.wasm',
        '/assets/missing.mjs',
        '/assets/missing.js',
        '/assets/extensionless',
        '/missing.custom',
        '/unpublished',
        '/%2e%2e/.env',
        '/%5c..%5c.env',
        '/assets/%2e%2e/.env',
      ])
        for (const method of ['GET', 'HEAD']) {
          const denied = await raw(running.url, route, method, 'text/html');
          assert.equal(denied.status, 404, method + ' ' + route);
          assert(!denied.body.includes(Buffer.from('<div id="root">')));
          if (method === 'HEAD') assert.equal(denied.body.length, 0);
        }
      for (const accept of ['*/*', 'application/json'])
        for (const method of ['GET', 'HEAD'])
          assert.equal(
            (await raw(running.url, '/projects', method, accept)).status,
            404,
            method + ' ' + accept,
          );
      assert.equal((await raw(running.url, '/projects', 'POST', 'text/html')).status, 404);
    });
    const manifest = JSON.parse(
      await readFile(path.join(serviceWebRoot, 'apps/service/dist/build-manifest.json'), 'utf8'),
    ) as { inputs: string[] };
    assert(
      !manifest.inputs.some(
        (value) => value.includes('node_modules/next/') || value.startsWith('app/api/'),
      ),
    );
    assert.deepEqual(await readdir(fixture.foreign), []);
  } finally {
    await fixture.close();
  }
});

test('SWD03/04 built Vite and one service owner preserve real project, SSE, MCP and exact receipts across graceful restart from foreign cwd', async () => {
  const fixture = await createServiceWebFixture();
  let stream: Awaited<ReturnType<typeof openResponse>> | undefined;
  try {
    let running = await fixture.start();
    const creation = {
        requestId: randomUUID(),
        rootPath: fixture.workspace,
        name: 'Same-origin persisted fixture',
      },
      created = await tcpRequest(
        running.url + '/api/projects',
        'POST',
        [Buffer.from(JSON.stringify(creation))],
        headers,
      );
    assert.equal(created.status, 201, created.body.toString());
    const project = json<{
      project: { id: string; name: string };
      created: boolean;
      replayed: boolean;
    }>(created);
    assert.equal(project.created, true);
    assert.equal(project.replayed, false);
    assert.equal(project.project.name, creation.name);
    const base = '/api/projects/' + project.project.id;
    const before = await tcpRequest(running.url + base, 'GET', [], headers);
    assert.equal(before.status, 200);
    const initial = json<Snapshot>(before);
    assert.equal(initial.state.projectId, project.project.id);
    stream = await openResponse(running.url + base + '/stream', headers);
    assert.equal(stream.response.statusCode, 200);
    await waitFor(
      () => snapshots(stream!.text()).length > 0,
      'initial same-origin SSE frame',
      5000,
    );
    assert.equal(stream.response.complete, false);
    const command = {
        type: 'createSpec',
        requestId: randomUUID(),
        expectedVersion: initial.cursor,
        content: {
          title: 'Persisted service UI fixture',
          goal: 'Same origin and durable history',
          dod: [{ id: 'one', text: 'Exact restart receipt', required: true }],
          constraints: '',
          assumptions: '',
          risks: '',
          inputs: '',
          comment: '',
        },
      },
      body = Buffer.from(' ' + JSON.stringify(command) + '\n');
    const applied = await tcpRequest(running.url + base + '/commands', 'POST', [body], headers);
    assert.equal(applied.status, 200, applied.body.toString());
    const receipt = json<Receipt>(applied);
    assert.equal(receipt.replayed, false);
    assert.equal(receipt.state.specs.at(-1)?.title, command.content.title);
    await waitFor(
      () => snapshots(stream!.text()).some((value) => value.cursor === receipt.cursor),
      'progressive committed SSE frame',
      5000,
    );
    assert.equal(stream.response.complete, false);
    const registered = await tcpRequest(
      running.url + base + '/agents',
      'POST',
      [Buffer.from(JSON.stringify({ name: 'Same-origin MCP fixture' }))],
      headers,
    );
    assert.equal(registered.status, 201);
    const registration = json<{ token: string; connection: { stdioArgs: string[] } }>(registered);
    const bridge = registration.connection.stdioArgs[0];
    assert(bridge.includes(path.join('dist', 'resources', 'mcp', 'bin')));
    await access(bridge);
    const client = new Client({ name: 'service-web-qualification', version: '1' });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: registration.connection.stdioArgs,
          cwd: fixture.foreign,
          env: {
            OURO_URL: running.url + base + '/mcp',
            OURO_PROJECT_ID: project.project.id,
            OURO_AGENT_TOKEN: registration.token,
            ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
          },
        }),
      );
      assert((await client.listTools()).tools.some((value) => value.name === 'ouro.get_context'));
      const context = await client.callTool({ name: 'ouro.get_context', arguments: {} });
      assert.notEqual(context.isError, true);
      assert(JSON.stringify(context).includes(project.project.id));
    } finally {
      await client.close();
    }
    let streamClosed = false;
    stream.response.once('close', () => {
      streamClosed = true;
    });
    await fixture.stop();
    await waitFor(() => streamClosed, 'shutdown closes owned SSE', 5000);
    stream = undefined;
    await access(fixture.profile + '.ouro-profile-mutex.sqlite');
    running = await fixture.start();
    const reopened = await tcpRequest(running.url + base, 'GET', [], headers);
    assert.equal(reopened.status, 200);
    const restored = json<Snapshot>(reopened);
    assert.equal(restored.cursor, receipt.cursor);
    assert.deepEqual(restored.state.specs, receipt.state.specs);
    const replayed = await tcpRequest(running.url + base + '/commands', 'POST', [body], headers);
    assert.equal(replayed.status, 200);
    const replay = json<Receipt>(replayed);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.events, receipt.events);
    assert.deepEqual(replay.state, receipt.state);
    const repeated = await tcpRequest(
      running.url + '/api/projects',
      'POST',
      [Buffer.from(JSON.stringify(creation))],
      headers,
    );
    assert.equal(repeated.status, 201);
    const catalogReceipt = json<{
      project: { id: string; name: string };
      created: boolean;
      replayed: boolean;
    }>(repeated);
    assert.deepEqual(catalogReceipt.project, project.project);
    assert.equal(catalogReceipt.created, true);
    assert.equal(catalogReceipt.replayed, true);
    const catalog = await tcpRequest(running.url + '/api/projects', 'GET', [], headers);
    assert.equal(catalog.status, 200);
    assert.equal(
      json<{ projects: { id: string }[] }>(catalog).projects.filter(
        (value) => value.id === project.project.id,
      ).length,
      1,
    );
    assert.equal(
      (await raw(running.url, '/projects/' + project.project.id, 'GET', 'text/html')).status,
      200,
    );
    assert.deepEqual(await readdir(fixture.foreign), []);
  } finally {
    stream?.abort();
    await fixture.close();
  }
});
