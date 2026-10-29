import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type Server as HttpServer} from 'node:http';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createOuroMcpServer} from '../packages/mcp/src/server';
import type {AgentStore} from '../packages/mcp/src/agent-service';
import {createStore} from '../lib/store';
import {PROJECT_ID,type Actor} from '../packages/core/src';
import {z} from 'zod';

const actor:Actor={id:'protocol-schema-agent',kind:'agent',projectIds:[PROJECT_ID]};
const human:Actor={id:'protocol-integration-human',kind:'human',projectIds:[PROJECT_ID]};
const manifestUri='ouro://protocol/manifest',bundleUri='ouro://protocol/schemas';
let projectAccesses=0;
const noProjectAccess:AgentStore={
 async getProject(){projectAccesses++;throw new Error('Static contract discovery accessed project data');},
 async getEvents(){projectAccesses++;throw new Error('Static contract discovery accessed project events');},
 async executeCommand(){projectAccesses++;throw new Error('Static contract discovery attempted a write');},
};
async function connect(store:AgentStore=noProjectAccess,identity:Actor=actor){
 const server=createOuroMcpServer({store,actor:identity}),client=new Client({name:'protocol-integration-client',version:'1'});
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 await server.connect(serverTransport);await client.connect(clientTransport);
 return {client,close:async()=>{await client.close();await server.close();}};
}
function resourceJson(result:Awaited<ReturnType<Client['readResource']>>){
 const item=result.contents[0];assert(item&&'text' in item&&typeof item.text==='string');return JSON.parse(item.text);
}
async function httpFixture(create:()=>McpServer){
 const token='protocol-stdio-fixture-token';
 const listener:HttpServer=createServer(async(req,res)=>{
  if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(401).end();return;}
  const server=create(),transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{
   await server.connect(transport);
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
   const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(', '):value);
   const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks).toString()}: {})});
   const response=await transport.handleRequest(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  }catch{res.writeHead(500).end();}finally{await server.close();}
 });
 await new Promise<void>(resolve=>listener.listen(0,'127.0.0.1',resolve));
 const port=(listener.address() as {port:number}).port,client=new Client({name:'protocol-stdio-acceptance',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/mcp/bin/ouro-mcp.mjs')],env:{PATH:process.env.PATH??'',OURO_URL:`http://127.0.0.1:${port}/mcp`,OURO_AGENT_TOKEN:token},stderr:'pipe'});
 try{await client.connect(transport);}
 catch(error){await client.close();await new Promise<void>(resolve=>listener.close(()=>resolve()));throw error;}
 return {client,close:async()=>{await client.close();await new Promise<void>(resolve=>listener.close(()=>resolve()));}};
}

test('P03 official MCP discovery publishes concrete Flow and response schemas for all fifteen tools',async()=>{
 const f=await connect();
 try{
  const inventory=await f.client.listTools();assert.equal(inventory.tools.length,15);
  for(const tool of inventory.tools)assert(tool.outputSchema,`Missing outputSchema for ${tool.name}`);
  const proposal=inventory.tools.find(tool=>tool.name==='ouro.submit_proposal')!;
  const schema=proposal.inputSchema as any;
  const flow=schema.properties.content.oneOf.find((branch:any)=>branch.properties.kind.const==='spec_proposal').properties.draft.properties.flow;
  assert.equal(flow.type,'object');assert.equal(flow.properties.nodes.type,'array');assert.equal(flow.properties.edges.type,'array');
  assert.equal(flow.additionalProperties,false);assert.equal(flow.properties.nodes.maxItems,100);
 }finally{await f.close();}
});

test('P05 MCP resources expose static versioned contracts without reading a project',async()=>{
 const before=projectAccesses,f=await connect();
 try{
  const {resources}=await f.client.listResources();
  assert.deepEqual(resources.map(resource=>resource.uri).sort(),[manifestUri,bundleUri].sort());
  const manifest=resourceJson(await f.client.readResource({uri:manifestUri}));assert.equal(manifest.version,'0.1.0');
  const bundle=resourceJson(await f.client.readResource({uri:bundleUri}));assert.deepEqual(bundle.manifest,manifest);
  assert(Array.isArray(bundle.schemas)&&bundle.schemas.length>0);
  for(const schema of bundle.schemas){assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');assert.match(schema.$id,/^urn:ouro:/);}
  await assert.rejects(f.client.readResource({uri:'ouro://protocol/private-project'}));
  assert.equal(projectAccesses,before);
 }finally{await f.close();}
});

test('P04 malformed output after SQL commit keeps an unknown outcome and replays the original receipt once',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 let f:Awaited<ReturnType<typeof connect>>|undefined;
 try{
  const registration=await store.createAgent('Output contract recovery',human),identity=(await store.authenticateAgentToken(registration.token))!;
  const run=async(command:Record<string,unknown>)=>store.executeCommand({...command,requestId:crypto.randomUUID(),expectedVersion:(await store.getProject()).version},human);
  let saved=await run({type:'createSpec',content:{title:'Выход после commit',goal:'Сохранить одну квитанцию при ошибке построения ответа.',dod:[{id:'once',text:'В истории один запуск.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
  const spec=saved.state.specs[0],revision=saved.state.revisions[0];
  await run({type:'activateRevision',specId:spec.id,revisionId:revision.id});
  saved=await run({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:identity.id});const execution=saved.state.executions[0];
  let corrupt:'invalid-state'|'missing-execution'|false='invalid-state';
  const wrapped:AgentStore={getProject:()=>store.getProject(),getEvents:after=>store.getEvents(after),async executeCommand(command,principal){
   const committed=await store.executeCommand(command,principal);
   if(!corrupt)return committed;
   const mode=corrupt;corrupt=false;const broken=structuredClone(committed);
   if(mode==='invalid-state')(broken.state.executions.find(item=>item.id===execution.id)! as unknown as {state:string}).state='PRIVATE_INVALID_EXECUTION_STATE';
   else broken.state.executions=[];
   return broken;
  }};
  f=await connect(wrapped,identity);await f.client.listTools();
  const args={executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:saved.cursor};
  const first=await f.client.callTool({name:'ouro.confirm_started',arguments:args});
  assert.equal(first.isError,true);assert(first.structuredContent);
  const failure=first.structuredContent as {ok:boolean;error:{code:string;message:string;details:{outcomeUnknown:boolean}}};
  assert.equal(failure.ok,false);assert.equal(failure.error.code,'OUTPUT_CONTRACT_ERROR');assert.equal(failure.error.details.outcomeUnknown,true);
  assert.match(failure.error.message,/requestId|тот же/);assert(!JSON.stringify(first).includes('PRIVATE_INVALID_EXECUTION_STATE'));
  assert.equal((await store.getProject()).version,args.expectedVersion+1);
  const repeated=await f.client.callTool({name:'ouro.confirm_started',arguments:args});assert.notEqual(repeated.isError,true);
  const receipt=repeated.structuredContent as {replayed:boolean;cursor:number;events:Array<{type:string}>};
  assert.equal(receipt.replayed,true);assert.equal(receipt.cursor,args.expectedVersion+1);assert.equal(receipt.events.length,1);assert.equal(receipt.events[0].type,'ExecutionStarted');
  assert.equal((await store.getProject()).version,args.expectedVersion+1);
  const count=await store.inspect<{count:string}>('SELECT count(*) FROM ouro_command_receipts WHERE actor_id=$1 AND request_id=$2',[identity.id,args.requestId]);
  assert.equal(Number(count.rows[0].count),1);
  // Projection can also fail before schema validation, after the durable write.
  corrupt='missing-execution';
  const actionArgs={executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:receipt.cursor,actionId:crypto.randomUUID(),phase:'completed',title:'Факт после запуска',context:'Проекция квитанции повреждена только в обёртке теста.',evidence:'fixture://protocol/postcommit'};
  const broken=await f.client.callTool({name:'ouro.report_action',arguments:actionArgs});
  assert.equal(broken.isError,true);assert.equal((broken.structuredContent as typeof failure).error.code,'OUTPUT_CONTRACT_ERROR');
  assert.equal((broken.structuredContent as typeof failure).error.details.outcomeUnknown,true);
  const actionReplay=await f.client.callTool({name:'ouro.report_action',arguments:actionArgs});assert.notEqual(actionReplay.isError,true);
  assert.equal((actionReplay.structuredContent as typeof receipt).replayed,true);
  assert.equal((await store.getProject()).version,actionArgs.expectedVersion+1);
 }finally{await f?.close();await store.close();}
});

test('P05 official stdio bridge forwards the same static resources as the HTTP server',async()=>{
 const f=await httpFixture(()=>createOuroMcpServer({store:noProjectAccess,actor}));
 try{
  const {resources}=await f.client.listResources();assert.deepEqual(resources.map(item=>item.uri).sort(),[manifestUri,bundleUri].sort());
  assert.equal(resourceJson(await f.client.readResource({uri:manifestUri})).version,'0.1.0');
  assert.equal(resourceJson(await f.client.readResource({uri:bundleUri})).manifest.version,'0.1.0');
 }finally{await f.close();}
});

test('P05 the new stdio bridge remains usable with a tools-only legacy server',async()=>{
 const f=await httpFixture(()=>{
  const legacy=new McpServer({name:'legacy-ouro-fixture',version:'0.1.0-alpha.11'});
  legacy.registerTool('ouro.get_context',{inputSchema:z.strictObject({})},async()=>({content:[{type:'text',text:'legacy fixture'}],structuredContent:{ok:true,legacy:true}}));
  return legacy;
 });
 try{
  assert.equal(f.client.getServerCapabilities()?.resources,undefined);
  const inventory=await f.client.listTools();assert.equal(inventory.tools[0].name,'ouro.get_context');
  const result=await f.client.callTool({name:'ouro.get_context',arguments:{}});assert.equal(result.isError,undefined);assert.equal((result.structuredContent as {legacy?:unknown}|undefined)?.legacy,true);
 }finally{await f.close();}
});
