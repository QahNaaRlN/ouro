import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import type { UserAuth, UserAccount } from '../../../lib/user-auth';
import type { Actor } from '../../../packages/core/src/types';
import type { ProjectStreamClock } from '../../../lib/project-stream';

/** Существующий root пока CommonJS; qualification не меняет его module contract. */
const rootRequire = createRequire(import.meta.url);
const { createUserAuthHandlers }: typeof import('../../../lib/user-auth-http') = rootRequire('../../../lib/user-auth-http');
const { applyCommand, emptyState, PROJECT_ID }: typeof import('../../../packages/core/src/engine') = rootRequire('../../../packages/core/src/engine');
const { createProjectStreamHandler }: typeof import('../../../lib/project-stream') = rootRequire('../../../lib/project-stream');

/** Результат настоящего TCP-запроса с исходными множественными headers. */
export type HttpResult = { status: number; headers: IncomingHttpHeaders; rawHeaders: string[]; body: Buffer };

/** Отправляет chunks настоящему Node listener, включая chunked body без Content-Length. */
export function tcpRequest(url: string, method = 'GET', chunks: readonly Uint8Array[] = [], headers: Record<string, string> = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method, headers, agent: false }, response => {
      const received: Buffer[] = [];
      response.on('data', (chunk: Buffer) => received.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, rawHeaders: response.rawHeaders, body: Buffer.concat(received) }));
    });
    request.setTimeout(2500, () => request.destroy(new Error('Fixture HTTP deadline exceeded')));
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

/** Ограниченно ожидает наблюдаемое условие, не завися от произвольной большой задержки. */
export async function waitFor(predicate: () => boolean, label: string, timeoutMs = 1500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await delay(5);
  }
}

/** Открывает progressive HTTP response и сохраняет chunks без ожидания конца. */
export async function openResponse(url: string, headers: Record<string, string> = {}) {
  const request = httpRequest(url, { headers, agent: false });
  const response = await new Promise<IncomingMessage>((resolve, reject) => { request.on('response', resolve); request.on('error', reject); request.end(); });
  let body = '';
  response.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
  response.on('error', () => undefined);
  return { request, response, text: () => body, abort: () => request.destroy() };
}

/** Typed fixture идентичности; SQL, credentials и рабочие профили не читаются. */
export function authFixture() {
  const account: UserAccount = { id: 'fixture-user', email: 'fixture@example.test', name: 'Fixture', emailVerifiedAt: null, createdAt: '2026-11-04T00:00:00.000Z', createdBy: 'fixture', disabledAt: null };
  const actor: Actor = { id: account.id, kind: 'human', name: account.name, projectIds: [PROJECT_ID] };
  const session = { account, actor, expiresAt: '2099-11-04T00:00:00.000Z' };
  let revoked = false, authentications = 0;
  const auth: UserAuth = {
    createAccount: async () => { throw new Error('Unexpected fixture createAccount'); },
    disableAccount: async () => { throw new Error('Unexpected fixture disableAccount'); },
    authenticate: async () => { authentications++; return { ...session, token: 'fixture-session-token' }; },
    resolveSession: async token => token === 'fixture-session-token' && !revoked ? session : null,
    revokeSession: async () => { revoked = true; },
  };
  return { actor, handlers: createUserAuthHandlers({ getAuth: async () => auth }), authentications: () => authentications };
}

/** Реальный SSE factory с чистым domain fixture и измеряемым cleanup таймеров. */
export function streamFixture() {
  const actor: Actor = { id: 'fixture-human', kind: 'human', projectIds: [PROJECT_ID] };
  let state = emptyState(), reads = 0, aborted = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const clock: ProjectStreamClock = {
    now: Date.now,
    schedule(callback, milliseconds) {
      const timer = setTimeout(() => { timers.delete(timer); callback(); }, milliseconds);
      timers.add(timer);
      return () => { clearTimeout(timer); timers.delete(timer); };
    },
  };
  const handler = createProjectStreamHandler({
    authenticateHuman: request => { request.signal.addEventListener('abort', () => { aborted = true; }, { once: true }); return actor; },
    store: { getProject: async () => state, getEvents: async () => { reads++; return { cursor: state.version, events: state.events }; } },
    clock, pollIntervalMs: 10, heartbeatMs: 1000, lifetimeMs: 5000,
  });
  return {
    handler, timers: () => timers.size, reads: () => reads, aborted: () => aborted,
    update() { state = applyCommand(state, { type: 'initializeProject', name: 'Transport fixture', requestId: 'stream-fixture-init', expectedVersion: 0 }, actor).state; },
  };
}
