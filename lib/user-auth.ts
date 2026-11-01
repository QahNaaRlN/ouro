import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify, type Options } from '@node-rs/argon2';
import { PROJECT_ID, type Actor } from '../packages/core/src';
import { isWellFormedUnicode } from '../packages/core/src/unicode';

export type AuthConnection = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>; exec(sql: string): Promise<unknown> };
export type AuthDatabase = AuthConnection & { transaction<T>(fn: (tx: AuthConnection) => Promise<T>): Promise<T> };
export type UserAccount = { id: string; email: string; name: string; emailVerifiedAt: string | null; createdAt: string; createdBy: string; disabledAt: string | null };
export type AccountSession = { account: UserAccount; actor: Actor; expiresAt: string };
export type AccountLogin = AccountSession & { token: string };
export class AuthError extends Error { constructor(public code: string, message: string) { super(message); this.name = 'AuthError'; } }

const fail = (code: string, message: string): never => { throw new AuthError(code, message); };
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const date = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
const passwordOptions: Options = { algorithm: 2, version: 1, memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 };
export const hashUserPassword = (password: string) => argon2Hash(password, passwordOptions);
const hashPassword = hashUserPassword;
const dummyPasswordHash = hashPassword('ouro-nonexistent-account-password');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AccountRow = { id: string; email: string; name: string; email_verified_at: Date | string | null; created_at: Date | string; created_by: string; disabled_at: Date | string | null };
const accountSelection = `SELECT a.id,a.email,a.name,a.email_verified_at,a.created_at,a.created_by,r.revoked_at AS disabled_at
  FROM ouro_user_accounts a LEFT JOIN ouro_user_account_revocations r ON r.user_id=a.id`;
const publicAccount = (row: AccountRow): UserAccount => ({ id: row.id, email: row.email, name: row.name, emailVerifiedAt: date(row.email_verified_at), createdAt: date(row.created_at)!, createdBy: row.created_by, disabledAt: date(row.disabled_at) });
export const normalizeUserEmail = (email: unknown) => typeof email === 'string' && isWellFormedUnicode(email) ? email.trim().toLowerCase() : '';
const normalizeEmail = normalizeUserEmail;
export const validUserEmail = (email: string) => email.length <= 254 && emailPattern.test(email);
const validEmail = validUserEmail;
export const validUserPassword = (password: unknown): password is string => typeof password === 'string' && password.length >= 12 && password.length <= 128 && isWellFormedUnicode(password) && !/[\x00-\x1f\x7f]/.test(password);
const validPassword = validUserPassword;
export const validUserName = (name: unknown): name is string => typeof name === 'string' && !!name.trim() && name.trim().length <= 120 && isWellFormedUnicode(name) && !/[\x00-\x1f\x7f]/.test(name);
const operator = (actor: Actor) => {
  if (!actor || actor.kind !== 'human' || !['local-human', 'human-token'].includes(actor.id) || !actor.projectIds.includes(PROJECT_ID)) fail('FORBIDDEN', 'Созданием начальных аккаунтов управляет доверенный оператор.');
};

export function createUserAuth(options: { db: AuthDatabase; serialize: <T>(fn: () => Promise<T>) => Promise<T>; resolveProjectIds?: (tx: AuthConnection, userId: string) => Promise<string[]> }) {
  const { db, serialize } = options;
  const failures = new Map<string, { count: number; resetAt: number }>();
  const rateLimit = (key: string) => {
    const now = Date.now(), current = failures.get(key);
    if (current && current.resetAt > now && current.count >= 10) fail('RATE_LIMITED', 'Слишком много попыток входа. Повторите позже.');
    if (current && current.resetAt <= now) failures.delete(key);
  };
  const failed = (key: string) => {
    const current = failures.get(key), now = Date.now();
    failures.set(key, !current || current.resetAt <= now ? { count: 1, resetAt: now + 600_000 } : { count: current.count + 1, resetAt: current.resetAt });
  };
  return {
    createAccount: (input: { email: string; name: string; password: string }, actor: Actor): Promise<{ account: UserAccount }> => serialize(async () => {
      operator(actor);
      const email = normalizeEmail(input?.email);
      if (!validEmail(email) || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120 || !isWellFormedUnicode(input.name) || /[\x00-\x1f\x7f]/.test(input.name) || !validPassword(input.password)) fail('VALIDATION_ERROR', 'Нужны корректный email, имя 1–120 символов и пароль 12–128 символов.');
      const passwordHash = await hashPassword(input.password);
      try {
        return await db.transaction(async tx => {
          await tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE', [PROJECT_ID]);
          await tx.query('INSERT INTO ouro_principals(id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING', [actor.id, 'human']);
          const principal = await tx.query<{ kind: string }>('SELECT kind FROM ouro_principals WHERE id=$1', [actor.id]);
          if (principal.rows[0]?.kind !== 'human') fail('FORBIDDEN', 'Нельзя изменить тип зарегистрированного участника.');
          const duplicate = await tx.query('SELECT id FROM ouro_user_accounts WHERE email=$1', [email]);
          if (duplicate.rows.length) fail('ACCOUNT_EXISTS', 'Аккаунт с таким email уже существует.');
          const id = randomUUID();
          await tx.query('INSERT INTO ouro_principals(id,kind) VALUES($1,$2)', [id, 'human']);
          await tx.query('INSERT INTO ouro_user_accounts(id,email,name,email_verified_at,created_by) VALUES($1,$2,$3,now(),$4)', [id, email, input.name.trim(), actor.id]);
          await tx.query('INSERT INTO ouro_user_password_credentials(user_id,password_hash) VALUES($1,$2)', [id, passwordHash]);
          const row = await tx.query<AccountRow>(`${accountSelection} WHERE a.id=$1`, [id]);
          return { account: publicAccount(row.rows[0]) };
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') fail('ACCOUNT_EXISTS', 'Аккаунт с таким email уже существует.');
        throw error;
      }
    }),
    authenticate: (rawEmail: string, password: string, rateKey: string): Promise<AccountLogin | null> => serialize(async () => {
      const email = normalizeEmail(rawEmail), key = `${email}:${rateKey}`;
      rateLimit(key);
      const passwordHash = validPassword(password) ? null : await dummyPasswordHash;
      return db.transaction(async tx => {
        const result = await tx.query<AccountRow & { password_hash: string }>(`SELECT a.id,a.email,a.name,a.email_verified_at,a.created_at,a.created_by,r.revoked_at AS disabled_at,p.password_hash
          FROM ouro_user_accounts a JOIN ouro_user_password_credentials p ON p.user_id=a.id
          LEFT JOIN ouro_user_account_revocations r ON r.user_id=a.id WHERE a.email=$1`, [email]);
        const row = result.rows[0];
        const valid = await argon2Verify(passwordHash ?? row?.password_hash ?? await dummyPasswordHash, password);
        if (!row || !valid || !row.email_verified_at || row.disabled_at) { failed(key); return null; }
        failures.delete(key);
        const token = `ouro_user_${randomBytes(32).toString('base64url')}`, expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
        await tx.query('INSERT INTO ouro_user_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)', [randomUUID(), row.id, tokenHash(token), expiresAt]);
        const account = publicAccount(row);
        return { account, actor: { id: row.id, kind: 'human', name: row.name, projectIds: await options.resolveProjectIds?.(tx, row.id) ?? [] }, token, expiresAt: expiresAt.toISOString() };
      });
    }),
    resolveSession: (token: string): Promise<AccountSession | null> => serialize(async () => {
      if (typeof token !== 'string' || !/^ouro_user_[A-Za-z0-9_-]{43}$/.test(token)) return null;
      return db.transaction(async tx => {
        const result = await tx.query<AccountRow & { session_id: string; expires_at: Date | string; session_revoked_at: Date | string | null }>(`SELECT a.id,a.email,a.name,a.email_verified_at,a.created_at,a.created_by,r.revoked_at AS disabled_at,s.id AS session_id,s.expires_at,s.revoked_at AS session_revoked_at
          FROM ouro_user_sessions s JOIN ouro_user_accounts a ON a.id=s.user_id
          LEFT JOIN ouro_user_account_revocations r ON r.user_id=a.id
          WHERE s.token_hash=$1`, [tokenHash(token)]);
        const row = result.rows[0];
        if (!row || row.disabled_at || row.session_revoked_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
        const account = publicAccount(row);
        return { account, actor: { id: row.id, kind: 'human', name: row.name, projectIds: await options.resolveProjectIds?.(tx, row.id) ?? [] }, expiresAt: date(row.expires_at)! };
      });
    }),
    revokeSession: (token: string): Promise<void> => serialize(async () => {
      if (typeof token !== 'string' || !/^ouro_user_[A-Za-z0-9_-]{43}$/.test(token)) return;
      await db.query("UPDATE ouro_user_sessions SET revoked_at=now(),revocation_reason='logout' WHERE token_hash=$1 AND revoked_at IS NULL", [tokenHash(token)]);
    }),
    disableAccount: (id: string, actor: Actor): Promise<void> => serialize(async () => {
      operator(actor);
      if (typeof id !== 'string' || !id || id.length > 200) fail('VALIDATION_ERROR', 'Нужен ID аккаунта.');
      await db.transaction(async tx => {
        const found = await tx.query('SELECT id FROM ouro_user_accounts WHERE id=$1', [id]);
        if (!found.rows.length) fail('NOT_FOUND', 'Аккаунт не найден.');
        await tx.query('INSERT INTO ouro_user_account_revocations(user_id,revoked_by) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, actor.id]);
        await tx.query("UPDATE ouro_user_sessions SET revoked_at=now(),revocation_reason='account_disabled' WHERE user_id=$1 AND revoked_at IS NULL", [id]);
      });
    }),
  };
}

export type UserAuth = ReturnType<typeof createUserAuth>;
