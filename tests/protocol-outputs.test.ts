import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';

const contracts=()=>import('../packages/protocol/src/outputs');
const flow={entryNodeId:'work',nodes:[
 {id:'work',kind:'action',title:'Read assigned revision',description:'Only the assigned contract.',owner:'agent'},
 {id:'result',kind:'result',title:'Present evidence',description:'Human acceptance is separate.',owner:'agent'},
],edges:[{id:'ready',source:'work',target:'result',label:'Evidence available'}]};
const revision={id:'revision-1',specId:'spec-1',revision:1,title:'Assigned specification',goal:'Read its exact immutable revision.',dod:[{id:'read',text:'Exact revision is read.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',createdAt:'2026-10-29T00:00:00.000Z',authorId:'human-1',flow};
const execution={id:'execution-1',specId:'spec-1',specRevisionId:revision.id,agentId:'agent-1',state:'running',kind:'primary'};
const event={id:'event-1',type:'ActionReported',schemaVersion:1,version:1,projectId:'project-1',occurredAt:'2026-10-29T00:00:00.000Z',actor:{id:'agent-1',kind:'agent',projectIds:['project-1']},correlationId:'correlation-1',executionId:execution.id,specId:'spec-1',specRevisionId:revision.id,payload:{title:'Read the assigned contract',evidence:'fixture://contract-read',extension:{values:[null,true,42,'fact']}}};
const request={id:'question-1',kind:'Question',title:'Clarify input',context:'A source is missing.',reason:'',options:[],question:'Which source applies?',state:'pending',specId:'spec-1',specRevisionId:revision.id,executionId:execution.id,agentId:'agent-1',blockingScope:'none'};
const mutation=()=>({ok:true,execution:structuredClone(execution),requests:[structuredClone(request)],events:[structuredClone(event)],cursor:1,replayed:true});
const context=()=>({ok:true,project:{id:'project-1',title:'Example',roadmapState:'active'},agent:{id:'agent-1'},version:1,cursor:1,work:[{
 execution:structuredClone(execution),spec:{id:'spec-1',humanId:'EXAMPLE-S-000001',title:revision.title,state:'in_progress',activeRevisionId:revision.id},revision:structuredClone(revision),requests:[structuredClone(request)],
 clarifications:[{eventId:'clarification-1',decisionRequestId:request.id,question:'What did you inspect?',actorId:'human-1',at:'2026-10-29T00:00:00.000Z',response:{eventId:'clarification-answer-1',text:'The exact revision.',actorId:'agent-1',at:'2026-10-29T00:00:01.000Z'}}],
 proposals:[],proposalRevisions:[],proposalSourceIds:[{id:event.id,version:1,type:event.type}],
 permissions:{canAcknowledgeStart:false,canAcknowledgeResume:false,canAcknowledgeStop:false,canStartAction:true,canCompleteSuccessfully:true,stopRequested:false,resumeAuthorized:false,terminal:false,canSubmitProposal:true},
}],instructions:['Keep the same requestId on uncertain retries.']});
const names=['ouro.get_context','ouro.get_updates','ouro.report_action','ouro.report_question','ouro.report_fork','ouro.report_blocker','ouro.withdraw_decision','ouro.submit_decision_clarification','ouro.confirm_started','ouro.confirm_resumed','ouro.confirm_stopped','ouro.confirm_decision_applied','ouro.complete_execution','ouro.clear_blocker','ouro.submit_proposal','ouro.report_flow_step'];
const errorBody=()=>({ok:false,error:{code:'OUTPUT_CONTRACT_ERROR',message:'Outcome is unknown; repeat the same requestId/body.',details:{outcomeUnknown:true},retryable:false,refreshRequired:false}});

test('P03 valid own __proto__ JSON extension keys survive validation without prototype pollution',async()=>{
 const {validateToolBody}=await contracts();
 const body=JSON.parse('{"ok":true,"events":[],"cursor":0,"__proto__":{"ouroProtocolMarker":"root"},"extension":{"__proto__":{"ouroProtocolMarker":"nested"},"constructor":"ordinary JSON key","prototype":{"value":true}}}');
 const before=JSON.stringify(body),result=validateToolBody('ouro.get_updates',body);
 assert.strictEqual(result,body,'validation must return the supplied validated JSON body');
 assert.equal(Object.hasOwn(result,'__proto__'),true);
 assert.equal(Object.hasOwn((result as Record<string,unknown>).extension as object,'__proto__'),true);
 assert.equal(JSON.stringify(result),before);
 assert.equal(Object.hasOwn(Object.prototype,'ouroProtocolMarker'),false);
});

test('P03 own __proto__ values cannot bypass validation of non-JSON data at any depth',async()=>{
 const {validateToolBody}=await contracts();
 for(const invalid of [undefined,()=>true,Symbol('not JSON'),1n,NaN,Infinity]){
  const body={ok:true,events:[],cursor:0};Object.defineProperty(body,'__proto__',{value:invalid,enumerable:true});
  assert.throws(()=>validateToolBody('ouro.get_updates',body),error=>error instanceof z.ZodError);
 }
 const nested={ok:true,events:[],cursor:0,extension:{}};
 Object.defineProperty(nested.extension,'__proto__',{value:undefined,enumerable:true});
 assert.throws(()=>validateToolBody('ouro.get_updates',nested),error=>error instanceof z.ZodError);
});

test('P03 JSON validation rejects cycles while allowing shared acyclic values',async()=>{
 const {validateToolBody}=await contracts();
 const cyclic:Record<string,unknown>={};cyclic.self=cyclic;
 assert.throws(()=>validateToolBody('ouro.get_updates',{ok:true,events:[],cursor:0,extension:cyclic}),error=>error instanceof z.ZodError);
 const shared={nested:[null,true,1]},body={ok:true,events:[],cursor:0,extension:{first:shared,second:shared}};
 assert.strictEqual(validateToolBody('ouro.get_updates',body),body);
 const sparse={ok:true,events:[],cursor:0,extension:Array(1)};
 assert.throws(()=>validateToolBody('ouro.get_updates',sparse),error=>error instanceof z.ZodError);
});

test('P03 non-JSON containers and accessor properties are rejected without invoking getters',async()=>{
 const {validateToolBody}=await contracts();
 for(const invalid of [new Date(),new Map(),Object.create({inherited:true})])assert.throws(()=>validateToolBody('ouro.get_updates',{ok:true,events:[],cursor:0,extension:invalid}),error=>error instanceof z.ZodError);
 let reads=0;const body={ok:true,events:[],cursor:0};
 Object.defineProperty(body,'extension',{enumerable:true,get(){reads++;return 'computed';}});
 assert.throws(()=>validateToolBody('ouro.get_updates',body),error=>error instanceof z.ZodError);
 assert.equal(reads,0);
});

test('P03 wire output schemas accept typed errors without making incomplete successes valid',async()=>{
 const {getToolOutputSchema}=await contracts();
 for(const name of names)assert(getToolOutputSchema(name).safeParse(errorBody()).success,name);
 assert.equal(getToolOutputSchema('ouro.get_context').safeParse({ok:true,error:errorBody().error}).success,false);
 assert.equal(getToolOutputSchema('ouro.report_action').safeParse({...mutation(),ok:false}).success,false);
 assert.equal(getToolOutputSchema('ouro.report_action').safeParse({...errorBody(),execution:{...execution,state:'invalid'}}).success,false);
 for(const [ajv,target] of [[new Ajv2020({strict:false}),'draft-2020-12'],[new Ajv({strict:false}),'draft-7']] as const){
  const validate=ajv.compile(z.toJSONSchema(getToolOutputSchema('ouro.report_action'),{target}));
  assert(validate(errorBody()),JSON.stringify(validate.errors));assert(validate(mutation()),JSON.stringify(validate.errors));
  assert.equal(validate({ok:true,error:errorBody().error}),false);
  assert.equal(validate({...mutation(),ok:false}),false);
  assert.equal(validate({...errorBody(),execution:{...execution,state:'invalid'}}),false);
 }
});

test('P03 helper and wire schemas agree on reserved variant fields while unknown-tool errors remain valid',async()=>{
 const {getToolOutputSchema,validateToolBody}=await contracts();
 const badError={...errorBody(),execution:{...execution,state:'invalid'}};
 assert.equal(getToolOutputSchema('ouro.report_action').safeParse(badError).success,false);
 assert.throws(()=>validateToolBody('ouro.report_action',badError,true));
 const badSuccess={...mutation(),error:{code:42}};
 assert.equal(getToolOutputSchema('ouro.report_action').safeParse(badSuccess).success,false);
 assert.throws(()=>validateToolBody('ouro.report_action',badSuccess));
 const compatibleError={...errorBody(),execution:structuredClone(execution),cursor:1};
 assert.deepEqual(validateToolBody('ouro.report_action',compatibleError,true),compatibleError);
 const unknown={ok:false,error:{code:'UNKNOWN_TOOL',message:'Unsupported tool.',retryable:false,refreshRequired:false}};
 assert.deepEqual(validateToolBody('ouro.unknown',unknown,true),unknown);
});

test('P03 every supported tool has a concrete output object schema and unknown names are rejected',async()=>{
 const {getToolOutputSchema}=await contracts();
 for(const name of names){const schema=z.toJSONSchema(getToolOutputSchema(name));assert.equal(schema.type,'object',name);assert('ok' in (schema.properties??{}),name);}
 assert.throws(()=>getToolOutputSchema('ouro.unknown'));
});

test('P03 context describes the assigned revision and rejects incomplete or malformed nested DTOs',async()=>{
 const {contextOutputSchema}=await contracts();
 assert(contextOutputSchema.safeParse(context()).success);
 const missing=context();delete (missing.work[0] as Partial<typeof missing.work[0]>).revision;
 assert.equal(contextOutputSchema.safeParse(missing).success,false);
 const wrongState=context();wrongState.work[0].execution.state='made_up';assert.equal(contextOutputSchema.safeParse(wrongState).success,false);
 const wrongFlow=context();wrongFlow.work[0].revision.flow.nodes[0].kind='made_up';assert.equal(contextOutputSchema.safeParse(wrongFlow).success,false);
 const wrongPermission=context();(wrongPermission.work[0].permissions as unknown as Record<string,unknown>).canStartAction='yes';assert.equal(contextOutputSchema.safeParse(wrongPermission).success,false);
});

test('P03 normal mutation responses retain legacy optionality and preserve additive JSON data',async()=>{
 const {validateToolBody}=await contracts();
 const body={...mutation(),futureMetadata:{note:'Preserve this value',items:[null,false,1]},execution:{...execution,futureStopEvidence:'fixture://extra'}};
 assert.deepEqual(validateToolBody('ouro.report_action',body),body);
 assert.equal('proposals' in validateToolBody('ouro.report_action',mutation()),false,'legacy mutation has no proposal arrays');
 assert.throws(()=>validateToolBody('ouro.submit_proposal',mutation()),'new proposal result requires its explicit arrays');
 for(const invalid of [undefined,NaN,Infinity,()=>true])assert.throws(()=>validateToolBody('ouro.report_action',{...mutation(),futureMetadata:invalid}),'extensions must contain JSON data');
});

test('P03 error bodies are validated separately and keep an unknown post-commit outcome explicit',async()=>{
 const {agentErrorSchema,validateToolBody}=await contracts();
 const body={ok:false,error:{code:'OUTPUT_CONTRACT_ERROR',message:'Outcome is unknown; repeat the same requestId/body.',details:{outcomeUnknown:true,extension:{source:null}},retryable:false,refreshRequired:false}};
 assert.deepEqual(validateToolBody('ouro.report_action',body,true),body);
 assert.equal(agentErrorSchema.safeParse({...body,ok:true}).success,false);
 assert.equal(agentErrorSchema.safeParse({ok:false,error:{code:'FORBIDDEN',retryable:false,refreshRequired:false}}).success,false);
 assert.throws(()=>validateToolBody('ouro.report_action',body));
});

test('P03 canonical JSON Schema independently validates real-shaped responses and recursive JSON extensions',async()=>{
 const {getToolOutputSchema,agentErrorSchema}=await contracts();
 const ajv=new Ajv2020({strict:false});
 const validateContext=ajv.compile(z.toJSONSchema(getToolOutputSchema('ouro.get_context'),{target:'draft-2020-12'}));
 assert(validateContext(context()),JSON.stringify(validateContext.errors));
 const incomplete=context();delete (incomplete.work[0] as Partial<typeof incomplete.work[0]>).revision;
 assert.equal(validateContext(incomplete),false);
 const validateMutation=ajv.compile(z.toJSONSchema(getToolOutputSchema('ouro.report_action'),{target:'draft-2020-12'}));
 assert(validateMutation(mutation()),JSON.stringify(validateMutation.errors));
 const malformed=mutation();(malformed.events[0].payload as Record<string,unknown>).evidence=undefined;
 assert.equal(validateMutation(malformed),false,'JSON extension fields cannot be undefined');
 const validateError=ajv.compile(z.toJSONSchema(agentErrorSchema,{target:'draft-2020-12'}));
 assert(validateError({ok:false,error:{code:'INTERNAL_ERROR',message:'Unknown outcome.',details:{nested:[1,{ok:true},null]},retryable:false,refreshRequired:false}}),JSON.stringify(validateError.errors));
});

test('P03 output schemas also export in the Draft7 dialect used by the pinned MCP SDK',async()=>{
 const {getToolOutputSchema,agentErrorSchema}=await contracts();
 const ajv=new Ajv({strict:false});
 const validate=ajv.compile(z.toJSONSchema(getToolOutputSchema('ouro.get_context'),{target:'draft-7'}));
 assert(validate(context()),JSON.stringify(validate.errors));
 const malformed=context();malformed.work[0].revision.flow.nodes[0].owner='unrecognised';
 assert.equal(validate(malformed),false);
 const validateError=ajv.compile(z.toJSONSchema(agentErrorSchema,{target:'draft-7'}));
 assert(validateError({ok:false,error:{code:'FORBIDDEN',message:'Assignment is unavailable.',retryable:false,refreshRequired:false}}),JSON.stringify(validateError.errors));
});
