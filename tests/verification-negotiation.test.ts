import test from 'node:test';
import assert from 'node:assert/strict';
import {negotiateProtocol,VERIFICATION_CAPABILITIES,AGENT_TOOLS,PROTOCOL_VERSION,createSchemaBundle} from '@ouro/protocol';
import {createAgentService} from '../packages/mcp/src/agent-service';
import {fixture,agent} from './verification-fixture';
import {report} from './verification-fixture';
import {applyCommand,type Command} from '../packages/core/src';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

// Exact historical schemas are frozen fixtures, not reconstructed from live schemas.
const legacySchemas=JSON.parse(readFileSync(new URL('./fixtures/verification/legacy-context-schemas.json',import.meta.url),'utf8')).schemas;
const legacyContextValidators=Object.fromEntries(Object.entries(legacySchemas).map(([version,schema])=>[version,new Ajv2020({strict:false,validateFormats:false}).compile(schema as object)]));

test('optional capability negotiation preserves legacy arguments and rejects explicit incompatible requirements',()=>{
 const tool=AGENT_TOOLS.find(item=>item.name==='ouro.get_context')!;
 assert(tool.inputSchema.safeParse({}).success);
 assert(tool.inputSchema.safeParse({executionId:'assigned',protocolVersion:PROTOCOL_VERSION,requiredCapabilities:['verification.cycles.v1']}).success);
 assert.equal(negotiateProtocol({}).version,PROTOCOL_VERSION);
 assert.deepEqual(negotiateProtocol({protocolVersion:'0.2.0'}).capabilities,[]);
 assert.deepEqual(negotiateProtocol({protocolVersion:'0.1.2'}).capabilities,[]);
 assert.throws(()=>negotiateProtocol({protocolVersion:'9.0.0'}),(error:any)=>error.code==='UNSUPPORTED_CONTRACT_VERSION');
 assert.throws(()=>negotiateProtocol({protocolVersion:'0.2.0',requiredCapabilities:['verification.cycles.v1']}),(error:any)=>error.code==='UNSUPPORTED_CAPABILITY');
 assert.throws(()=>negotiateProtocol({requiredCapabilities:['invented']}),(error:any)=>error.code==='UNSUPPORTED_CAPABILITY');
 assert.deepEqual(negotiateProtocol({requiredCapabilities:[...VERIFICATION_CAPABILITIES]}).capabilities,VERIFICATION_CAPABILITIES);
 assert(createSchemaBundle().manifest.negotiation.optional);
});
test('MCP cycle reports preserve assignment and phase authority without exposing human cancellation',async()=>{
 const f=fixture();f.current();f.importRun(report(['failed','failed']));f.review('expected_red');
 f.send({type:'beginVerificationCycle',verificationRevisionId:f.revision.id,scopeCaseIds:['case-1','case-2'],baselineRunIds:[f.state.verificationRuns[0].id],reason:'Reviewed RED'});
 f.send({type:'startExecution',specId:f.work.id,specRevisionId:f.workRevision.id,agentId:agent.id});const work=f.state.executions.at(-1)!;
 f.send({type:'confirmResumed',executionId:work.id,ackPhase:'start'},agent);let state=f.state;
 const service=createAgentService({actor:agent,store:{getProject:async()=>state,getEvents:async()=>({events:state.events,cursor:state.version}),executeCommand:async(command,actor)=>{const result=applyCommand(state,command as Command,actor);state=result.state;return {...result,cursor:state.version,replayed:false};}}});
 const args={executionId:f.execution.id,cycleId:state.verificationCycles[0].id,requestId:randomUUID(),expectedVersion:state.version,phase:'implementation',evidence:'Assigned implementation started'};
 const result=await service.callTool('ouro.report_verification_cycle',args);assert.equal(result.isError,undefined);assert.equal(state.verificationCycles[0].phase,'implementation');
 const version=state.version;const cancelled=await service.callTool('ouro.report_verification_cycle',{...args,requestId:randomUUID(),expectedVersion:version,phase:'cancelled'});assert.equal(cancelled.isError,true);assert.equal(state.version,version);
 const foreign=await service.callTool('ouro.report_verification_cycle',{...args,requestId:randomUUID(),expectedVersion:version,executionId:work.id,phase:'verification'});assert.equal(foreign.isError,true);assert.equal(state.version,version);
});

test('assigned verification context negotiates new data and refuses legacy client instead of silently downgrading work',async()=>{
 const f=fixture();let writes=0;
 const service=createAgentService({actor:agent,store:{getProject:async()=>f.state,getEvents:async()=>({events:f.state.events,cursor:f.state.version}),executeCommand:async()=>{writes++;throw new Error('No write expected');}}});
 for(const protocolVersion of ['0.1.2','0.2.0']){
  const old=await service.callTool('ouro.get_context',{executionId:f.execution.id,protocolVersion});
  assert.equal(old.isError,true);assert.equal((old.structuredContent as any).error.code,'UNSUPPORTED_CAPABILITY');
 }
 const modern=await service.callTool('ouro.get_context',{executionId:f.execution.id,protocolVersion:PROTOCOL_VERSION,requiredCapabilities:['verification.cycles.v1','verification.observation.v1']});
 assert.equal(modern.isError,undefined);const body=modern.structuredContent as any;
 assert.equal(body.contract.version,PROTOCOL_VERSION);assert.deepEqual(body.work[0].verification.cycles,[]);assert.deepEqual(body.work[0].verification.observations,[]);
 assert.equal(legacyContextValidators['0.2.0'](body),false,'A real 0.2.0 strict nested schema cannot consume current verification readiness.');
 const omitted=await service.callTool('ouro.get_context',{executionId:f.execution.id});
 assert.equal(omitted.isError,undefined);assert.deepEqual((omitted.structuredContent as any).contract.capabilities,VERIFICATION_CAPABILITIES);
 assert.equal(writes,0);
});

test('explicit legacy context supports only visible verification-free work without dropping proposal facts',async()=>{
 const f=fixture();f.send({type:'startExecution',specId:f.work.id,specRevisionId:f.workRevision.id,agentId:agent.id});
 const execution=f.state.executions.at(-1)!;let writes=0;
 const state=structuredClone(f.state);
 const service=createAgentService({actor:agent,store:{getProject:async()=>state,getEvents:async()=>({events:state.events,cursor:state.version}),executeCommand:async()=>{writes++;throw new Error('Read only');}}});
 for(const protocolVersion of ['0.1.2','0.2.0']){
  // The other assigned verification is outside this explicitly selected context.
  const ordinary=await service.callTool('ouro.get_context',{executionId:execution.id,protocolVersion});
  assert.equal(ordinary.isError,undefined);const body=ordinary.structuredContent as any;
  assert.deepEqual(body.contract.capabilities,[]);assert.equal(body.work.length,1);assert.equal(body.work[0].execution.id,execution.id);
  assert(legacyContextValidators[protocolVersion](body),JSON.stringify(legacyContextValidators[protocolVersion].errors));
  const demanded=await service.callTool('ouro.get_context',{executionId:execution.id,protocolVersion,requiredCapabilities:['verification.v1']});
  assert.equal(demanded.isError,true);assert.equal((demanded.structuredContent as any).error.code,'UNSUPPORTED_CAPABILITY');
 }
 const draft=structuredClone(f.revision);draft.verification!.cases[0].quality={mutation:{required:true,minimumScore:80}};
 state.agentProposals.push({id:'visible-proposal',projectId:state.projectId,executionId:execution.id,specId:f.work.id,specRevisionId:f.workRevision.id,agentId:agent.id,latestRevisionId:'visible-proposal-revision',state:'pending'});
 state.agentProposalRevisions.push({id:'visible-proposal-revision',proposalId:'visible-proposal',revision:1,sourceCursor:state.version,sourceEventIds:[],content:{kind:'spec_proposal',title:'Verification proposal',findings:[],interpretation:'Review only',limitations:'Not accepted',draft},submittedBy:agent.id,createdAt:'2026-11-03T00:00:00.000Z'});
 for(const protocolVersion of ['0.1.2','0.2.0']){
  const denied=await service.callTool('ouro.get_context',{executionId:execution.id,protocolVersion});
  assert.equal(denied.isError,true);assert.equal((denied.structuredContent as any).error.code,'UNSUPPORTED_CAPABILITY');
 }
 const modern=await service.callTool('ouro.get_context',{executionId:execution.id});
 assert.equal(modern.isError,undefined);assert.deepEqual((modern.structuredContent as any).work[0].proposalRevisions[0].content.draft,draft);
 assert.equal(writes,0);
});
