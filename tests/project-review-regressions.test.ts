import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../lib/store';
import { PROJECT_ID, type Actor } from '../packages/core/src';
import type { OuroMailer } from '../lib/projects';

const password = 'correct horse battery staple';
const operator: Actor = { id: 'local-human', kind: 'human', name: 'Operator', projectIds: [PROJECT_ID] };
const hasCode = (code: string) => (error: unknown) => (error as { code?: string }).code === code;

async function fixture(dataDir = 'memory://') {
  const invitations: { email: string; code: string }[] = [];
  const mailer: OuroMailer = { sendInvitation: async input => { invitations.push(input); }, sendPasswordReset: async () => {} };
  const store = await createStore({ dataDir, seedEvents: [], mailer });
  const account = (await store.createAccount({ email: 'owner@example.com', name: 'Owner', password }, operator)).account;
  const owner: Actor = { id: account.id, kind: 'human', name: account.name, projectIds: [] };
  const project = await store.createProject({ name: 'Membership regression' }, owner);
  owner.projectIds = [project.id];
  return { store, invitations, mailer, owner, project };
}

test('R04 a revoked participant accepts a new grant without rewriting prior membership or revocation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ouro-membership-review-'));
  let store: Awaited<ReturnType<typeof createStore>> | undefined;
  try {
    const f = await fixture(directory); store = f.store;
    await store.createInvitation(f.project.id, { email: 'member@example.com', role: 'Contributor' }, f.owner);
    const first = await store.acceptInvitation(f.invitations.at(-1)!.code, { name: 'Member', password });
    await store.revokeMember(f.project.id, first.membership.id, f.owner);
    const previousFacts = (await store.inspect('SELECT row_to_json(m) AS membership,row_to_json(r) AS revocation FROM ouro_project_memberships m JOIN ouro_project_membership_revocations r ON r.membership_id=m.id WHERE m.id=$1', [first.membership.id])).rows;
    assert.equal(await store.resolveSession(first.token), null);
    const login = (await store.authenticate('member@example.com', password, 'rejoin'))!;
    const returning = (await store.resolveSession(login.token))!.actor;
    await store.createInvitation(f.project.id, { email: 'member@example.com', role: 'Viewer' }, f.owner);
    const second = await store.acceptInvitation(f.invitations.at(-1)!.code, {}, returning);
    assert.notEqual(second.membership.id, first.membership.id);
    assert.equal(second.membership.role, 'Viewer');
    assert.deepEqual((await store.inspect('SELECT row_to_json(m) AS membership,row_to_json(r) AS revocation FROM ouro_project_memberships m JOIN ouro_project_membership_revocations r ON r.membership_id=m.id WHERE m.id=$1', [first.membership.id])).rows, previousFacts);
    assert.equal((await store.resolveSession(second.token))!.actor.projectIds.includes(f.project.id), true);
    await assert.rejects(store.acceptInvitation(f.invitations.at(-1)!.code, {}, returning), hasCode('INVITATION_INVALID'));
    await store.close(); store = undefined;
    store = await createStore({ dataDir: directory, seedEvents: [], mailer: f.mailer });
    const members = await store.listMembers(f.project.id, f.owner);
    assert.equal(members.filter(member => member.userId === first.account.id).length, 2);
    assert.deepEqual(members.filter(member => member.userId === first.account.id && !member.revokedAt).map(member => member.id), [second.membership.id]);
    assert.deepEqual((await store.inspect('SELECT row_to_json(m) AS membership,row_to_json(r) AS revocation FROM ouro_project_memberships m JOIN ouro_project_membership_revocations r ON r.membership_id=m.id WHERE m.id=$1', [first.membership.id])).rows, previousFacts);
  } finally { if (store) await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test('R05 a disabled account cannot satisfy the last active Owner guard', async () => {
  const f = await fixture();
  try {
    await f.store.createInvitation(f.project.id, { email: 'second-owner@example.com', role: 'Owner' }, f.owner);
    const second = await f.store.acceptInvitation(f.invitations.at(-1)!.code, { name: 'Disabled Owner', password });
    await f.store.disableAccount(second.account.id, operator);
    const own = (await f.store.listMembers(f.project.id, f.owner)).find(member => member.userId === f.owner.id)!;
    await assert.rejects(f.store.changeMemberRole(f.project.id, own.id, 'Viewer', f.owner), hasCode('LAST_OWNER'));
    await assert.rejects(f.store.revokeMember(f.project.id, own.id, f.owner), hasCode('LAST_OWNER'));
    assert.equal((await f.store.listProjects(f.owner))[0].role, 'Owner');
    // Cleaning up an already disabled Owner does not remove a functioning owner.
    assert.equal((await f.store.changeMemberRole(f.project.id, second.membership.id, 'Viewer', f.owner)).role, 'Viewer');
  } finally { await f.store.close(); }
});

test('R04 repeated and concurrent invitation acceptance keeps one active grant and invalidates old pending codes', async () => {
  const f = await fixture();
  try {
    const account = (await f.store.createAccount({ email: 'returning@example.com', name: 'Returning member', password }, operator)).account;
    const returning: Actor = { id: account.id, kind: 'human', name: account.name, projectIds: [] };
    const grantIds: string[] = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      await f.store.createInvitation(f.project.id, { email: account.email, role: 'Contributor' }, f.owner);
      await f.store.createInvitation(f.project.id, { email: account.email, role: 'Viewer' }, f.owner);
      const codes = f.invitations.slice(-2).map(item => item.code);
      const results = await Promise.allSettled(codes.map(code => f.store.acceptInvitation(code, {}, returning)));
      const successes = results.filter(result => result.status === 'fulfilled');
      const failures = results.filter(result => result.status === 'rejected');
      assert.equal(successes.length, 1);
      assert.equal(failures.length, 1);
      assert.equal(failures[0].reason.code, 'ALREADY_MEMBER');
      const accepted = successes[0].value;
      grantIds.push(accepted.membership.id);
      assert.equal((await f.store.resolveSession(accepted.token))!.actor.projectIds.includes(f.project.id), true);
      const active = await f.store.inspect<{ membership_id: string }>('SELECT membership_id FROM ouro_active_project_memberships WHERE project_id=$1 AND user_id=$2', [f.project.id, account.id]);
      assert.deepEqual(active.rows.map(row => row.membership_id), [accepted.membership.id]);
      await assert.rejects(f.store.inspect('INSERT INTO ouro_project_memberships(id,project_id,user_id,role,created_by) VALUES($1,$2,$3,$4,$5)', [randomUUID(), f.project.id, account.id, 'Owner', f.owner.id]), hasCode('23505'));
      await f.store.revokeMember(f.project.id, accepted.membership.id, f.owner);
      assert.equal(await f.store.resolveSession(accepted.token), null);
      // A second outstanding invitation from before removal cannot restore access.
      for (const code of codes) await assert.rejects(f.store.acceptInvitation(code, {}, returning), hasCode('INVITATION_INVALID'));
      assert.equal((await f.store.inspect('SELECT membership_id FROM ouro_active_project_memberships WHERE project_id=$1 AND user_id=$2', [f.project.id, account.id])).rows.length, 0);
    }
    const history = (await f.store.listMembers(f.project.id, f.owner)).filter(member => member.userId === account.id);
    assert.equal(history.length, 3);
    assert(history.every(member => !!member.revokedAt));
    assert.equal(new Set(grantIds).size, 3);
    await assert.rejects(f.store.inspect('UPDATE ouro_project_memberships SET role=role WHERE id=$1', [grantIds[0]]), /append-only/);
    await assert.rejects(f.store.inspect('DELETE FROM ouro_project_membership_revocations WHERE membership_id=$1', [grantIds[0]]), /append-only/);
  } finally { await f.store.close(); }
});

test('R04 migration 009 preserves old grants and revocations and backfills a durable active-grant invariant', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ouro-membership-migration-'));
  let legacy: PGlite | undefined = new PGlite(directory);
  let store: Awaited<ReturnType<typeof createStore>> | undefined;
  const invitations: { code: string }[] = [];
  const mailer: OuroMailer = { sendInvitation: async input => { invitations.push(input); }, sendPasswordReset: async () => {} };
  const projectId = 'legacy-hosted', ownerId = 'legacy-owner', memberId = 'legacy-member';
  const oldCode = 'b'.repeat(43);
  try {
    await legacy.waitReady;
    for (const file of ['001_initial.sql','002_agents.sql','003_github.sql','004_participants.sql','005_drafts.sql','006_workspace_projects.sql','007_identity.sql','008_projects_memberships.sql']) {
      await legacy.exec(await readFile(path.join(process.cwd(), 'db/migrations', file), 'utf8'));
    }
    await legacy.exec("INSERT INTO ouro_principals(id,kind) VALUES('local-human','human'),('legacy-owner','human'),('legacy-member','human')");
    await legacy.exec("INSERT INTO ouro_user_accounts(id,email,name,email_verified_at,created_by) VALUES('legacy-owner','legacy-owner@example.com','Legacy Owner',now(),'local-human'),('legacy-member','legacy-member@example.com','Legacy Member',now(),'local-human')");
    await legacy.query('INSERT INTO ouro_projects(id,version,name,slug,created_at,created_by) VALUES($1,0,$2,$1,now(),$3)', [projectId, 'Legacy project', ownerId]);
    await legacy.query('INSERT INTO ouro_project_memberships(id,project_id,user_id,role,created_by) VALUES($1,$2,$3,$4,$5),($6,$2,$7,$8,$5)', ['owner-grant',projectId,ownerId,'Owner',ownerId,'revoked-grant',memberId,'Contributor']);
    await legacy.query('INSERT INTO ouro_project_membership_role_changes(id,membership_id,role,changed_by) VALUES($1,$2,$3,$4)', ['previous-role','revoked-grant','Viewer',ownerId]);
    await legacy.query('INSERT INTO ouro_project_invitations(id,project_id,email,role,token_hash,created_by,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()-interval \'2 minutes\',now()+interval \'1 day\')', ['stale-invite',projectId,'legacy-member@example.com','Owner',createHash('sha256').update(oldCode).digest('hex'),ownerId]);
    await legacy.query('INSERT INTO ouro_project_membership_revocations(membership_id,revoked_by) VALUES($1,$2)', ['revoked-grant',ownerId]);
    const oldFacts = (await legacy.query('SELECT row_to_json(m) AS membership,row_to_json(r) AS revocation FROM ouro_project_memberships m LEFT JOIN ouro_project_membership_revocations r ON r.membership_id=m.id ORDER BY m.id')).rows;
    const oldRoles = (await legacy.query('SELECT row_to_json(c) AS change FROM ouro_project_membership_role_changes c ORDER BY id')).rows;
    await legacy.close(); legacy = undefined;
    store = await createStore({ dataDir: directory, seedEvents: [], mailer });
    const owner: Actor = { id: ownerId, kind: 'human', name: 'Legacy Owner', projectIds: [projectId] };
    const returning: Actor = { id: memberId, kind: 'human', name: 'Legacy Member', projectIds: [] };
    assert.deepEqual((await store.inspect('SELECT row_to_json(m) AS membership,row_to_json(r) AS revocation FROM ouro_project_memberships m LEFT JOIN ouro_project_membership_revocations r ON r.membership_id=m.id ORDER BY m.id')).rows, oldFacts);
    assert.deepEqual((await store.inspect('SELECT row_to_json(c) AS change FROM ouro_project_membership_role_changes c ORDER BY id')).rows, oldRoles);
    assert.deepEqual((await store.inspect('SELECT membership_id FROM ouro_active_project_memberships ORDER BY membership_id')).rows, [{ membership_id: 'owner-grant' }]);
    await assert.rejects(store.acceptInvitation(oldCode, {}, returning), hasCode('INVITATION_INVALID'));
    await store.createInvitation(projectId, { email: 'legacy-member@example.com', role: 'Contributor' }, owner);
    const accepted = await store.acceptInvitation(invitations.at(-1)!.code, {}, returning);
    assert.notEqual(accepted.membership.id, 'revoked-grant');
    await store.close(); store = undefined;
    store = await createStore({ dataDir: directory, seedEvents: [], mailer });
    assert.equal((await store.inspect('SELECT membership_id FROM ouro_active_project_memberships WHERE project_id=$1', [projectId])).rows.length, 2);
    assert.equal((await store.inspect('SELECT version FROM ouro_schema_migrations WHERE version=9')).rows.length, 1);
    assert.deepEqual((await store.inspect('SELECT row_to_json(m) AS membership,row_to_json(r) AS revocation FROM ouro_project_memberships m LEFT JOIN ouro_project_membership_revocations r ON r.membership_id=m.id WHERE m.id IN (\'owner-grant\',\'revoked-grant\') ORDER BY m.id')).rows, oldFacts);
  } finally { if (store) await store.close(); if (legacy) await legacy.close(); await rm(directory, { recursive: true, force: true }); }
});
