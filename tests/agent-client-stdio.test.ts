import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import type {ContextOutput,WorkspaceFileOutput} from '@ouro/protocol';
import {PROJECT_ID,type Actor} from '../packages/core/src';
import {createStore} from '../lib/store';
import {buildAgentClientConfig,type AgentClientId} from '../lib/agent-client-config';
import {createProjectMcpHandler} from '../packages/mcp/src/http';

test('CO03 generated Cursor and Claude entries launch the actual bridge with separate identities and one immutable project scope',{timeout:45000},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"ouro clients ' UTF8-данные "));
 const owner=await createStore({dataDir:'memory://',seedEvents:[]});
 const operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]},clients:Client[]=[];
 let listener:ReturnType<typeof createServer>|undefined;
 try{
  const rootA=path.join(directory,'selected source'),rootB=path.join(directory,'other source');await mkdir(rootA);await mkdir(rootB);
  const text='# Assigned source\nActual MCP reading, not an LLM run.\n';await writeFile(path.join(rootA,'README.md'),text);await writeFile(path.join(rootB,'PRIVATE.md'),'OTHER_PROJECT_ONLY');
  const projectA=(await owner.createWorkspaceProject({requestId:randomUUID(),name:'Selected clients project',rootPath:rootA},operator)).project;
  const projectB=(await owner.createWorkspaceProject({requestId:randomUUID(),name:'OTHER_PROJECT_ONLY',rootPath:rootB},operator)).project;
  const storeA=await owner.forProject(projectA.id),humanA={...operator,projectIds:[projectA.id]};
  const handler=createProjectMcpHandler(async id=>({store:await owner.forProject(id)}));
  listener=createServer(async(req,res)=>{
   try{
    const projectId=/^\/api\/projects\/([^/]+)\/mcp$/.exec(req.url??'')?.[1];if(!projectId){res.writeHead(404).end();return;}
    const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(', '):value);
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks).toString()}: {})});
    const response=await handler(request,decodeURIComponent(projectId));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
   }catch{res.writeHead(500).end();}
  });
  await new Promise<void>(resolve=>listener!.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(listener.address() as {port:number}).port}`,urlA=`${base}/api/projects/${projectA.id}/mcp`,urlB=`${base}/api/projects/${projectB.id}/mcp`;
  const connection={projectId:projectA.id,httpUrl:urlA,stdioCommand:process.execPath,stdioArgs:[path.resolve('packages/mcp/bin/ouro-mcp.mjs')]};
  const results:{client:Client;agentId:string;token:string;executionId:string;entry:{command:string;args:string[];env:Record<string,string>}}[]=[];
  for(const profile of ['cursor','claude-code','claude-desktop'] as AgentClientId[]){
   const issued=await storeA.createAgent(`${profile} technical SDK fixture`,humanA),keyFile=path.join(directory,`${profile} ' ключ.key`);await writeFile(keyFile,issued.token,{mode:0o600});
   const assigned=await storeA.executeCommand({type:'startProjectWork',requestId:randomUUID(),expectedVersion:(await storeA.getProject()).version,agentId:issued.agent.id,content:{title:`${profile}: inspect assigned context`,goal:'Report a checked source through the common contract.',dod:[{id:'human',text:'The human verifies the result.',required:true}],constraints:'Technical SDK fixture.',assumptions:'',risks:'',inputs:'README.md',comment:''}},humanA);
   const execution=assigned.state.executions.at(-1)!;
   const generated=buildAgentClientConfig({client:profile,connection,keyFile});
   assert(!JSON.stringify(generated).includes(issued.token));
   const entry=JSON.parse(JSON.stringify(generated.config)).mcpServers[generated.serverName] as {command:string;args:string[];env:Record<string,string>};
   const client=new Client({name:`generated-${profile}-acceptance`,version:'1'});clients.push(client);
   await client.connect(new StdioClientTransport({command:entry.command,args:entry.args,env:{...getDefaultEnvironment(),...entry.env},stderr:'pipe'}));
   const inventory=await client.listTools();assert.equal(inventory.tools.length,18);assert(inventory.tools.some(tool=>tool.name==='ouro.report_flow_step'));
   const resources=await client.listResources();assert(resources.resources.some(resource=>resource.uri==='ouro://protocol/manifest'));
   const context=await client.callTool({name:'ouro.get_context',arguments:{executionId:execution.id}}),body=context.structuredContent as ContextOutput;
   assert.notEqual(context.isError,true);assert.equal(body.project.id,projectA.id);assert.equal(body.agent.id,issued.agent.id);assert.equal(body.work.length,1);assert.equal(body.work[0].execution.state,'queued');assert(!JSON.stringify(context).includes('OTHER_PROJECT_ONLY'));
   const file=await client.callTool({name:'ouro.read_workspace_file',arguments:{executionId:execution.id,path:'README.md'}});assert.notEqual(file.isError,true);assert.equal((file.structuredContent as WorkspaceFileOutput).sha256,createHash('sha256').update(text).digest('hex'));
   const started=await client.callTool({name:'ouro.confirm_started',arguments:{executionId:execution.id,requestId:randomUUID(),expectedVersion:(await storeA.getProject()).version}});assert.notEqual(started.isError,true);
   assert.equal((await storeA.getProject()).executions.find(item=>item.id===execution.id)!.state,'running');
   results.push({client,agentId:issued.agent.id,token:issued.token,executionId:execution.id,entry});
  }
  assert.equal(new Set(results.map(result=>result.agentId)).size,3);
  const state=await storeA.getProject();assert.equal(state.events.filter(event=>event.type==='ExecutionStarted').length,3);assert(state.specs.every(spec=>spec.state!=='done'));
  assert.equal((await(await owner.forProject(projectB.id)).getProject()).version,1);
  const first=results[0],wrong=new Client({name:'generated-scope-negative',version:'1'});clients.push(wrong);
  const transport=new StdioClientTransport({command:first.entry.command,args:first.entry.args,env:{...getDefaultEnvironment(),...first.entry.env,OURO_URL:urlB},stderr:'pipe'});
  let diagnostic='';transport.stderr?.on('data',chunk=>{diagnostic+=String(chunk);});
  await assert.rejects(wrong.connect(transport));assert(!diagnostic.includes(first.token));assert(!diagnostic.includes('OTHER_PROJECT_ONLY'));
  await storeA.revokeAgent(first.agentId,humanA);
  const other=await results[1].client.callTool({name:'ouro.get_context',arguments:{executionId:results[1].executionId}});assert.notEqual(other.isError,true);assert.equal((other.structuredContent as ContextOutput).agent.id,results[1].agentId);
 }finally{
  for(const client of clients.reverse())await client.close();
  if(listener)await new Promise<void>(resolve=>listener!.close(()=>resolve()));
  await owner.close();await rm(directory,{recursive:true,force:true});
 }
});
