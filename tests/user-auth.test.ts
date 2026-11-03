import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createUserAuth, type AuthConnection } from '../lib/user-auth';
import { PROJECT_ID, type Actor } from '../packages/core/src';

const operator: Actor = { id: 'local-human', kind: 'human', name: 'Оператор', projectIds: [PROJECT_ID] };
const hasCode = (code: string) => (error: unknown) => (error as { code?: string }).code === code;

async function fixture(directory = 'memory://') {
  const pg = new PGlite(directory);
  await pg.waitReady;
  for (const file of ['001_initial.sql', '007_identity.sql']) await pg.exec(await readFile(path.join(process.cwd(), 'db/migrations', file), 'utf8'));
  await pg.query('INSERT INTO ouro_projects (id,version) VALUES ($1,0) ON CONFLICT (id) DO NOTHING', [PROJECT_ID]);
  await pg.query('INSERT INTO ouro_principals (id,kind) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING', [operator.id, operator.kind]);
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(fn: () => Promise<T>) => { const run = tail.then(fn, fn); tail = run.catch(() => undefined); return run; };
  const db = {
    query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => pg.query<T>(sql, values),
    exec: (sql: string) => pg.exec(sql),
    transaction: <T>(fn: (tx: AuthConnection) => Promise<T>) => pg.transaction(tx => fn({ query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => tx.query<R>(sql, values), exec: (sql: string) => tx.exec(sql) })),
  };
  return { auth: createUserAuth({ db, serialize }), pg };
}

const input = (email: string, password = 'correct horse battery staple') => ({ email, name: email.split('@')[0], password });

test('AA01/AA03 independent email accounts use Argon2id and opaque sessions without persisted secrets', async () => {
  const f = await fixture();
  try {
    const alice = await f.auth.createAccount(input('Alice@Example.com'), operator);
    const bob = await f.auth.createAccount(input('bob@example.com'), operator);
    assert.notEqual(alice.account.id, bob.account.id);
    assert.equal(alice.account.email, 'alice@example.com');
    assert(alice.account.emailVerifiedAt);
    const aliceLogin = await f.auth.authenticate('alice@example.com', 'correct horse battery staple', 'test-a');
    const bobLogin = await f.auth.authenticate('bob@example.com', 'correct horse battery staple', 'test-b');
    assert(aliceLogin && bobLogin);
    assert.notEqual(aliceLogin.token, bobLogin.token);
    assert.match(aliceLogin.token, /^ouro_user_[A-Za-z0-9_-]{43}$/);
    assert.equal((await f.auth.resolveSession(aliceLogin.token))?.account.id, alice.account.id);
    assert.equal(await f.auth.authenticate('alice@example.com', 'wrong password', 'test-c'), null);
    assert.equal(await f.auth.authenticate('missing@example.com', 'correct horse battery staple', 'test-d'), null);
    const raw = await f.pg.query("SELECT row_to_json(a) AS account, row_to_json(p) AS password FROM ouro_user_accounts a JOIN ouro_user_password_credentials p ON p.user_id=a.id");
    const persisted = JSON.stringify(raw.rows);
    assert.match(persisted, /\$argon2id\$/);
    assert(!persisted.includes('correct horse battery staple'));
    assert(!JSON.stringify(alice.account).includes(aliceLogin.token));
  } finally { await f.pg.close(); }
});

test('AA06 session revocation and account disable survive reopen and reject captured sessions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ouro-user-auth-'));
  let f: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    f = await fixture(directory);
    const created = await f.auth.createAccount(input('revoke@example.com'), operator);
    const login = (await f.auth.authenticate(created.account.email, 'correct horse battery staple', 'test'))!;
    await f.pg.close();
    f = undefined;
    f = await fixture(directory);
    assert.equal((await f.auth.resolveSession(login.token))?.account.id, created.account.id);
    await f.auth.revokeSession(login.token);
    assert.equal(await f.auth.resolveSession(login.token), null);
    const second = (await f.auth.authenticate(created.account.email, 'correct horse battery staple', 'test'))!;
    await f.auth.disableAccount(created.account.id, operator);
    assert.equal(await f.auth.resolveSession(second.token), null);
    assert.equal(await f.auth.authenticate(created.account.email, 'correct horse battery staple', 'test'), null);
    await f.pg.close();
    f = undefined;
    f = await fixture(directory);
    assert.equal(await f.auth.resolveSession(second.token), null);
    assert.equal(await f.auth.authenticate(created.account.email, 'correct horse battery staple', 'test'), null);
  } finally { if (f) await f.pg.close(); await rm(directory, { recursive: true, force: true }); }
});

test('AA01/AA02 account creation is operator-only and validates email/password without duplicate identities', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.auth.createAccount(input('agent@example.com'), { id: 'agent', kind: 'agent', projectIds: [PROJECT_ID] }), hasCode('FORBIDDEN'));
    for (const value of ['', 'bad', 'missing@']) await assert.rejects(f.auth.createAccount(input(value), operator), hasCode('VALIDATION_ERROR'));
    await assert.rejects(f.auth.createAccount(input('short@example.com', 'too-short'), operator), hasCode('VALIDATION_ERROR'));
    await f.auth.createAccount(input('unique@example.com'), operator);
    await assert.rejects(f.auth.createAccount(input('UNIQUE@example.com'), operator), hasCode('ACCOUNT_EXISTS'));
  } finally { await f.pg.close(); }
});
