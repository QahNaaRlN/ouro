import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../lib/store';
import { createUserAuthHandlers } from '../lib/user-auth-http';
import { createProjectHandlers } from '../lib/project-http';
import { PROJECT_ID, type Actor } from '../packages/core/src';

const origin = 'https://ouro.example.com';
const password = 'correct horse battery staple';
const operator: Actor = { id: 'local-human', kind: 'human', projectIds: [PROJECT_ID] };
const request = (path: string, body: unknown, client: number) => new Request(origin + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': `203.0.113.${client}` },
  body: JSON.stringify(body),
});

async function fixture() {
  const oldOrigin = process.env.OURO_PUBLIC_URL;
  process.env.OURO_PUBLIC_URL = origin;
  const codes = new Map<string, string>();
  const store = await createStore({
    dataDir: 'memory://',
    seedEvents: [],
    mailer: { sendInvitation: async () => {}, sendPasswordReset: async input => { codes.set(input.email, input.code); } },
  });
  await store.createAccount({ email: 'alice@example.com', name: 'Alice', password }, operator);
  await store.createAccount({ email: 'bob@example.com', name: 'Bob', password }, operator);
  return {
    store,
    codes,
    users: createUserAuthHandlers({ getAuth: async () => store }),
    projects: createProjectHandlers({ getStore: async () => store }),
    close: async () => {
      await store.close();
      if (oldOrigin === undefined) delete process.env.OURO_PUBLIC_URL; else process.env.OURO_PUBLIC_URL = oldOrigin;
    },
  };
}

test('R08 login limits the normalized account across forged forwarding headers without mixing independent accounts', async () => {
  const f = await fixture();
  try {
    for (let index = 0; index < 10; index++) {
      const response = await f.users.login(request('/api/auth/login', {
        email: index % 2 ? ' ALICE@EXAMPLE.COM ' : 'alice@example.com', password: 'incorrect password',
      }, index + 1));
      assert.equal(response.status, 401);
    }
    const limited = await f.users.login(request('/api/auth/login', { email: 'alice@example.com', password }, 50));
    assert.equal(limited.status, 429, 'a fresh forwarding header must not reset the account failure budget');

    const independent = await f.users.login(request('/api/auth/login', { email: 'bob@example.com', password }, 50));
    assert.equal(independent.status, 200, 'another account must not inherit the first account limit');

    for (let index = 0; index < 10; index++) {
      const response = await f.users.login(request('/api/auth/login', { email: 'missing@example.com', password: 'incorrect password' }, index + 60));
      assert.equal(response.status, 401);
    }
    const missing = await f.users.login(request('/api/auth/login', { email: 'missing@example.com', password }, 80));
    assert.equal(missing.status, 429);
    assert.deepEqual(await missing.json(), await limited.json(), 'the limit must not disclose whether the account exists');
  } finally { await f.close(); }
});

test('R08 password-reset requests retain an account budget across forwarding changes and preserve generic responses', async () => {
  const f = await fixture();
  try {
    for (let index = 0; index < 5; index++) {
      const response = await f.projects.requestPasswordReset(request('/api/auth/password-reset/request', { email: index % 2 ? ' ALICE@EXAMPLE.COM ' : 'alice@example.com' }, index + 1));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
    }
    const limited = await f.projects.requestPasswordReset(request('/api/auth/password-reset/request', { email: 'alice@example.com' }, 50));
    assert.equal(limited.status, 429, 'changing the forwarding header must not create a fresh reset-request budget');

    const independent = await f.projects.requestPasswordReset(request('/api/auth/password-reset/request', { email: 'bob@example.com' }, 50));
    const missing = await f.projects.requestPasswordReset(request('/api/auth/password-reset/request', { email: 'missing@example.com' }, 50));
    assert.equal(independent.status, 200);
    assert.equal(missing.status, 200);
    assert.deepEqual(await independent.json(), await missing.json());
  } finally { await f.close(); }
});

test('R08 reset confirmation limits the same code operation across forwarding changes without blocking another account', async () => {
  const f = await fixture();
  try {
    const invalidCode = 'A'.repeat(43);
    for (let index = 0; index < 10; index++) {
      const response = await f.projects.resetPassword(request('/api/auth/password-reset/confirm', { code: invalidCode, password: 'replacement password' }, index + 1));
      assert.equal(response.status, 422);
      assert.equal((await response.json()).error.code, 'RESET_INVALID');
    }
    const limited = await f.projects.resetPassword(request('/api/auth/password-reset/confirm', { code: invalidCode, password: 'replacement password' }, 50));
    assert.equal(limited.status, 429, 'the same code must retain its budget when the forwarding header changes');

    const resetRequest = await f.projects.requestPasswordReset(request('/api/auth/password-reset/request', { email: 'bob@example.com' }, 50));
    assert.equal(resetRequest.status, 200);
    const reset = await f.projects.resetPassword(request('/api/auth/password-reset/confirm', { code: f.codes.get('bob@example.com')!, password: 'independent account password' }, 50));
    assert.equal(reset.status, 200, 'the operation limit must not become a shared block for unrelated accounts');
    const login = await f.users.login(request('/api/auth/login', { email: 'bob@example.com', password: 'independent account password' }, 50));
    assert.equal(login.status, 200);
  } finally { await f.close(); }
});
