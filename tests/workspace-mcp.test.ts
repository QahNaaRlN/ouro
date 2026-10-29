import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {replay,PROJECT_ID,AGENT_ID,type Actor} from '../packages/core/src';
import {createAgentService,type AgentStore,type AgentWorkspace} from '../packages/mcp/src/agent-service';
import {authenticatedAgent} from '../lib/auth';
import {connectionConfig} from '../lib/connection-config';
import {createStore} from '../lib/store';
import {createProjectMcpHandler} from '../packages/mcp/src/http';

test('PW05 project-bound MCP context authorizes its configured project without default-project privilege',async()=>{
 const projectId='workspace-project-a',actor:Actor={id:'agent-a',kind:'agent',projectIds:[projectId]},state=replay([],projectId);
 const store:AgentStore={async getProject(){return state;},async getEvents(){return {events:[],cursor:0};},async executeCommand(){throw new Error('Read-only test cannot write');}};
 const service=createAgentService({store,actor,projectId} as Parameters<typeof createAgentService>[0]);
 const context=await service.callTool('ouro.get_context',{});assert.notEqual(context.isError,true,JSON.stringify(context));assert.equal((context.structuredContent.project as {id:string}).id,projectId);
 const foreign=createAgentService({store,actor:{...actor,projectIds:['workspace-project-b']},projectId} as Parameters<typeof createAgentService>[0]);
 assert.equal((await foreign.callTool('ouro.get_context',{})).isError,true);
});

test('PW05/PW07/PW09 official HTTP and stdio clients stay project-bound while reading files and reporting human-governed work',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ouro-workspace-mcp-')),owner=await createStore({dataDir:'memory://',seedEvents:[]});
 const operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]},clients:Client[]=[];
 let listener:ReturnType<typeof createServer>|undefined;
 try{
  const folderA=path.join(directory,'alpha'),folderB=path.join(directory,'beta');await mkdir(folderA);await mkdir(folderB);
  const text='Project alpha source\n';await writeFile(path.join(folderA,'README.md'),text);await writeFile(path.join(folderB,'README.md'),'Project beta source\n');
  await writeFile(path.join(folderA,'.env'),'PRIVATE_WORKSPACE_SECRET');await writeFile(path.join(folderA,'binary.bin'),Buffer.from([0,255,1]));await writeFile(path.join(folderA,'oversize.txt'),'x'.repeat(131073));
  const outside=path.join(directory,'outside.txt');await writeFile(outside,'PRIVATE_OUTSIDE');await symlink(outside,path.join(folderA,'linked.txt'));
  const projectA=(await owner.createWorkspaceProject({requestId:randomUUID(),rootPath:folderA,name:'Alpha'},operator)).project;
  const projectB=(await owner.createWorkspaceProject({requestId:randomUUID(),rootPath:folderB,name:'Beta'},operator)).project;
  const storeA=await owner.forProject(projectA.id),storeB=await owner.forProject(projectB.id),humanA={...operator,projectIds:[projectA.id]},humanB={...operator,projectIds:[projectB.id]};
  const registrationA=await storeA.createAgent('ChatGPT Alpha',humanA),registrationB=await storeB.createAgent('ChatGPT Beta',humanB);
  const content={title:'Inspect the selected project',goal:'Read the project file and present a result.',dod:[{id:'checked',text:'The human checks the result.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'README.md',comment:''};
  const humanCommand=async(store:typeof storeA,actor:Actor,data:Record<string,unknown>)=>store.executeCommand({...data,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},actor);
  const assignedA=await humanCommand(storeA,humanA,{type:'startProjectWork',agentId:registrationA.agent.id,content}),assignedB=await humanCommand(storeB,humanB,{type:'startProjectWork',agentId:registrationB.agent.id,content});
  const executionA=assignedA.state.executions[0],executionB=assignedB.state.executions[0];
  const handler=createProjectMcpHandler(async id=>{
   assert(await owner.getWorkspaceProject(id));return {store:await owner.forProject(id)};
  });
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
  const http=new Client({name:'workspace-http-acceptance',version:'1'});clients.push(http);
  await http.connect(new StreamableHTTPClientTransport(new URL(urlA),{requestInit:{headers:{Authorization:`Bearer ${registrationA.token}`,Cookie:'ouro_participant=changed-in-browser'}}}));
  const tools=await http.listTools();assert.equal(tools.tools.length,18);assert(tools.tools.find(tool=>tool.name==='ouro.read_workspace_file')?.outputSchema);
  const context=await http.callTool({name:'ouro.get_context',arguments:{executionId:executionA.id}});assert.notEqual(context.isError,true,JSON.stringify(context));
  const body=context.structuredContent as any;assert.equal(body.project.id,projectA.id);assert.equal(body.workspace.folderName,'alpha');assert.equal(body.workspace.capabilities.readOnlyFiles,true);assert(!JSON.stringify(context).includes(folderA));assert.equal(body.work[0].execution.state,'queued');
  const listing=await http.callTool({name:'ouro.list_workspace_files',arguments:{executionId:executionA.id}});assert.notEqual(listing.isError,true,JSON.stringify(listing));assert((listing.structuredContent as any).entries.some((entry:any)=>entry.path==='README.md'));assert(!JSON.stringify(listing).includes('.env'));assert(!JSON.stringify(listing).includes('linked.txt'));
  const file=await http.callTool({name:'ouro.read_workspace_file',arguments:{executionId:executionA.id,path:'README.md'}});assert.notEqual(file.isError,true,JSON.stringify(file));assert.equal((file.structuredContent as any).text,text);assert.equal((file.structuredContent as any).sha256,createHash('sha256').update(text).digest('hex'));assert.equal((file.structuredContent as any).projectId,projectA.id);
  for(const filePath of ['../outside.txt',outside,'.env','linked.txt','binary.bin','oversize.txt','C:\\outside.txt']){
   const denied=await http.callTool({name:'ouro.read_workspace_file',arguments:{executionId:executionA.id,path:filePath}});assert.equal(denied.isError,true,filePath);assert(!JSON.stringify(denied).includes('PRIVATE_'));
  }
  const foreign=await http.callTool({name:'ouro.read_workspace_file',arguments:{executionId:executionB.id,path:'README.md'}});assert.equal(foreign.isError,true);assert.equal((foreign.structuredContent as any).error.code,'FORBIDDEN');
  const rawBody=JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'wrong-project',version:'1'}}});
  for(const headers of [{Authorization:`Bearer ${registrationA.token}`},{Cookie:'ouro_session=not-an-agent'}] as Record<string,string>[]){
   const denied=await fetch(urlB,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...headers},body:rawBody});assert.equal(denied.status,401);
  }
  const changed=await fetch(urlA,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${registrationA.token}`,'X-Ouro-Expected-Project':projectB.id},body:rawBody});assert.equal(changed.status,409);
  const keyFile=path.join(directory,'beta-agent-key');await writeFile(keyFile,registrationB.token,{mode:0o600});
  const stdio=new Client({name:'workspace-stdio-acceptance',version:'1'});clients.push(stdio);
  await stdio.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/mcp/bin/ouro-mcp.mjs')],env:{PATH:process.env.PATH??'',OURO_URL:urlB,OURO_AGENT_TOKEN_FILE:keyFile},stderr:'pipe'}));
  const stdioTools=await stdio.listTools();assert.equal(stdioTools.tools.length,18);
  const betaFile=await stdio.callTool({name:'ouro.read_workspace_file',arguments:{executionId:executionB.id,path:'README.md'}});assert.notEqual(betaFile.isError,true,JSON.stringify(betaFile));assert.equal((betaFile.structuredContent as any).text,'Project beta source\n');assert.equal((betaFile.structuredContent as any).projectId,projectB.id);
  const stillAlpha=await http.callTool({name:'ouro.get_context',arguments:{executionId:executionA.id}});assert.equal((stillAlpha.structuredContent as any).project.id,projectA.id);
  const call=async(name:string,args:Record<string,unknown>)=>{const result=await http.callTool({name,arguments:{executionId:executionA.id,requestId:randomUUID(),expectedVersion:(await storeA.getProject()).version,...args}});assert.notEqual(result.isError,true,JSON.stringify(result));return result.structuredContent as any;};
  await call('ouro.confirm_started',{});
  const opened=await call('ouro.report_question',{title:'Choose the source',context:'Human authority is required.',question:'May the README be used?',blockingScope:'execution'}),request=opened.requests.at(-1);
  assert.equal(opened.execution.state,'waiting_for_human');
  await humanCommand(storeA,humanA,{type:'resolveDecision',decisionRequestId:request.id,specRevisionId:executionA.specRevisionId,outcome:{kind:'answer',answer:'Use the selected project README.'}});
  await call('ouro.confirm_decision_applied',{decisionRequestId:request.id,evidence:'test://workspace/answer-applied'});await humanCommand(storeA,humanA,{type:'resumeExecution',executionId:executionA.id});await call('ouro.confirm_resumed',{});await call('ouro.complete_execution',{result:'succeeded',evidence:'test://workspace/result'});
  assert.notEqual((await storeA.getProject()).specs[0].state,'done');assert.equal((await storeB.getProject()).executions[0].state,'queued');
 }finally{
  for(const client of clients.reverse())await client.close();
  if(listener)await new Promise<void>(resolve=>listener!.close(()=>resolve()));
  await owner.close();await rm(directory,{recursive:true,force:true});
 }
});

test('PW05 legacy env-agent credential stays on the default project and selected-store auth never uses browser cookies',async()=>{
 const previous=process.env.OURO_AGENT_TOKEN;process.env.OURO_AGENT_TOKEN='workspace-legacy-test-key';
 try{
  const request=new Request('http://127.0.0.1/api/projects/new-project/mcp',{headers:{authorization:'Bearer workspace-legacy-test-key',cookie:'ouro_session=invalid; ouro_participant=invalid'}});
  await assert.rejects(authenticatedAgent(request,'new-project',AGENT_ID),/проект|ключ|Ключ/);
  assert.equal((await authenticatedAgent(request,PROJECT_ID,AGENT_ID)).id,AGENT_ID);
  let resolved=0;const resolver=async(token:string)=>{resolved++;return token==='scoped-key'?{id:'scoped-agent',kind:'agent' as const,projectIds:['new-project']}:null;};
  const scoped=new Request(request.url,{headers:{authorization:'Bearer scoped-key',cookie:'ouro_participant=invalid'}});
  const authenticate=authenticatedAgent as (...args:any[])=>Promise<Actor>;
  assert.equal((await authenticate(scoped,'new-project',AGENT_ID,resolver)).id,'scoped-agent');assert.equal(resolved,1);
  await assert.rejects(authenticate(new Request(request.url,{headers:{cookie:'ouro_session=not-an-agent'}}),'new-project',AGENT_ID,resolver));assert.equal(resolved,1);
 }finally{if(previous===undefined)delete process.env.OURO_AGENT_TOKEN;else process.env.OURO_AGENT_TOKEN=previous;}
});

test('PW05 connection configuration pins explicit projects while preserving the legacy endpoint',()=>{
 const request=new Request('http://127.0.0.1:3000/api/projects/new-project/agents');
 const config=(connectionConfig as (...args:any[])=>ReturnType<typeof connectionConfig>)(request,'new-project');
 assert.equal(config.httpUrl,'http://127.0.0.1:3000/api/projects/new-project/mcp');assert.equal(config.projectId,'new-project');
 assert.equal(connectionConfig(request).httpUrl,'http://127.0.0.1:3000/api/mcp');
});

test('PW07 file tools check assignment before touching workspace metadata or filesystem and require a folder',async()=>{
 const projectId='workspace-files-project',actor:Actor={id:'agent-a',kind:'agent',projectIds:[projectId]},state=replay([],projectId);
 state.specs.push({id:'spec',projectId,humanId:'PW-1',title:'Read assigned input',state:'in_progress',activeRevisionId:'revision',revisionIds:['revision']});
 state.revisions.push({id:'revision',specId:'spec',revision:1,title:'Read assigned input',goal:'Inspect the chosen folder.',dod:[{id:'read',text:'Read evidence.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',createdAt:'2026-10-29T00:00:00Z',authorId:'local-human'});
 state.executions.push({id:'own',specId:'spec',specRevisionId:'revision',agentId:actor.id,state:'queued',kind:'primary'},{id:'foreign',specId:'spec',specRevisionId:'revision',agentId:'other-agent',state:'queued',kind:'primary'});
 const seen:string[]=[],workspace:AgentWorkspace={
  async getMetadata(){seen.push('metadata');return {name:'Selected project',projectId,bindingId:'binding',folderName:'source',capabilities:{readOnlyFiles:true}};},
  async listFiles(){seen.push('list');return {path:'',entries:[{name:'README.md',path:'README.md',kind:'file',size:5}],nextCursor:null,truncated:false};},
  async readFile(){seen.push('read');return {path:'README.md',text:'Hello',sha256:'a'.repeat(64),size:5,modifiedAt:'2026-10-29T00:00:00Z'};},
 };
 const store:AgentStore={async getProject(){return state;},async getEvents(){return {events:[],cursor:0};},async executeCommand(){throw new Error('Read-only file tools cannot write');}};
 const service=createAgentService({store,actor,projectId,workspace});
 for(const name of ['ouro.list_workspace_files','ouro.read_workspace_file']){
  const denied=await service.callTool(name,{executionId:'foreign',path:'README.md'});assert.equal(denied.isError,true);assert.equal((denied.structuredContent.error as {code:string}).code,'FORBIDDEN');
 }
 assert.deepEqual(seen,[]);
 const read=await service.callTool('ouro.read_workspace_file',{executionId:'own',path:'README.md'});assert.notEqual(read.isError,true,JSON.stringify(read));assert.equal(read.structuredContent.text,'Hello');assert.deepEqual(seen,['metadata','read']);
 const unavailable=await createAgentService({store,actor,projectId}).callTool('ouro.list_workspace_files',{executionId:'own'});assert.equal(unavailable.isError,true);assert.equal((unavailable.structuredContent.error as {code:string}).code,'NOT_AVAILABLE');
});
