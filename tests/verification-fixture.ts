import { randomUUID } from 'node:crypto';
import { applyCommand, emptyState, PROJECT_ID, AGENT_ID, type Actor, type Command, type ProjectState, type RevisionContent, type VerificationContract, type VerificationImport, type VerificationSlice } from '../packages/core/src';
import { importPlaywrightReport } from '../lib/verification/playwright';
export const human: Actor = { id: 'verification-human', kind: 'human', projectIds: [PROJECT_ID] };
export const agent: Actor = { id: AGENT_ID, kind: 'agent', projectIds: [PROJECT_ID] };
export const slice: VerificationSlice = { productRevision: 'product-red', testRevision: 'tests-1', fixtureRevision: 'fixture-1', environmentDigest: 'a'.repeat(64) };
export const workContent: RevisionContent = { title: 'Work', goal: 'Preserve observable behavior', dod: [{ id: 'c1', text: 'First behavior', required: true }, { id: 'c2', text: 'Second behavior', required: true }], constraints: '', assumptions: '', risks: '', inputs: '', comment: '' };
export function contract(targetSpecId: string, targetRevisionId: string, workflow: VerificationContract['workflow'] = 'tdd'): VerificationContract { return { version: 1, targetSpecId, targetRevisionId, criterionIds: ['c1', 'c2'], workflow, cases: ['1', '2'].map(n => ({ id: 'case-' + n, criterionIds: ['c' + n], given: 'Initial state', action: 'Execute behavior ' + n, expected: 'Observable result ' + n, data: 'fixture', prerequisites: 'Runner and fixture available', level: 'e2e', purpose: 'acceptance', required: true, procedure: { kind: 'playwright', testId: 'test-' + n } })) }; }
export function report(statuses: ('passed' | 'failed' | 'timedOut' | 'skipped' | 'missing')[] = ['passed', 'passed'], inputs = slice): VerificationImport {
    const entries = statuses.flatMap((status, index) => status === 'missing' ? [] : [{ id: 'test-' + (index + 1), title: 'Behavior ' + (index + 1), tests: [{ expectedStatus: 'passed', results: [{ status, ...(status === 'failed' ? { errors: [{ message: 'Expected behavior missing' }] } : {}) }] }] }]);
    return { slice: inputs, scopeCaseIds: ['case-1', 'case-2'], artifactRef: 'artifact://isolated/playwright.json', rawReport: JSON.stringify({ suites: [{ specs: entries }], errors: [], stats: { expected: statuses.filter(item => item === 'passed').length, unexpected: statuses.filter(item => ['failed', 'timedOut'].includes(item)).length, flaky: 0, skipped: statuses.filter(item => item === 'skipped').length } }), startedAt: '2026-11-03T00:00:00.000Z', finishedAt: '2026-11-03T00:00:01.000Z' };
}
export function fixture(workflow: VerificationContract['workflow'] = 'tdd') {
    let state = emptyState();
    const send = (body: Record<string, unknown>, actor = human) => {
        const command = { ...body, expectedVersion: state.version, requestId: randomUUID() } as Command;
        const contract = command.type === 'reportVerificationRun' ? state.revisions.find(item => item.id === state.executions.find(item => item.id === command.executionId)?.specRevisionId)?.verification : undefined;
        const proof = command.type === 'reportVerificationRun' && contract ? importPlaywrightReport(command.report, contract) : undefined;
        const result = applyCommand(state, command, actor, { now: '2026-11-03T00:00:02.000Z', verificationImport: proof });
        state = result.state;
        return result;
    };
    send({ type: 'createSpec', content: workContent });
    const work = state.specs[0], workRevision = state.revisions[0];
    send({ type: 'activateRevision', specId: work.id, revisionId: workRevision.id });
    send({ type: 'createSpec', content: { ...workContent, title: 'Verification', verification: contract(work.id, workRevision.id, workflow) } });
    const spec = state.specs[1], revision = state.revisions[1];
    send({ type: 'activateRevision', specId: spec.id, revisionId: revision.id });
    send({ type: 'startExecution', specId: spec.id, specRevisionId: revision.id, agentId: agent.id });
    const execution = state.executions[0];
    send({ type: 'confirmResumed', executionId: execution.id, ackPhase: 'start' }, agent);
    const importRun = (input = report()) => { send({ type: 'reportVerificationRun', executionId: execution.id, report: input }, agent); return state.verificationRuns.at(-1)!; };
    const review = (assessment: string, runId = state.verificationRuns.at(-1)!.id) => send({ type: 'reviewVerificationRun', runId, assessment, reason: 'Inspected actual vs expected behavior', prerequisitesEvidence: 'Isolated runner and fixture health checked' });
    const current = (value = slice) => send({ type: 'setVerificationSlice', verificationRevisionId: revision.id, slice: value, reason: 'Operator selected checkout inputs' });
    return { get state(): ProjectState { return state; }, send, work, workRevision, spec, revision, execution, importRun, review, current };
}
