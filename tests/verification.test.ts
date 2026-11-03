import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { applyCommand, emptyState, replay, getVerificationReadiness, getVerificationPresentation, getWorkPairGroups, getWorkPairPresentation, type RevisionContent } from '../packages/core/src';
import { calculateExpectationImpact } from '../packages/core/src/expectation-impact';
import { createDraftDocument, readDraftContent, loadDraftDocument, encodeDraftDocument, replaceDraftText, Y } from '../packages/collaboration/src/document';
import { AGENT_TOOLS, createSchemaBundle, verificationContractSchema, verificationCommandSchema, proposalRevisionContentSchema, PROTOCOL_VERSION } from '@ouro/protocol';
import { importPlaywrightReport } from '../lib/verification/playwright';
import { fixture, human, agent, slice, report, workContent } from './verification-fixture';
test('verification RED -> changed product GREEN retains immutable facts, exact comparable inputs, human acceptance separate', () => {
    const f = fixture();
    f.current();
    const red = f.importRun(report(['failed', 'failed'])), raw = JSON.stringify(red);
    assert.equal(getVerificationReadiness(f.state, f.revision).ready, false);
    assert.equal(getVerificationReadiness(f.state, f.revision).implementationReady, false);
    f.review('expected_red');
    assert.equal(getVerificationReadiness(f.state, f.revision).implementationReady, true);
    f.send({ type: 'recordVerificationPhase', verificationRevisionId: f.revision.id, scopeCaseIds: ['case-1'], phase: 'implementation', evidence: 'Start implementation for first behavior' });
    assert.equal(getVerificationPresentation(f.state, f.revision).foreground, 'work');
    const greenSlice = { ...slice, productRevision: 'product-green' };
    f.current(greenSlice);
    assert.equal(getVerificationReadiness(f.state, f.revision).applicability, 'stale');
    f.importRun(report(['passed', 'passed'], greenSlice));
    f.review('usable');
    const readiness = getVerificationReadiness(f.state, f.revision);
    assert.equal(readiness.ready, true);
    assert.equal(readiness.redRun?.id, red.id);
    assert.equal(JSON.stringify(f.state.verificationRuns[0]), raw);
    assert.equal(f.state.specs[0].acceptance, undefined);
    assert(!f.state.events.some(event => event.type === 'SpecAccepted'));
    assert.deepEqual(replay(f.state.events), f.state);
});
test('infrastructure, skipped and missing required results cannot qualify RED or global readiness', () => {
    for (const statuses of [['timedOut', 'passed'], ['skipped', 'passed'], ['passed', 'missing']] as const) {
        const f = fixture();
        f.current();
        const run = f.importRun(report([...statuses]));
        assert.throws(() => f.review('expected_red'));
        assert.throws(() => f.review('usable'));
        assert.equal(getVerificationReadiness(f.state, f.revision).ready, false);
        assert(['error', 'partial'].includes(run.outcome));
    }
    const f = fixture();
    const input = report();
    const raw = JSON.parse(input.rawReport);
    raw.errors = [{ message: 'Browser could not launch' }];
    f.importRun({ ...input, rawReport: JSON.stringify(raw) });
    assert.equal(f.state.verificationRuns[0].outcome, 'error');
    f.review('environment_error');
    assert.equal(getVerificationPresentation(f.state, f.revision).resultLabel, 'Ошибка окружения');
});
test('unknown applicability, stale tests/fixture/environment, revoked RED assessment and preservation baseline', () => {
    const f = fixture();
    f.importRun();
    f.review('usable');
    assert.equal(getVerificationReadiness(f.state, f.revision).applicability, 'unknown');
    f.current();
    assert.equal(getVerificationReadiness(f.state, f.revision).ready, true);
    for (const next of [{ ...slice, testRevision: 'tests-2' }, { ...slice, fixtureRevision: 'fixture-2' }, { ...slice, environmentDigest: 'b'.repeat(64) }]) {
        f.current(next);
        assert.equal(getVerificationReadiness(f.state, f.revision).applicability, 'stale');
    }
    const p = fixture('preservation');
    p.current();
    p.importRun();
    p.review('baseline');
    assert.equal(getVerificationReadiness(p.state, p.revision).implementationReady, true);
    p.review('invalid_test');
    assert.equal(getVerificationReadiness(p.state, p.revision).implementationReady, false);
});
test('subset readiness never accepts the full contract; unchanged test expectation is required across TDD cycle', () => {
    const f = fixture();
    f.current();
    const input = report(['failed', 'missing']);
    input.scopeCaseIds = ['case-1'];
    f.importRun(input);
    f.review('expected_red');
    assert.equal(getVerificationReadiness(f.state, f.revision, ['case-1']).implementationReady, true);
    assert.equal(getVerificationReadiness(f.state, f.revision).implementationReady, false);
    f.current({ ...slice, testRevision: 'removed-assertion' });
    assert.equal(getVerificationReadiness(f.state, f.revision, ['case-1']).implementationReady, false);
    assert.throws(() => f.send({ type: 'recordVerificationPhase', verificationRevisionId: f.revision.id, scopeCaseIds: ['case-1'], phase: 'implementation', evidence: 'Invalid cross-test RED' }));
});
test('exact revision/criterion/role scope; no reciprocal dependencies; draft activation requires current target', () => {
    const f = fixture();
    assert.equal(f.state.dependencies.length, 0);
    for (const verification of [{ ...f.revision.verification!, targetRevisionId: 'proposal-id' }, { ...f.revision.verification!, criterionIds: ['absent'] }, { ...f.revision.verification!, targetSpecId: f.spec.id, targetRevisionId: f.revision.id }])
        assert.throws(() => f.send({ type: 'createSpec', content: { ...workContent, verification } }));
    assert.throws(() => f.send({ type: 'proposeRevision', specId: f.work.id, content: { ...workContent, verification: f.revision.verification } }));
    const stripped = { ...f.revision } as Partial<RevisionContent>;
    delete stripped.verification;
    assert.throws(() => f.send({ type: 'proposeRevision', specId: f.spec.id, content: stripped }));
    f.send({ type: 'proposeRevision', specId: f.work.id, content: { ...workContent, goal: 'New behavior' } });
    const next = f.state.revisions.at(-1)!;
    f.send({ type: 'activateRevision', specId: f.work.id, revisionId: next.id });
    assert.equal(getVerificationReadiness(f.state, f.revision).ready, false);
    assert.throws(() => f.send({ type: 'setVerificationSlice', verificationRevisionId: f.revision.id, slice, reason: 'Old binding' }));
});
test('assignment, human-only assessment, stop/resume, CAS and adapter origin cannot be bypassed', () => {
    const f = fixture();
    const body = { type: 'reportVerificationRun' as const, executionId: f.execution.id, report: report(), requestId: randomUUID(), expectedVersion: f.state.version };
    assert.throws(() => applyCommand(f.state, body, agent), /адаптер/);
    assert.throws(() => f.send(body, { ...agent, id: 'other' }));
    assert.throws(() => f.send(body, { ...agent, projectIds: ['other'] }));
    f.importRun();
    assert.throws(() => f.send({ type: 'reviewVerificationRun', runId: f.state.verificationRuns[0].id, assessment: 'usable', reason: 'I assert pass', prerequisitesEvidence: 'Agent assertion' }, agent));
    f.send({ type: 'requestStop', executionId: f.execution.id, reason: 'Pause imported work' });
    assert.throws(() => f.importRun());
    assert.throws(() => applyCommand(f.state, { ...body, expectedVersion: 0 }, agent), (error: any) => error.code === 'VERSION_CONFLICT');
});
test('adapter retains bytes/hash, rejects contradictory counts, duplicate test IDs, retries and unsafe source claims', () => {
    const f = fixture(), input = report(), proof = importPlaywrightReport(input, f.revision.verification!);
    assert.equal(proof.sha256, createHash('sha256').update(input.rawReport).digest('hex'));
    const raw = JSON.parse(input.rawReport);
    raw.stats.expected = 100;
    assert.throws(() => importPlaywrightReport({ ...input, rawReport: JSON.stringify(raw) }, f.revision.verification!));
    raw.stats.expected = 2;
    raw.suites[0].specs.push(raw.suites[0].specs[0]);
    assert.throws(() => importPlaywrightReport({ ...input, rawReport: JSON.stringify(raw) }, f.revision.verification!));
    const retry = JSON.parse(input.rawReport);
    retry.suites[0].specs[0].tests[0].results.unshift({ status: 'failed' });
    retry.stats.expected = 1;
    retry.stats.flaky = 1;
    assert.equal(importPlaywrightReport({ ...input, rawReport: JSON.stringify(retry) }, f.revision.verification!).outcome, 'error');
    assert.equal(verificationCommandSchema.safeParse({ ...bodyFor(f), trusted: true }).success, false);
});
function bodyFor(f: ReturnType<typeof fixture>) { return { type: 'reportVerificationRun', executionId: f.execution.id, report: report(), requestId: randomUUID(), expectedVersion: f.state.version }; }
test('legacy revisions and immutable JSON hashes survive replay and another command without added defaults', () => {
    const state = applyCommand(emptyState(), { type: 'createSpec', content: workContent, requestId: randomUUID(), expectedVersion: 0 }, human).state, original = JSON.stringify(state.revisions[0]);
    const next = applyCommand(state, { type: 'createSpec', content: workContent, requestId: randomUUID(), expectedVersion: state.version }, human).state;
    assert.equal(JSON.stringify(replay(next.events).revisions[0]), original);
    assert(!('verification' in next.revisions[0]));
});
test('Yjs create/edit/encode/load/read preserves verification contract and legacy absence', () => {
    const f = fixture(), doc = createDraftDocument(f.revision);
    try {
        replaceDraftText(doc.getMap('draft').get('title') as Y.Text, 'Edited title');
        const loaded = loadDraftDocument(encodeDraftDocument(doc));
        try {
            const content = readDraftContent(loaded);
            assert.deepEqual(content.verification, f.revision.verification);
            assert.equal(content.title, 'Edited title');
        }
        finally {
            loaded.destroy();
        }
    }
    finally {
        doc.destroy();
    }
    const old = createDraftDocument(workContent);
    try {
        assert(!('verification' in readDraftContent(old)));
    }
    finally {
        old.destroy();
    }
});
test('contract changes appear in expectation impact and paired projection remains revision-bound at historical cursor', () => {
    const f = fixture(), before = f.state;
    f.current();
    f.importRun();
    f.review('usable');
    const c0 = f.state.version;
    const changed = structuredClone(f.revision.verification!);
    changed.cases[0].expected = 'Changed observable result';
    changed.cases.pop();
    changed.criterionIds = ['c1'];
    assert.throws(() => f.send({ type: 'proposeRevision', specId: f.spec.id, content: { ...workContent, verification: changed } }), /Основание/);
    f.send({ type: 'proposeRevision', specId: f.spec.id, content: { ...workContent, verification: changed, comment: 'Owner revised scope explicitly' } });
    const revision = f.state.revisions.at(-1)!;
    f.send({ type: 'activateRevision', specId: f.spec.id, revisionId: revision.id });
    const impact = calculateExpectationImpact(f.state.events, { projectId: f.state.projectId, c0, c1: f.state.version });
    assert(impact.changedSpecs.some(item => item.changes.some(change => change.fields.includes('verification'))));
    assert.equal(getWorkPairGroups(f.state).length, 1);
    assert.equal(getWorkPairGroups(f.state)[0].verifications.length, 1);
    assert.equal(getWorkPairPresentation(before, getWorkPairGroups(before)[0]).verifications[0].readiness.result, 'not_run');
});
test('portable strict schemas, generated capability and old work content remain compatible', () => {
    const f = fixture();
    assert.equal(PROTOCOL_VERSION, '0.3.0');
    assert(proposalRevisionContentSchema.safeParse(workContent).success);
    assert(verificationContractSchema.safeParse(f.revision.verification).success);
    assert(!verificationContractSchema.safeParse({ ...f.revision.verification, autoAccept: true }).success);
    assert(AGENT_TOOLS.find(item => item.name === 'ouro.report_verification_run'));
    assert.deepEqual(createSchemaBundle().manifest.verification.provenance, ['imported_report','human_attested','local_runner']);
});
test('optional skip remains visible without blocking required coverage, and unexpected xfail success never becomes GREEN', () => {
    const f = fixture();
    const next = structuredClone(f.revision.verification!);
    next.cases[1].required = false;
    f.send({ type: 'proposeRevision', specId: f.spec.id, content: { ...workContent, verification: next, comment: 'Owner explicitly made second case optional' } });
    const revision = f.state.revisions.at(-1)!;
    f.send({ type: 'requestStop', executionId: f.execution.id, reason: 'New contract' });
    f.send({ type: 'confirmStopped', executionId: f.execution.id }, agent);
    f.send({ type: 'cancelExecution', executionId: f.execution.id, reason: 'Replace contract' });
    f.send({ type: 'activateRevision', specId: f.spec.id, revisionId: revision.id });
    f.send({ type: 'startExecution', specId: f.spec.id, specRevisionId: revision.id, agentId: agent.id });
    const execution = f.state.executions.at(-1)!;
    f.send({ type: 'confirmResumed', executionId: execution.id, ackPhase: 'start' }, agent);
    f.send({ type: 'setVerificationSlice', verificationRevisionId: revision.id, slice, reason: 'Current inputs' });
    f.send({ type: 'reportVerificationRun', executionId: execution.id, report: report(['passed', 'skipped']) }, agent);
    f.review('usable');
    assert.equal(getVerificationReadiness(f.state, revision).ready, true);
    assert.equal(f.state.verificationRuns.at(-1)?.results[1].outcome, 'skipped');
    const input = report(), raw = JSON.parse(input.rawReport);
    raw.suites[0].specs[0].tests[0].expectedStatus = 'failed';
    raw.stats.expected = 1;
    raw.stats.unexpected = 1;
    assert.equal(importPlaywrightReport({ ...input, rawReport: JSON.stringify(raw) }, revision.verification!).results[0].outcome, 'error');
});
test('paired foreground follows actual bound execution ACK and later verification run, without granting execution authority', () => {
    const f = fixture();
    f.send({ type: 'startExecution', specId: f.work.id, specRevisionId: f.workRevision.id, agentId: agent.id });
    const execution = f.state.executions.at(-1)!;
    f.send({ type: 'confirmResumed', executionId: execution.id, ackPhase: 'start' }, agent);
    assert.equal(getWorkPairPresentation(f.state, getWorkPairGroups(f.state)[0]).foreground.id, f.work.id);
    f.importRun();
    assert.equal(getWorkPairPresentation(f.state, getWorkPairGroups(f.state)[0]).foreground.id, f.spec.id);
    assert.equal(f.state.executions.find(item => item.id === execution.id)?.state, 'running');
    assert.equal(f.state.specs[0].acceptance, undefined);
});
test('JSONB property order and a title-only edit do not become verification expectation drift',()=>{
 const f=fixture(),c0=f.state.version;
 const reordered=JSON.parse(JSON.stringify(f.revision.verification,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value));
 f.send({type:'proposeRevision',specId:f.spec.id,content:{...workContent,title:'Title only',verification:reordered}});
 const revision=f.state.revisions.at(-1)!;f.send({type:'activateRevision',specId:f.spec.id,revisionId:revision.id});
 const impact=calculateExpectationImpact(f.state.events,{projectId:f.state.projectId,c0,c1:f.state.version});assert.equal(impact.K,0);
});
