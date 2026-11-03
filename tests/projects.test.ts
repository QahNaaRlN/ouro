import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createStore } from '../lib/store';
import type { OuroMailer, ProjectRole } from '../lib/projects';
import { PROJECT_ID, type Actor } from '../packages/core/src';

const operator: Actor = { id: 'local-human', kind: 'human', name: 'Оператор', projectIds: [PROJECT_ID] };
const password = 'correct horse battery staple';
const hasCode = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
async function fixture() {
  const invitations: { email: string; projectName: string; role: ProjectRole; code: string; expiresAt: string }[] = [];
  const resets: { email: string; name: string; code: string; expiresAt: string }[] = [];
  const mailer: OuroMailer = {
    sendInvitation: async input => { invitations.push(input); },
    sendPasswordReset: async input => { resets.push(input); },
  };
  const store = await createStore({ dataDir: 'memory://', seedEvents: [], mailer });
  const owner = (await store.createAccount({ email: 'owner@example.com', name: 'Владелец', password }, operator)).account;
  const actor: Actor = { id: owner.id, kind: 'human', name: owner.name, projectIds: [] };
  return { store, owner, actor, invitations, resets };
}

test('MP01/AA02/AA08 projects, invitations and memberships are scoped and preserve the last Owner', async () => {
  const f = await fixture();
  try {
    const first = await f.store.createProject({ name: 'Grace' }, f.actor);
    const second = await f.store.createProject({ name: 'Other Product' }, f.actor);
    f.actor.projectIds = [first.id, second.id];
    assert.notEqual(first.id, second.id);
    assert.equal(first.role, 'Owner');
    assert.deepEqual((await f.store.listProjects(f.actor)).map(project => project.id).sort(), [first.id, second.id].sort());

    const firstInvite = await f.store.createInvitation(first.id, { email: 'Bob@Example.com', role: 'Contributor' }, f.actor);
    assert(!JSON.stringify(firstInvite).includes(f.invitations[0].code));
    const accepted = await f.store.acceptInvitation(f.invitations[0].code, { name: 'Борис', password });
    assert.equal(accepted.membership.projectId, first.id);
    assert.equal(accepted.membership.role, 'Contributor');
    assert(!JSON.stringify(accepted.account).includes(password));
    assert.deepEqual((await f.store.resolveSession(accepted.token))?.actor.projectIds, [first.id]);
    await assert.rejects(f.store.acceptInvitation(f.invitations[0].code, { name: 'Повтор', password }), hasCode('INVITATION_INVALID'));

    const bob = (await f.store.resolveSession(accepted.token))!.actor;
    await f.store.createInvitation(second.id, { email: 'bob@example.com', role: 'Viewer' }, f.actor);
    const secondAcceptance = await f.store.acceptInvitation(f.invitations[1].code, {}, bob);
    assert.equal(secondAcceptance.membership.role, 'Viewer');
    assert.deepEqual((await f.store.listProjects(bob)).map(project => project.id).sort(), [first.id, second.id].sort());
    await assert.rejects(f.store.listInvitations(first.id, bob), hasCode('FORBIDDEN'));
    await assert.rejects(f.store.changeMemberRole(second.id, accepted.membership.id, 'Owner', f.actor), hasCode('NOT_FOUND'));

    const members = await f.store.listMembers(first.id, f.actor);
    const ownerMembership = members.find(member => member.userId === f.owner.id)!;
    await assert.rejects(f.store.changeMemberRole(first.id, ownerMembership.id, 'Contributor', f.actor), hasCode('LAST_OWNER'));
    assert.equal((await f.store.changeMemberRole(first.id, ownerMembership.id, 'Owner', f.actor)).role, 'Owner');
    await f.store.changeMemberRole(first.id, accepted.membership.id, 'Owner', f.actor);
    await f.store.changeMemberRole(first.id, ownerMembership.id, 'Contributor', f.actor);
    await assert.rejects(f.store.revokeMember(first.id, accepted.membership.id, bob), hasCode('LAST_OWNER'));

    const facts = await f.store.inspect<{ details: Record<string, unknown> }>('SELECT details FROM ouro_administrative_facts');
    assert(!JSON.stringify(facts.rows).includes(f.invitations[0].code));
    assert(!JSON.stringify(facts.rows).includes(password));
  } finally { await f.store.close(); }
});

test('AA02/AA06 invitation revocation and expiry are enforced without creating membership', async () => {
  const f = await fixture();
  try {
    const project = await f.store.createProject({ name: 'Invites' }, f.actor);
    f.actor.projectIds = [project.id];
    const invite = await f.store.createInvitation(project.id, { email: 'revoke@example.com', role: 'Viewer' }, f.actor);
    await f.store.revokeInvitation(project.id, invite.id, f.actor);
    await assert.rejects(f.store.acceptInvitation(f.invitations[0].code, { name: 'Отозванный', password }), hasCode('INVITATION_INVALID'));
    const expiredCode = 'x'.repeat(43);
    await f.store.inspect(`INSERT INTO ouro_project_invitations(id,project_id,email,role,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, [crypto.randomUUID(), project.id, 'expired@example.com', 'Viewer', createHash('sha256').update(expiredCode).digest('hex'), f.owner.id, new Date(Date.now() - 1000)]);
    await assert.rejects(f.store.acceptInvitation(expiredCode, { name: 'Истёкший', password }), hasCode('INVITATION_INVALID'));
    const members = await f.store.listMembers(project.id, f.actor);
    assert.deepEqual(members.map(member => member.email), [f.owner.email]);
  } finally { await f.store.close(); }
});

test('AA06/AA10 password reset revokes captured sessions and rotates credentials', async () => {
  const f = await fixture();
  try {
    const login = (await f.store.authenticate(f.owner.email, password, 'test'))!;
    assert.deepEqual(await f.store.requestPasswordReset('unknown@example.com', 'test'), { ok: true });
    assert.deepEqual(await f.store.requestPasswordReset(f.owner.email, 'test'), { ok: true });
    assert.equal(f.resets.length, 1);
    const reset = await f.store.resetPassword(f.resets[0].code, 'new correct horse battery', 'test');
    assert.equal(await f.store.resolveSession(login.token), null);
    assert.equal(await f.store.authenticate(f.owner.email, password, 'test'), null);
    assert.equal((await f.store.authenticate(f.owner.email, 'new correct horse battery', 'test'))?.account.id, f.owner.id);
    assert((await f.store.resolveSession(reset.token))?.account.id === f.owner.id);
    await assert.rejects(f.store.resetPassword(f.resets[0].code, 'another valid password', 'test'), hasCode('RESET_INVALID'));
    const stored = await f.store.inspect('SELECT token_hash FROM ouro_password_reset_tokens');
    assert(!JSON.stringify(stored.rows).includes(f.resets[0].code));
  } finally { await f.store.close(); }
});
