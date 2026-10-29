import {z} from 'zod';
import {proposalRevisionContentSchema,agentProposalContentSchema,submitProposalInputSchema} from '@ouro/protocol';
export {proposalRevisionContentSchema,agentProposalContentSchema,submitProposalInputSchema} from '@ouro/protocol';
import type {AgentProposalContent,DomainEvent,Execution,ProjectState,SpecRevision} from './types';

const validDatabaseText=(value:string)=>value.isWellFormed()&&!value.includes('\u0000');
const text=(maximum:number,empty=false)=>z.string().max(maximum).refine(value=>empty||value.trim().length>0,'Требуется непустой текст.').refine(validDatabaseText,'Текст содержит недопустимый Unicode или NUL.');
const id=text(200),version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const requestId=text(200).min(8);
export const submitProposalCommandSchema=submitProposalInputSchema.safeExtend({type:z.literal('submitAgentProposal'),specId:id.optional(),specRevisionId:id.optional()});
export const reviewProposalCommandSchema=z.strictObject({type:z.literal('reviewAgentProposal'),requestId,expectedVersion:version,proposalId:id,proposalRevisionId:id,outcome:z.enum(['reviewed','dismissed']),comment:text(20000)});
export const adoptProposalCommandSchema=z.strictObject({type:z.literal('adoptAgentSpecProposal'),requestId,expectedVersion:version,proposalId:id,proposalRevisionId:id,content:proposalRevisionContentSchema,comment:text(20000),sourceSpecId:id.optional()});

/** This allowlist is narrower than aggregate agent get_updates visibility. */
const observationTypes=new Set([
 'ActionReported','DecisionRequested','DecisionResolved','DecisionDeferred','DecisionApplied','DecisionWithdrawn','DecisionClarificationRequested','DecisionClarificationSubmitted','DecisionSuperseded',
 'BlockerCleared','BlockerApplicabilityEnded','ExecutionStarted','ExecutionResumed','ExecutionPaused','ExecutionCompleted','ExecutionCancelled','ExecutionSkipped','StopRequested','ResumeAuthorized','ExecutionOperatorCancelled','ExternalStopAttested',
 'FlowStepStarted','FlowStepCompleted','FlowStepFailed','FlowStepSkipped','FlowStepRetried','FlowEdgeTraversed',
]);
export function isExecutionProposalSource(event:DomainEvent,execution:Execution,projectId:string):boolean {
 if(event.projectId!==projectId||event.actor.kind==='agent'&&event.actor.id!==execution.agentId)return false;
 if(event.executionId){
  if(event.executionId!==execution.id||event.specId!==execution.specId||event.specRevisionId!==execution.specRevisionId)return false;
  if(event.actor.kind==='service'&&!(event.actor.id==='ouro-github-webhook'&&event.type==='ActionReported'&&(event.payload.source as {kind?:string}|undefined)?.kind==='github_commit'))return false;
  return observationTypes.has(event.type)||event.type==='ExecutionCreated';
 }
 if(event.actor.kind!=='human')return false;
 if(event.type==='RoadmapStateChanged')return true;
 if(event.specId!==execution.specId)return false;
 if(event.type==='SpecCreated')return (event.payload.revision as SpecRevision|undefined)?.id===execution.specRevisionId;
 return (event.type==='RevisionProposed'||event.type==='RevisionActivated'||event.type==='SpecInvalidated')&&event.specRevisionId===execution.specRevisionId;
}
export function hasRealityProposalSource(events:readonly DomainEvent[]):boolean{return events.some(event=>!!event.executionId&&observationTypes.has(event.type));}
export function deriveProposalSources(state:ProjectState,execution:Execution,sourceCursor:number,content:AgentProposalContent):string[]|null {
 const assigned=state.events.find(event=>event.type==='ExecutionCreated'&&event.executionId===execution.id);
 if(!Number.isSafeInteger(sourceCursor)||!assigned||sourceCursor<assigned.version||sourceCursor>state.version)return null;
 const ids=[...new Set(content.findings.flatMap(finding=>finding.sourceEventIds))];if(ids.length<1||ids.length>50)return null;
 const found=ids.map(id=>state.events.find(event=>event.id===id));
 if(found.some(event=>!event||event.version>sourceCursor||!isExecutionProposalSource(event,execution,state.projectId)))return null;
 const events=found as DomainEvent[];if(!hasRealityProposalSource(events))return null;
 return events.sort((a,b)=>a.version-b.version).map(event=>event.id);
}
