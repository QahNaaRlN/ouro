import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {AGENT_TOOLS,PROTOCOL_VERSION,type FlowDefinition} from '@ouro/protocol';
import {PROJECT_ID,replay,type Actor,type ProjectState} from '../packages/core/src';
import {createOuroMcpServer} from '../packages/mcp/src/server';
import type {AgentStore} from '../packages/mcp/src/agent-service';
import {createStore} from '../lib/store';

const human:Actor={id:'flow-runtime-mcp-human',kind:'human',projectIds:[PROJECT_ID]};
const actor:Actor={id:'flow-runtime-mcp-agent',kind:'agent',projectIds:[PROJECT_ID]};
const flow:FlowDefinition={entryNodeId:'work',nodes:[
 {id:'work',kind:'action',title:'Inspect',description:'Check assigned input.',owner:'agent'},
 {id:'result',kind:'result',title:'Present',description:'Human acceptance remains separate.',owner:'agent'},
],edges:[{id:'ready',source:'work',target:'result',label:'Evidence verified'}]};
async function connect(store:AgentStore,identity=actor){
 const server=createOuroMcpServer({store,actor:identity}),client=new Client({name:'flow-runtime-acceptance',version:'1'});
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 await server.connect(serverTransport);await client.connect(clientTransport);
 return {client,close:async()=>{await client.close();await server.close();}};
}
function projection():ProjectState{
 const state=replay([]);state.version=10;state.roadmap.state='active';
 state.specs.push({id:'spec',projectId:PROJECT_ID,humanId:'FR-1',title:'Assigned process',state:'in_progress',activeRevisionId:'revision',revisionIds:['revision']});
 state.revisions.push({id:'revision',specId:'spec',revision:1,title:'Assigned process',goal:'Follow explicit runs.',dod:[{id:'evidence',text:'Evidence exists.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',createdAt:'2026-10-29T00:00:00.000Z',authorId:human.id,flow});
 state.executions.push({id:'execution',specId:'spec',specRevisionId:'revision',agentId:actor.id,state:'running',kind:'primary',flowRuntime:{version:1,state:'active',currentRunId:'run-2',runs:[
  {id:'run-1',nodeId:'work',visit:1,state:'succeeded',createdAt:'2026-10-29T00:00:00.000Z',startedAt:'2026-10-29T00:00:01.000Z',finishedAt:'2026-10-29T00:00:02.000Z',evidence:'fixture://first'},
  {id:'run-2',nodeId:'result',visit:1,state:'ready',createdAt:'2026-10-29T00:00:02.000Z'},
 ],traversals:[{id:'traversal-1',edgeId:'ready',fromRunId:'run-1',toRunId:'run-2',at:'2026-10-29T00:00:02.000Z'}]}});
 return state;
}

test('FR10 official SDK discovers opt-in tracking and exposes the assigned current run with permission views',async()=>{
 const state=projection(),store:AgentStore={async getProject(){return state;},async getEvents(){return {events:[],cursor:state.version};},async executeCommand(){throw new Error('Read-only discovery attempted a write');}};
 const f=await connect(store);
 try{
  const tools=await f.client.listTools();assert.equal(tools.tools.length,AGENT_TOOLS.length);assert.equal(tools.tools.length,16);
  const step=tools.tools.find(tool=>tool.name==='ouro.report_flow_step')!;assert(step.outputSchema);assert.equal((step.inputSchema.properties?.runId as any).type,'string');
  assert.deepEqual((step.inputSchema.properties?.phase as any).enum,['start','complete','fail']);
  const manifest=await f.client.readResource({uri:'ouro://protocol/manifest'});assert.equal(JSON.parse((manifest.contents[0] as {text:string}).text).version,PROTOCOL_VERSION);
  const context=await f.client.callTool({name:'ouro.get_context',arguments:{executionId:'execution'}});assert.notEqual(context.isError,true,JSON.stringify(context));
  const work=(context.structuredContent as any).work[0];assert.equal(work.flowProgress.mode,'enforced');assert.equal(work.flowProgress.run.id,'run-2');assert.equal(typeof work.flowProgress.agentActions.start.allowed,'boolean');assert.equal(typeof work.flowProgress.agentActions.start.reason,'string');
  assert.equal(work.execution.flowRuntime.runs.length,2);assert.equal(work.flowProgress.edges[0].state,'possible');
 }finally{await f.close();}
});

test('FR04/FR06/FR09 official SDK records explicit runs, off-plan human interruption and a single durable transition receipt',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});let f:Awaited<ReturnType<typeof connect>>|undefined;
 try{
  const registration=await store.createAgent('Flow runtime SDK',human),identity=(await store.authenticateAgentToken(registration.token))!;
  const humanCommand=async(data:Record<string,unknown>)=>store.executeCommand({...data,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},human);
  let saved=await humanCommand({type:'createSpec',content:{title:'Explicit SDK process',goal:'Follow the immutable Flow with human authority.',dod:[{id:'verified',text:'Human verifies evidence.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',flow}});
  const spec=saved.state.specs[0],revision=saved.state.revisions[0];await humanCommand({type:'activateRevision',specId:spec.id,revisionId:revision.id});
  saved=await humanCommand({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:identity.id,flowTracking:'enforced'});
  const executionId=saved.state.executions[0].id,first=saved.state.executions[0].flowRuntime!.currentRunId!;
  f=await connect(store,identity);await f.client.listTools();
  const call=async(name:string,args:Record<string,unknown>)=>f!.client.callTool({name,arguments:{executionId,requestId:randomUUID(),expectedVersion:(await store.getProject()).version,...args}});
  const ok=async(name:string,args:Record<string,unknown>)=>{const result=await call(name,args);assert.notEqual(result.isError,true,JSON.stringify(result));return result.structuredContent as any;};
  await ok('ouro.confirm_started',{});
  const context=await f.client.callTool({name:'ouro.get_context',arguments:{executionId}});assert.equal((context.structuredContent as any).work[0].flowProgress.agentActions.start.allowed,true);
  await ok('ouro.report_flow_step',{runId:first,phase:'start'});
  const running=await f.client.callTool({name:'ouro.get_context',arguments:{executionId}});assert.equal((running.structuredContent as any).work[0].permissions.canStartAction,true);
  const action=await ok('ouro.report_action',{flowStepRunId:first,actionId:randomUUID(),phase:'completed',title:'Verified input',context:'Concrete observation on this run.',evidence:'test://sdk/input'});assert.equal(action.events[0].payload.flowNodeId,'work');assert.equal(action.events[0].payload.flowStepRunId,first);
  const premature=await call('ouro.complete_execution',{result:'succeeded',evidence:'test://premature'});assert.equal(premature.isError,true);
  const opened=await ok('ouro.report_question',{flowStepRunId:first,title:'Unexpected input ambiguity',context:'The planned action discovered a question.',question:'Which source is authoritative?',blockingScope:'none'});
  const request=opened.requests.at(-1);assert.equal(request.flowInterrupt,true);assert.equal(request.flowNodeId,undefined);assert.equal(request.flowStepRunId,first);assert.equal(request.blockingScope,'execution');assert.equal(opened.execution.state,'waiting_for_human');
  const denied=await call('ouro.report_flow_step',{runId:first,phase:'complete',evidence:'test://not-authorized'});assert.equal(denied.isError,true);
  await humanCommand({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:revision.id,outcome:{kind:'answer',answer:'Use the signed original.'}});
  await ok('ouro.confirm_decision_applied',{decisionRequestId:request.id,evidence:'test://sdk/answer-applied'});
  const noResume=await call('ouro.report_flow_step',{runId:first,phase:'complete',evidence:'test://requires-resume'});assert.equal(noResume.isError,true);
  await humanCommand({type:'resumeExecution',executionId});await ok('ouro.confirm_resumed',{});
  const transition={executionId,requestId:randomUUID(),expectedVersion:(await store.getProject()).version,runId:first,phase:'complete',evidence:'test://sdk/work-complete'};
  const committed=await f.client.callTool({name:'ouro.report_flow_step',arguments:transition});assert.notEqual(committed.isError,true,JSON.stringify(committed));
  const receipt=committed.structuredContent as any,next=receipt.execution.flowRuntime.currentRunId;assert.notEqual(next,first);assert.equal(receipt.execution.flowRuntime.traversals.length,1);assert.equal(receipt.execution.flowRuntime.runs[0].state,'succeeded');
  const replayed=await f.client.callTool({name:'ouro.report_flow_step',arguments:transition});assert.notEqual(replayed.isError,true,JSON.stringify(replayed));assert.equal((replayed.structuredContent as any).replayed,true);assert.deepEqual((replayed.structuredContent as any).events,receipt.events);assert.equal((await store.getProject()).version,receipt.cursor);
  const receiptCount=await store.inspect<{count:string}>('SELECT count(*) FROM ouro_command_receipts WHERE actor_id=$1 AND request_id=$2',[identity.id,transition.requestId]);assert.equal(Number(receiptCount.rows[0].count),1);
  await ok('ouro.report_flow_step',{runId:next,phase:'start'});await ok('ouro.report_flow_step',{runId:next,phase:'complete',evidence:'test://sdk/result'});
  assert.equal((await store.getProject()).executions[0].state,'running');await ok('ouro.complete_execution',{result:'succeeded',evidence:'test://sdk/execution'});
  assert.notEqual((await store.getProject()).specs[0].state,'done');
 }finally{await f?.close();await store.close();}
});

test('FR09 MCP forwards the original run and body to receipt lookup before considering the current run',async()=>{
 const state=projection(),receipt=structuredClone(state),seen:unknown[]=[];
 receipt.version=7;receipt.executions[0].flowRuntime={version:1,state:'active',currentRunId:'run-1',runs:[{id:'run-1',nodeId:'work',visit:1,state:'running',createdAt:'2026-10-29T00:00:00.000Z',startedAt:'2026-10-29T00:00:01.000Z'}],traversals:[]};
 const store:AgentStore={async getProject(){return state;},async getEvents(){return {events:[],cursor:state.version};},async executeCommand(command,identity){seen.push(command);assert.equal(identity.id,actor.id);return {state:receipt,events:[],cursor:receipt.version,replayed:true};}};
 const f=await connect(store);
 try{
  const args={executionId:'execution',requestId:'same-original-request',expectedVersion:6,runId:'run-1',phase:'start'};
  const result=await f.client.callTool({name:'ouro.report_flow_step',arguments:args});assert.notEqual(result.isError,true,JSON.stringify(result));
  assert.deepEqual(seen,[{...args,type:'reportFlowStep'}]);assert.equal((result.structuredContent as any).replayed,true);assert.equal((result.structuredContent as any).execution.flowRuntime.currentRunId,'run-1');
  const denied=await f.client.callTool({name:'ouro.report_flow_step',arguments:{...args,executionId:'foreign'}});assert.equal(denied.isError,true);assert.equal((denied.structuredContent as any).error.code,'FORBIDDEN');assert.equal(seen.length,1);
  const spoof=await f.client.callTool({name:'ouro.report_flow_step',arguments:{...args,agentId:'other'}});assert.equal(spoof.isError,true);assert.equal(seen.length,1);
 }finally{await f.close();}
});
