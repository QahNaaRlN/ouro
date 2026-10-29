import {z} from 'zod';
import {flowDefinitionSchema,validateFlowDefinition,type FlowDefinition} from './flow.js';

const id=z.string().min(1).max(200),time=z.string().min(1);
const extensible=<Shape extends z.ZodRawShape>(shape:Shape)=>z.object(shape).catchall(z.json());

/** Pure opt-in profile rules. Runtime authority/lifecycle checks stay in Ouro. */
export function validateEnforcedFlowDefinition(value:unknown):asserts value is FlowDefinition{
 validateFlowDefinition(value);
 const invalid=(message:string):never=>{throw Object.assign(new Error(message),{code:'VALIDATION_ERROR'});};
 for(const node of value.nodes){
  const exits=value.edges.filter(edge=>edge.source===node.id);
  if(['action','wait','question','blocker'].includes(node.kind)&&exits.length!==1)invalid(`Строгий Flow: узел «${node.title}» должен иметь ровно один исходящий переход.`);
  if(node.kind==='fork'){
   if(exits.length>10)invalid('Строгий Flow: развилка поддерживает не более 10 вариантов.');
   if(exits.some(edge=>!edge.optionId)||new Set(exits.map(edge=>edge.optionId)).size!==exits.length)invalid('Строгий Flow: каждый выход развилки требует отдельный optionId.');
  }
  if(node.kind==='blocker'&&node.owner!=='agent')invalid('Строгий Flow: блокер сообщает назначенный агент.');
 }
}
export const enforcedFlowDefinitionSchema=flowDefinitionSchema.superRefine((value,context)=>{
 try{validateEnforcedFlowDefinition(value);}
 catch(error){context.addIssue({code:'custom',message:error instanceof Error?error.message:'Некорректный строгий Flow.'});}
}).describe('Opt-in sequential Flow profile. Additional semantic rules require exactly one outgoing action/wait/question/blocker edge, agent-owned blockers and distinct Fork option IDs (at most ten).');

export const flowStepRunStateSchema=z.enum(['ready','running','waiting','succeeded','failed','skipped','cancelled']);
export const flowRuntimeStateSchema=z.enum(['active','completed','failed','cancelled']);
const runShape=z.object({
 id,nodeId:id,visit:z.number().int().min(1).max(1000),state:flowStepRunStateSchema,createdAt:time,
 startedAt:time.optional(),finishedAt:time.optional(),evidence:z.string().optional(),reason:z.string().optional(),retryOfRunId:id.optional(),
});
const traversalShape=z.object({id,edgeId:id,fromRunId:id,toRunId:id,at:time});
const runtimeShape=z.object({
 version:z.literal(1),state:flowRuntimeStateSchema,currentRunId:id.nullable(),
 runs:z.array(runShape).min(1).max(1000),traversals:z.array(traversalShape).max(1000),
});
const actionShape=z.object({allowed:z.boolean(),reason:z.string()});
const edgeShape=z.object({
 id,state:z.enum(['possible','available','blocked','taken','not_selected']),reason:z.string(),
});
const agentActionsShape=z.object({start:actionShape,complete:actionShape,fail:actionShape});
const humanActionsShape=agentActionsShape.extend({retry:actionShape,skip:actionShape});
const viewShape=z.object({
 mode:z.enum(['legacy','enforced']),run:runShape.nullable(),agentActions:agentActionsShape,humanActions:humanActionsShape,edges:z.array(edgeShape),
});

// Wire readers permit additional JSON fields. Core/public DTOs below describe
// the known projection fields without imposing JSON index signatures on state.
export const flowStepRunSchema=runShape.catchall(z.json());
export const flowTraversalSchema=traversalShape.catchall(z.json());
export const flowRuntimeSchema=runtimeShape.extend({
 runs:z.array(flowStepRunSchema).min(1).max(1000),traversals:z.array(flowTraversalSchema).max(1000),
}).catchall(z.json());
export const flowRuntimeActionSchema=actionShape.catchall(z.json());
export const flowRuntimeEdgeSchema=edgeShape.catchall(z.json());
export const flowRuntimeViewSchema=viewShape.extend({
 run:flowStepRunSchema.nullable(),
 agentActions:extensible({start:flowRuntimeActionSchema,complete:flowRuntimeActionSchema,fail:flowRuntimeActionSchema}),
 humanActions:extensible({start:flowRuntimeActionSchema,complete:flowRuntimeActionSchema,fail:flowRuntimeActionSchema,retry:flowRuntimeActionSchema,skip:flowRuntimeActionSchema}),
 edges:z.array(flowRuntimeEdgeSchema),
}).catchall(z.json());

export type FlowStepRunState=z.infer<typeof flowStepRunStateSchema>;
export type FlowRuntimeState=z.infer<typeof flowRuntimeStateSchema>;
export type FlowStepRun=z.infer<typeof runShape>;
export type FlowTraversal=z.infer<typeof traversalShape>;
export type FlowRuntime=z.infer<typeof runtimeShape>;
export type FlowRuntimeView=z.infer<typeof viewShape>;
