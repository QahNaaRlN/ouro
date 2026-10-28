import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Actor } from '@/packages/core/src/types';

const authGlobal = globalThis as unknown as { ouroSessionSecret?: string };
const secret = authGlobal.ouroSessionSecret ??= randomBytes(32).toString('hex');
export class AccessError extends Error {
  constructor(public code: string, message: string, public status = 403) { super(message); }
}
const eq = (a: string, b: string) => {
  const left=Buffer.from(a), right=Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left,right);
};
export function isLocalDemo(request: Request): boolean {
  const url = new URL(request.url);
  let host: string;
  try { host=new URL(`${url.protocol}//${request.headers.get('host') ?? url.host}`).hostname; }
  catch { return false; }
  const loopbacks=['localhost','127.0.0.1','[::1]'];
  return process.env.OURO_LOCAL_DEMO === '1' && loopbacks.includes(url.hostname) && loopbacks.includes(host);
}
export function issueLocalSession(request: Request): string {
  if (!isLocalDemo(request)) throw new AccessError('UNAUTHENTICATED', 'Демо-сессия доступна только на loopback. Настройте адаптер идентичности.', 401);
  const expires = String(Date.now() + 12 * 60 * 60 * 1000);
  const signature = createHmac('sha256', secret).update(expires).digest('hex');
  return `${expires}.${signature}`;
}
export function authenticatedActor(request: Request, projectId: string, agentId: string): Actor {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '');
  const humanToken = process.env.OURO_HUMAN_TOKEN;
  const agentToken = process.env.OURO_AGENT_TOKEN;
  if (humanToken && agentToken && eq(humanToken, agentToken)) throw new AccessError('CONFIGURATION_ERROR', 'У человека и агента должны быть разные ключи.', 503);
  if (bearer && humanToken && eq(bearer, humanToken)) return {id: 'human-token', kind:'human', name:'Человек', projectIds:[projectId]};
  if (bearer && agentToken && eq(bearer, agentToken)) return {id: agentId, kind:'agent', name:'Внешний агент', projectIds:[projectId]};
  const token = request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('ouro_session='))?.slice(13);
  if (token && isLocalDemo(request)) {
    const [expires, signature] = token.split('.');
    const expected = createHmac('sha256', secret).update(expires ?? '').digest('hex');
    if (signature && eq(signature, expected) && Number(expires) > Date.now()) return { id:'local-human', kind:'human', name:'Человек · локальная сессия', projectIds:[projectId] };
  }
  throw new AccessError('UNAUTHENTICATED', 'Необходима сессия человека или серверный токен агента.', 401);
}
export function assertHuman(actor: Actor) {
  if (actor.kind !== 'human') throw new AccessError('FORBIDDEN', 'Решение и управление принадлежат человеку.');
}
export function assertJsonWrite(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AccessError('UNSUPPORTED_MEDIA_TYPE', 'Используйте application/json.', 415);
  const origin = request.headers.get('origin');
  // Next's internal request URL may use localhost while the browser uses 127.0.0.1.
  // The browser-facing Host is authoritative here; local sessions validate it too.
  const url=new URL(request.url);
  const expectedOrigin=`${url.protocol}//${request.headers.get('host') ?? url.host}`;
  if (origin && origin !== expectedOrigin) throw new AccessError('FORBIDDEN', 'Межсайтовая запись запрещена.');
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 256_000) throw new AccessError('PAYLOAD_TOO_LARGE', 'Команда превышает 256 КБ.', 413);
}
export async function readCommandBody(request: Request): Promise<unknown> {
  assertJsonWrite(request);
  const body = await request.text();
  if (Buffer.byteLength(body) > 256_000) throw new AccessError('PAYLOAD_TOO_LARGE', 'Команда превышает 256 КБ.', 413);
  try { return JSON.parse(body); } catch { throw new AccessError('VALIDATION_ERROR', 'Некорректный JSON.', 400); }
}
