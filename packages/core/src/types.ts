export type SpecState = 'idea' | 'specified' | 'in_progress' | 'blocked' | 'done' | 'invalidated';
export type ExecutionState = 'queued' | 'running' | 'waiting_for_human' | 'paused' | 'succeeded' | 'failed' | 'cancelled' | 'skipped';
export type RequestState = 'pending' | 'resolved' | 'withdrawn' | 'superseded';
export type RequestKind = 'Question' | 'Fork' | 'Blocker';
export type Actor = { id: string; kind: 'human' | 'agent' | 'service'; projectIds: string[]; name?: string };
export type Criterion = { id: string; text: string; required: boolean };
export type FlowNodeKind = 'action' | 'condition' | 'question' | 'fork' | 'blocker' | 'wait' | 'result';
export type FlowOwner = 'human' | 'agent' | 'system';
export type FlowNode = { id:string; kind:FlowNodeKind; title:string; description:string; owner:FlowOwner };
export type FlowEdge = { id:string; source:string; target:string; label:string; optionId?:string };
export type FlowDefinition = { entryNodeId:string; nodes:FlowNode[]; edges:FlowEdge[] };
export type SpecRevision = {
  id: string; specId: string; revision: number; title: string; goal: string; dod: Criterion[];
  constraints: string; assumptions: string; risks: string; inputs: string; comment: string;
  parentRevisionId?: string; createdAt: string; authorId: string; flow?: FlowDefinition;
};
export type Spec = {
  id: string; projectId: string; humanId: string; title: string; state: SpecState;
  activeRevisionId: string | null; revisionIds: string[];
  acceptance?: { revisionId: string; evidence: Record<string, string>; actorId: string; at: string };
};
export type Execution = {
  id: string; specId: string; specRevisionId: string; agentId: string; state: ExecutionState;
  kind: 'primary' | 'remediation'; remediatesBlockerId?: string; retryOfExecutionId?: string;
  resumeAuthorized?: boolean; stopRequested?: boolean; resultEvidence?: string;
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
export type DomainEvent = {
  id: string; type: string; schemaVersion: 1; version: number; projectId: string; occurredAt: string; actor: Actor;
  correlationId: string; causationId?: string;
  requestId?: string; specId?: string; specRevisionId?: string; executionId?: string;
  payload: Record<string, unknown>;
};
export type ProjectState = {
  projectId: string; version: number; roadmap: Roadmap; specs: Spec[]; revisions: SpecRevision[];
  executions: Execution[]; requests: DecisionRequest[]; dependencies: Dependency[]; events: DomainEvent[];
  githubBindings: GitHubBinding[];
};
export type RevisionContent = Pick<SpecRevision, 'title' | 'goal' | 'dod' | 'constraints' | 'assumptions' | 'risks' | 'inputs' | 'comment' | 'flow'>;
type CommandBase = { requestId: string; expectedVersion: number; specId?: string; specRevisionId?: string };
type ReportBase = { specId: string; specRevisionId: string; executionId: string; title: string; context: string; flowNodeId?: string };
export type Command = CommandBase & (
  | { type: 'createSpec'; content: RevisionContent }
  | { type: 'proposeRevision'; specId: string; content: RevisionContent }
  | { type: 'activateRevision'; specId: string; revisionId: string }
  | { type: 'startExecution'; specId: string; specRevisionId: string; agentId: string; retryOfExecutionId?: string }
  | ({ type: 'reportAction'; actionId: string; phase: 'started' | 'completed' | 'failed'; evidence?: string } & ReportBase)
  | ({ type: 'reportQuestion'; question: string; blockingScope: 'execution' | 'none' } & ReportBase)
  | ({ type: 'reportFork'; reason: string; options: DecisionOption[]; recommendationOptionId?: string } & ReportBase)
  | ({ type: 'reportBlocker'; reason: string; expected: string; actual: string; impact: string; options: DecisionOption[]; noPathReason?: string } & ReportBase)
  | { type: 'resolveDecision'; decisionRequestId: string; specRevisionId: string; outcome: DecisionOutcome; comment?: string }
  | { type: 'deferDecision'; decisionRequestId: string; reason: string; until: string }
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
  | { type: 'acceptSpec'; specId: string; specRevisionId: string; evidence: Record<string, string> }
  | { type: 'invalidateSpec'; specId: string; reason: string }
  | { type: 'addDependency'; from: string; to: string; relationship?: Dependency['type'] }
  | { type: 'changeRoadmapState'; state: Roadmap['state'] }
  | { type:'createGitHubBinding'; executionId:string; repositoryId:number; repositoryFullName:string; ref:string }
  | { type:'revokeGitHubBinding'; bindingId:string }
  | { type:'recordGitHubCommit'; bindingId:string; deliveryId:string; payloadDigest:string; commit:GitHubVerifiedCommit }
);
