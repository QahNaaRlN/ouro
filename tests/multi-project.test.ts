import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../lib/store';
import { createAgentService } from '../packages/mcp/src/agent-service';
import { AGENT_ID, PROJECT_ID, type Actor, type RevisionContent } from '../packages/core/src';
import type { OuroMailer, ProjectRole } from '../lib/projects';

const password = 'correct horse battery staple';
const operator: Actor = { id: 'local-human', kind: 'human', name: 'Оператор', projectIds: [PROJECT_ID] };
const hasCode = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
const content = (title: string): RevisionContent => ({ title, goal: `Цель: ${title}`, dod: [{ id: 'dod-1', text: 'Проверяемый результат', required: true }], constraints: '', assumptions: '', risks: '', inputs: '', comment: '' });

async function fixture() {
  const invitations: { email: string; projectName: string; role: ProjectRole; code: string; expiresAt: string }[] = [];
  const mailer: OuroMailer = { sendInvitation: async input => { invitations.push(input); }, sendPasswordReset: async () => {} };
  const store = await createStore({ dataDir: 'memory://', seedEvents: [], mailer });
  const account = (await store.createAccount({ email: 'owner@example.com', name: 'Владелец', password }, operator)).account;
  const owner: Actor = { id: account.id, kind: 'human', name: account.name, projectIds: [] };
  const first = await store.createProject({ name: 'Grace' }, owner);
  const second = await store.createProject({ name: 'Other' }, owner);
  owner.projectIds = [first.id, second.id];
  return { store, owner, first, second, invitations };
}

async function createActiveSpec(store: Awaited<ReturnType<typeof createStore>>, actor: Actor, projectId: string, requestId: string, title: string) {
  const created = await store.executeCommand({ type: 'createSpec', requestId, expectedVersion: 0, content: content(title) }, actor, projectId);
  const spec = created.state.specs[0];
  const revision = created.state.revisions[0];
  const activated = await store.executeCommand({ type: 'activateRevision', requestId: `${requestId}-activate`, expectedVersion: created.cursor, specId: spec.id, revisionId: revision.id }, actor, projectId);
  return { spec, revision, state: activated.state };
}

test('MP01/MP03/MP04 independent histories, scoped receipts and foreign IDs', async () => {
  const f = await fixture();
  try {
    const first = await f.store.executeCommand({ type: 'createSpec', requestId: 'shared-request-id', expectedVersion: 0, content: content('Grace spec') }, f.owner, f.first.id);
    const second = await f.store.executeCommand({ type: 'createSpec', requestId: 'shared-request-id', expectedVersion: 0, content: content('Other spec') }, f.owner, f.second.id);
    assert.equal(first.cursor, 1);
    assert.equal(second.cursor, 1);
    assert.equal(first.state.projectId, f.first.id);
    assert.equal(second.state.projectId, f.second.id);
    assert.equal(first.state.specs[0].title, 'Grace spec');
    assert.equal(second.state.specs[0].title, 'Other spec');
    const replay = await f.store.executeCommand({ type: 'createSpec', requestId: 'shared-request-id', expectedVersion: 0, content: content('Grace spec') }, f.owner, f.first.id);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.events, first.events);
    await assert.rejects(f.store.executeCommand({ type: 'createSpec', projectId: f.second.id, requestId: 'foreign-project-field', expectedVersion: 1, content: content('Escalation') }, f.owner, f.first.id), hasCode('FORBIDDEN'));
    await assert.rejects(f.store.executeCommand({ type: 'proposeRevision', requestId: 'foreign-spec-id', expectedVersion: 1, specId: first.state.specs[0].id, content: content('Foreign') }, f.owner, f.second.id), hasCode('NOT_FOUND'));
    const firstEvents = await f.store.getEvents(0, f.first.id, f.owner);
    const secondEvents = await f.store.getEvents(0, f.second.id, f.owner);
    assert.deepEqual(firstEvents.events.map(event => event.projectId), [f.first.id]);
    assert.deepEqual(secondEvents.events.map(event => event.projectId), [f.second.id]);
    assert(!JSON.stringify(secondEvents).includes('Grace spec'));
  } finally { await f.store.close(); }
});

test('MP02/AA09 one agent has isolated MCP scopes and project-scoped revocation', async () => {
  const f = await fixture();
  try {
    const first = await createActiveSpec(f.store, f.owner, f.first.id, 'first-spec', 'First work');
    const second = await createActiveSpec(f.store, f.owner, f.second.id, 'second-spec', 'Second work');
    const registration = await f.store.createAgent('Shared agent', f.owner, f.first.id);
    await f.store.assignAgent(registration.agent.id, f.second.id, f.owner);
    const agent = (await f.store.authenticateAgentToken(registration.token))!;
    assert.deepEqual(agent.projectIds, [f.first.id, f.second.id].sort());
    const firstExecution = (await f.store.executeCommand({ type: 'startExecution', requestId: 'start-first', expectedVersion: first.state.version, specId: first.spec.id, specRevisionId: first.revision.id, agentId: agent.id }, f.owner, f.first.id)).state.executions[0];
    const secondExecution = (await f.store.executeCommand({ type: 'startExecution', requestId: 'start-second', expectedVersion: second.state.version, specId: second.spec.id, specRevisionId: second.revision.id, agentId: agent.id }, f.owner, f.second.id)).state.executions[0];
    const scoped = (projectId: string) => createAgentService({ actor: agent, projectId, store: {
      getProject: () => f.store.getProject(projectId, agent),
      getEvents: (after = 0) => f.store.getEvents(after, projectId, agent),
      executeCommand: (body, actor) => f.store.executeCommand(body, actor, projectId),
    } });
    const firstContext = await scoped(f.first.id).callTool('ouro.get_context', {});
    const secondContext = await scoped(f.second.id).callTool('ouro.get_context', {});
    assert.equal(firstContext.structuredContent.project && (firstContext.structuredContent.project as { id: string }).id, f.first.id);
    assert.deepEqual((firstContext.structuredContent.work as { execution: { id: string } }[]).map(work => work.execution.id), [firstExecution.id]);
    assert.deepEqual((secondContext.structuredContent.work as { execution: { id: string } }[]).map(work => work.execution.id), [secondExecution.id]);
    const foreign = await scoped(f.first.id).callTool('ouro.get_context', { executionId: secondExecution.id });
    assert.equal(foreign.isError, true);
    assert.equal((foreign.structuredContent.error as { code: string }).code, 'FORBIDDEN');
    await f.store.revokeAgent(agent.id, f.owner, f.second.id);
    const remaining = (await f.store.authenticateAgentToken(registration.token))!;
    assert.deepEqual(remaining.projectIds, [f.first.id]);
    assert.equal((await scoped(f.second.id).callTool('ouro.get_context', {})).isError, true);
    await f.store.revokeAgent(agent.id, f.owner, f.first.id);
    assert.equal(await f.store.authenticateAgentToken(registration.token), null);
  } finally { await f.store.close(); }
});

test('AA04/AA05/AA06 Contributor writes, Viewer reads and captured actors lose revoked authority', async () => {
  const f = await fixture();
  try {
    await f.store.createInvitation(f.first.id, { email: 'member@example.com', role: 'Contributor' }, f.owner);
    const accepted = await f.store.acceptInvitation(f.invitations[0].code, { name: 'Участник', password });
    const member = (await f.store.resolveSession(accepted.token))!.actor;
    assert.equal((await f.store.getProject(f.first.id, member)).version, 0);
    await assert.rejects(f.store.getProject(f.second.id, member), hasCode('FORBIDDEN'));
    const created = await f.store.executeCommand({ type: 'createSpec', requestId: 'contributor-write', expectedVersion: 0, content: content('Member work') }, member, f.first.id);
    assert.equal(created.events[0].actor.id, member.id);
    await f.store.changeMemberRole(f.first.id, accepted.membership.id, 'Viewer', f.owner);
    assert.equal((await f.store.getProject(f.first.id, member)).specs.length, 1);
    await assert.rejects(f.store.executeCommand({ type: 'createSpec', requestId: 'viewer-write', expectedVersion: 1, content: content('Denied') }, member, f.first.id), hasCode('FORBIDDEN'));
    await f.store.revokeMember(f.first.id, accepted.membership.id, f.owner);
    await assert.rejects(f.store.getProject(f.first.id, member), hasCode('FORBIDDEN'));
    assert.equal(await f.store.resolveSession(accepted.token), null);
  } finally { await f.store.close(); }
});

test('AA11 explicit legacy Owner bootstrap preserves existing history and registrations', async () => {
  const store = await createStore({ dataDir: 'memory://' });
  try {
    const legacy: Actor = { id: 'historical-human', kind: 'human', name: 'История', projectIds: [PROJECT_ID] };
    const before = await store.getProject();
    const registration = await store.createAgent('Historical agent', legacy);
    const account = (await store.createAccount({ email: 'new-owner@example.com', name: 'Новый Owner', password }, operator)).account;
    const membership = await store.bootstrapProjectOwner(account.id, operator);
    const owner: Actor = { id: account.id, kind: 'human', name: account.name, projectIds: [PROJECT_ID] };
    assert.deepEqual(await store.getProject(PROJECT_ID, owner), before);
    assert.equal((await store.listAgents(owner))[0].id, registration.agent.id);
    assert.equal((await store.bootstrapProjectOwner(account.id, operator)).id, membership.id);
    assert.equal((await store.listProjects(owner))[0].role, 'Owner');
  } finally { await store.close(); }
});

test('MP06 collaborative drafts and GitHub receipts, deliveries and bindings stay project-scoped', async () => {
  const f = await fixture();
  try {
    const first = await createActiveSpec(f.store, f.owner, f.first.id, 'draft-first-spec', 'First draft');
    const second = await createActiveSpec(f.store, f.owner, f.second.id, 'draft-second-spec', 'Second draft');
    const draftInput = (specId: string, baseRevisionId: string) => ({ specId, baseRevisionId, requestId: 'shared-draft-request', expectedVersion: 2 });
    const firstDraft = await f.store.createCollaborativeDraft(draftInput(first.spec.id, first.revision.id), f.owner, f.first.id);
    const secondDraft = await f.store.createCollaborativeDraft(draftInput(second.spec.id, second.revision.id), f.owner, f.second.id);
    assert.notEqual(firstDraft.id, secondDraft.id);
    assert.equal((await f.store.createCollaborativeDraft(draftInput(first.spec.id, first.revision.id), f.owner, f.first.id)).id, firstDraft.id);
    assert.deepEqual((await f.store.listCollaborativeDrafts(f.owner, undefined, f.first.id)).map(draft => draft.id), [firstDraft.id]);
    assert.deepEqual((await f.store.listCollaborativeDrafts(f.owner, undefined, f.second.id)).map(draft => draft.id), [secondDraft.id]);
    assert.equal((await f.store.getCollaborativeDraft(firstDraft.id, f.owner, f.first.id)).content.title, 'First draft');
    await assert.rejects(f.store.getCollaborativeDraft(firstDraft.id, f.owner, f.second.id), hasCode('NOT_FOUND'));

    const firstAgent = await f.store.createAgent('First GitHub agent', f.owner, f.first.id);
    const secondAgent = await f.store.createAgent('Second GitHub agent', f.owner, f.second.id);
    const firstExecution = await f.store.executeCommand({ type: 'startExecution', requestId: 'github-first-start', expectedVersion: first.state.version, specId: first.spec.id, specRevisionId: first.revision.id, agentId: firstAgent.agent.id }, f.owner, f.first.id);
    const secondExecution = await f.store.executeCommand({ type: 'startExecution', requestId: 'github-second-start', expectedVersion: second.state.version, specId: second.spec.id, specRevisionId: second.revision.id, agentId: secondAgent.agent.id }, f.owner, f.second.id);
    const bindingInput = (executionId: string, expectedVersion: number) => ({ executionId, repositoryId: 123, repositoryFullName: 'example/ouro', ref: 'refs/heads/work', requestId: 'shared-binding-request', expectedVersion });
    const firstBindingResult = await f.store.createGitHubBinding(bindingInput(firstExecution.state.executions[0].id, firstExecution.cursor), f.owner, f.first.id);
    const secondBindingResult = await f.store.createGitHubBinding(bindingInput(secondExecution.state.executions[0].id, secondExecution.cursor), f.owner, f.second.id);
    const firstBinding = firstBindingResult.state.githubBindings[0];
    const secondBinding = secondBindingResult.state.githubBindings[0];
    assert.equal(firstBinding.projectId, f.first.id);
    assert.equal(secondBinding.projectId, f.second.id);
    await assert.rejects(f.store.executeCommand({ type: 'revokeGitHubBinding', requestId: 'foreign-binding-revoke', expectedVersion: secondBindingResult.cursor, bindingId: firstBinding.id }, f.owner, f.second.id), hasCode('NOT_FOUND'));

    const sha = 'a'.repeat(40);
    const push = { repositoryId: 123, repositoryFullName: 'example/ouro', ref: 'refs/heads/work', before: 'b'.repeat(40), after: sha, commitShas: [sha], payloadDigest: 'f'.repeat(64), disposition: 'pending' as const };
    const firstDelivery = await f.store.enqueueGitHubDelivery('shared-delivery-id', push, f.first.id);
    const secondDelivery = await f.store.enqueueGitHubDelivery('shared-delivery-id', push, f.second.id);
    assert.notEqual(firstDelivery.delivery.id, secondDelivery.delivery.id);
    assert.deepEqual((await f.store.listGitHubDeliveries(f.owner, f.first.id)).map(delivery => delivery.id), [firstDelivery.delivery.id]);
    assert.deepEqual((await f.store.listGitHubDeliveries(f.owner, f.second.id)).map(delivery => delivery.id), [secondDelivery.delivery.id]);
    const firstClaim = await f.store.claimGitHubDelivery({ projectId: f.first.id });
    const secondClaim = await f.store.claimGitHubDelivery({ projectId: f.second.id });
    assert.equal(firstClaim?.projectId, f.first.id);
    assert.equal(secondClaim?.projectId, f.second.id);
    assert.deepEqual(firstClaim?.bindingIds, [firstBinding.id]);
    assert.deepEqual(secondClaim?.bindingIds, [secondBinding.id]);
  } finally { await f.store.close(); }
});
