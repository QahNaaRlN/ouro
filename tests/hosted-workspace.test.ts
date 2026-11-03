import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStore,type Store} from '../lib/store';
import {PROJECT_ID,type Actor,type RevisionContent} from '../packages/core/src';
import {GET as readWorkspace} from '../app/api/projects/[projectId]/route';
import {POST as command} from '../app/api/projects/[projectId]/commands/route';
import {GET as readAgents,POST as registerAgent} from '../app/api/projects/[projectId]/agents/route';
import {POST as assignTask} from '../app/api/projects/[projectId]/tasks/route';
import {GET as stream} from '../app/api/projects/[projectId]/stream/route';
import {POST as observe} from '../app/api/projects/[projectId]/verification/observe/route';
import {POST as run} from '../app/api/projects/[projectId]/verification/run/route';
import {GET as folders} from '../app/api/workspace/folders/route';
import {GET as catalog,POST as createProject} from '../app/api/projects/route';
import {issueLocalSession} from '../lib/auth';
import {createAgentService} from '../packages/mcp/src/agent-service';

const globals=globalThis as typeof globalThis&{__ouroStore?:Promise<Store>};
const operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]},password='correct horse battery staple';
const content:RevisionContent={title:'Hosted assigned work',goal:'Use the accepted workspace without server filesystem access.',dod:[{id:'safe',text:'Only current project members can act.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
const params=(projectId:string)=>({params:Promise.resolve({projectId})});
const hasCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;

async function fixture(){
 const previous=globals.__ouroStore,env=Object.fromEntries(['OURO_DEPLOYMENT_MODE','OURO_LOCAL_DEMO','OURO_PUBLIC_URL'].map(name=>[name,process.env[name]]));
 const invitations:{email:string;code:string}[]=[],store=await createStore({dataDir:'memory://',seedEvents:[],mailer:{sendInvitation:async input=>{invitations.push(input)},sendPasswordReset:async()=>{}}});
 globals.__ouroStore=Promise.resolve(store);process.env.OURO_DEPLOYMENT_MODE='cloud';process.env.OURO_LOCAL_DEMO='0';process.env.OURO_PUBLIC_URL='https://ouro.example.com';
 const ownerAccount=(await store.createAccount({email:'workspace-owner@example.com',name:'Workspace owner',password},operator)).account;
 const owner:Actor={id:ownerAccount.id,kind:'human',name:ownerAccount.name,projectIds:[]};
 const first=await store.createProject({name:'Closed cloud project'},owner),second=await store.createProject({name:'Other private project'},owner);owner.projectIds=[first.id,second.id];
 const login=await store.authenticate(ownerAccount.email,password);assert(login);
 const members=[];
 for(const role of ['Contributor','Viewer'] as const){
  const email=role.toLowerCase()+'@example.com';await store.createInvitation(first.id,{email,role},owner);
  const accepted=await store.acceptInvitation(invitations.find(item=>item.email===email)!.code,{name:role,password});
  const session=await store.resolveSession(accepted.token);assert(session);members.push({role,actor:session.actor,token:accepted.token,membership:accepted.membership});
 }
 const request=(path:string,token:string,body?:unknown,headers:Record<string,string>={})=>new Request('https://ouro.example.com'+path,{method:body===undefined?'GET':'POST',headers:{host:'ouro.example.com',cookie:'ouro_user_session='+token,...(body===undefined?{}:{'Content-Type':'application/json',origin:'https://ouro.example.com'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {store,owner,first,second,ownerToken:login.token,contributor:members[0],viewer:members[1],request,close:async()=>{if(previous===undefined)delete globals.__ouroStore;else globals.__ouroStore=previous;for(const [name,value]of Object.entries(env))if(value===undefined)delete process.env[name];else process.env[name]=value;await store.close();}};
}

test('hosted workspace reads preserve membership isolation and expose no local paths or seed data',async()=>{
 const f=await fixture();
 try{
  for(const member of [{token:f.ownerToken},f.contributor,f.viewer]){
   const response=await readWorkspace(f.request('/api/projects/'+f.first.id,member.token),params(f.first.id));assert.equal(response.status,200,await response.clone().text());
   const body=await response.json();assert.equal(body.project.kind,'hosted');assert.equal(body.project.rootPath,null);assert.equal(body.project.rootIdentity,null);assert.equal(body.project.bindingId,null);
   assert.equal(body.state.projectId,f.first.id);assert.equal(body.cursor,0);assert.deepEqual(body.state.events,[]);assert.deepEqual(body.state.specs,[]);
   assert.equal(body.connection.stdioCommand,'');assert.deepEqual(body.connection.stdioArgs,[]);assert.equal(body.connection.localBridgeRequired,true);assert.equal(body.connection.httpUrl,'https://ouro.example.com/api/projects/'+f.first.id+'/mcp');
  }
  const listed=await catalog(f.request('/api/projects',f.viewer.token));assert.deepEqual((await listed.json()).projects.map((item:{id:string})=>item.id),[f.first.id]);
  const foreign='/api/projects/'+f.second.id;
  for(const response of [await readWorkspace(f.request(foreign,f.viewer.token),params(f.second.id)),await readAgents(f.request(foreign+'/agents',f.viewer.token),params(f.second.id)),await stream(f.request(foreign+'/stream',f.viewer.token),params(f.second.id))]){
   assert.equal(response.status,401);assert(!JSON.stringify(await response.json()).includes('Other private project'));
  }
  const changed=await readWorkspace(f.request('/api/projects/'+f.first.id,f.ownerToken,undefined,{'X-Ouro-Expected-Project':f.second.id}),params(f.first.id));assert.equal(changed.status,409);
  const participant=await readWorkspace(f.request('/api/projects/'+f.first.id,f.ownerToken,undefined,{'X-Ouro-Expected-Participant':f.viewer.actor.id}),params(f.first.id));assert.equal(participant.status,401);
 }finally{await f.close()}
});

test('anonymous cloud catalog requires an account while Host and authenticated mutation Origin remain exact',async()=>{
 const f=await fixture();
 try{
  const request=(method:'GET'|'POST',headers:Record<string,string>={})=>new Request('https://ouro.example.com/api/projects',{method,headers:{host:'ouro.example.com',...(method==='POST'?{'content-type':'application/json',origin:'https://ouro.example.com'}:{}),...headers},...(method==='POST'?{body:JSON.stringify({name:'Must not be created'})}:{})});
  for(const response of [await catalog(request('GET')),await createProject(request('POST'))]){
   assert.equal(response.status,401);const body=await response.json();assert.equal(body.error.code,'UNAUTHENTICATED');assert.deepEqual(Object.keys(body),['error']);
   assert(!JSON.stringify(body).includes(f.first.name));assert(!JSON.stringify(body).includes('workspace-owner@example.com'));
  }
  assert.equal((await catalog(request('GET',{host:'attacker.invalid'}))).status,403);
  assert.equal((await createProject(request('POST',{host:'attacker.invalid'}))).status,403);
  assert.equal((await createProject(request('POST',{cookie:'ouro_user_session='+f.ownerToken,origin:'https://attacker.invalid'}))).status,403);
  assert.equal((await folders(new Request('https://ouro.example.com/api/workspace/folders',{headers:{host:'ouro.example.com'}}))).status,403);
  assert.equal((await f.store.listProjects(f.owner)).length,2,'Denied anonymous/origin requests cannot create projects');
 }finally{await f.close()}
});

test('hosted workspace Owner manages agents, Contributor assigns exact work, Viewer and revoked members cannot write',async()=>{
 const f=await fixture();
 try{
  const base='/api/projects/'+f.first.id;
  for(const member of [f.contributor,f.viewer])assert.equal((await registerAgent(f.request(base+'/agents',member.token,{name:'Denied'}),params(f.first.id))).status,403);
  const issued=await registerAgent(f.request(base+'/agents',f.ownerToken,{name:'Cloud agent'}),params(f.first.id));assert.equal(issued.status,201);const registration=await issued.json(),agent=registration.agent;
  const task={requestId:randomUUID(),expectedVersion:0,agentId:agent.id,content};
  assert.equal((await assignTask(f.request(base+'/tasks',f.viewer.token,task),params(f.first.id))).status,403);
  const assigned=await assignTask(f.request(base+'/tasks',f.contributor.token,task),params(f.first.id));assert.equal(assigned.status,200,await assigned.clone().text());const result=await assigned.json();
  assert.equal(result.state.executions.length,1);assert.equal(result.state.executions[0].state,'queued');assert(result.events.every((event:{actor:Actor;projectId:string})=>event.actor.id===f.contributor.actor.id&&event.projectId===f.first.id));
  const retry=await assignTask(f.request(base+'/tasks',f.contributor.token,task),params(f.first.id));assert.equal(retry.status,200);assert.equal((await retry.json()).replayed,true);
  const agentActor=await f.store.authenticateAgentToken(registration.token);assert(agentActor);
  const service=createAgentService({actor:agentActor,projectId:f.first.id,store:{getProject:()=>f.store.getProject(f.first.id,agentActor),getEvents:after=>f.store.getEvents(after,f.first.id,agentActor),executeCommand:(body,actor)=>f.store.executeCommand(body,actor,f.first.id)}});
  const context=await service.callTool('ouro.get_context',{executionId:result.state.executions[0].id});assert.equal(context.isError,undefined);assert.equal(context.structuredContent.workspace,undefined);
  const capabilities=(context.structuredContent.contract as {capabilities:string[]}).capabilities;assert(!capabilities.includes('verification.local-runner.v1'));assert(!capabilities.includes('verification.observation.v1'));
  const unsupported=await service.callTool('ouro.get_context',{executionId:result.state.executions[0].id,requiredCapabilities:['verification.local-runner.v1']});assert.equal(unsupported.isError,true);assert.equal((unsupported.structuredContent.error as {code:string}).code,'UNSUPPORTED_CAPABILITY');
  const file=await service.callTool('ouro.read_workspace_file',{executionId:result.state.executions[0].id,path:'README.md'});assert.equal(file.isError,true);assert.equal((file.structuredContent.error as {code:string}).code,'NOT_AVAILABLE');
  const spoofed={type:'createSpec',requestId:randomUUID(),expectedVersion:result.cursor,content,actor:f.owner};
  assert.equal((await command(f.request(base+'/commands',f.viewer.token,spoofed),params(f.first.id))).status,403);
  await f.store.changeMemberRole(f.first.id,f.contributor.membership.id,'Viewer',f.owner);
  assert.equal((await assignTask(f.request(base+'/tasks',f.contributor.token,task),params(f.first.id))).status,403,'A saved receipt cannot retain revoked write authority');
  await f.store.revokeMember(f.first.id,f.contributor.membership.id,f.owner);
  assert.equal((await readWorkspace(f.request(base,f.contributor.token),params(f.first.id))).status,401);
  assert.equal((await stream(f.request(base+'/stream',f.contributor.token),params(f.first.id))).status,401);
  assert.deepEqual((await f.store.getProject(f.second.id,f.owner)).events,[]);
 }finally{await f.close()}
});

test('an open hosted SSE subscription stops at membership revocation and cannot deliver subsequent facts',async()=>{
 const f=await fixture();
 try{
  const response=await stream(f.request('/api/projects/'+f.first.id+'/stream',f.viewer.token),params(f.first.id));assert.equal(response.status,200);
  const reader=response.body!.getReader();const first=await reader.read();assert(!first.done);assert(new TextDecoder().decode(first.value).includes('event: snapshot'));
  await f.store.revokeMember(f.first.id,f.viewer.membership.id,f.owner);
  await f.store.executeCommand({type:'createSpec',content:{...content,title:'After revoked access'},requestId:randomUUID(),expectedVersion:0},f.owner,f.first.id);
  await assert.rejects(reader.read(),/Подписка недоступна/);
  await reader.cancel().catch(()=>{});
 }finally{await f.close()}
});

test('cloud workspace denies local folders, observation and execution, including direct command bypasses',async()=>{
 const f=await fixture();
 try{
  const base='/api/projects/'+f.first.id;
  assert.equal((await folders(f.request('/api/workspace/folders',f.ownerToken))).status,403);
  assert.equal((await createProject(f.request('/api/projects',f.ownerToken,{rootPath:'C:\\private',name:'Cannot attach',requestId:randomUUID()}))).status,422);
  assert.equal((await observe(f.request(base+'/verification/observe',f.ownerToken,{}),params(f.first.id))).status,403);
  assert.equal((await run(f.request(base+'/verification/run',f.ownerToken,{}),params(f.first.id))).status,403);
  const scoped=await f.store.forProject(f.first.id);
  await assert.rejects(scoped.observeVerification({},f.owner),hasCode('FORBIDDEN'));
  await assert.rejects(scoped.runVerification({},f.owner),hasCode('FORBIDDEN'));
  const result=await command(f.request(base+'/commands',f.ownerToken,{type:'configureVerificationObservation',requestId:randomUUID(),expectedVersion:0}),params(f.first.id));assert.equal(result.status,403);
  assert.equal((await f.store.getProject(f.first.id,f.owner)).version,0);
 }finally{await f.close()}
});

test('local folder workspace remains available to its loopback operator without cloud accounts',async()=>{
 const previous=globals.__ouroStore,oldDemo=process.env.OURO_LOCAL_DEMO,oldMode=process.env.OURO_DEPLOYMENT_MODE,oldUrl=process.env.OURO_PUBLIC_URL;
 const folder=await mkdtemp(join(tmpdir(),'ouro-hosted-local-regression-')),store=await createStore({dataDir:'memory://',seedEvents:[]});globals.__ouroStore=Promise.resolve(store);
 process.env.OURO_LOCAL_DEMO='1';delete process.env.OURO_DEPLOYMENT_MODE;delete process.env.OURO_PUBLIC_URL;
 try{
  const project=(await store.createWorkspaceProject({requestId:randomUUID(),name:'Local preserved',rootPath:folder},operator)).project;
  const url='http://127.0.0.1:3509/api/projects/'+project.id,token=issueLocalSession(new Request(url));
  const response=await readWorkspace(new Request(url,{headers:{cookie:'ouro_session='+token}}),params(project.id));assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.project.kind,'folder');assert.equal(body.project.rootPath,folder);assert.equal(body.project.role,'Owner');assert.equal(body.connection.localBridgeRequired,undefined);
 }finally{
  if(previous===undefined)delete globals.__ouroStore;else globals.__ouroStore=previous;
  for(const [name,value]of [['OURO_LOCAL_DEMO',oldDemo],['OURO_DEPLOYMENT_MODE',oldMode],['OURO_PUBLIC_URL',oldUrl]])if(value===undefined)delete process.env[name!];else process.env[name!]=value;
  await store.close();await rm(folder,{recursive:true,force:true});
 }
});
