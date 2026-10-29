import {z} from 'zod';
import {isWellFormedUnicode} from './unicode.js';

/** JSON Schema describes these structural constraints. Additional graph rules
 * and the legacy UTF-16-unit text bounds are enforced by the portable validator.
 * Parsing never trims or repairs source text.
 */
const text=(maximum:number,minimum=1)=>z.string().min(minimum).max(maximum)
 .refine(value=>value.trim().length>=minimum,'Требуется непустой текст.')
 .refine(value=>isWellFormedUnicode(value)&&!value.includes('\u0000'),'Текст содержит недопустимый Unicode или NUL.');
const id=text(200);

export const flowNodeKindSchema=z.enum(['action','condition','question','fork','blocker','wait','result']);
export const flowOwnerSchema=z.enum(['human','agent','system']);
export const flowNodeSchema=z.strictObject({
 id,
 kind:flowNodeKindSchema,
 title:text(20000),
 description:text(20000,0),
 owner:flowOwnerSchema.describe('Question and fork nodes require human ownership; choosing a path never grants execution permission.'),
});
export const flowEdgeSchema=z.strictObject({
 id,source:id,target:id,label:text(20000,0),optionId:id.optional(),
});

export const flowShapeSchema=z.strictObject({
 entryNodeId:id,
 nodes:z.array(flowNodeSchema).min(1).max(100),
 edges:z.array(flowEdgeSchema).max(200),
});

export type FlowNodeKind=z.infer<typeof flowNodeKindSchema>;
export type FlowOwner=z.infer<typeof flowOwnerSchema>;
export type FlowNode=z.infer<typeof flowNodeSchema>;
export type FlowEdge=z.infer<typeof flowEdgeSchema>;
export type FlowDefinition=z.infer<typeof flowShapeSchema>;

