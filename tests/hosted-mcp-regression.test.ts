import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import type {ContextOutput,WorkspaceFileOutput,AgentErrorBody} from '@ouro/protocol';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {POST as createAgent} from '../app/api/agents/route';
import {POST as projectMcp,GET as projectMcpGet,DELETE as projectMcpDelete} from '../app/api/projects/[projectId]/mcp/route';
import {POST as legacyMcp} from '../app/api/mcp/route';
import {createStore,type Store} from '../lib/store';
import {PROJECT_ID,type Actor} from '../packages/core/src';

type Registration={agent:{id:string};token:string;connection:{httpUrl:string;stdioCommand:string;stdioArgs:string[];projectId:string}};
const operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
const password='correct horse battery staple';
const globalStore=globalThis as typeof globalThis & {__ouroStore?:Promise<Store>};

async function listen():Promise<{server:Server;base:string}>{
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url??'/',`http://${req.headers.host}`),headers=new Headers();
   for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
   const request=new Request(url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks).toString()}: {})});
   const project=/^\/api\/projects\/([^/]+)\/mcp$/.exec(url.pathname)?.[1];
   const response=project?
    await(req.method==='POST'?projectMcp(request,{params:Promise.resolve({projectId:decodeURIComponent(project)})}):req.method==='DELETE'?projectMcpDelete():projectMcpGet()):
    url.pathname==='/api/mcp'&&req.method==='POST'?await legacyMcp(request):new Response(null,{status:404});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  }catch{res.writeHead(500).end();}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,base:`http://127.0.0.1:${(server.address() as {port:number}).port}`};
}

async function assign(store:Store,actor:Actor,projectId:string,agentId:string){
 const command=async(body:Record<string,unknown>)=>store.executeCommand({...body,requestId:randomUUID(),expectedVersion:(await store.getProject(projectId)).version},actor,projectId);
 const created=await command({type:'createSpec',content:{title:'Hosted work',goal:'Read the assigned scope.',dod:[{id:'reviewed',text:'Human review.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
 const spec=created.state.specs[0],revision=created.state.revisions[0];
 await command({type:'activateRevision',specId:spec.id,revisionId:revision.id});
 return (await command({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId})).state.executions[0];
}

test('R03 issued hosted-project MCP URL connects real HTTP and stdio clients and retains project scope',async()=>{
 const previous=globalStore.__ouroStore,store=await createStore({dataDir:'memory://',seedEvents:[]}),clients:Client[]=[];
 globalStore.__ouroStore=Promise.resolve(store);
 let server:Server|undefined;
 try{
  const account=(await store.createAccount({email:'hosted-mcp-owner@example.com',name:'Owner',password},operator)).account;
  const owner:Actor={id:account.id,kind:'human',name:account.name,projectIds:[]};
  const project=await store.createProject({name:'Hosted project'},owner),foreign=await store.createProject({name:'Other hosted project'},owner);
  owner.projectIds=[project.id,foreign.id];
  const session=await store.authenticate(account.email,password,'hosted-mcp-regression');assert(session);
  const listener=await listen();server=listener.server;
  const response=await createAgent(new Request(`${listener.base}/api/agents`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`ouro_user_session=${session.token}`,'X-Ouro-Project-Id':project.id},body:JSON.stringify({name:'Hosted MCP agent'})}));
  assert.equal(response.status,201,await response.clone().text());
  const issued=await response.json() as Registration;
  assert.equal(issued.connection.projectId,project.id);
  assert.equal(issued.connection.httpUrl,`${listener.base}/api/projects/${project.id}/mcp`);
  assert.equal(await store.getWorkspaceProject(project.id),null);
  const execution=await assign(store,owner,project.id,issued.agent.id);
  const http=new Client({name:'hosted-http-regression',version:'1'});clients.push(http);
  await http.connect(new StreamableHTTPClientTransport(new URL(issued.connection.httpUrl),{requestInit:{headers:{Authorization:`Bearer ${issued.token}`}}}));
  const inventory=await http.listTools();assert.equal(inventory.tools.length,18);
  const context=await http.callTool({name:'ouro.get_context',arguments:{executionId:execution.id}});
  assert.notEqual(context.isError,true,JSON.stringify(context));
  assert.equal(((context.structuredContent as ContextOutput)?.project as {id:string}).id,project.id);
  assert.equal(((context.structuredContent as ContextOutput)?.work as {execution:{id:string}}[])[0].execution.id,execution.id);
  assert.equal((context.structuredContent as ContextOutput)?.workspace,undefined);
  const file=await http.callTool({name:'ouro.read_workspace_file',arguments:{executionId:execution.id,path:'README.md'}});
  assert.equal(file.isError,true);assert.equal(((file.structuredContent as AgentErrorBody)?.error as {code:string}).code,'NOT_AVAILABLE');
  const stdio=new Client({name:'hosted-stdio-regression',version:'1'});clients.push(stdio);
  await stdio.connect(new StdioClientTransport({command:issued.connection.stdioCommand,args:issued.connection.stdioArgs,env:{...getDefaultEnvironment(),...(process.versions.electron?{ELECTRON_RUN_AS_NODE:'1'}:{}),OURO_URL:issued.connection.httpUrl,OURO_PROJECT_ID:issued.connection.projectId,OURO_AGENT_TOKEN:issued.token},stderr:'pipe'}));
  const bridged=await stdio.callTool({name:'ouro.get_context',arguments:{executionId:execution.id}});
  assert.notEqual(bridged.isError,true,JSON.stringify(bridged));assert.equal(((bridged.structuredContent as ContextOutput)?.project as {id:string}).id,project.id);
  const initialize=JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'scope-regression',version:'1'}}});
  const initHeaders={'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${issued.token}`};
  const denied=await fetch(`${listener.base}/api/projects/${foreign.id}/mcp`,{method:'POST',headers:initHeaders,body:initialize});assert.equal(denied.status,401);
  const missing=await fetch(`${listener.base}/api/projects/${randomUUID()}/mcp`,{method:'POST',headers:initHeaders,body:initialize});assert.equal(missing.status,404);
  await store.revokeAgent(issued.agent.id,owner,project.id);
  const revoked=await fetch(issued.connection.httpUrl,{method:'POST',headers:initHeaders,body:initialize});assert.equal(revoked.status,401);
 }finally{
  for(const client of clients)await client.close().catch(()=>{});
  if(server)await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
  if(previous===undefined)delete globalStore.__ouroStore;else globalStore.__ouroStore=previous;
  await store.close();
 }
});

test('R03 scoped folder MCP keeps file binding while legacy MCP remains usable',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path');
 const previous=globalStore.__ouroStore,store=await createStore({dataDir:'memory://',seedEvents:[]}),clients:Client[]=[];
 const directory=await mkdtemp(path.join(tmpdir(),'ouro-hosted-mcp-compat-'));
 globalStore.__ouroStore=Promise.resolve(store);
 let server:Server|undefined;
 try{
  await writeFile(path.join(directory,'README.md'),'Bound folder only\n');
  const project=(await store.createWorkspaceProject({requestId:randomUUID(),rootPath:directory,name:'Folder compatibility'},operator)).project;
  const folderStore=await store.forProject(project.id),folderOwner={...operator,projectIds:[project.id]};
  const folderAgent=await folderStore.createAgent('Folder agent',folderOwner),legacyAgent=await store.createAgent('Legacy agent',operator);
  const folderExecution=await assign(store,folderOwner,project.id,folderAgent.agent.id),legacyExecution=await assign(store,operator,PROJECT_ID,legacyAgent.agent.id);
  const listener=await listen();server=listener.server;
  const folderClient=new Client({name:'folder-route-compatibility',version:'1'});clients.push(folderClient);
  await folderClient.connect(new StreamableHTTPClientTransport(new URL(`${listener.base}/api/projects/${project.id}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${folderAgent.token}`}}}));
  const file=await folderClient.callTool({name:'ouro.read_workspace_file',arguments:{executionId:folderExecution.id,path:'README.md'}});
  assert.notEqual(file.isError,true,JSON.stringify(file));assert.equal((file.structuredContent as WorkspaceFileOutput)?.text,'Bound folder only\n');assert.equal((file.structuredContent as WorkspaceFileOutput)?.projectId,project.id);
  const legacyClient=new Client({name:'legacy-route-compatibility',version:'1'});clients.push(legacyClient);
  await legacyClient.connect(new StreamableHTTPClientTransport(new URL(`${listener.base}/api/mcp`),{requestInit:{headers:{Authorization:`Bearer ${legacyAgent.token}`}}}));
  const context=await legacyClient.callTool({name:'ouro.get_context',arguments:{executionId:legacyExecution.id}});
  assert.notEqual(context.isError,true,JSON.stringify(context));assert.equal(((context.structuredContent as ContextOutput)?.project as {id:string}).id,PROJECT_ID);
  const foreign=await legacyClient.callTool({name:'ouro.get_context',arguments:{executionId:folderExecution.id}});
  assert.equal(foreign.isError,true);assert.equal(((foreign.structuredContent as AgentErrorBody)?.error as {code:string}).code,'FORBIDDEN');
 }finally{
  for(const client of clients)await client.close().catch(()=>{});
  if(server)await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
  if(previous===undefined)delete globalStore.__ouroStore;else globalStore.__ouroStore=previous;
  await store.close();await rm(directory,{recursive:true,force:true});
 }
});
