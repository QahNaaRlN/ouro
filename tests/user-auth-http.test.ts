import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../lib/store';
import { createUserAuthHandlers } from '../lib/user-auth-http';
import { PROJECT_ID, type Actor } from '../packages/core/src';

const operator: Actor = { id: 'local-human', kind: 'human', name: 'Оператор', projectIds: [PROJECT_ID] };
const password = 'correct horse battery staple';
const request = (path: string, body?: unknown, cookie?: string, base = 'http://127.0.0.1', origin?: string) => new Request(base + path, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
async function fixture() {
  const store = await createStore({ dataDir: 'memory://' });
  const handlers = createUserAuthHandlers({ getAuth: async () => store });
  const account = await store.createAccount({ email: 'Alice@Example.com', name: 'Алиса', password }, operator);
  return { store, handlers, account };
}

test('AA01/AA03/AA06 HTTP login issues an opaque secure session and logout revokes it', async () => {
  const f = await fixture();
  try {
    const login = await f.handlers.login(request('/api/auth/login', { email: 'alice@example.com', password }));
    assert.equal(login.status, 200);
    const body = JSON.stringify(await login.clone().json());
    assert(!body.includes(password));
    assert(!body.includes('ouro_user_'));
    const cookie = login.headers.getSetCookie().find(value => value.startsWith('ouro_user_session='))!;
    assert.match(cookie, /^ouro_user_session=ouro_user_[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200/);
    const pair = cookie.split(';')[0];
    const session = await f.handlers.session(request('/api/auth/session', undefined, pair));
    assert.equal(session.status, 200);
    assert.equal((await session.json()).account.id, f.account.account.id);
    assert.equal((await f.handlers.session(request('/api/auth/session', undefined, `${pair}; ${pair}`))).status, 401);
    const logout = await f.handlers.logout(request('/api/auth/logout', {}, pair));
    assert.equal(logout.status, 200);
    assert.match(logout.headers.getSetCookie()[0], /Max-Age=0/);
    assert.equal((await f.handlers.session(request('/api/auth/session', undefined, pair))).status, 401);
  } finally { await f.store.close(); }
});

test('AA10 login has identical unknown-account and wrong-password responses and a rate limit', async () => {
  const f = await fixture();
  try {
    const missing = await f.handlers.login(request('/api/auth/login', { email: 'missing@example.com', password }));
    const wrong = await f.handlers.login(request('/api/auth/login', { email: 'alice@example.com', password: 'wrong password' }));
    assert.equal(missing.status, 401);
    assert.equal(wrong.status, 401);
    assert.deepEqual(await missing.json(), await wrong.json());
    for (let index = 0; index < 9; index++) {
      assert.equal((await f.handlers.login(request('/api/auth/login', { email: 'alice@example.com', password: 'wrong password' }))).status, 401);
    }
    assert.equal((await f.handlers.login(request('/api/auth/login', { email: 'alice@example.com', password }))).status, 429);
    assert.equal((await f.handlers.login(request('/api/auth/login', { email: 'alice@example.com', password }, undefined, 'http://127.0.0.1', 'https://evil.example'))).status, 403);
  } finally { await f.store.close(); }
});

test('AA03/AA10 HTTPS cookies are Secure and cross-origin writes are rejected before authentication', async () => {
  const f = await fixture();
  const old = process.env.OURO_PUBLIC_URL;
  process.env.OURO_PUBLIC_URL = 'https://ouro.example.com';
  try {
    const login = await f.handlers.login(request('/api/auth/login', { email: 'alice@example.com', password }, undefined, 'https://ouro.example.com'));
    assert.equal(login.status, 200);
    assert.match(login.headers.getSetCookie().find(value => value.startsWith('ouro_user_session='))!, /; Secure$/);
    const crossOrigin = await f.handlers.login(request('/api/auth/login', { email: 'alice@example.com', password }, undefined, 'https://ouro.example.com', 'https://evil.example'));
    assert.equal(crossOrigin.status, 403);
  } finally {
    await f.store.close();
    if (old === undefined) delete process.env.OURO_PUBLIC_URL; else process.env.OURO_PUBLIC_URL = old;
  }
});
