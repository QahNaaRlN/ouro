import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { startHttpServer } from '../src/bootstrap/start-http-server.js';
import type { ServiceDiagnostic } from '../src/http/service-types.js';
import type { GitHubHttpStore } from '../../../lib/github/http';
import { authFixture, openResponse, streamFixture, tcpRequest, waitFor } from './http-fixtures.js';

/** Typed bridge к существующим CommonJS factories без изменения root package. */
const rootRequire = createRequire(import.meta.url);
const { createGitHubHandlers }: typeof import('../../../lib/github/http') = rootRequire(
  '../../../lib/github/http',
);
const { checkHealth }: typeof import('../../../lib/health') = rootRequire('../../../lib/health');

test('SQ02 real auth factory retains three cookies, session/logout and origin refusal through TCP', async () => {
  const fixture = authFixture();
  const service = await startHttpServer({
    routes: [
      {
        path: '/api/auth/login',
        methods: { POST: (request) => fixture.handlers.login(request) },
        maxBodyBytes: 256000,
      },
      {
        path: '/api/auth/logout',
        methods: { POST: (request) => fixture.handlers.logout(request) },
        maxBodyBytes: 256000,
      },
      {
        path: '/api/auth/session',
        methods: { GET: (request) => fixture.handlers.session(request) },
      },
    ],
  });
  try {
    const login = await tcpRequest(
      service.url + '/api/auth/login',
      'POST',
      [
        Buffer.from(
          JSON.stringify({ email: 'fixture@example.test', password: 'fixture-password' }),
        ),
      ],
      { 'Content-Type': 'application/json' },
    );
    assert.equal(login.status, 200);
    assert.equal(login.headers['set-cookie']?.length, 3);
    assert.match(
      login.headers['set-cookie']?.[0] ?? '',
      /HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200/,
    );
    assert.equal(login.headers['cache-control'], 'no-store');
    const cookie = login.headers['set-cookie']![0].split(';')[0];
    assert.equal(
      (await tcpRequest(service.url + '/api/auth/session', 'GET', [], { Cookie: cookie })).status,
      200,
    );
    const refused = await tcpRequest(service.url + '/api/auth/login', 'POST', [Buffer.from('{}')], {
      'Content-Type': 'application/json',
      Origin: 'https://foreign.invalid',
    });
    assert.equal(refused.status, 403);
    assert.equal(fixture.authentications(), 1);
    const logout = await tcpRequest(service.url + '/api/auth/logout', 'POST', [Buffer.from('{}')], {
      'Content-Type': 'application/json',
      Cookie: cookie,
    });
    assert.equal(logout.headers['set-cookie']?.length, 3);
    assert.equal(
      (await tcpRequest(service.url + '/api/auth/session', 'GET', [], { Cookie: cookie })).status,
      401,
    );
  } finally {
    await service.stop();
  }
});

test('SQ05 Next method contract supplies OPTIONS/Allow, HEAD cleanup, implicit and explicit 405', async () => {
  let cancelled = 0;
  const service = await startHttpServer({
    routes: [
      {
        path: '/api/resource',
        methods: {
          GET: () =>
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(Buffer.from('retained'));
                },
                cancel() {
                  cancelled++;
                },
              }),
              { headers: { 'X-Fixture': 'kept' } },
            ),
          POST: () => Response.json({ ok: true }),
        },
      },
      {
        path: '/api/mcp',
        methods: {
          POST: () => Response.json({ ok: true }),
          GET: () =>
            new Response(null, {
              status: 405,
              headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
            }),
          DELETE: () => new Response(null, { status: 405, headers: { Allow: 'POST' } }),
        },
      },
      {
        path: '/api/disabled',
        methods: { GET: undefined, POST: () => Response.json({ ok: true }) },
      },
    ],
  });
  try {
    const options = await tcpRequest(service.url + '/api/resource', 'OPTIONS');
    assert.equal(options.status, 204);
    assert.equal(options.headers.allow, 'GET, HEAD, OPTIONS, POST');
    const head = await tcpRequest(service.url + '/api/resource', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.equal(head.headers['x-fixture'], 'kept');
    assert.equal(cancelled, 1, 'HEAD must cancel the unused GET body');
    const unsupported = await tcpRequest(service.url + '/api/resource', 'PATCH');
    assert.equal(unsupported.status, 405);
    assert.equal(unsupported.headers.allow, undefined);
    const mcp = await tcpRequest(service.url + '/api/mcp');
    assert.equal(mcp.status, 405);
    assert.equal(mcp.headers.allow, 'POST');
    assert.equal(
      (await tcpRequest(service.url + '/api/disabled', 'OPTIONS')).headers.allow,
      'OPTIONS, POST',
    );
    assert.equal((await tcpRequest(service.url + '/api/missing')).status, 404);
  } finally {
    await service.stop();
  }
});

test('SQ04 streamed body cap rejects oversized chunks before application execution', async () => {
  let called = 0;
  const service = await startHttpServer({
    routes: [
      {
        path: '/api/body',
        maxBodyBytes: 8,
        methods: {
          POST: async (request) => {
            called++;
            return new Response(await request.arrayBuffer());
          },
        },
      },
    ],
  });
  try {
    const exact = await tcpRequest(service.url + '/api/body', 'POST', [
      Buffer.from('1234'),
      Buffer.from('5678'),
    ]);
    assert.equal(exact.status, 200);
    assert.equal(exact.body.toString(), '12345678');
    const oversized = await tcpRequest(service.url + '/api/body', 'POST', [
      Buffer.from('1234'),
      Buffer.from('56789'),
    ]);
    assert.equal(oversized.status, 413);
    assert.equal(called, 1);
    const error: unknown = JSON.parse(oversized.body.toString());
    assert.deepEqual(error, {
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds its operation limit.' },
    });
  } finally {
    await service.stop();
  }
});

test('SQ03 actual webhook verifies byte-exact chunked HMAC and queues before deferred kick', async () => {
  const secret = 'fixture-only-secret';
  let enqueued = 0,
    kicked = 0;
  const store: GitHubHttpStore = {
    getProject: async () => ({ githubBindings: [] }),
    listGitHubDeliveries: async () => [],
    createGitHubBinding: async () => ({}),
    executeCommand: async () => ({}),
    retryGitHubDelivery: async () => ({}),
    enqueueGitHubDelivery: async () => {
      enqueued++;
      return { delivery: { id: 'fixture-delivery' }, duplicate: false };
    },
  };
  const service = await startHttpServer({
    routes: [
      {
        path: '/api/github/webhook',
        maxBodyBytes: 2 * 1024 * 1024,
        methods: {
          POST: (request, context) =>
            createGitHubHandlers({
              getStore: async () => store,
              env: () => ({ secret }),
              client: {
                resolveRepository: async () => {
                  throw new Error('Unexpected external API');
                },
              },
              afterResponse: context.afterResponse,
              kick: async () => {
                assert.equal(enqueued, 1);
                kicked++;
              },
            }).webhook(request),
        },
      },
    ],
  });
  try {
    const raw = Buffer.from(
      '{\n "repository":{"id":42,"full_name":"fixture/repository"}, "ref":"refs/heads/main", "before":"' +
        'b'.repeat(40) +
        '", "after":"' +
        'a'.repeat(40) +
        '", "deleted":false, "commits":[{"id":"' +
        'a'.repeat(40) +
        '","message":"проверка"}]\n}',
    );
    const headers = {
      'Content-Type': 'application/json',
      'X-GitHub-Delivery': 'fixture-delivery',
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'),
    };
    const accepted = await tcpRequest(
      service.url + '/api/github/webhook',
      'POST',
      [raw.subarray(0, 13), raw.subarray(13, raw.length - 3), raw.subarray(raw.length - 3)],
      headers,
    );
    assert.equal(accepted.status, 202);
    assert.equal(enqueued, 1);
    await waitFor(() => kicked === 1, 'deferred GitHub kick');
    assert.equal(
      (
        await tcpRequest(service.url + '/api/github/webhook', 'POST', [raw], {
          ...headers,
          'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64),
        })
      ).status,
      401,
    );
    assert.equal(enqueued, 1);
  } finally {
    await service.stop();
  }
});

test('SQ06 existing SSE delivers progressive snapshots and cancels its timers on client disconnect', async () => {
  const fixture = streamFixture();
  const service = await startHttpServer({
    routes: [{ path: '/api/stream', methods: { GET: (request) => fixture.handler(request) } }],
  });
  try {
    const stream = await openResponse(service.url + '/api/stream');
    assert.equal(stream.response.headers['content-type'], 'text/event-stream; charset=utf-8');
    assert.equal(stream.response.headers['cache-control'], 'no-store, no-transform');
    assert.equal(stream.response.headers['x-accel-buffering'], 'no');
    await waitFor(
      () => stream.text().includes('id: 0\nevent: snapshot'),
      'first progressive frame',
    );
    fixture.update();
    await waitFor(() => stream.text().includes('id: 1\nevent: snapshot'), 'next progressive frame');
    stream.abort();
    await waitFor(() => fixture.aborted() && fixture.timers() === 0, 'abort cleanup');
    const reads = fixture.reads();
    await new Promise<void>((resolve) => setTimeout(resolve, 35));
    assert.equal(fixture.reads(), reads);
  } finally {
    await service.stop();
  }
});

test('SQ07 thrown handler is sanitized and a failing reporter cannot replace the HTTP result', async () => {
  const events: ServiceDiagnostic[] = [];
  const service = await startHttpServer({
    report: (event) => {
      events.push(event);
      throw new Error('reporter-private-secret');
    },
    routes: [
      {
        path: '/api/error',
        methods: {
          GET: () => {
            throw new Error('handler-private-secret');
          },
        },
      },
    ],
  });
  try {
    const result = await tcpRequest(service.url + '/api/error');
    assert.equal(result.status, 500);
    assert.equal(result.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(result.body.toString()), {
      error: { code: 'INTERNAL_ERROR', message: 'Operation outcome is not confirmed.' },
    });
    assert.deepEqual(events, [{ code: 'HANDLER_FAILED', operation: 'GET /api/error' }]);
  } finally {
    await service.stop();
  }
});

test('SQ08 background starts after the entire response finishes and stop drains the owned task', async () => {
  let started = false,
    finished = false,
    responseClosed = false;
  let endResponse: (() => void) | undefined, finishTask: (() => void) | undefined;
  const taskGate = new Promise<void>((resolve) => {
    finishTask = resolve;
  });
  const service = await startHttpServer({
    routes: [
      {
        path: '/api/deferred',
        methods: {
          GET: (_request, context) => {
            context.afterResponse(async () => {
              started = true;
              await taskGate;
              finished = true;
            });
            return new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(Buffer.from('first'));
                  endResponse = () => {
                    if (!responseClosed) {
                      responseClosed = true;
                      controller.close();
                    }
                  };
                },
              }),
            );
          },
        },
      },
    ],
  });
  try {
    const response = await openResponse(service.url + '/api/deferred');
    await waitFor(() => response.text() === 'first', 'response prefix');
    assert.equal(started, false, 'a task must wait for the response finish event');
    endResponse?.();
    await waitFor(() => started, 'task starts after finish');
    let stopped = false;
    const stop = service.stop().then(() => {
      stopped = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(stopped, false);
    finishTask?.();
    await stop;
    assert.equal(finished, true);
  } finally {
    finishTask?.();
    endResponse?.();
    await service.stop();
  }
});

test('SQ09 stop is idempotent and aborts an open existing SSE without waiting for its lifetime', async () => {
  const fixture = streamFixture();
  const service = await startHttpServer({
    shutdownTimeoutMs: 300,
    routes: [{ path: '/api/stream', methods: { GET: (request) => fixture.handler(request) } }],
  });
  try {
    const response = await openResponse(service.url + '/api/stream');
    await waitFor(() => response.text().includes('event: snapshot'), 'open SSE');
    await service.stop();
    await service.stop();
    assert.equal(fixture.timers(), 0);
    assert.equal(fixture.aborted(), true);
    await assert.rejects(tcpRequest(service.url + '/api/stream'));
  } finally {
    await service.stop();
  }
});

test('SQ02 health factory preserves readiness failure and no-store through TCP', async () => {
  const service = await startHttpServer({
    routes: [
      {
        path: '/api/health',
        methods: {
          GET: () =>
            checkHealth(
              async () => ({
                inspect: async () => {
                  throw new Error('fixture offline');
                },
              }),
              'fixture',
              50,
            ),
        },
      },
    ],
  });
  try {
    const result = await tcpRequest(service.url + '/api/health');
    assert.equal(result.status, 503);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(result.body.toString()), { status: 'unavailable' });
  } finally {
    await service.stop();
  }
});

test('SQ02 trusted HTTPS origin keeps Secure cookies and forged forwarding headers cannot authorize another Host', async () => {
  const previous = process.env.OURO_PUBLIC_URL;
  const fixture = authFixture();
  const service = await startHttpServer({
    routes: [
      {
        path: '/api/auth/login',
        maxBodyBytes: 256000,
        methods: { POST: (request) => fixture.handlers.login(request) },
      },
    ],
  });
  process.env.OURO_PUBLIC_URL = service.url.replace('http:', 'https:');
  try {
    const body = [
      Buffer.from(JSON.stringify({ email: 'fixture@example.test', password: 'fixture-password' })),
    ];
    const headers = { 'Content-Type': 'application/json', Origin: process.env.OURO_PUBLIC_URL };
    const forged = await tcpRequest(service.url + '/api/auth/login', 'POST', body, {
      ...headers,
      Host: 'foreign.invalid',
      'X-Forwarded-Host': new URL(service.url).host,
      'X-Forwarded-Proto': 'https',
    });
    assert.equal(forged.status, 403);
    assert.equal(fixture.authentications(), 0);
    const accepted = await tcpRequest(service.url + '/api/auth/login', 'POST', body, headers);
    assert.equal(accepted.status, 200);
    assert.match(accepted.headers['set-cookie']?.[0] ?? '', /; Secure$/);
    assert.equal(accepted.headers['set-cookie']?.length, 3);
  } finally {
    if (previous === undefined) delete process.env.OURO_PUBLIC_URL;
    else process.env.OURO_PUBLIC_URL = previous;
    await service.stop();
  }
});

test('SQ04 route-specific budgets retain webhook-sized bytes above generic command limit', async () => {
  let webhookBytes = 0,
    commandCalls = 0;
  const service = await startHttpServer({
    routes: [
      {
        path: '/api/command',
        maxBodyBytes: 256000,
        methods: {
          POST: () => {
            commandCalls++;
            return Response.json({ ok: true });
          },
        },
      },
      {
        path: '/api/webhook-bytes',
        maxBodyBytes: 2 * 1024 * 1024,
        methods: {
          POST: async (request) => {
            webhookBytes = (await request.arrayBuffer()).byteLength;
            return Response.json({ bytes: webhookBytes });
          },
        },
      },
    ],
  });
  try {
    const payload = Buffer.alloc(256001, 97);
    assert.equal((await tcpRequest(service.url + '/api/command', 'POST', [payload])).status, 413);
    assert.equal(commandCalls, 0);
    assert.equal(
      (
        await tcpRequest(service.url + '/api/webhook-bytes', 'POST', [
          payload.subarray(0, 65536),
          payload.subarray(65536),
        ])
      ).status,
      200,
    );
    assert.equal(webhookBytes, payload.length);
    const oversized = await tcpRequest(service.url + '/api/webhook-bytes', 'POST', [
      Buffer.alloc(2 * 1024 * 1024 + 1),
    ]);
    assert.equal(oversized.status, 413);
    assert.equal(webhookBytes, payload.length);
  } finally {
    await service.stop();
  }
});

test('SQ08 pending responses reserve bounded background capacity and failed work is safely reported', async () => {
  const events: ServiceDiagnostic[] = [];
  let closeResponse: (() => void) | undefined,
    ran = 0,
    closed = false;
  const service = await startHttpServer({
    maxBackgroundTasks: 1,
    report: (event) => {
      events.push(event);
      return Promise.reject(new Error('private-reporter-failure'));
    },
    routes: [
      {
        path: '/api/held',
        methods: {
          GET: (_request, context) => {
            context.afterResponse(async () => {
              ran++;
              throw new Error('private-background-failure');
            });
            return new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(Buffer.from('held'));
                  closeResponse = () => {
                    if (!closed) {
                      closed = true;
                      controller.close();
                    }
                  };
                },
              }),
            );
          },
        },
      },
      {
        path: '/api/full',
        methods: {
          GET: (_request, context) => {
            context.afterResponse(async () => {
              ran++;
            });
            return Response.json({ ok: true });
          },
        },
      },
    ],
  });
  try {
    const held = await openResponse(service.url + '/api/held');
    await waitFor(() => held.text() === 'held', 'reserved response');
    const denied = await tcpRequest(service.url + '/api/full');
    assert.equal(denied.status, 503);
    assert.deepEqual(JSON.parse(denied.body.toString()), {
      error: { code: 'BACKGROUND_QUEUE_FULL', message: 'Background task capacity is exhausted.' },
    });
    assert.equal(ran, 0);
    closeResponse?.();
    await waitFor(() => events.length === 1, 'safe failed task report');
    assert.deepEqual(events, [{ code: 'BACKGROUND_TASK_FAILED', operation: 'GET /api/held' }]);
    assert.equal(ran, 1);
  } finally {
    closeResponse?.();
    await service.stop();
  }
});

test('SQ09 unfinished owned task produces a bounded shutdown failure and closes the listener', async () => {
  let started = false;
  const events: ServiceDiagnostic[] = [];
  const service = await startHttpServer({
    shutdownTimeoutMs: 50,
    report: (event) => {
      events.push(event);
    },
    routes: [
      {
        path: '/api/hung',
        methods: {
          GET: (_request, context) => {
            context.afterResponse(async () => {
              started = true;
              await new Promise<void>(() => undefined);
            });
            return Response.json({ accepted: true });
          },
        },
      },
    ],
  });
  try {
    assert.equal((await tcpRequest(service.url + '/api/hung')).status, 200);
    await waitFor(() => started, 'owned task running');
    await assert.rejects(service.stop(), /shutdown deadline/);
    await assert.rejects(service.stop(), /shutdown deadline/);
    assert.deepEqual(events, [{ code: 'SHUTDOWN_TIMED_OUT', operation: 'service.stop' }]);
    await assert.rejects(tcpRequest(service.url + '/api/hung'));
  } finally {
    await service.stop().catch(() => undefined);
  }
});

test('SQ08 cooperative background abort clears a real task interval before shutdown resolves', async () => {
  let started = false,
    liveTimer = false,
    cleaned = 0;
  let timer: ReturnType<typeof setInterval> | undefined, release: (() => void) | undefined;
  const service = await startHttpServer({
    shutdownTimeoutMs: 100,
    routes: [
      {
        path: '/api/timed-task',
        methods: {
          GET: (_request, context) => {
            context.afterResponse(
              async (signal: AbortSignal) =>
                new Promise<void>((resolve) => {
                  release = resolve;
                  timer = setInterval(() => undefined, 10);
                  liveTimer = true;
                  const cleanup = () => {
                    if (!liveTimer) return;
                    if (timer) clearInterval(timer);
                    liveTimer = false;
                    cleaned++;
                    resolve();
                  };
                  signal?.addEventListener('abort', cleanup, { once: true });
                  if (signal?.aborted) cleanup();
                  started = true;
                }),
            );
            return Response.json({ accepted: true });
          },
        },
      },
    ],
  });
  try {
    assert.equal((await tcpRequest(service.url + '/api/timed-task')).status, 200);
    await waitFor(() => started && liveTimer, 'real task timer running');
    await service.stop();
    assert.equal(liveTimer, false);
    assert.equal(cleaned, 1);
  } finally {
    if (timer) clearInterval(timer);
    release?.();
    await service.stop().catch(() => undefined);
  }
});
