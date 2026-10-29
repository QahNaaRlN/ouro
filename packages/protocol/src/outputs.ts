import {z} from 'zod';
import {flowDefinitionSchema} from './flow.js';
import {flowRuntimeSchema,flowRuntimeViewSchema} from './flow-runtime.js';

/** Explicit JSON extension data; it never accepts functions, undefined or NaN. */
export const jsonValueSchema=z.json();
export const jsonObjectSchema=z.record(z.string(),jsonValueSchema);
const extensible=<Shape extends z.ZodRawShape>(shape:Shape)=>z.object(shape).catchall(jsonValueSchema);
const id=z.string().min(1);
const version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const revisionNumber=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const specState=z.enum(['idea','specified','in_progress','blocked','done','invalidated']);
const executionState=z.enum(['queued','running','waiting_for_human','paused','succeeded','failed','cancelled','skipped']);

export const actorOutputSchema=extensible({
 id,kind:z.enum(['human','agent','service']),projectIds:z.array(id),name:z.string().optional(),
});

export const criterionOutputSchema=extensible({id,text:z.string(),required:z.boolean()});
export const revisionContentOutputSchema=extensible({
 title:z.string(),goal:z.string(),dod:z.array(criterionOutputSchema),constraints:z.string(),assumptions:z.string(),
 risks:z.string(),inputs:z.string(),comment:z.string(),flow:flowDefinitionSchema.optional(),
});
export const revisionOutputSchema=revisionContentOutputSchema.safeExtend({
 id,specId:id,revision:revisionNumber,parentRevisionId:id.optional(),createdAt:z.string(),authorId:id,
});

export const executionOutputSchema=extensible({
 id,specId:id,specRevisionId:id,agentId:id,state:executionState,kind:z.enum(['primary','remediation']),
 remediatesBlockerId:id.optional(),retryOfExecutionId:id.optional(),resumeAuthorized:z.boolean().optional(),
 stopRequested:z.boolean().optional(),resultEvidence:z.string().optional(),
 stopConfirmation:z.enum(['unknown','operator_attested']).optional(),
 operatorCancellation:extensible({actorId:id,at:z.string(),reason:z.string(),evidence:z.string(),revokedAgentId:id,revokedAt:z.string()}).optional(),
 stopAttestation:extensible({actorId:id,at:z.string(),evidence:z.string()}).optional(),
 flowRuntime:flowRuntimeSchema.optional(),
});

export const decisionOutcomeOutputSchema=z.discriminatedUnion('kind',[
 extensible({kind:z.literal('answer'),answer:z.string()}),
 extensible({kind:z.literal('approve'),chosenOptionId:id}),
 extensible({kind:z.literal('reject'),reason:z.string()}),
]);
export const decisionOutputSchema=extensible({
 id,actorId:id,at:z.string(),outcome:decisionOutcomeOutputSchema,appliedAt:z.string().optional(),comment:z.string().optional(),
});
export const decisionOptionOutputSchema=extensible({id,title:z.string(),description:z.string()});
export const decisionRequestOutputSchema=extensible({
 id,kind:z.enum(['Question','Fork','Blocker']),title:z.string(),context:z.string(),reason:z.string(),
 options:z.array(decisionOptionOutputSchema),recommendationOptionId:id.optional(),question:z.string().optional(),
 expected:z.string().optional(),actual:z.string().optional(),impact:z.string().optional(),noPathReason:z.string().optional(),
 state:z.enum(['pending','resolved','withdrawn','superseded']),specId:id,specRevisionId:id,executionId:id,
 agentId:id,blockingScope:z.enum(['execution','none']),decision:decisionOutputSchema.optional(),
 clearedEvidence:z.string().optional(),deferredUntil:z.string().optional(),deferredReason:z.string().optional(),
 flowNodeId:id.optional(),rootRequestId:id.optional(),supersedesDecisionId:id.optional(),supersedesRequestId:id.optional(),
 flowStepRunId:id.optional(),
 flowInterrupt:z.boolean().optional(),
 correctionReason:z.string().optional(),withdrawalReason:z.string().optional(),
 applicabilityEndedEvidence:z.string().optional(),applicabilityEndedReason:z.string().optional(),
 applicabilityEndedForRevisionId:id.nullable().optional(),
});

/** The envelope is typed; event-specific payloads remain versioned JSON extensions. */
export const eventEnvelopeSchema=extensible({
 id,type:id,schemaVersion:z.literal(1),version:revisionNumber,projectId:id,occurredAt:z.string(),actor:actorOutputSchema,
 correlationId:id,causationId:id.optional(),requestId:id.optional(),specId:id.optional(),specRevisionId:id.optional(),
 executionId:id.optional(),payload:jsonObjectSchema,
});

export const proposalFindingOutputSchema=extensible({text:z.string(),sourceEventIds:z.array(id)});
const proposalFields={title:z.string(),findings:z.array(proposalFindingOutputSchema),interpretation:z.string(),limitations:z.string()};
export const proposalContentOutputSchema=z.discriminatedUnion('kind',[
 extensible({...proposalFields,kind:z.literal('reality_summary')}),
 extensible({...proposalFields,kind:z.literal('spec_proposal'),draft:revisionContentOutputSchema}),
]);
export const proposalOutputSchema=extensible({
 id,projectId:id,executionId:id,specId:id,specRevisionId:id,agentId:id,latestRevisionId:id,
 state:z.enum(['pending','reviewed','dismissed','adopted']),
 review:extensible({revisionId:id,actorId:id,at:z.string(),comment:z.string(),draftSpecId:id.optional(),draftSpecRevisionId:id.optional()}).optional(),
});
export const proposalRevisionOutputSchema=extensible({
 id,proposalId:id,revision:revisionNumber,parentRevisionId:id.optional(),sourceCursor:version,sourceEventIds:z.array(id),
 content:proposalContentOutputSchema,submittedBy:id,createdAt:z.string(),
});

export const clarificationOutputSchema=extensible({
 eventId:id,decisionRequestId:id,question:z.string(),actorId:id,at:z.string(),
 response:extensible({eventId:id,text:z.string(),actorId:id,at:z.string()}).optional(),
});
export const permissionsOutputSchema=extensible({
 canAcknowledgeStart:z.boolean(),canAcknowledgeResume:z.boolean(),canAcknowledgeStop:z.boolean(),
 canStartAction:z.boolean(),canCompleteSuccessfully:z.boolean(),stopRequested:z.boolean(),resumeAuthorized:z.boolean(),
 terminal:z.boolean(),canSubmitProposal:z.boolean(),
});
export const workItemOutputSchema=extensible({
 execution:executionOutputSchema,
 spec:extensible({id,humanId:id,title:z.string(),state:specState,activeRevisionId:id.nullable()}),
 revision:revisionOutputSchema,requests:z.array(decisionRequestOutputSchema),clarifications:z.array(clarificationOutputSchema),
 proposals:z.array(proposalOutputSchema),proposalRevisions:z.array(proposalRevisionOutputSchema),
 proposalSourceIds:z.array(extensible({id,version:revisionNumber,type:id})),permissions:permissionsOutputSchema,
 flowProgress:flowRuntimeViewSchema.optional(),
});

export const contextOutputSchema=extensible({
 ok:z.literal(true),project:extensible({id,title:z.string(),roadmapState:z.enum(['draft','active','frozen','archived'])}),
 agent:extensible({id,name:z.string().optional()}),version,cursor:version,work:z.array(workItemOutputSchema),instructions:z.array(z.string()),
});
export const updatesOutputSchema=extensible({ok:z.literal(true),events:z.array(eventEnvelopeSchema),cursor:version});
export const mutationOutputSchema=extensible({
 ok:z.literal(true),execution:executionOutputSchema,requests:z.array(decisionRequestOutputSchema),
 events:z.array(eventEnvelopeSchema),cursor:version,replayed:z.boolean(),
});
export const proposalMutationOutputSchema=mutationOutputSchema.safeExtend({
 proposals:z.array(proposalOutputSchema).min(1),proposalRevisions:z.array(proposalRevisionOutputSchema).min(1),
});

/** MCP isError replies are checked separately from each success outputSchema. */
export const agentErrorSchema=extensible({
 ok:z.literal(false),error:extensible({
  code:id,message:z.string(),details:jsonObjectSchema.optional(),retryable:z.literal(false),refreshRequired:z.boolean(),
 }),
});

const mutationTools=new Set([
 'ouro.report_action','ouro.report_question','ouro.report_fork','ouro.report_blocker','ouro.withdraw_decision',
 'ouro.submit_decision_clarification','ouro.confirm_started','ouro.confirm_resumed','ouro.confirm_stopped',
 'ouro.confirm_decision_applied','ouro.complete_execution','ouro.clear_blocker','ouro.report_flow_step',
]);

export type AgentSuccessSchema=typeof contextOutputSchema|typeof updatesOutputSchema|typeof mutationOutputSchema|typeof proposalMutationOutputSchema;

export function getToolSuccessSchema(name:string):AgentSuccessSchema{
 if(name==='ouro.get_context')return contextOutputSchema;
 if(name==='ouro.get_updates')return updatesOutputSchema;
 if(name==='ouro.submit_proposal')return proposalMutationOutputSchema;
 if(mutationTools.has(name))return mutationOutputSchema;
 throw new RangeError(`Unknown Ouro tool: ${name}`);
}

const wireSchemas=new Map<string,z.ZodObject>();

/**
 * Both result variants are published because MCP clients can validate structured
 * error content too. The root remains an object for SDK normalization, while
 * oneOf publishes the discriminator and required branch fields in JSON Schema.
 */
export function getToolOutputSchema(name:string):z.ZodObject{
 const cached=wireSchemas.get(name);if(cached)return cached;
 const success=getToolSuccessSchema(name);
 const shape=success.shape;
 const optionalShape:Record<string,z.ZodType>=Object.fromEntries(Object.entries(shape).map(([key,schema])=>[key,schema.optional()]));
 const required=Object.entries(shape).filter(([,schema])=>!schema.isOptional()).map(([key])=>key);
 const wire=z.object({...optionalShape,ok:z.boolean(),error:agentErrorSchema.shape.error.optional()})
  .catchall(jsonValueSchema)
  .superRefine((body,context)=>{
   const parsed=(body.ok?success:agentErrorSchema).safeParse(body);
   if(!parsed.success)for(const issue of parsed.error.issues)context.addIssue({code:'custom',path:issue.path,message:'Body does not match its Ouro result variant.'});
  })
  .meta({oneOf:[
   {properties:{ok:{const:true}},required},
   {properties:{ok:{const:false}},required:['ok','error']},
  ]});
 wireSchemas.set(name,wire);return wire;
}

export type ContextOutput=z.infer<typeof contextOutputSchema>;
export type UpdatesOutput=z.infer<typeof updatesOutputSchema>;
export type MutationOutput=z.infer<typeof mutationOutputSchema>;
export type ProposalMutationOutput=z.infer<typeof proposalMutationOutputSchema>;
export type AgentErrorBody=z.infer<typeof agentErrorSchema>;
export type AgentResultBody=ContextOutput|UpdatesOutput|MutationOutput|ProposalMutationOutput|AgentErrorBody;

function validateReservedField(schema:z.ZodType,key:string,value:unknown):void{
 const parsed=schema.safeParse(value);
 if(!parsed.success)throw new z.ZodError(parsed.error.issues.map(issue=>({...issue,path:[key,...issue.path]})));
}

/** Check raw JSON data before Zod can skip special keys or copy object values. */
function validateJsonData(value:unknown):void{
 const active=new Set<object>();
 const reject=(path:Array<string|number>,message:string):never=>{throw new z.ZodError([{code:'custom',path,message}]);};
 const visit=(item:unknown,path:Array<string|number>):void=>{
  if(item===null||typeof item==='string'||typeof item==='boolean')return;
  if(typeof item==='number'){if(Number.isFinite(item))return;reject(path,'JSON numbers must be finite.');}
  if(typeof item!=='object')reject(path,'Expected JSON data without undefined, functions, symbols or bigint.');
  const object=item as object;
  if(active.has(object))reject(path,'Cyclic values are not JSON data.');
  let prototype:object|null,descriptors:PropertyDescriptorMap;
  try{prototype=Object.getPrototypeOf(object);descriptors=Object.getOwnPropertyDescriptors(object);}
  catch{return reject(path,'Expected readable plain JSON data.');}
  const array=Array.isArray(object);
  if(prototype!==null&&prototype!==(array?Array.prototype:Object.prototype))reject(path,'Expected a plain JSON object or array.');
  active.add(object);
  try{
   if(array){
    for(let index=0;index<object.length;index++){
     const key=String(index);
     if(!Object.hasOwn(descriptors,key))reject([...path,index],'Sparse arrays are not JSON data.');
     const descriptor=descriptors[key];
     if(!Object.hasOwn(descriptor,'value'))reject([...path,index],'JSON data must not contain accessor properties.');
     visit(descriptor.value,[...path,index]);
    }
   }
   for(const key of Reflect.ownKeys(descriptors)){
    const descriptor=Reflect.get(descriptors,key) as PropertyDescriptor;
    if(key==='toJSON'&&(!Object.hasOwn(descriptor,'value')||typeof descriptor.value==='function'))reject([...path,'toJSON'],'JSON data must not define serialization behavior.');
    if(!descriptor.enumerable)continue;
    if(typeof key==='symbol')return reject(path,'JSON property names must be strings.');
    if(array){
     const index=Number(key);
     if(Number.isInteger(index)&&index>=0&&index<object.length&&String(index)===key)continue;
     reject([...path,key],'JSON arrays must not contain additional enumerable properties.');
    }
    if(!Object.hasOwn(descriptor,'value'))reject([...path,key],'JSON data must not contain accessor properties.');
    visit(descriptor.value,[...path,key]);
   }
  }finally{active.delete(object);}
 };
 visit(value,[]);
}

/**
 * No transforms or stripping: additive JSON extensions survive validation.
 * Known wire field names retain their declared types across both variants.
 */
export function validateToolBody(name:string,body:unknown,isError=false):AgentResultBody{
 validateJsonData(body);
 if(!isError){
  const parsed=getToolSuccessSchema(name).parse(body);
  if(Object.hasOwn(parsed,'error'))validateReservedField(agentErrorSchema.shape.error,'error',parsed.error);
  return body as AgentResultBody;
 }
 const parsed=agentErrorSchema.parse(body);
 let success:AgentSuccessSchema;
 try{success=getToolSuccessSchema(name);}catch(error){if(error instanceof RangeError)return body as AgentResultBody;throw error;}
 for(const [key,schema] of Object.entries(success.shape)){
  if(key!=='ok'&&Object.hasOwn(parsed,key))validateReservedField(schema,key,parsed[key]);
 }
 return body as AgentResultBody;
}
