import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import Ajv2020 from 'ajv/dist/2020.js';

const contracts=()=>import('../packages/protocol/src/index');
const run={id:'run-1',nodeId:'inspect',visit:1,state:'running',createdAt:'2026-10-29T00:00:00.000Z',startedAt:'2026-10-29T00:00:01.000Z'};
const runtime={version:1,state:'active',currentRunId:run.id,runs:[run],traversals:[]};
const action={allowed:false,reason:'Human approval required.'};
const view={mode:'enforced',run,agentActions:{start:action,complete:action,fail:action},humanActions:{start:action,complete:action,fail:action,retry:action,skip:action},edges:[{id:'inspect-result',state:'blocked',reason:'No completed step.'}]};

test('FR10 standalone contract describes concrete runtime runs, traversal history and permission views',async()=>{
 const protocol=await contracts() as unknown as Record<string,any>;
 assert(protocol.flowRuntimeSchema,'Flow runtime schema must be exported');
 assert(protocol.flowStepRunSchema,'Step run schema must be exported');
 assert(protocol.flowTraversalSchema,'Traversal schema must be exported');
 assert(protocol.flowRuntimeViewSchema,'Runtime view schema must be exported');
 assert(protocol.flowRuntimeSchema.safeParse(runtime).success);
 assert(protocol.flowRuntimeViewSchema.safeParse(view).success);
 assert(protocol.flowRuntimeSchema.safeParse({...runtime,state:'completed',currentRunId:null}).success);
 assert.equal(protocol.flowRuntimeSchema.safeParse({...runtime,runs:[{...run,state:'guessed'}]}).success,false);
 assert.equal(protocol.flowRuntimeViewSchema.safeParse({...view,edges:[{id:'x',state:'executed',reason:''}]}).success,false);
 const validate=new Ajv2020({strict:false}).compile(z.toJSONSchema(protocol.flowRuntimeSchema,{target:'draft-2020-12'}));
 assert(validate(runtime),JSON.stringify(validate.errors));
 assert.equal(validate({...runtime,runs:[{...run,visit:0}]}),false);
});

test('FR10 new flow-step tool and optional run bindings are discoverable without changing legacy report inputs',async()=>{
 const protocol=await contracts(),tool=protocol.AGENT_TOOLS.find(tool=>tool.name==='ouro.report_flow_step');
 assert(tool,'Flow-step reporting tool must be published');
 assert.equal(protocol.AGENT_TOOLS.length,16);
 assert(tool.inputSchema.safeParse({executionId:'execution-1',requestId:'stable-request-1',expectedVersion:42,runId:'run-1',phase:'start'}).success);
 assert.equal(tool.inputSchema.safeParse({executionId:'execution-1',requestId:'stable-request-1',expectedVersion:42,runId:'run-1',phase:'jump'}).success,false);
 assert.equal(tool.inputSchema.safeParse({executionId:'execution-1',requestId:'stable-request-1',expectedVersion:42,runId:'run-1',phase:'complete',state:'succeeded'}).success,false);
 for(const name of ['ouro.report_action','ouro.report_question','ouro.report_fork','ouro.report_blocker']){
  const report=protocol.AGENT_TOOLS.find(tool=>tool.name===name)!,schema=z.toJSONSchema(report.inputSchema) as any;
  assert.equal(schema.properties.flowStepRunId.type,'string',name);
  assert(!schema.required.includes('flowStepRunId'),name);
 }
 const contextSchema=z.toJSONSchema(protocol.contextOutputSchema) as any;
 assert(contextSchema.properties.work.items.properties.flowProgress.properties.agentActions);
 assert(contextSchema.properties.work.items.properties.execution.properties.flowRuntime.properties.runs);
 assert(protocol.getToolOutputSchema('ouro.report_flow_step'));
});

test('FR02 enforced profile checks are portable without tightening legacy Flow validation',async()=>{
 const protocol=await contracts() as unknown as Record<string,any>;
 assert(protocol.validateEnforcedFlowDefinition,'Enforced profile validator must be exported');
 const flow={entryNodeId:'work',nodes:[
  {id:'work',kind:'action',title:'Inspect',description:'Read the input.',owner:'agent'},
  {id:'alternate',kind:'action',title:'Alternative',description:'Another permitted step.',owner:'agent'},
  {id:'result',kind:'result',title:'Present',description:'Human acceptance is separate.',owner:'agent'},
 ],edges:[{id:'a',source:'work',target:'result',label:'Direct'},{id:'b',source:'work',target:'alternate',label:'Another path'},{id:'c',source:'alternate',target:'result',label:'Ready'}]};
 protocol.validateFlowDefinition(flow);
 assert.throws(()=>protocol.validateEnforcedFlowDefinition(flow),(error:any)=>error.code==='VALIDATION_ERROR');
 const linear={...flow,edges:flow.edges.filter(edge=>edge.id!=='a')};protocol.validateEnforcedFlowDefinition(linear);
 const fork={...flow,nodes:flow.nodes.map(node=>node.id==='work'?{...node,kind:'fork',owner:'human'}:node)};
 protocol.validateFlowDefinition(fork);assert.throws(()=>protocol.validateEnforcedFlowDefinition(fork));
 protocol.validateEnforcedFlowDefinition({...fork,edges:fork.edges.map(edge=>edge.source==='work'?{...edge,optionId:edge.id}:edge)});
 const blocker={...linear,nodes:linear.nodes.map(node=>node.id==='work'?{...node,kind:'blocker',owner:'human'}:node)};
 protocol.validateFlowDefinition(blocker);assert.throws(()=>protocol.validateEnforcedFlowDefinition(blocker));
});
