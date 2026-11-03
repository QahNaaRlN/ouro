import { z } from 'zod';
import { isWellFormedUnicode } from './unicode.js';
const text = (max = 4000) => z.string().min(1).max(max).refine(value => !!value.trim() && isWellFormedUnicode(value) && !value.includes('\0'), 'Invalid database text');
const id = text(200), digest = z.string().regex(/^[a-f0-9]{64}$/);
const ids = z.array(id).min(1).max(50).refine(items => new Set(items).size === items.length, 'Duplicate ID');
export const verificationQualityPolicySchema=z.strictObject({mutation:z.strictObject({required:z.boolean(),minimumScore:z.number().min(0).max(100)}).optional()});
const mutationResult=z.strictObject({caseId:id,killed:z.number().int().nonnegative(),survived:z.number().int().nonnegative(),noCoverage:z.number().int().nonnegative(),timedOut:z.number().int().nonnegative(),total:z.number().int().positive()}).refine(value=>value.total===value.killed+value.survived+value.noCoverage+value.timedOut,'Mutation counts do not add up');
export const verificationQualitySchema=z.strictObject({mutation:z.array(mutationResult).min(1).max(50).refine(items=>new Set(items.map(item=>item.caseId)).size===items.length,'Duplicate mutation case')});
export const verificationCaseSchema = z.strictObject({
    id, criterionIds: ids, given: text(), action: text(), expected: text(), data: text(), prerequisites: text(),
    level: z.enum(['unit', 'component', 'integration', 'e2e']), purpose: z.enum(['regression', 'acceptance']), required: z.boolean(), quality:verificationQualityPolicySchema.optional(),
    procedure: z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('playwright'), testId: id }),
        z.strictObject({ kind: z.literal('manual'), instructions: text() }),
        z.strictObject({ kind: z.literal('unlinked') }),
    ]),
});
export const verificationContractSchema = z.strictObject({
    version: z.literal(1), targetSpecId: id, targetRevisionId: id, criterionIds: ids,
    workflow: z.enum(['tdd', 'preservation', 'verification']),
    cases: z.array(verificationCaseSchema).min(1).max(50).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Duplicate case ID'),
});
/** Declared snapshots, not a claim that Ouro observed a checkout or CI. */
export const verificationSliceSchema = z.strictObject({
    productRevision: text(200), testRevision: text(200), fixtureRevision: text(200), environmentDigest: digest,
});
const fileRole=z.enum(['product','test','fixture','config']);
const relativePath=text(2000).refine(value=>!value.startsWith('/')&&!value.startsWith('\\')&&!/^[A-Za-z]:/.test(value)&&!value.split(/[\\/]/).some(part=>part==='..'||part==='.'||part===''),'Relative contained path required');
export const verificationObservationConfigSchema=z.strictObject({files:z.array(z.strictObject({path:relativePath,role:fileRole})).min(1).max(32).refine(items=>new Set(items.map(item=>item.path.toLowerCase())).size===items.length,'Duplicate observation path'),playwrightConfigPath:relativePath,requiredCapabilities:z.record(text(100),text(1000)).optional()});
export const verificationArtifactManifestSchema=z.strictObject({files:z.array(z.strictObject({path:relativePath,role:fileRole,sha256:digest,size:z.number().int().nonnegative()})).max(32),capabilities:z.record(text(100),text(1000)),digest});
export const verificationWorkspaceObservationSchema=verificationArtifactManifestSchema.extend({slice:verificationSliceSchema,status:z.enum(['observed','unavailable']),reason:text(2000).optional()});
export const verificationObservationConfigRecordSchema=z.strictObject({id,verificationRevisionId:id,config:verificationObservationConfigSchema,reason:text(20000),actorId:id,at:z.iso.datetime()});
export const verificationObservationRecordSchema=z.strictObject({id,verificationRevisionId:id,configId:id,observation:verificationWorkspaceObservationSchema,at:z.iso.datetime()});
export const verificationImportSchema = z.strictObject({
    slice: verificationSliceSchema, scopeCaseIds: ids, artifactRef: text(2000), rawReport: text(160000),
    startedAt: z.iso.datetime(), finishedAt: z.iso.datetime(), flowStepRunId: id.optional(),quality:verificationQualitySchema.optional(),
}).refine(value => Date.parse(value.finishedAt) >= Date.parse(value.startedAt), 'Invalid run interval');
export const reportVerificationInputSchema = z.strictObject({
    executionId: id, requestId: text(200).min(8), expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), report: verificationImportSchema,
});
export const verificationCaseResultSchema = z.strictObject({
    caseId: id, outcome: z.enum(['passed', 'failed', 'error', 'skipped', 'not_run']), actual: text(8000),
});
export const verificationRunSchema = z.strictObject({
    id, projectId: id, executionId: id, verificationSpecId: id, verificationRevisionId: id, targetSpecId: id, targetRevisionId: id,
    slice: verificationSliceSchema, scopeCaseIds: ids, startedAt: z.iso.datetime(), finishedAt: z.iso.datetime(), recordedAt: z.iso.datetime(),
    results: z.array(verificationCaseResultSchema).min(1).max(50),
    outcome: z.enum(['passed', 'failed', 'error', 'partial']),
    source: z.discriminatedUnion('kind',[
        z.strictObject({ kind: z.literal('imported_report'), adapter: z.literal('playwright-json/v1'), artifactRef: text(2000), sha256: digest, rawReport: text(160000), submittedBy: id }),
        z.strictObject({kind:z.literal('human_attested'),adapter:z.literal('manual/v1'),artifactRef:text(2000),evidence:text(20000),submittedBy:id}),
        z.strictObject({kind:z.literal('local_runner'),adapter:z.literal('playwright-json/v1'),verificationMethod:z.literal('server-owned-playwright-process'),artifactRef:text(2000),sha256:digest,rawReport:text(160000),submittedBy:id,runnerVersion:text(200),exitCode:z.number().int().nullable(),inputStability:z.enum(['unchanged','changed'])}),
    ]),
    flowStepRunId: id.optional(),quality:verificationQualitySchema.optional(),artifactManifest:verificationArtifactManifestSchema.optional(),
});
export const verificationAssessmentSchema = z.enum(['usable', 'expected_red', 'baseline', 'environment_error', 'invalid_test', 'unresolved']);
export const verificationPhaseSchema = z.enum(['preparation', 'implementation', 'verification', 'refactoring', 'acceptance']);
export const verificationReviewSchema = z.strictObject({ id, runId: id, assessment: verificationAssessmentSchema, reason: text(20000), prerequisitesEvidence: text(20000), actorId: id, at: z.iso.datetime() });
export const verificationSliceRecordSchema = z.strictObject({ id, verificationRevisionId: id, slice: verificationSliceSchema, reason: text(20000), actorId: id, at: z.iso.datetime() });
export const verificationPhaseRecordSchema = z.strictObject({ id, verificationRevisionId: id, targetRevisionId: id, scopeCaseIds: ids, phase: verificationPhaseSchema, evidence: text(20000), actorId: id, at: z.iso.datetime() });
export const verificationCaseEvidenceSchema=z.strictObject({caseId:id,runId:id.optional(),outcome:z.enum(['passed','failed','error','skipped','not_run']).optional(),applicability:z.enum(['applicable','stale','incomplete','unknown']),admitted:z.boolean(),reason:z.string()});
export const verificationReadinessSchema = z.strictObject({ result: z.enum(['not_run', 'passed', 'failed', 'error', 'partial']), applicability: z.enum(['applicable', 'stale', 'incomplete', 'unknown']), ready: z.boolean(), implementationReady: z.boolean(), reasons: z.array(z.string()), run: verificationRunSchema.optional(), redRun: verificationRunSchema.optional(),caseEvidence:z.array(verificationCaseEvidenceSchema).optional(),runIds:z.array(id).optional() });
export const verificationCyclePhaseSchema=z.enum(['preparation','implementation','verification','refactoring','acceptance','cancelled']);
export const verificationCycleTransitionSchema=z.strictObject({phase:verificationCyclePhaseSchema,actorId:id,at:z.iso.datetime(),evidence:text(20000),greenRunIds:ids.optional()});
export const verificationCycleSchema=z.strictObject({id,verificationRevisionId:id,targetRevisionId:id,workflow:z.enum(['tdd','preservation']),scopeCaseIds:ids,phase:verificationCyclePhaseSchema,baselineRunIds:ids,greenRunIds:z.array(id),createdBy:id,createdAt:z.iso.datetime(),transitions:z.array(verificationCycleTransitionSchema)});
export const verificationRefactorAdmissionSchema=z.strictObject({id,verificationRevisionId:id,fromSlice:verificationSliceSchema,toSlice:verificationSliceSchema,scopeCaseIds:ids,reason:text(20000),evidence:text(20000),actorId:id,at:z.iso.datetime()});
export const manualVerificationInputSchema=z.strictObject({executionId:id,slice:verificationSliceSchema,results:z.array(verificationCaseResultSchema).min(1).max(50).refine(items=>new Set(items.map(item=>item.caseId)).size===items.length,'Duplicate case result'),startedAt:z.iso.datetime(),finishedAt:z.iso.datetime(),evidence:text(20000),flowStepRunId:id.optional(),quality:verificationQualitySchema.optional()}).refine(value=>Date.parse(value.finishedAt)>=Date.parse(value.startedAt),'Invalid run interval');
const commandBase = { requestId: text(200).min(8), expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) };
export const verificationObserveInputSchema=z.strictObject({...commandBase,verificationRevisionId:id,config:verificationObservationConfigSchema.optional(),reason:text(20000).optional()}).refine(value=>!value.config||!!value.reason,'Configuration requires a reason');
export const verificationRunnerInputSchema=z.strictObject({...commandBase,executionId:id,scopeCaseIds:ids});
export const verificationCommandSchema = z.discriminatedUnion('type', [
    reportVerificationInputSchema.safeExtend({ type: z.literal('reportVerificationRun'), specId: id.optional(), specRevisionId: id.optional() }),
    z.strictObject({ ...commandBase, type: z.literal('reviewVerificationRun'), runId: id, assessment: verificationAssessmentSchema, reason: text(20000), prerequisitesEvidence: text(20000) }),
    z.strictObject({ ...commandBase, type: z.literal('setVerificationSlice'), verificationRevisionId: id, slice: verificationSliceSchema, reason: text(20000) }),
    z.strictObject({ ...commandBase, type: z.literal('recordVerificationPhase'), verificationRevisionId: id, scopeCaseIds: ids, phase: verificationPhaseSchema, evidence: text(20000), executionId: id.optional() }),
    manualVerificationInputSchema.safeExtend({...commandBase,type:z.literal('reportManualVerificationRun')}),
    z.strictObject({...commandBase,type:z.literal('beginVerificationCycle'),verificationRevisionId:id,scopeCaseIds:ids,baselineRunIds:ids,reason:text(20000)}),
    z.strictObject({...commandBase,type:z.literal('advanceVerificationCycle'),cycleId:id,phase:verificationCyclePhaseSchema.exclude(['preparation']),evidence:text(20000),greenRunIds:ids.optional(),executionId:id.optional()}),
    z.strictObject({...commandBase,type:z.literal('admitVerificationRefactor'),verificationRevisionId:id,fromSlice:verificationSliceSchema,toSlice:verificationSliceSchema,scopeCaseIds:ids,reason:text(20000),evidence:text(20000)}),
    z.strictObject({...commandBase,type:z.literal('configureVerificationObservation'),verificationRevisionId:id,config:verificationObservationConfigSchema,reason:text(20000)}),
    z.strictObject({...commandBase,type:z.literal('observeVerificationWorkspace'),verificationRevisionId:id,configId:id,observation:verificationWorkspaceObservationSchema}),
]);
export type VerificationContract = z.infer<typeof verificationContractSchema>;
export type VerificationCase = z.infer<typeof verificationCaseSchema>;
export type VerificationSlice = z.infer<typeof verificationSliceSchema>;
export type VerificationImport = z.infer<typeof verificationImportSchema>;
export type VerificationRun = z.infer<typeof verificationRunSchema>;
export type VerificationAssessment = z.infer<typeof verificationAssessmentSchema>;
export type VerificationPhase = z.infer<typeof verificationPhaseSchema>;
export type VerificationCycle=z.infer<typeof verificationCycleSchema>;
export type VerificationRefactorAdmission=z.infer<typeof verificationRefactorAdmissionSchema>;
export type ManualVerificationInput=z.infer<typeof manualVerificationInputSchema>;
export type VerificationQuality=z.infer<typeof verificationQualitySchema>;
export type VerificationObservationConfig=z.infer<typeof verificationObservationConfigSchema>;
export type VerificationArtifactManifest=z.infer<typeof verificationArtifactManifestSchema>;
export type VerificationWorkspaceObservation=z.infer<typeof verificationWorkspaceObservationSchema>;
export type VerificationObservationConfigRecord=z.infer<typeof verificationObservationConfigRecordSchema>;
export type VerificationObservationRecord=z.infer<typeof verificationObservationRecordSchema>;
