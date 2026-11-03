import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore } from '../lib/store';
import { createAgentService, type AgentStore } from '../packages/mcp/src/agent-service';
import { getVerificationReadiness, PROJECT_ID, type ProjectState } from '../packages/core/src';
import { fixture, agent, human, report, slice } from './verification-fixture';
import { loadDraftDocument, replaceDraftText, encodeDraftDocument, Y } from '../packages/collaboration/src/document';
test('verification storage: atomic facts/outbox/index/receipt, immutable bytes, exact replay, rollback and reopen', async () => {
    const f = fixture(), dir = await mkdtemp(path.join(tmpdir(), 'ouro-verification-storage-'));
    let store = await createStore({ dataDir: dir, seedEvents: f.state.events });
    try {
        const hashes = await store.inspect('SELECT id,content_hash FROM ouro_spec_revisions ORDER BY id');
        const input = { type: 'reportVerificationRun', executionId: f.execution.id, report: report(['failed', 'failed']), requestId: randomUUID(), expectedVersion: f.state.version };
        const first = await store.executeCommand(input, agent);
        assert.equal(first.state.verificationRuns.length, 1);
        const duplicate = await store.executeCommand(input, agent);
        assert.equal(duplicate.replayed, true);
        assert.deepEqual(duplicate.events, first.events);
        await assert.rejects(store.executeCommand({ ...input, report: report() }, agent), (e: any) => e.code === 'IDEMPOTENCY_CONFLICT');
        await assert.rejects(store.executeCommand({ ...input, requestId: randomUUID(), expectedVersion: first.cursor, projectId: 'foreign' }, agent), (e: any) => e.code === 'FORBIDDEN');
        await assert.rejects(store.inspect('UPDATE ouro_verification_runs SET content=content'), /append-only/);
        await assert.rejects(store.inspect('DELETE FROM ouro_verification_runs'), /append-only/);
        await assert.rejects(store.inspect('TRUNCATE ouro_verification_runs'), /append-only/);
        const before = await store.getProject();
        await store.inspect("CREATE FUNCTION ouro_test_fail_run() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected run failure'; END $$");
        await store.inspect('CREATE TRIGGER ouro_test_fail_run BEFORE INSERT ON ouro_verification_runs FOR EACH ROW EXECUTE FUNCTION ouro_test_fail_run()');
        const next = { ...input, requestId: randomUUID(), expectedVersion: before.version };
        await assert.rejects(store.executeCommand(next, agent), /injected run failure/);
        assert.deepEqual(await store.getProject(), before);
        await store.inspect('DROP TRIGGER ouro_test_fail_run ON ouro_verification_runs');
        await store.inspect('DROP FUNCTION ouro_test_fail_run()');
        await store.executeCommand(next, agent);
        assert.deepEqual(await store.inspect('SELECT id,content_hash FROM ouro_spec_revisions ORDER BY id'), hashes);
        const committed = await store.getProject(), facts = await store.inspect<{
            count: number;
        }>('SELECT count(*)::int AS count FROM ouro_verification_runs');
        assert.equal(facts.rows[0].count, 2);
        await store.close();
        store = await createStore({ dataDir: dir, seedEvents: [] });
        assert.deepEqual(await store.getProject(), committed);
        assert.equal((await store.executeCommand(input, agent)).replayed, true);
    }
    finally {
        await store.close();
        await rm(dir, { recursive: true, force: true });
    }
});
test('MCP verification capability: exact assigned context, strict tool schema and unknown post-commit receipt recovery', async () => {
    const f = fixture(), store = await createStore({ dataDir: 'memory://', seedEvents: f.state.events });
    try {
        let inject = true;
        const uncertain: AgentStore = { getProject: () => store.getProject(), getEvents: after => store.getEvents(after), executeCommand: async (body, actor) => { const committed = await store.executeCommand(body, actor); if (inject) {
                inject = false;
                return { ...committed, state: { ...committed.state, executions: [] } as ProjectState };
            } return committed; } };
        const service = createAgentService({ store: uncertain, actor: agent }), args = { executionId: f.execution.id, requestId: randomUUID(), expectedVersion: f.state.version, report: report() };
        const unknown = await service.callTool('ouro.report_verification_run', args);
        assert.equal(unknown.isError, true);
        assert.equal((unknown.structuredContent as any).error.details.outcomeUnknown, true);
        assert.equal((await store.getProject()).verificationRuns.length, 1);
        const recovered = await service.callTool('ouro.report_verification_run', args);
        assert.equal(recovered.isError, undefined);
        assert.equal((recovered.structuredContent as any).replayed, true);
        assert.equal((await store.getProject()).verificationRuns.length, 1);
        const bad = await service.callTool('ouro.report_verification_run', { ...args, claim: 'trusted-runner' });
        assert.equal(bad.isError, true);
        const context = await service.callTool('ouro.get_context', { executionId: f.execution.id });
        assert.equal(context.isError, undefined);
        assert.equal((context.structuredContent as any).work[0].verification.runs.length, 1);
        assert.equal((context.structuredContent as any).work[0].verification.readiness.ready, false);
        const current = await store.getProject();
        await store.executeCommand({ type: 'setVerificationSlice', verificationRevisionId: f.revision.id, slice, reason: 'Select current inputs', requestId: randomUUID(), expectedVersion: current.version }, human);
        assert.equal(getVerificationReadiness(await store.getProject(), f.revision).ready, false);
        const foreign = createAgentService({ store, actor: { ...agent, id: 'not-assigned', projectIds: [PROJECT_ID] } });
        assert.equal((await foreign.callTool('ouro.get_context', { executionId: f.execution.id })).isError, true);
    }
    finally {
        await store.close();
    }
});
test('collaborative verification storage publishes a distinct revision with binding/cases preserved', async () => {
    const f = fixture(), store = await createStore({ dataDir: 'memory://', seedEvents: f.state.events });
    try {
        const draft = await store.createCollaborativeDraft({ specId: f.spec.id, baseRevisionId: f.revision.id, requestId: randomUUID(), expectedVersion: f.state.version }, human);
        const doc = loadDraftDocument(draft.stateUpdate);
        let update: string;
        try {
            const before = Y.encodeStateVector(doc);
            replaceDraftText(doc.getMap('draft').get('title') as Y.Text, 'Collaboratively edited verification');
            update = Buffer.from(Y.encodeStateAsUpdate(doc, before)).toString('base64');
        }
        finally {
            doc.destroy();
        }
        const edited = await store.updateCollaborativeDraft({ draftId: draft.id, updateId: randomUUID(), clientId: 'verification-editor', updateBase64: update }, human);
        const head = await store.getCollaborativeDraft(draft.id, human);
        assert.deepEqual(head.content.verification, f.revision.verification);
        const published = await store.publishCollaborativeDraft({ draftId: draft.id, requestId: randomUUID(), expectedVersion: (await store.getProject()).version, draftVersion: head.version, contentHash: head.contentHash, baseLatestRevisionId: f.revision.id }, human);
        const state = await store.getProject();
        assert.deepEqual(state.revisions.at(-1)?.verification, f.revision.verification);
        assert.equal(state.specs.find(item => item.id === f.spec.id)?.activeRevisionId, f.revision.id);
    }
    finally {
        await store.close();
    }
});
