import test from 'node:test';
import assert from 'node:assert/strict';
import { request, type IncomingHttpHeaders } from 'node:http';
import { readFileSync } from 'node:fs';
import { createConnection, type Socket } from 'node:net';
import { startHttpServer } from '../src/bootstrap/start-http-server.js';

type RawResult = { status: number; headers: IncomingHttpHeaders; body: Buffer };
const baseline = JSON.parse(
  readFileSync(new URL('./fixtures/uri-baseline.json', import.meta.url), 'utf8'),
) as {
  cases: {
    target: string;
    method: string;
    status: number;
    location?: string;
    refresh?: string;
    contentType?: string | null;
    body?: string;
  }[];
};

/** Передаёт исходный request-target без предварительной нормализации URL клиентом. */
function raw(url: string, target: string, method = 'GET', body?: Buffer): Promise<RawResult> {
  return new Promise((resolve, reject) => {
    const address = new URL(url),
      req = request(
        { host: address.hostname, port: address.port, path: target, method, agent: false },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.once('error', reject);
          res.once('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
    req.setTimeout(3000, () => req.destroy(new Error('Raw URI response timed out')));
    req.once('error', reject);
    req.end(body);
  });
}

test('UP01 raw URL normalization retains the actual Next production redirect contract', async (t) => {
  let admissions = 0;
  const service = await startHttpServer({
    routes: [
      { path: '/', methods: { GET: () => new Response('Isolated UI fixture') } },
      {
        path: '/api/health',
        methods: {
          GET: () => {
            admissions++;
            return Response.json({ ok: true });
          },
        },
      },
    ],
  });
  try {
    for (const expected of baseline.cases)
      await t.test(expected.method + ' ' + expected.target, async () => {
        const previous = admissions,
          actual = await raw(service.url, expected.target, expected.method);
        assert.equal(actual.status, expected.status);
        if (expected.status === 308) {
          assert.equal(actual.headers.location, expected.location);
          assert.equal(actual.headers.refresh, expected.refresh);
          assert.equal(actual.headers['content-type'] ?? null, expected.contentType);
          assert.equal(actual.body.toString('utf8'), expected.body);
          assert.equal(admissions, previous, 'A redirect must not execute the domain handler');
        }
      });
  } finally {
    await service.stop();
  }
});

test('UP02 slash normalization retains the two original redirect hops and original POST bytes', async () => {
  const body = Buffer.from('{"payload":"☃","spacing": "a  b"}\n', 'utf8');
  let writes = 0,
    received: Buffer | undefined;
  const service = await startHttpServer({
    routes: [
      {
        path: '/api/commands',
        methods: {
          POST: async (request) => {
            writes++;
            received = Buffer.from(await request.arrayBuffer());
            return Response.json({ ok: true });
          },
        },
        maxBodyBytes: 64000,
      },
    ],
  });
  try {
    const first = await raw(service.url, '/api//commands/?keep=%2f', 'POST', body);
    assert.equal(first.status, 308);
    assert.equal(first.headers.location, '/api/commands/?keep=%2f');
    assert.equal(writes, 0);
    const second = await raw(service.url, first.headers.location!, 'POST', body);
    assert.equal(second.status, 308);
    assert.equal(second.headers.location, '/api/commands?keep=%2F');
    assert.equal(writes, 0);
    const accepted = await raw(service.url, second.headers.location!, 'POST', body);
    assert.equal(accepted.status, 200);
    assert.equal(writes, 1);
    assert.deepEqual(received, body);
  } finally {
    await service.stop();
  }
});

test('UP03 an unfinished raw POST receives redirect before EOF and shutdown releases its body owner', async () => {
  let writes = 0;
  const service = await startHttpServer({
    routes: [
      {
        path: '/api/commands',
        methods: {
          POST: () => {
            writes++;
            return Response.json({ ok: true });
          },
        },
      },
    ],
  });
  let socket: Socket | undefined;
  try {
    const url = new URL(service.url);
    const headers = await new Promise<string>((resolve, reject) => {
      socket = createConnection({ host: url.hostname, port: Number(url.port) }, () =>
        socket!.write(
          'POST /api/commands/ HTTP/1.1\r\nHost: ' +
            url.host +
            '\r\nContent-Length: 100000\r\nConnection: keep-alive\r\n\r\nx',
        ),
      );
      let received = '';
      socket.setTimeout(3000, () =>
        socket!.destroy(new Error('Incomplete-upload redirect timed out')),
      );
      socket.once('error', reject);
      socket.on('data', (chunk) => {
        received += chunk.toString('latin1');
        if (received.includes('\r\n\r\n')) resolve(received);
      });
    });
    assert.match(headers, /^HTTP\/1\.1 308 /);
    assert.match(headers, /location: \/api\/commands\r\n/i);
    assert.equal(writes, 0);
    await service.stop();
  } finally {
    socket?.destroy();
    await service.stop();
  }
});
