import {z} from 'zod';
import {PROTOCOL_VERSION} from './version.js';
import {flowDefinitionSchema} from './flow.js';
import {flowRuntimeSchema,flowStepRunSchema,flowTraversalSchema,flowRuntimeViewSchema,enforcedFlowDefinitionSchema} from './flow-runtime.js';
import {agentProposalContentSchema,proposalRevisionContentSchema} from './inputs.js';
import {AGENT_TOOLS} from './tools.js';
import {agentErrorSchema,getToolOutputSchema} from './outputs.js';
import {workspaceMetadataSchema,workspaceFileEntrySchema,workspaceFileListSchema,workspaceFileSchema} from './workspace.js';
import {VERIFICATION_CAPABILITIES,SUPPORTED_CLIENT_VERSIONS} from './capabilities.js';
import {verificationContractSchema,verificationRunSchema,verificationSliceSchema,verificationImportSchema,verificationCommandSchema,verificationReviewSchema,verificationPhaseRecordSchema,verificationSliceRecordSchema,verificationReadinessSchema} from './verification.js';
import {verificationCycleSchema,verificationRefactorAdmissionSchema,verificationObservationConfigRecordSchema,verificationObservationRecordSchema,verificationArtifactManifestSchema,verificationQualitySchema,manualVerificationInputSchema,verificationObserveInputSchema,verificationRunnerInputSchema} from './verification.js';

export {PROTOCOL_VERSION} from './version.js';
export const JSON_SCHEMA_DIALECT='https://json-schema.org/draft/2020-12/schema' as const;
const definitions=[
 {name:'verification-observe-input',file:'verification-observe-input.schema.json',schema:verificationObserveInputSchema},
 {name:'verification-runner-input',file:'verification-runner-input.schema.json',schema:verificationRunnerInputSchema},
 {name:'verification-cycle',file:'verification-cycle.schema.json',schema:verificationCycleSchema},
 {name:'verification-refactor-admission',file:'verification-refactor-admission.schema.json',schema:verificationRefactorAdmissionSchema},
 {name:'verification-observation-config',file:'verification-observation-config.schema.json',schema:verificationObservationConfigRecordSchema},
 {name:'verification-observation',file:'verification-observation.schema.json',schema:verificationObservationRecordSchema},
 {name:'verification-artifact-manifest',file:'verification-artifact-manifest.schema.json',schema:verificationArtifactManifestSchema},
 {name:'verification-quality',file:'verification-quality.schema.json',schema:verificationQualitySchema},
 {name:'verification-manual-input',file:'verification-manual-input.schema.json',schema:manualVerificationInputSchema},
 {name:'verification-contract',file:'verification-contract.schema.json',schema:verificationContractSchema},
 {name:'verification-run',file:'verification-run.schema.json',schema:verificationRunSchema},
 {name:'verification-slice',file:'verification-slice.schema.json',schema:verificationSliceSchema},
 {name:'verification-import',file:'verification-import.schema.json',schema:verificationImportSchema},
 {name:'verification-command',file:'verification-command.schema.json',schema:verificationCommandSchema},
 {name:'verification-review',file:'verification-review.schema.json',schema:verificationReviewSchema},
 {name:'verification-phase-record',file:'verification-phase-record.schema.json',schema:verificationPhaseRecordSchema},
 {name:'verification-slice-record',file:'verification-slice-record.schema.json',schema:verificationSliceRecordSchema},
 {name:'verification-readiness',file:'verification-readiness.schema.json',schema:verificationReadinessSchema},
 {name:'flow',file:'flow.schema.json',schema:flowDefinitionSchema},
 {name:'enforced-flow',file:'enforced-flow.schema.json',schema:enforcedFlowDefinitionSchema},
 {name:'flow-runtime',file:'flow-runtime.schema.json',schema:flowRuntimeSchema},
 {name:'flow-step-run',file:'flow-step-run.schema.json',schema:flowStepRunSchema},
 {name:'flow-traversal',file:'flow-traversal.schema.json',schema:flowTraversalSchema},
 {name:'flow-runtime-view',file:'flow-runtime-view.schema.json',schema:flowRuntimeViewSchema},
 {name:'workspace',file:'workspace.schema.json',schema:workspaceMetadataSchema},
 {name:'workspace-file-entry',file:'workspace-file-entry.schema.json',schema:workspaceFileEntrySchema},
 {name:'workspace-file-list',file:'workspace-file-list.schema.json',schema:workspaceFileListSchema},
 {name:'workspace-file',file:'workspace-file.schema.json',schema:workspaceFileSchema},
 {name:'error',file:'error.schema.json',schema:agentErrorSchema},
 {name:'proposal-content',file:'proposal-content.schema.json',schema:agentProposalContentSchema},
 {name:'revision-content',file:'revision-content.schema.json',schema:proposalRevisionContentSchema},
 ...AGENT_TOOLS.flatMap(tool=>[
  {name:`input:${tool.name}`,file:`input-${tool.name}.schema.json`,schema:tool.inputSchema},
  {name:`output:${tool.name}`,file:`output-${tool.name}.schema.json`,schema:getToolOutputSchema(tool.name)},
 ]),
];
const schemaId=(name:string)=>`urn:ouro:protocol:${PROTOCOL_VERSION}:${name}`;
export const protocolManifest={
 name:'ouro-domain-contract',version:PROTOCOL_VERSION,dialect:JSON_SCHEMA_DIALECT,
 resources:{manifest:'ouro://protocol/manifest',schemas:'ouro://protocol/schemas'},
 features:{flowRuntime:{mode:'opt-in',tracking:'enforced',runtimeVersion:1,tool:'ouro.report_flow_step',runBinding:'flowStepRunId',maxRuns:1000,legacyExecutions:'unchanged'},workspaceFiles:{readOnly:true,assignedExecutionRequired:true,maxEntries:200,maxFileBytes:131072,tools:['ouro.list_workspace_files','ouro.read_workspace_file']}},
 tools:AGENT_TOOLS.map(tool=>({name:tool.name,inputSchema:schemaId(`input:${tool.name}`),outputSchema:schemaId(`output:${tool.name}`)})),
 errorSchema:schemaId('error'),
 schemas:definitions.map(({name,file})=>({name,id:schemaId(name),file})),
 compatibility:{supportedVersions:[PROTOCOL_VERSION],legacyToolArguments:true,mcpWireDialect:'draft-07',outputExtensions:'additional JSON properties are preserved; Flow and inputs remain closed'},
 negotiation:{tool:'ouro.get_context',optional:true,clientVersions:SUPPORTED_CLIENT_VERSIONS,capabilities:VERIFICATION_CAPABILITIES,legacyContexts:'verification-free-visible-work-and-proposals-only',legacyVerificationCapabilities:[],unknownRequirements:'fail-closed'},
 verification:{version:1,optional:true,tool:'ouro.report_verification_run',adapter:'playwright-json/v1',provenance:['imported_report','human_attested','local_runner'],readiness:'latest-per-case-evidence-at-current-observed-or-declared-slice',cycles:true,manualProcedures:true,mutationQuality:'independent-axis',automaticObservation:'human-configured-bounded-files',localRunner:'human-authorized-fixed-playwright-process',acceptance:'human-only',legacyRevisions:'unchanged',eventReplay:'upgrade clients together; unknown events fail closed'},
 semantics:[
  'JSON Schema checks structure. Application validation additionally checks references, reachability, authority, lifecycle and idempotency.',
  'Flow limits use legacy UTF-16 code units; JSON Schema maxLength counts Unicode code points. The portable semantic validator preserves the stricter legacy acceptance.',
  'Node/edge IDs are unique; all nodes are reachable from entry and can reach a result. Retry cycles with an exit are allowed.',
  'Question and fork nodes belong to the human. A plan, a decision and actual application are distinct facts.',
  'Event envelopes are typed; event payload and error details remain JSON extension data, not a complete typed event catalog.',
  'Enforced Flow tracking is human opt-in on new executions. Run IDs distinguish repeated node visits; reports alone never advance a runtime or grant human approval.',
  'A failed response after commit is an unknown outcome: preserve requestId and the exact body until the receipt is recovered.',
  'Project routes and credentials pin workspace scope. File reads are bounded current observations from the assigned folder binding; they never write files or execute code.',
 ],
};

export function createSchemaBundle(){
 return {
  format:'ouro-protocol-bundle' as const,
  manifest:structuredClone(protocolManifest),
  schemas:definitions.map(({name,schema})=>({...z.toJSONSchema(schema,{target:'draft-2020-12',io:'input'}),$schema:JSON_SCHEMA_DIALECT,$id:schemaId(name)})),
 };
}

export function assertProtocolVersion(version:string):void{
 if(version!==PROTOCOL_VERSION)throw Object.assign(new Error(`Unsupported Ouro contract version: ${version}`),{code:'UNSUPPORTED_CONTRACT_VERSION'});
}
