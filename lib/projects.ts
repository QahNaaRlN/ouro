import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PROJECT_ID, type Actor } from '../packages/core/src';
import { hashUserPassword, normalizeUserEmail, validUserEmail, validUserName, validUserPassword, type UserAccount } from './user-auth';

export type ProjectRole = 'Owner' | 'Contributor' | 'Viewer';
export type ProjectMetadata = { id: string; name: string; slug: string; createdAt: string; createdBy: string | null; role: ProjectRole };
export type ProjectMembership = { id: string; projectId: string; userId: string; email: string; name: string; role: ProjectRole; createdAt: string; createdBy: string; revokedAt: string | null };
export type ProjectInvitation = { id: string; projectId: string; email: string; role: ProjectRole; createdAt: string; createdBy: string; expiresAt: string; acceptedAt: string | null; revokedAt: string | null };
export type OuroMailer = {
  sendInvitation(input: { email: string; projectName: string; role: ProjectRole; code: string; expiresAt: string }): Promise<void>;
  sendPasswordReset(input: { email: string; name: string; code: string; expiresAt: string }): Promise<void>;
};
type Connection = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };
type Database = Connection & { transaction<T>(fn: (tx: Connection) => Promise<T>): Promise<T> };
type MembershipRow = { id: string; project_id: string; user_id: string; email: string; name: string; role: ProjectRole; created_at: Date | string; created_by: string; revoked_at: Date | string | null };
type InvitationRow = { id: string; project_id: string; email: string; role: ProjectRole; created_at: Date | string; created_by: string; expires_at: Date | string; accepted_at: Date | string | null; revoked_at: Date | string | null };
type AccountRow = { id: string; email: string; name: string; email_verified_at: Date | string | null; created_at: Date | string; created_by: string; disabled_at: Date | string | null };
const roles: ProjectRole[] = ['Owner', 'Contributor', 'Viewer'];
const date = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const code = () => randomBytes(32).toString('base64url');
const membershipSelection = `SELECT m.id,m.project_id,m.user_id,a.email,a.name,COALESCE((SELECT c.role FROM ouro_project_membership_role_changes c WHERE c.membership_id=m.id ORDER BY c.changed_at DESC,c.id DESC LIMIT 1),m.role) AS role,m.created_at,m.created_by,r.revoked_at
  FROM ouro_project_memberships m JOIN ouro_user_accounts a ON a.id=m.user_id LEFT JOIN ouro_project_membership_revocations r ON r.membership_id=m.id`;
const invitationSelection = `SELECT i.id,i.project_id,i.email,i.role,i.created_at,i.created_by,i.expires_at,a.accepted_at,r.revoked_at
  FROM ouro_project_invitations i LEFT JOIN ouro_project_invitation_acceptances a ON a.invitation_id=i.id LEFT JOIN ouro_project_invitation_revocations r ON r.invitation_id=i.id`;
const accountSelection = `SELECT a.id,a.email,a.name,a.email_verified_at,a.created_at,a.created_by,r.revoked_at AS disabled_at FROM ouro_user_accounts a LEFT JOIN ouro_user_account_revocations r ON r.user_id=a.id`;
const membership = (row: MembershipRow): ProjectMembership => ({ id: row.id, projectId: row.project_id, userId: row.user_id, email: row.email, name: row.name, role: row.role, createdAt: date(row.created_at)!, createdBy: row.created_by, revokedAt: date(row.revoked_at) });
const invitation = (row: InvitationRow): ProjectInvitation => ({ id: row.id, projectId: row.project_id, email: row.email, role: row.role, createdAt: date(row.created_at)!, createdBy: row.created_by, expiresAt: date(row.expires_at)!, acceptedAt: date(row.accepted_at), revokedAt: date(row.revoked_at) });
const account = (row: AccountRow): UserAccount => ({ id: row.id, email: row.email, name: row.name, emailVerifiedAt: date(row.email_verified_at), createdAt: date(row.created_at)!, createdBy: row.created_by, disabledAt: date(row.disabled_at) });
const fail = (code: string, message: string): never => { throw new ProjectError(code, message); };
const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id);
const validRole = (role: unknown): role is ProjectRole => roles.includes(role as ProjectRole);
export class ProjectError extends Error { constructor(public code: string, message: string) { super(message); this.name = 'ProjectError'; } }

export async function resolveAccountProjectIds(tx: Connection, userId: string): Promise<string[]> {
  const rows = await tx.query<{ project_id: string }>(`SELECT m.project_id FROM ouro_project_memberships m
    LEFT JOIN ouro_project_membership_revocations r ON r.membership_id=m.id
    JOIN ouro_user_accounts a ON a.id=m.user_id LEFT JOIN ouro_user_account_revocations x ON x.user_id=a.id
    WHERE m.user_id=$1 AND r.membership_id IS NULL AND x.user_id IS NULL ORDER BY m.project_id`, [userId]);
  return rows.rows.map(row => row.project_id);
}

export async function projectRole(tx: Connection, actor: Actor, projectId: string): Promise<ProjectRole | null> {
  if (!actor || actor.kind !== 'human' || !validId(actor.id) || !validId(projectId) || !actor.projectIds.includes(projectId)) return null;
  if (['local-human', 'human-token'].includes(actor.id)) return 'Owner';
  const result = await tx.query<{ role: ProjectRole }>(`${membershipSelection}
    LEFT JOIN ouro_user_account_revocations ar ON ar.user_id=m.user_id
    WHERE m.user_id=$1 AND m.project_id=$2 AND r.membership_id IS NULL AND ar.user_id IS NULL`, [actor.id, projectId]);
  if (result.rows[0]) return result.rows[0].role;
  const legacy = await tx.query('SELECT r.id FROM ouro_participant_registrations r LEFT JOIN ouro_participant_revocations v ON v.participant_id=r.id WHERE r.id=$1 AND r.project_id=$2 AND v.participant_id IS NULL', [actor.id, projectId]);
  if (legacy.rows.length) return 'Contributor';
  if (projectId === PROJECT_ID) {
    const account = await tx.query('SELECT id FROM ouro_user_accounts WHERE id=$1', [actor.id]);
    if (!account.rows.length) return 'Owner';
  }
  return null;
}

export async function requireProjectRole(tx: Connection, actor: Actor, projectId: string, allowed: ProjectRole[] = roles) {
  const role = await projectRole(tx, actor, projectId);
  if (!role) fail('FORBIDDEN', 'Нет действующего членства в этом проекте.');
  if (!allowed.includes(role!)) fail('FORBIDDEN', 'Роль участника не разрешает эту операцию.');
  return role;
}

export function createProjectService(options: { db: Database; serialize: <T>(fn: () => Promise<T>) => Promise<T>; mailer?: OuroMailer }) {
  const { db, serialize, mailer } = options;
  const attempts = new Map<string, { count: number; resetAt: number }>();
  const limit = (key: string, maximum = 10) => {
    const now = Date.now(), current = attempts.get(key);
    if (current && current.resetAt > now && current.count >= maximum) fail('RATE_LIMITED', 'Слишком много попыток. Повторите позже.');
    if (current && current.resetAt <= now) attempts.delete(key);
    attempts.set(key, { count: (current?.count ?? 0) + 1, resetAt: current?.resetAt ?? now + 600_000 });
  };
  const admin = (tx: Connection, projectId: string, actorId: string, action: string, targetId: string, details: Record<string, unknown> = {}) => tx.query('INSERT INTO ouro_administrative_facts(id,project_id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)', [randomUUID(), projectId, actorId, action, targetId, JSON.stringify(details)]);
  const lock = (tx: Connection, projectId: string) => tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE', [projectId]);
  const assertLastOwner = async (tx: Connection, projectId: string, membershipId: string, nextRole: ProjectRole | null = null) => {
    const target = await tx.query<MembershipRow>(`${membershipSelection} WHERE m.id=$1 AND m.project_id=$2 AND r.membership_id IS NULL`, [membershipId, projectId]);
    if (!target.rows[0]) fail('NOT_FOUND', 'Активное членство не найдено.');
    if (target.rows[0].role !== 'Owner' || nextRole === 'Owner') return target.rows[0];
    const owners = await tx.query<{ count: string | number }>(`SELECT count(*) AS count FROM ouro_project_memberships m LEFT JOIN ouro_project_membership_revocations r ON r.membership_id=m.id WHERE m.project_id=$1 AND r.membership_id IS NULL AND COALESCE((SELECT c.role FROM ouro_project_membership_role_changes c WHERE c.membership_id=m.id ORDER BY c.changed_at DESC,c.id DESC LIMIT 1),m.role)='Owner'`, [projectId]);
    if (Number(owners.rows[0]?.count ?? 0) <= 1) fail('LAST_OWNER', 'Сначала передайте владение другому участнику.');
    return target.rows[0];
  };
  const newSession = async (tx: Connection, userId: string) => {
    const token = `ouro_user_${randomBytes(32).toString('base64url')}`, expiresAt = new Date(Date.now() + 43_200_000);
    await tx.query('INSERT INTO ouro_user_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)', [randomUUID(), userId, digest(token), expiresAt]);
    return { token, expiresAt: expiresAt.toISOString() };
  };
  return {
    bootstrapProjectOwner: (userId: string, actor: Actor, projectId = PROJECT_ID): Promise<ProjectMembership> => serialize(() => db.transaction(async tx => {
      if (!actor || actor.kind !== 'human' || !['local-human', 'human-token'].includes(actor.id) || !actor.projectIds.includes(PROJECT_ID) || projectId !== PROJECT_ID || !validId(userId)) fail('FORBIDDEN', 'Начального Owner назначает доверенный оператор существующего проекта.');
      await lock(tx, projectId);
      const user = await tx.query<AccountRow>(`${accountSelection} WHERE a.id=$1 AND r.revoked_at IS NULL AND a.email_verified_at IS NOT NULL`, [userId]);
      if (!user.rows[0]) fail('NOT_FOUND', 'Активный подтверждённый аккаунт не найден.');
      const existing = await tx.query<MembershipRow>(`${membershipSelection} WHERE m.project_id=$1 AND m.user_id=$2`, [projectId, userId]);
      if (existing.rows[0]) {
        if (existing.rows[0].revoked_at || existing.rows[0].role !== 'Owner') fail('OWNER_EXISTS', 'У проекта уже есть история членства; используйте управление ролями текущего Owner.');
        return membership(existing.rows[0]);
      }
      const owners = await tx.query(`${membershipSelection} WHERE m.project_id=$1 AND r.membership_id IS NULL AND COALESCE((SELECT c.role FROM ouro_project_membership_role_changes c WHERE c.membership_id=m.id ORDER BY c.changed_at DESC,c.id DESC LIMIT 1),m.role)='Owner'`, [projectId]);
      if (owners.rows.length) fail('OWNER_EXISTS', 'Начальный Owner уже назначен.');
      const membershipId = randomUUID();
      await tx.query('INSERT INTO ouro_project_memberships(id,project_id,user_id,role,created_by) VALUES($1,$2,$3,$4,$5)', [membershipId, projectId, userId, 'Owner', actor.id]);
      await admin(tx, projectId, actor.id, 'membership.bootstrap_owner', membershipId, { userId, role: 'Owner' });
      return membership((await tx.query<MembershipRow>(`${membershipSelection} WHERE m.id=$1`, [membershipId])).rows[0]);
    })),
    createProject: (input: { name: string }, actor: Actor): Promise<ProjectMetadata> => serialize(() => db.transaction(async tx => {
      if (!actor || actor.kind !== 'human' || !validUserName(input?.name)) fail('VALIDATION_ERROR', 'Название проекта должно содержать 1–120 корректных символов.');
      const owner = await tx.query<AccountRow>(`${accountSelection} WHERE a.id=$1 AND r.revoked_at IS NULL`, [actor.id]);
      if (!owner.rows[0]) fail('FORBIDDEN', 'Создавать проект может только активный пользовательский аккаунт.');
      const id = randomUUID(), base = input.name.trim().toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70) || 'project';
      const slug = `${base}-${id.slice(0, 8)}`;
      await tx.query('INSERT INTO ouro_projects(id,version,name,slug,created_at,created_by) VALUES($1,0,$2,$3,now(),$4)', [id, input.name.trim(), slug, actor.id]);
      const membershipId = randomUUID();
      await tx.query('INSERT INTO ouro_project_memberships(id,project_id,user_id,role,created_by) VALUES($1,$2,$3,$4,$5)', [membershipId, id, actor.id, 'Owner', actor.id]);
      await admin(tx, id, actor.id, 'project.created', id, { name: input.name.trim(), slug });
      await admin(tx, id, actor.id, 'membership.created', membershipId, { userId: actor.id, role: 'Owner' });
      return { id, name: input.name.trim(), slug, createdAt: new Date().toISOString(), createdBy: actor.id, role: 'Owner' };
    })),
    listProjects: (actor: Actor): Promise<ProjectMetadata[]> => serialize(() => db.transaction(async tx => {
      if (!actor || actor.kind !== 'human') fail('FORBIDDEN', 'Нужна человеческая identity.');
      if (['local-human', 'human-token'].includes(actor.id)) {
        if (!actor.projectIds.includes(PROJECT_ID)) return [];
        const legacy = await tx.query<{ id: string; name: string; slug: string; created_at: Date | string; created_by: string | null }>('SELECT id,name,slug,created_at,created_by FROM ouro_projects WHERE id=$1', [PROJECT_ID]);
        return legacy.rows.map(row => ({ id: row.id, name: row.name, slug: row.slug, createdAt: date(row.created_at)!, createdBy: row.created_by, role: 'Owner' }));
      }
      const result = await tx.query<{ id: string; name: string; slug: string; created_at: Date | string; created_by: string | null; role: ProjectRole }>(`SELECT p.id,p.name,p.slug,p.created_at,p.created_by,COALESCE((SELECT c.role FROM ouro_project_membership_role_changes c WHERE c.membership_id=m.id ORDER BY c.changed_at DESC,c.id DESC LIMIT 1),m.role) AS role
        FROM ouro_project_memberships m JOIN ouro_projects p ON p.id=m.project_id LEFT JOIN ouro_project_membership_revocations r ON r.membership_id=m.id
        LEFT JOIN ouro_user_account_revocations ar ON ar.user_id=m.user_id WHERE m.user_id=$1 AND r.membership_id IS NULL AND ar.user_id IS NULL ORDER BY p.name,p.id`, [actor.id]);
      return result.rows.map(row => ({ id: row.id, name: row.name, slug: row.slug, createdAt: date(row.created_at)!, createdBy: row.created_by, role: row.role }));
    })),
    listMembers: (projectId: string, actor: Actor): Promise<ProjectMembership[]> => serialize(() => db.transaction(async tx => {
      await lock(tx, projectId); await requireProjectRole(tx, actor, projectId);
      const result = await tx.query<MembershipRow>(`${membershipSelection} WHERE m.project_id=$1 ORDER BY m.created_at,m.id`, [projectId]);
      return result.rows.map(membership);
    })),
    changeMemberRole: (projectId: string, membershipId: string, role: ProjectRole, actor: Actor): Promise<ProjectMembership> => serialize(() => db.transaction(async tx => {
      await lock(tx, projectId); await requireProjectRole(tx, actor, projectId, ['Owner']);
      if (!validId(membershipId) || !validRole(role)) fail('VALIDATION_ERROR', 'Нужны membership ID и допустимая роль.');
      const target = await assertLastOwner(tx, projectId, membershipId, role);
      if (target.project_id !== projectId) fail('NOT_FOUND', 'Членство не найдено.');
      if (target.role !== role) {
        await tx.query('INSERT INTO ouro_project_membership_role_changes(id,membership_id,role,changed_by) VALUES($1,$2,$3,$4)', [randomUUID(), membershipId, role, actor.id]);
        await admin(tx, projectId, actor.id, 'membership.role_changed', membershipId, { userId: target.user_id, from: target.role, to: role });
      }
      const result = await tx.query<MembershipRow>(`${membershipSelection} WHERE m.id=$1 AND m.project_id=$2`, [membershipId, projectId]);
      return membership(result.rows[0]);
    })),
    revokeMember: (projectId: string, membershipId: string, actor: Actor): Promise<ProjectMembership> => serialize(() => db.transaction(async tx => {
      await lock(tx, projectId); await requireProjectRole(tx, actor, projectId, ['Owner']);
      if (!validId(membershipId)) fail('VALIDATION_ERROR', 'Нужен membership ID.');
      const target = await assertLastOwner(tx, projectId, membershipId);
      if (target.project_id !== projectId) fail('NOT_FOUND', 'Членство не найдено.');
      await tx.query('INSERT INTO ouro_project_membership_revocations(membership_id,revoked_by) VALUES($1,$2)', [membershipId, actor.id]);
      await tx.query("UPDATE ouro_user_sessions SET revoked_at=now(),revocation_reason='membership_revoked' WHERE user_id=$1 AND revoked_at IS NULL", [target.user_id]);
      await admin(tx, projectId, actor.id, 'membership.revoked', membershipId, { userId: target.user_id, role: target.role });
      const result = await tx.query<MembershipRow>(`${membershipSelection} WHERE m.id=$1`, [membershipId]);
      return membership(result.rows[0]);
    })),
    createInvitation: (projectId: string, input: { email: string; role: ProjectRole }, actor: Actor): Promise<ProjectInvitation> => serialize(async () => {
      if (!mailer) fail('MAIL_NOT_CONFIGURED', 'SMTP не настроен.');
      const email = normalizeUserEmail(input?.email);
      if (!validUserEmail(email) || !validRole(input?.role)) fail('VALIDATION_ERROR', 'Нужны корректный email и роль.');
      limit(`invite:${actor.id}`);
      const token = code(), expiresAt = new Date(Date.now() + 7 * 86_400_000);
      const created = await db.transaction(async tx => {
        await lock(tx, projectId); await requireProjectRole(tx, actor, projectId, ['Owner']);
        const existing = await tx.query(`${membershipSelection} WHERE m.project_id=$1 AND a.email=$2 AND r.membership_id IS NULL`, [projectId, email]);
        if (existing.rows.length) fail('ALREADY_MEMBER', 'Пользователь уже участвует в проекте.');
        const id = randomUUID();
        await tx.query('INSERT INTO ouro_project_invitations(id,project_id,email,role,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, projectId, email, input.role, digest(token), actor.id, expiresAt]);
        await admin(tx, projectId, actor.id, 'invitation.created', id, { email, role: input.role, expiresAt: expiresAt.toISOString() });
        const result = await tx.query<InvitationRow>(`${invitationSelection} WHERE i.id=$1`, [id]);
        return invitation(result.rows[0]);
      });
      const project = await txProjectName(db, projectId);
      try { await mailer!.sendInvitation({ email, projectName: project, role: input.role, code: token, expiresAt: created.expiresAt }); }
      catch { fail('MAIL_DELIVERY_FAILED', 'Приглашение сохранено, но письмо не доставлено. Повторите отправку после проверки SMTP.'); }
      return created;
    }),
    listInvitations: (projectId: string, actor: Actor): Promise<ProjectInvitation[]> => serialize(() => db.transaction(async tx => {
      await lock(tx, projectId); await requireProjectRole(tx, actor, projectId, ['Owner']);
      const result = await tx.query<InvitationRow>(`${invitationSelection} WHERE i.project_id=$1 ORDER BY i.created_at DESC,i.id LIMIT 100`, [projectId]);
      return result.rows.map(invitation);
    })),
    revokeInvitation: (projectId: string, invitationId: string, actor: Actor): Promise<ProjectInvitation> => serialize(() => db.transaction(async tx => {
      await lock(tx, projectId); await requireProjectRole(tx, actor, projectId, ['Owner']);
      const found = await tx.query<InvitationRow>(`${invitationSelection} WHERE i.id=$1 AND i.project_id=$2 FOR UPDATE OF i`, [invitationId, projectId]);
      if (!found.rows[0] || found.rows[0].accepted_at) fail('NOT_FOUND', 'Активное приглашение не найдено.');
      await tx.query('INSERT INTO ouro_project_invitation_revocations(invitation_id,revoked_by) VALUES($1,$2) ON CONFLICT DO NOTHING', [invitationId, actor.id]);
      await admin(tx, projectId, actor.id, 'invitation.revoked', invitationId);
      const result = await tx.query<InvitationRow>(`${invitationSelection} WHERE i.id=$1`, [invitationId]);
      return invitation(result.rows[0]);
    })),
    acceptInvitation: (token: string, input: { name?: string; password?: string }, actor?: Actor): Promise<{ account: UserAccount; membership: ProjectMembership; token: string; expiresAt: string }> => serialize(async () => {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail('INVITATION_INVALID', 'Приглашение недействительно или истекло.');
      limit(`accept:${digest(token)}`, 20);
      const passwordHash = input.password !== undefined && validUserPassword(input.password) ? await hashUserPassword(input.password) : null;
      return db.transaction(async tx => {
        const found = await tx.query<InvitationRow>(`${invitationSelection} WHERE i.token_hash=$1 FOR UPDATE OF i`, [digest(token)]);
        const invite = found.rows[0];
        if (!invite || invite.accepted_at || invite.revoked_at || new Date(invite.expires_at).getTime() <= Date.now()) fail('INVITATION_INVALID', 'Приглашение недействительно или истекло.');
        await lock(tx, invite.project_id);
        const existing = await tx.query<AccountRow>(`${accountSelection} WHERE a.email=$1`, [invite.email]);
        let user = existing.rows[0];
        if (user) {
          if (!actor || actor.kind !== 'human' || actor.id !== user.id || user.disabled_at || !user.email_verified_at) fail('INVITATION_LOGIN_REQUIRED', 'Войдите в аккаунт с приглашённым email.');
        } else {
          if (!validUserName(input.name) || !passwordHash) fail('VALIDATION_ERROR', 'Новый пользователь должен задать имя и пароль 12–128 символов.');
          const id = randomUUID();
          await tx.query('INSERT INTO ouro_principals(id,kind) VALUES($1,$2)', [id, 'human']);
          await tx.query('INSERT INTO ouro_user_accounts(id,email,name,email_verified_at,created_by) VALUES($1,$2,$3,now(),$4)', [id, invite.email, input.name!.trim(), invite.created_by]);
          await tx.query('INSERT INTO ouro_user_password_credentials(user_id,password_hash) VALUES($1,$2)', [id, passwordHash]);
          user = (await tx.query<AccountRow>(`${accountSelection} WHERE a.id=$1`, [id])).rows[0];
        }
        const duplicate = await tx.query(`${membershipSelection} WHERE m.project_id=$1 AND m.user_id=$2`, [invite.project_id, user.id]);
        if (duplicate.rows.length) fail('ALREADY_MEMBER', 'Членство уже существует.');
        const membershipId = randomUUID();
        await tx.query('INSERT INTO ouro_project_memberships(id,project_id,user_id,role,created_by) VALUES($1,$2,$3,$4,$5)', [membershipId, invite.project_id, user.id, invite.role, invite.created_by]);
        await tx.query('INSERT INTO ouro_project_invitation_acceptances(invitation_id,accepted_by) VALUES($1,$2)', [invite.id, user.id]);
        await admin(tx, invite.project_id, user.id, 'invitation.accepted', invite.id, { membershipId, role: invite.role });
        const session = await newSession(tx, user.id);
        const member = await tx.query<MembershipRow>(`${membershipSelection} WHERE m.id=$1`, [membershipId]);
        return { account: account(user), membership: membership(member.rows[0]), ...session };
      });
    }),
    requestPasswordReset: (rawEmail: string, rateKey: string): Promise<{ ok: true }> => serialize(async () => {
      if (!mailer) fail('MAIL_NOT_CONFIGURED', 'SMTP не настроен.');
      const email = normalizeUserEmail(rawEmail); limit(`reset-request:${email}:${rateKey}`, 5);
      const result = await db.transaction(async tx => {
        const found = await tx.query<AccountRow>(`${accountSelection} WHERE a.email=$1 AND r.revoked_at IS NULL AND a.email_verified_at IS NOT NULL`, [email]);
        if (!found.rows[0]) return null;
        const token = code(), expiresAt = new Date(Date.now() + 3_600_000), id = randomUUID();
        await tx.query('INSERT INTO ouro_password_reset_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)', [id, found.rows[0].id, digest(token), expiresAt]);
        return { user: account(found.rows[0]), token, expiresAt: expiresAt.toISOString() };
      });
      if (result) {
        try { await mailer!.sendPasswordReset({ email: result.user.email, name: result.user.name, code: result.token, expiresAt: result.expiresAt }); }
        catch { /* The external response remains identical; operators inspect SMTP health without account data. */ }
      }
      return { ok: true };
    }),
    resetPassword: (token: string, password: string, rateKey: string): Promise<{ account: UserAccount; token: string; expiresAt: string }> => serialize(async () => {
      limit(`reset-confirm:${rateKey}`, 10);
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || !validUserPassword(password)) fail('VALIDATION_ERROR', 'Нужны действительный код и пароль 12–128 символов.');
      const passwordHash = await hashUserPassword(password);
      return db.transaction(async tx => {
        const found = await tx.query<{ reset_id: string; user_id: string; expires_at: Date | string; confirmed_at: Date | string | null }>(`SELECT t.id AS reset_id,t.user_id,t.expires_at,c.confirmed_at FROM ouro_password_reset_tokens t LEFT JOIN ouro_password_reset_confirmations c ON c.reset_id=t.id WHERE t.token_hash=$1 FOR UPDATE OF t`, [digest(token)]);
        const reset = found.rows[0];
        if (!reset || reset.confirmed_at || new Date(reset.expires_at).getTime() <= Date.now()) fail('RESET_INVALID', 'Код сброса недействителен или истёк.');
        const user = (await tx.query<AccountRow>(`${accountSelection} WHERE a.id=$1 AND r.revoked_at IS NULL`, [reset.user_id])).rows[0];
        if (!user) fail('RESET_INVALID', 'Код сброса недействителен или истёк.');
        await tx.query('UPDATE ouro_user_password_credentials SET password_hash=$2,algorithm_version=1,updated_at=now() WHERE user_id=$1', [user.id, passwordHash]);
        await tx.query("UPDATE ouro_user_sessions SET revoked_at=now(),revocation_reason='password_reset' WHERE user_id=$1 AND revoked_at IS NULL", [user.id]);
        await tx.query('INSERT INTO ouro_password_reset_confirmations(reset_id) VALUES($1)', [reset.reset_id]);
        const session = await newSession(tx, user.id);
        return { account: account(user), ...session };
      });
    }),
    requireRole: requireProjectRole,
    resolveProjectIds: resolveAccountProjectIds,
  };
}

async function txProjectName(db: Database, projectId: string) {
  const result = await db.query<{ name: string }>('SELECT name FROM ouro_projects WHERE id=$1', [projectId]);
  return result.rows[0]?.name ?? 'Ouro';
}

export type ProjectService = ReturnType<typeof createProjectService>;
