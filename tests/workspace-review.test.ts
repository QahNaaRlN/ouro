import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,link,rename,rm,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStore,type Store} from '../lib/store';
import {PROJECT_ID,replay,type Actor,type RevisionContent} from '../packages/core/src';
import {issueLocalSession} from '../lib/auth';
import {resolveWorkspaceFolder,listWorkspaceFiles,readWorkspaceFile} from '../lib/workspace-files';

const PROJECT_A='51111111-1111-4111-8111-111111111111';
const operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
const actorFor=(projectId:string):Actor=>({...operator,projectIds:[projectId]});
const content:RevisionContent={title:'Проверить папку проекта',goal:'Получить проверяемый результат в выбранном проекте.',dod:[{id:'checked',text:'Результат подтверждён человеком.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
const hasCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;
const safeFailure=(error:unknown)=>typeof(error as {code?:string}).code==='string'&&(error as {code:string}).code!=='UNKNOWN_COMMAND';

async function projects(){
 const base=await mkdtemp(path.join(tmpdir(),'ouro-workspace-review-')),rootA=path.join(base,'a'),rootB=path.join(base,'b');
 await mkdir(rootA);await mkdir(rootB);
 const owner=await createStore({dataDir:'memory://',seedEvents:[]});
 const inputA={requestId:crypto.randomUUID(),name:'Проект A',rootPath:rootA};
 const registeredA=await owner.createWorkspaceProject(inputA,operator),registeredB=await owner.createWorkspaceProject({requestId:crypto.randomUUID(),name:'Проект B',rootPath:rootB},operator);
 const a=await owner.forProject(registeredA.project.id),b=await owner.forProject(registeredB.project.id);
 return {base,rootA,rootB,owner,a,b,inputA,projectA:registeredA.project,projectB:registeredB.project,close:async()=>{await owner.close();await rm(base,{recursive:true,force:true});}};
}

test('PW-REVIEW01 an explicit store project never falls back to the legacy project',async()=>{
 const options={dataDir:'memory://',projectId:PROJECT_A,seedEvents:[]};
 const store=await createStore(options);
 try{
  const state=await store.getProject();
  assert.equal(state.projectId,PROJECT_A,'An explicitly selected project must retain its own scope');
  assert.equal(state.specs.length,0,'A new folder project must not receive the legacy teaching seed');
 }finally{await store.close();}
});

test('PW-REVIEW02 canonical projects share one owner but isolate initialization, keys and actor scope',async()=>{
 const f=await projects();
 try{
  assert.notEqual(f.projectA.id,f.projectB.id);
  const alias=path.join(f.base,'alias-a');await symlink(f.rootA,alias,'dir');
  const deduplicated=await f.owner.createWorkspaceProject({requestId:crypto.randomUUID(),name:'Другое имя alias',rootPath:alias},operator);
  assert.equal(deduplicated.project.id,f.projectA.id);assert.equal(deduplicated.created,false);
  assert.deepEqual(deduplicated.project.rootIdentity,f.projectA.rootIdentity);
  const [stateA,stateB,legacy]=await Promise.all([f.a.getProject(),f.b.getProject(),f.owner.getProject()]);
  for(const [state,id] of [[stateA,f.projectA.id],[stateB,f.projectB.id]] as const){
   assert.equal(state.projectId,id);assert.equal(state.specs.length,0);assert.equal(state.executions.length,0);
   assert.deepEqual(state.events.map(event=>event.type),['ProjectInitialized']);assert.deepEqual(replay(state.events,id),state);
  }
  assert.notEqual(stateA.roadmap.id,stateB.roadmap.id);assert.equal(legacy.specs.length,0);assert.equal(legacy.events.length,0);
  const registrationA=await f.a.createAgent('ChatGPT A',actorFor(f.projectA.id)),registrationB=await f.b.createAgent('ChatGPT B',actorFor(f.projectB.id));
  assert.deepEqual((await f.a.authenticateAgentToken(registrationA.token))?.projectIds,[f.projectA.id]);
  assert.equal(await f.b.authenticateAgentToken(registrationA.token),null);assert.equal(await f.a.authenticateAgentToken(registrationB.token),null);assert.equal(await f.owner.authenticateAgentToken(registrationA.token),null);
  await assert.rejects(f.a.listAgents(actorFor(f.projectB.id)),hasCode('FORBIDDEN'));
  await assert.rejects(f.b.executeCommand({type:'createSpec',content,requestId:crypto.randomUUID(),expectedVersion:stateB.version},actorFor(f.projectA.id)),hasCode('FORBIDDEN'));
  await assert.rejects(f.owner.createWorkspaceProject({requestId:crypto.randomUUID(),rootPath:f.rootA},{id:'legacy-participant',kind:'human',projectIds:[PROJECT_ID]}),hasCode('FORBIDDEN'));
  assert.equal((await f.b.getProject()).version,stateB.version);
  await assert.rejects(f.owner.forProject('52222222-2222-4222-8222-222222222222'),hasCode('NOT_FOUND'));
 }finally{await f.close();}
});

test('PW-REVIEW03 task and catalog receipts survive lost roots and newer versions without cross-project recovery',async()=>{
 const f=await projects();
 try{
  const humanA=actorFor(f.projectA.id),humanB=actorFor(f.projectB.id);
  const registration=await f.a.createAgent('ChatGPT A',humanA),foreign=await f.b.createAgent('ChatGPT B',humanB);
  const before=await f.a.getProject(),command={type:'startProjectWork',requestId:crypto.randomUUID(),expectedVersion:before.version,agentId:registration.agent.id,content};
  const race=await Promise.all([f.a.executeCommand(command,humanA),f.a.executeCommand(command,humanA)]);
  assert.equal(race.filter(result=>!result.replayed).length,1);assert.equal(race.filter(result=>result.replayed).length,1);
  const result=race.find(result=>!result.replayed)!;
  assert.deepEqual(result.events.map(event=>event.type),['SpecCreated','RevisionActivated','ExecutionCreated']);
  assert.equal(result.state.specs.length,1);assert.equal(result.state.revisions.length,1);assert.equal(result.state.executions.length,1);assert.equal(result.state.executions[0].state,'queued');
  assert.equal(result.state.specs[0].activeRevisionId,result.state.revisions[0].id);
  const identity=await f.a.authenticateAgentToken(registration.token);assert(identity);
  await f.a.executeCommand({type:'confirmResumed',executionId:result.state.executions[0].id,requestId:crypto.randomUUID(),expectedVersion:result.cursor},identity);
  const newer=await f.a.getProject();assert.equal(newer.executions[0].state,'running');
  await assert.rejects(f.a.executeCommand({...command,requestId:crypto.randomUUID(),expectedVersion:newer.version,agentId:foreign.agent.id},humanA),hasCode('FORBIDDEN'));
  await rename(f.rootA,path.join(f.base,'original-a'));
  const recovered=await f.a.executeCommand(command,humanA);assert.equal(recovered.replayed,true);assert.equal(recovered.cursor,result.cursor);
  assert.deepEqual(recovered.events,result.events);assert.equal((await f.a.getProject()).version,newer.version);
  const catalogReceipt=await f.owner.createWorkspaceProject(f.inputA,operator);assert.equal(catalogReceipt.replayed,true);assert.equal(catalogReceipt.project.id,f.projectA.id);
  await assert.rejects(f.a.executeCommand({...command,content:{...content,title:'Другое тело'}},humanA),hasCode('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(f.owner.createWorkspaceProject({...f.inputA,rootPath:f.rootB},operator),hasCode('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(f.a.executeCommand({...command,requestId:crypto.randomUUID(),expectedVersion:newer.version},humanA),hasCode('WORKSPACE_BINDING_CONFLICT'));
  await mkdir(f.rootA);await writeFile(path.join(f.rootA,'new.txt'),'Новая папка по старому пути');
  await assert.rejects(f.a.executeCommand({...command,requestId:crypto.randomUUID(),expectedVersion:newer.version},humanA),hasCode('WORKSPACE_BINDING_CONFLICT'));
  await assert.rejects(f.owner.createWorkspaceProject({requestId:crypto.randomUUID(),rootPath:f.rootA},operator),hasCode('WORKSPACE_BINDING_CONFLICT'));
  assert.deepEqual((await f.owner.getWorkspaceProject(f.projectA.id))?.rootIdentity,f.projectA.rootIdentity);
  const bBefore=await f.b.getProject();
  await assert.rejects(f.b.executeCommand(command,humanA),hasCode('FORBIDDEN'));
  assert.equal((await f.b.getProject()).version,bBefore.version);assert.equal((await f.a.getProject()).specs.length,1);
  assert.deepEqual(replay(newer.events,f.projectA.id),newer);
 }finally{await f.close();}
});

test('PW-REVIEW04 special files never block a reader, while hardlink aliases and symlink roots remain denied',{skip:process.platform!=='linux'},async()=>{
 const base=await mkdtemp(path.join(tmpdir(),'ouro-workspace-fs-review-')),root=path.join(base,'project');await mkdir(root);
 const fifo=path.join(root,'pipe.txt');execFileSync('mkfifo',[fifo]);
 let reader:Promise<{code:string}>|undefined;
 try{
  const resolved=await resolveWorkspaceFolder(root),binding={id:'review-binding',canonicalPath:resolved.canonicalPath,identity:resolved.identity};
  reader=readWorkspaceFile(binding,'pipe.txt').then(()=>({code:'ACCEPTED'}),error=>({code:(error as {code?:string}).code??'UNKNOWN'}));
  const outcome=await Promise.race([reader,new Promise<{code:string}>(resolve=>setTimeout(()=>resolve({code:'BLOCKED_ON_OPEN'}),200))]);
  if(outcome.code==='BLOCKED_ON_OPEN'){
   // Unblock the old implementation so a genuine RED never leaves a hung worker.
   const writer=await open(fifo,constants.O_WRONLY|constants.O_NONBLOCK);await writer.close();await reader;
  }
  assert.notEqual(outcome.code,'BLOCKED_ON_OPEN','A named pipe must be rejected before a blocking file open');assert.notEqual(outcome.code,'ACCEPTED');assert.notEqual(outcome.code,'UNKNOWN');
  const outside=path.join(base,'credentials.txt');await writeFile(outside,'outside-secret');await link(outside,path.join(root,'ordinary.txt'));
  await assert.rejects(readWorkspaceFile(binding,'ordinary.txt'),hasCode('FORBIDDEN'));
  const listed=await listWorkspaceFiles(binding);assert(!listed.entries.some(entry=>entry.name==='ordinary.txt'));
  await rename(root,path.join(base,'old-project'));await symlink(path.join(base,'old-project'),root,'dir');
  await assert.rejects(readWorkspaceFile(binding,'ordinary.txt'),safeFailure);
 }finally{if(reader)await reader;await rm(base,{recursive:true,force:true});}
});

test('PW-REVIEW05 HTTP recovery keeps the original project while cookies and legacy env tokens never authorize another MCP',async()=>{
 const f=await projects(),globals=globalThis as typeof globalThis&{__ouroStore?:Promise<Store>},previousStore=globals.__ouroStore;
 const previousDemo=process.env.OURO_LOCAL_DEMO,previousAgent=process.env.OURO_AGENT_TOKEN;
 globals.__ouroStore=Promise.resolve(f.owner);process.env.OURO_LOCAL_DEMO='1';process.env.OURO_AGENT_TOKEN='workspace-review-legacy-agent-token';
 try{
  const tasks=await import('../app/api/projects/[projectId]/tasks/route'),snapshot=await import('../app/api/projects/[projectId]/route'),mcp=await import('../app/api/projects/[projectId]/mcp/route');
  const context=(projectId:string)=>({params:Promise.resolve({projectId})});
  const request=(projectId:string,endpoint:string,body?:unknown,headers:Record<string,string>={})=>{
   const url=`http://127.0.0.1/api/projects/${projectId}${endpoint}`;
   return new Request(url,{method:body===undefined?'GET':'POST',headers:{cookie:`ouro_session=${issueLocalSession(new Request(url))}`,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  };
  const agentA=await f.a.createAgent('ChatGPT A',actorFor(f.projectA.id));
  const command={requestId:crypto.randomUUID(),expectedVersion:(await f.a.getProject()).version,agentId:agentA.agent.id,content};
  let response=await tasks.POST(request(f.projectA.id,'/tasks',command,{'X-Ouro-Expected-Project':f.projectA.id,'X-Ouro-Expected-Participant':operator.id}),context(f.projectA.id));
  assert.equal(response.status,200);const committed=await response.json();assert.equal(committed.state.executions[0].state,'queued');
  await rename(f.rootA,path.join(f.base,'missing-a'));
  response=await tasks.POST(request(f.projectA.id,'/tasks',command),context(f.projectA.id));
  assert.equal(response.status,200,'The project endpoint must recover its receipt before checking the missing folder');assert.equal((await response.json()).replayed,true);
  response=await tasks.POST(request(f.projectA.id,'/tasks',{...command,requestId:crypto.randomUUID(),expectedVersion:committed.cursor}),context(f.projectA.id));assert.equal(response.status,409);
  response=await snapshot.GET(request(f.projectB.id,'',undefined,{'X-Ouro-Expected-Project':f.projectA.id}),context(f.projectB.id));assert.equal(response.status,409);
  response=await snapshot.GET(request(f.projectB.id,'',undefined,{'X-Ouro-Expected-Participant':'different-operator'}),context(f.projectB.id));assert.equal(response.status,401);
  await rename(f.rootB,path.join(f.base,'missing-b'));
  const initialize={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'independent-workspace-review',version:'1'}}};
  const authHeaders:Record<string,string>[]=[{Authorization:`Bearer ${agentA.token}`},{Authorization:'Bearer workspace-review-legacy-agent-token'},{}];
  for(const headers of authHeaders){
   response=await mcp.POST(request(f.projectB.id,'/mcp',initialize,headers),context(f.projectB.id));
   assert.equal(response.status,401,'Cross-project key, legacy env token and human cookie must all fail before workspace filesystem access');
  }
  response=await snapshot.GET(request(f.projectB.id,''),context(f.projectB.id));assert.equal(response.status,200);assert.equal((await response.json()).state.projectId,f.projectB.id);
  assert.equal((await f.b.getProject()).specs.length,0);assert.equal((await f.a.getProject()).specs.length,1);
 }finally{
  if(previousStore===undefined)delete globals.__ouroStore;else globals.__ouroStore=previousStore;
  if(previousDemo===undefined)delete process.env.OURO_LOCAL_DEMO;else process.env.OURO_LOCAL_DEMO=previousDemo;
  if(previousAgent===undefined)delete process.env.OURO_AGENT_TOKEN;else process.env.OURO_AGENT_TOKEN=previousAgent;
  await f.close();
 }
});

test('PW-REVIEW06 an opened directory relocated outside the root cannot redirect read or listing',{skip:process.platform!=='linux'},async()=>{
 const fsModule=require('node:fs/promises') as {open:typeof open};
 for(const operation of ['read','list'] as const){
  const base=await mkdtemp(path.join(tmpdir(),'ouro-workspace-relocation-review-')),root=path.join(base,'root'),sub=path.join(root,'sub'),outside=path.join(base,'outside');
  await mkdir(sub,{recursive:true});await writeFile(path.join(sub,'file.txt'),'inside-before');
  const resolved=await resolveWorkspaceFolder(root),binding={id:'relocation-review',canonicalPath:resolved.canonicalPath,identity:resolved.identity};
  const originalOpen=fsModule.open;let moved=false;
  fsModule.open=async(...args:Parameters<typeof open>)=>{
   const handle=await originalOpen(...args);
   if(!moved&&String(args[0]).startsWith('/proc/self/fd/')&&String(args[0]).endsWith('/sub')){
    moved=true;await rename(sub,outside);await writeFile(path.join(outside,'file.txt'),'outside-after');
   }
   return handle;
  };
  try{
   const action=operation==='read'?readWorkspaceFile(binding,'sub/file.txt'):listWorkspaceFiles(binding,'sub');
   await assert.rejects(action,hasCode('WORKSPACE_BINDING_CONFLICT'),`The ${operation} must reject a directory moved outside its root after opening`);
   assert.equal(moved,true,'The deterministic relocation boundary must actually be exercised');
  }finally{fsModule.open=originalOpen;await rm(base,{recursive:true,force:true});}
 }
});
