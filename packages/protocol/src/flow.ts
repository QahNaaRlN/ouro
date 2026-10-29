import {flowShapeSchema} from './flow-structure.js';
import {validateFlowDefinition} from './flow-semantics.js';
export {flowNodeKindSchema,flowOwnerSchema,flowNodeSchema,flowEdgeSchema} from './flow-structure.js';
export type {FlowDefinition,FlowNode,FlowEdge,FlowNodeKind,FlowOwner} from './flow-structure.js';

/** Concrete JSON shape plus semantic graph checks. JSON Schema exposes the
 * shape; the portable validator is authoritative for reference/graph and legacy
 * UTF-16 text rules. Use validateFlowDefinition on raw JS values when prototype
 * checks matter, as ZodObject normalizes records during parsing.
 */
export const flowDefinitionSchema=flowShapeSchema.superRefine((value,context)=>{
 try{validateFlowDefinition(value);}
 catch(error){context.addIssue({code:'custom',message:error instanceof Error?error.message:'Некорректная схема процесса.'});}
});
export {validateFlowDefinition};
