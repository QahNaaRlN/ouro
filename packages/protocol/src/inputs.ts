import {z} from 'zod';
import {flowDefinitionSchema} from './flow.js';
import {isWellFormedUnicode} from './unicode.js';
const validDatabaseText=(value:string)=>isWellFormedUnicode(value)&&!value.includes('\u0000');
const text=(maximum:number,empty=false)=>z.string().max(maximum).refine(value=>empty||value.trim().length>0,'Требуется непустой текст.').refine(validDatabaseText,'Текст содержит недопустимый Unicode или NUL.');
const id=text(200),version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const requestId=text(200).min(8);
const criterion=z.strictObject({id:text(20000),text:text(20000),required:z.boolean()});
export const proposalRevisionContentSchema=z.strictObject({
 title:text(20000),goal:text(20000),dod:z.array(criterion).min(1).max(50).refine(items=>new Set(items.map(item=>item.id)).size===items.length,'Повтор criterion ID.'),
 constraints:text(20000,true),assumptions:text(20000,true),risks:text(20000,true),inputs:text(20000,true),comment:text(20000,true),
 flow:flowDefinitionSchema.optional(),
});
const finding=z.strictObject({text:text(4000),sourceEventIds:z.array(id).min(1).max(10).refine(ids=>new Set(ids).size===ids.length,'Повтор source ID.')});
const fields={title:text(200),findings:z.array(finding).min(1).max(12),interpretation:text(8000),limitations:text(4000)};
export const agentProposalContentSchema=z.discriminatedUnion('kind',[
 z.strictObject({...fields,kind:z.literal('reality_summary')}),
 z.strictObject({...fields,kind:z.literal('spec_proposal'),draft:proposalRevisionContentSchema}),
]).refine(value=>new TextEncoder().encode(JSON.stringify(value)).byteLength<=192*1024,'Предложение превышает192KiB.');
export const submitProposalInputSchema=z.strictObject({executionId:id,requestId,expectedVersion:version,sourceCursor:version,content:agentProposalContentSchema,proposalId:id.optional(),baseProposalRevisionId:id.optional()})
 .refine(value=>!!value.proposalId===!!value.baseProposalRevisionId,'Нужны оба ID базовой версии.');
