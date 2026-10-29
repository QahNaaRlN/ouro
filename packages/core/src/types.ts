import type {FlowDefinition} from '@ouro/protocol';
export type {FlowDefinition,FlowNode,FlowEdge,FlowNodeKind,FlowOwner} from '@ouro/protocol';
import type {ManagedSubject,Pin,RunRef} from '../../meridian/src/context';

export type SpecState = 'idea' | 'specified' | 'in_progress' | 'blocked' | 'done' | 'invalidated';
export type ExecutionState = 'queued' | 'running' | 'waiting_for_human' | 'paused' | 'succeeded' | 'failed' | 'cancelled' | 'skipped';
export type RequestState = 'pending' | 'resolved' | 'withdrawn' | 'superseded';
export type RequestKind = 'Question' | 'Fork' | 'Blocker';
export type Actor = { id: string; kind: 'human' | 'agent' | 'service'; projectIds: string[]; name?: string };
export type Criterion = { id: string; text: string; required: boolean };
export type SpecRevision = {
  id: string; specId: string; revision: number; title: string; goal: string; dod: Criterion[];
  constraints: string; assumptions: string; risks: string; inputs: string; comment: string;
  parentRevisionId?: string; createdAt: string; authorId: string; flow?: FlowDefinition;
};
export type Spec = {
  id: string; projectId: string; humanId: string; title: string; state: SpecState;
  activeRevisionId: string | null; revisionIds: string[];
  origin?: {kind:'lesson';lessonId:string;lessonRevisionId:string}|{kind:'agent_proposal';proposalId:string;proposalRevisionId:string}|MeridianSpecOrigin;
  acceptance?: { revisionId: string; evidence: Record<string, string>; actorId: string; at: string };
};
export type MeridianSpecOrigin = {
  kind:'meridian_import';contract:'meridian-work-scope-view';contractVersion:1;
  snapshotId:string;documentSha256:string;projectId:string;repositoryId:string;providerId:string;workspaceId:string;
  subjectRef:ManagedSubject;runRef:RunRef;taskSpecificationPin:Pin;contextManifestPin:Pin;
  criterionBindings:{criterionId:string;sourceCriterionId:string}[];
  transportVerification:'unverified_import';
};
export type Execution = {
  id: string; specId: string; specRevisionId: string; agentId: string; state: ExecutionState;
  kind: 'primary' | 'remediation'; remediatesBlockerId?: string; retryOfExecutionId?: string;
  resumeAuthorized?: boolean; stopRequested?: boolean; resultEvidence?: string;
  stopConfirmation?: 'unknown' | 'operator_attested';
  operatorCancellation?: {actorId:string;at:string;reason:string;evidence:string;revokedAgentId:string;revokedAt:string};
  stopAttestation?: {actorId:string;at:string;evidence:string};
};
export type DecisionOption = { id: string; title: string; description: string };
export type DecisionOutcome = { kind: 'answer'; answer: string } | { kind: 'approve'; chosenOptionId: string } | { kind: 'reject'; reason: string };
export type Decision = { id: string; actorId: string; at: string; outcome: DecisionOutcome; appliedAt?: string; comment?: string };
export type DecisionRequest = {
  id: string; kind: RequestKind; title: string; context: string; reason: string;
  options: DecisionOption[]; recommendationOptionId?: string; question?: string;
  expected?: string; actual?: string; impact?: string; noPathReason?: string;
  state: RequestState; specId: string; specRevisionId: string; executionId: string;
  agentId: string; blockingScope: 'execution' | 'none'; decision?: Decision;
  clearedEvidence?: string; deferredUntil?: string; deferredReason?: string;
  flowNodeId?: string;
  rootRequestId?: string; supersedesDecisionId?: string; supersedesRequestId?:string; correctionReason?: string; withdrawalReason?: string;
  applicabilityEndedEvidence?:string; applicabilityEndedReason?:string;
  applicabilityEndedForRevisionId?:string|null;
};
export type Dependency = { id: string; from: string; to: string; type: 'depends_on' | 'derived_from' | 'replaces' | 'relates_to' };
export type Roadmap = { id: string; title: string; goal: string; state: 'draft' | 'active' | 'frozen' | 'archived' };
export type GitHubBinding = {
  id:string; projectId:string; executionId:string; specId:string; specRevisionId:string;
  repositoryId:number; repositoryFullName:string; ref:string; createdAt:string; createdBy:string;
  revokedAt?:string; revokedBy?:string;
};
export type GitHubVerifiedCommit = {
  repositoryId:number; repositoryFullName:string; fullSha:string; url:string; title:string;
  verifiedAt:string; verificationMethod:'github-api-sha';
};
export type GitHubCommitSource = Omit<GitHubVerifiedCommit,'title'> & {
  kind:'github_commit'; bindingId:string; ref:string; deliveryId:string; payloadDigest:string;
};
export type LessonContent = {title:string;context:string;conclusion:string;applicability:string;evidence:string;tags:string[];sourceEventIds:string[]};
export type LessonRevision = LessonContent & {id:string;lessonId:string;revision:number;parentRevisionId?:string;createdBy:string;createdAt:string};
export type Lesson = {id:string;projectId:string;latestRevisionId:string;publishedRevisionId?:string};
export type DomainEvent = {
  id: string; type: string; schemaVersion: 1; version: number; projectId: string; occurredAt: string; actor: Actor;
  correlationId: string; causationId?: string;
  requestId?: string; specId?: string; specRevisionId?: string; executionId?: string;
  payload: Record<string, unknown>;
};
export type ProposalFinding={text:string;sourceEventIds:string[]};
export type AgentProposalContent={title:string;findings:ProposalFinding[];interpretation:string;limitations:string}&(
  |{kind:'reality_summary'}|{kind:'spec_proposal';draft:RevisionContent}
);
export type AgentProposal={
  id:string;projectId:string;executionId:string;specId:string;specRevisionId:string;agentId:string;latestRevisionId:string;
  state:'pending'|'reviewed'|'dismissed'|'adopted';
  review?:{revisionId:string;actorId:string;at:string;comment:string;draftSpecId?:string;draftSpecRevisionId?:string};
};
export type AgentProposalRevision={
  id:string;proposalId:string;revision:number;parentRevisionId?:string;sourceCursor:number;sourceEventIds:string[];
  content:AgentProposalContent;submittedBy:string;createdAt:string;
};
export type ProjectState = {
  projectId: string; version: number; roadmap: Roadmap; specs: Spec[]; revisions: SpecRevision[];
  executions: Execution[]; requests: DecisionRequest[]; dependencies: Dependency[]; events: DomainEvent[];
  githubBindings: GitHubBinding[]; lessons:Lesson[]; lessonRevisions:LessonRevision[];
  agentProposals:AgentProposal[];agentProposalRevisions:AgentProposalRevision[];
};
export type RevisionContent = Pick<SpecRevision, 'title' | 'goal' | 'dod' | 'constraints' | 'assumptions' | 'risks' | 'inputs' | 'comment' | 'flow'>;
type CommandBase = { requestId: string; expectedVersion: number; specId?: string; specRevisionId?: string };
type ReportBase = { specId: string; specRevisionId: string; executionId: string; title: string; context: string; flowNodeId?: string };
export type Command = CommandBase & (
  | { type: 'createSpec'; content: RevisionContent }
  | { type:'importMeridianScope';rawDocument:string;content:RevisionContent }
  | { type:'createLesson'; content:LessonContent }
  | { type:'reviseLesson'; lessonId:string; content:LessonContent }
  | { type:'publishLesson'; lessonId:string; revisionId:string }
  | { type:'createSpecFromLesson'; lessonId:string; lessonRevisionId:string; content:RevisionContent; sourceSpecId?:string }
  | { type: 'proposeRevision'; specId: string; content: RevisionContent }
  | { type: 'activateRevision'; specId: string; revisionId: string }
  | { type: 'startExecution'; specId: string; specRevisionId: string; agentId: string; retryOfExecutionId?: string }
  | ({ type: 'reportAction'; actionId: string; phase: 'started' | 'completed' | 'failed'; evidence?: string } & ReportBase)
  | ({ type: 'reportQuestion'; question: string; blockingScope: 'execution' | 'none' } & ReportBase)
  | ({ type: 'reportFork'; reason: string; options: DecisionOption[]; recommendationOptionId?: string } & ReportBase)
  | ({ type: 'reportBlocker'; reason: string; expected: string; actual: string; impact: string; options: DecisionOption[]; noPathReason?: string } & ReportBase)
  | { type: 'resolveDecision'; decisionRequestId: string; specRevisionId: string; outcome: DecisionOutcome; comment?: string }
  | { type: 'deferDecision'; decisionRequestId: string; reason: string; until: string }
  | { type: 'withdrawDecision'; decisionRequestId:string; reason:string }
  | { type: 'requestDecisionClarification'; decisionRequestId:string; question:string }
  | { type: 'submitDecisionClarification'; decisionRequestId:string; clarificationEventId:string; response:string }
  | { type: 'correctDecision'; decisionRequestId:string; reason:string }
  | { type:'reopenBlockerPlan'; decisionRequestId:string; reason:string }
  | { type:'retireHistoricalBlocker'; decisionRequestId:string; reason:string; evidence:string }
  | { type: 'resumeExecution'; executionId: string }
  | { type: 'confirmResumed'; executionId: string; ackPhase?: 'start' | 'resume' }
  | { type: 'confirmDecisionApplied'; decisionRequestId: string; evidence: string }
  | { type: 'authorizeRemediation'; decisionRequestId: string; agentId: string }
  | { type: 'clearBlocker'; decisionRequestId: string; remediationExecutionId: string; evidence: string }
  | { type: 'completeExecution'; executionId: string; result: 'succeeded' | 'failed'; evidence: string }
  | { type: 'cancelExecution'; executionId: string; reason: string }
  | { type: 'skipExecution'; executionId: string; reason: string }
  | { type: 'requestStop'; executionId: string; reason: string }
  | { type: 'confirmStopped'; executionId: string }
  | { type: 'forceCancelRevokedExecution'; executionId:string; reason:string; evidence:string }
  | { type: 'attestExternalStop'; executionId:string; evidence:string }
  | { type: 'acceptSpec'; specId: string; specRevisionId: string; evidence: Record<string, string> }
  | { type: 'invalidateSpec'; specId: string; reason: string }
  | { type: 'addDependency'; from: string; to: string; relationship?: Dependency['type'] }
  | { type: 'changeRoadmapState'; state: Roadmap['state'] }
  | { type:'createGitHubBinding'; executionId:string; repositoryId:number; repositoryFullName:string; ref:string }
  | { type:'revokeGitHubBinding'; bindingId:string }
  | { type:'recordGitHubCommit'; bindingId:string; deliveryId:string; payloadDigest:string; commit:GitHubVerifiedCommit }
  |{type:'submitAgentProposal';executionId:string;sourceCursor:number;content:AgentProposalContent;proposalId?:string;baseProposalRevisionId?:string}
  |{type:'reviewAgentProposal';proposalId:string;proposalRevisionId:string;outcome:'reviewed'|'dismissed';comment:string}
  |{type:'adoptAgentSpecProposal';proposalId:string;proposalRevisionId:string;content:RevisionContent;comment:string;sourceSpecId?:string}
);
