import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createStore,type Store} from '../lib/store';
import {issueLocalSession,issueParticipantSession} from '../lib/auth';
import {PROJECT_ID,type Actor} from '../packages/core/src';

const operator:Actor={id:'human-token',kind:'human',projectIds:[PROJECT_ID]},token='workspace-http-test-operator';
const content={title:'Проверить проектную задачу',goal:'Назначить конкретную работу без ложного ACK.',dod:[{id:'proof',text:'Получен проверяемый результат.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
function request(url:string,body?:unknown,headers:HeadersInit={}){
 const merged=new Headers(headers);if(!merged.has('authorization')&&!merged.has('cookie'))merged.set('authorization',`Bearer ${token}`);
 if(body!==undefined)merged.set('content-type','application/json');
 return new Request(`http://127.0.0.1${url}`,{method:body===undefined?'GET':'POST',headers:merged,...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function routes(){
 assert(existsSync(path.resolve('app/api/projects/route.ts')),'The operator project catalog HTTP feature is missing');
 return {catalog:await import('../app/api/projects/route'),project:await import('../app/api/projects/[projectId]/route'),tasks:await import('../app/api/projects/[projectId]/tasks/route'),commands:await import('../app/api/projects/[projectId]/commands/route'),agents:await import('../app/api/projects/[projectId]/agents/route'),revoke:await import('../app/api/projects/[projectId]/agents/[agentId]/revoke/route'),stream:await import('../app/api/projects/[projectId]/stream/route'),folders:await import('../app/api/workspace/folders/route')};
}
async function fixture(){
 const base=await mkdtemp(path.join(tmpdir(),'ouro-workspace-http-'));await mkdir(path.join(base,'A'));await mkdir(path.join(base,'B'));
 const previous={human:process.env.OURO_HUMAN_TOKEN,demo:process.env.OURO_LOCAL_DEMO,agent:process.env.OURO_AGENT_TOKEN};
 process.env.OURO_HUMAN_TOKEN=token;process.env.OURO_LOCAL_DEMO='1';process.env.OURO_AGENT_TOKEN='workspace-http-test-agent';
 const store=await createStore({dataDir:'memory://'});(globalThis as typeof globalThis&{__ouroStore?:Promise<Store>}).__ouroStore=Promise.resolve(store);
 return {base,store,async close(){delete (globalThis as typeof globalThis&{__ouroStore?:Promise<Store>}).__ouroStore;await store.close();await rm(base,{recursive:true,force:true});for(const [name,value] of Object.entries({OURO_HUMAN_TOKEN:previous.human,OURO_LOCAL_DEMO:previous.demo,OURO_AGENT_TOKEN:previous.agent}))if(value===undefined)delete process.env[name];else process.env[name]=value;}};
}
const context=(projectId:string)=>({params:Promise.resolve({projectId})});

test('WH01 project routes expose a real operator-only catalog and canonical folder project',async()=>{
 const f=await fixture();try{
  const r=await routes(),before=await r.catalog.GET(request('/api/projects'));assert.equal(before.status,200);assert((await before.json()).projects.some((project:{id:string;kind:string})=>project.id===PROJECT_ID&&project.kind==='demo'));
  const response=await r.catalog.POST(request('/api/projects',{requestId:randomUUID(),rootPath:path.join(f.base,'A'),name:'Проект A'}));assert.equal(response.status,201);const created=await response.json();
  assert.equal(created.project.name,'Проект A');assert.equal(created.project.rootPath,path.join(f.base,'A'));assert.equal(created.created,true);
  const stateResponse=await r.project.GET(request(`/api/projects/${created.project.id}`),context(created.project.id));assert.equal(stateResponse.status,200);
  const value=await stateResponse.json();assert.equal(value.state.projectId,created.project.id);assert.equal(value.state.specs.length,0);assert.equal(value.cursor,value.state.version);assert.equal(value.connection.projectId,created.project.id);assert(value.connection.httpUrl.endsWith(`/api/projects/${created.project.id}/mcp`));
 }finally{await f.close();}
});

test('WH02 invalid and ordinary participant cookies never acquire operator catalog/folder access',async()=>{
 const f=await fixture();try{
  const r=await routes(),local=issueLocalSession(new Request('http://127.0.0.1/api/session'));
  const bad=request('/api/projects',undefined,{cookie:`ouro_session=${local}; ouro_participant=invalid`});assert.equal((await r.catalog.GET(bad)).status,401);
  const participant=await f.store.createParticipant('Обычный участник',operator),actor=(await f.store.authenticateParticipantCredential(participant.credential))!;
  const cookie=issueParticipantSession(actor,PROJECT_ID),headers={cookie:`ouro_participant=${cookie}; ouro_session=${local}`};
  assert.equal((await r.catalog.GET(request('/api/projects',undefined,headers))).status,403);
  assert.equal((await r.folders.GET(request(`/api/workspace/folders?path=${encodeURIComponent(f.base)}`,undefined,headers))).status,403);
  assert.equal((await r.catalog.GET(request('/api/projects',undefined,{authorization:'Bearer workspace-http-test-agent'}))).status,403);
  assert.equal((await r.catalog.GET(new Request('http://127.0.0.1/api/projects'))).status,401);
  assert.equal((await r.catalog.GET(request('/api/projects',undefined,{'X-Ouro-Expected-Participant':'a-different-author'}))).status,401);
  assert.equal((await r.folders.GET(request(`/api/workspace/folders?path=${encodeURIComponent(f.base)}`))).status,200);
 }finally{await f.close();}
});

test('WH03 tasks select the route project and active registration; real ACK and human acceptance remain separate',async()=>{
 const f=await fixture();try{
  const r=await routes();const a=await f.store.createWorkspaceProject({requestId:randomUUID(),rootPath:path.join(f.base,'A')},operator),b=await f.store.createWorkspaceProject({requestId:randomUUID(),rootPath:path.join(f.base,'B')},operator);
  const aid=a.project.id,bid=b.project.id,sa=await f.store.forProject(aid),sb=await f.store.forProject(bid);
  const created=await r.agents.POST(request(`/api/projects/${aid}/agents`,{name:'ChatGPT'}),context(aid));assert.equal(created.status,201);const registration=await created.json();assert.equal(registration.agent.projectId,aid);
  const actor=(await sa.authenticateAgentToken(registration.token))!,body={requestId:randomUUID(),expectedVersion:(await sa.getProject()).version,agentId:actor.id,content};
  assert.equal((await r.tasks.POST(request(`/api/projects/${aid}/tasks`,body,{'X-Ouro-Expected-Project':bid}),context(aid))).status,409);
  assert.equal((await r.tasks.POST(request(`/api/projects/${bid}/tasks`,{...body,expectedVersion:(await sb.getProject()).version}),context(bid))).status,403);
  assert.equal((await r.tasks.POST(request(`/api/projects/${aid}/tasks`,{...body,projectId:bid}),context(aid))).status,422);
  const response=await r.tasks.POST(request(`/api/projects/${aid}/tasks`,body,{'X-Ouro-Expected-Project':aid,'X-Ouro-Expected-Participant':operator.id}),context(aid));assert.equal(response.status,200);const value=await response.json();
  assert.deepEqual(value.events.map((event:{type:string})=>event.type),['SpecCreated','RevisionActivated','ExecutionCreated']);assert.equal(value.state.executions.at(-1).state,'queued');assert.equal((await sb.getProject()).specs.length,0);
  const repeated=await r.tasks.POST(request(`/api/projects/${aid}/tasks`,body),context(aid));assert.equal(repeated.status,200);assert.equal((await repeated.json()).replayed,true);assert.equal((await sa.getProject()).specs.length,1);
  const execution=value.state.executions.at(-1);await sa.executeCommand({type:'confirmResumed',executionId:execution.id,ackPhase:'start',requestId:randomUUID(),expectedVersion:value.cursor},actor);
  assert.equal((await sa.getProject()).executions.at(-1)!.state,'running');assert.notEqual((await sa.getProject()).specs.at(-1)!.state,'done');
  const revoked=await r.revoke.POST(request(`/api/projects/${aid}/agents/${actor.id}/revoke`,{}),{params:Promise.resolve({projectId:aid,agentId:actor.id})});assert.equal(revoked.status,200);assert.equal(await sa.authenticateAgentToken(registration.token),null);
 }finally{await f.close();}
});

test('WH04 project commands and streams reject cross-project entities and retain explicit SSE scope',async()=>{
 const f=await fixture();try{
  const r=await routes(),a=await f.store.createWorkspaceProject({requestId:randomUUID(),rootPath:path.join(f.base,'A')},operator),b=await f.store.createWorkspaceProject({requestId:randomUUID(),rootPath:path.join(f.base,'B')},operator),aid=a.project.id,bid=b.project.id;
  const sa=await f.store.forProject(aid),sb=await f.store.forProject(bid),aActor={...operator,projectIds:[aid]},agent=await sa.createAgent('ChatGPT',aActor);
  const started=await sa.executeCommand({type:'startProjectWork',requestId:randomUUID(),expectedVersion:(await sa.getProject()).version,agentId:agent.agent.id,content},aActor),execution=started.state.executions.at(-1)!;
  const denied=await r.commands.POST(request(`/api/projects/${bid}/commands`,{type:'requestStop',executionId:execution.id,reason:'Чужая попытка',requestId:randomUUID(),expectedVersion:(await sb.getProject()).version}),context(bid));assert.equal(denied.status,404);
  const controller=new AbortController(),headers={authorization:`Bearer ${token}`,'X-Ouro-Expected-Project':aid};
  const stream=await r.stream.GET(new Request(`http://127.0.0.1/api/projects/${aid}/stream?after=0`,{headers,signal:controller.signal}),context(aid));assert.equal(stream.status,200);
  const reader=stream.body!.getReader(),frame=new TextDecoder().decode((await reader.read()).value),payload=JSON.parse(frame.split('\ndata: ')[1].split('\n')[0]);assert.equal(payload.state.projectId,aid);assert.equal(payload.state.executions[0].id,execution.id);
  controller.abort();await reader.cancel();
  assert.equal((await r.stream.GET(request(`/api/projects/${aid}/stream?after=0`,undefined,{'X-Ouro-Expected-Project':bid}),context(aid))).status,409);
  assert.equal((await r.project.GET(request('/api/projects/unknown'),context('unknown'))).status,404);
  assert.equal((await r.catalog.POST(request('/api/projects',{requestId:randomUUID(),rootPath:path.join(f.base,'A')},{origin:'http://evil.example'}))).status,403);
 }finally{await f.close();}
});
