import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createStore,type Store} from '../lib/store';
import {PROJECT_ID,type Actor} from '../packages/core/src';

const actor:Actor={id:'human-token',kind:'human',projectIds:[PROJECT_ID]},token='isolated-binding-http-human';
const context=(projectId:string)=>({params:Promise.resolve({projectId})});
function request(projectId:string,operation:string,body?:unknown,headers:Record<string,string>={}){
 return new Request(`http://127.0.0.1/api/projects/${projectId}/${operation}`,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${token}`,'X-Ouro-Expected-Participant':actor.id,'X-Ouro-Expected-Project':projectId,...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function fixture(){
 const base=await mkdtemp(path.join(tmpdir(),'ouro-binding-http-')),folder=path.join(base,'project');await mkdir(folder);
 const previous={OURO_HUMAN_TOKEN:process.env.OURO_HUMAN_TOKEN,OURO_LOCAL_DEMO:process.env.OURO_LOCAL_DEMO,OURO_AGENT_TOKEN:process.env.OURO_AGENT_TOKEN};
 process.env.OURO_HUMAN_TOKEN=token;process.env.OURO_LOCAL_DEMO='1';process.env.OURO_AGENT_TOKEN='isolated-binding-http-agent';
 const owner=await createStore({dataDir:'memory://'});(globalThis as typeof globalThis&{__ouroStore?:Promise<Store>}).__ouroStore=Promise.resolve(owner);
 const created=await owner.createWorkspaceProject({requestId:randomUUID(),rootPath:folder,name:'Isolated binding HTTP'},actor),store=await owner.forProject(created.project.id),human={...actor,projectIds:[created.project.id]};
 return {base,folder,owner,store,human,project:created.project,async close(){delete (globalThis as typeof globalThis&{__ouroStore?:Promise<Store>}).__ouroStore;await owner.close();assert.equal(path.dirname(folder),base);await rm(base,{recursive:true,force:true});for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}};
}

test('binding HTTP inspection is read-only; wrong participant/project/origin and nonhuman access never issue recovery authority',async()=>{
 const f=await fixture();try{
  const route=await import('../app/api/projects/[projectId]/binding-recovery/route'),before=await f.store.getProject(),catalog=await f.owner.getWorkspaceProject(f.project.id);
  const response=await route.GET(request(f.project.id,'binding-recovery'),context(f.project.id));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();
  assert.equal(body.projectId,f.project.id);assert.equal(body.status,'healthy');assert.equal(body.eligible,false);assert.equal(body.ticket,undefined);assert.deepEqual(body.audit,[]);
  assert.deepEqual(await f.store.getProject(),before);assert.deepEqual(await f.owner.getWorkspaceProject(f.project.id),catalog);
  for(const [headers,status]of [[{'X-Ouro-Expected-Participant':'wrong-author'},401],[{'X-Ouro-Expected-Project':randomUUID()},409],[{origin:'https://unrelated.invalid'},403],[{authorization:'Bearer isolated-binding-http-agent'},403]] as const){
   const denied=await route.GET(request(f.project.id,'binding-recovery',undefined,headers),context(f.project.id));assert.equal(denied.status,status);assert.equal((await denied.json()).ticket,undefined);
  }
  const invalid=await route.POST(request(f.project.id,'binding-recovery',{requestId:randomUUID(),ticket:'not-an-authenticated-ticket',reason:'Review isolated data',acknowledgeUnknownContinuity:true,rootPath:f.base}),context(f.project.id));assert.equal(invalid.status,422);
  const invalidTicket=await route.POST(request(f.project.id,'binding-recovery',{requestId:randomUUID(),ticket:'not-an-authenticated-ticket',reason:'Review isolated data',acknowledgeUnknownContinuity:true}),context(f.project.id));assert.equal(invalidTicket.status,422);assert.equal((await invalidTicket.json()).error.code,'BINDING_RECOVERY_TICKET_INVALID');
  assert.deepEqual(await f.store.getProject(),before);assert.deepEqual(await f.owner.getWorkspaceProject(f.project.id),catalog);
 }finally{await f.close();}
});

test('HTTP binding guard proves only its rolled-back request; an exact committed assignment still replays after the folder is lost',async()=>{
 const f=await fixture();try{
  const commands=await import('../app/api/projects/[projectId]/commands/route'),agent=await f.store.createAgent('Isolated binding HTTP agent',f.human);
  const send=async(body:Record<string,unknown>)=>f.store.executeCommand({...body,requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version},f.human);
  let result=await send({type:'createSpec',content:{title:'Isolated binding HTTP assignment',goal:'No write on rejected folder identity',dod:[{id:'one',text:'Exactly one execution after explicit retry',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
  const spec=result.state.specs[0],revision=result.state.revisions[0];await send({type:'activateRevision',specId:spec.id,revisionId:revision.id});
  const before=await f.store.getProject(),body={type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.agent.id,requestId:randomUUID(),expectedVersion:before.version},moved=path.join(f.base,'saved-project');
  await rename(f.folder,moved);
  const rejected=await commands.POST(request(f.project.id,'commands',body),context(f.project.id));assert.equal(rejected.status,409);const rejection=await rejected.json();
  assert.equal(rejection.error.code,'WORKSPACE_BINDING_CONFLICT');assert.equal(rejection.error.details.commandRejection.phase,'workspace-binding-guard');assert.equal(rejection.error.details.commandRejection.requestId,body.requestId);assert.equal(rejection.error.details.commandRejection.actorId,actor.id);
  assert.deepEqual(await f.store.getProject(),before);
  await rename(moved,f.folder);
  const accepted=await commands.POST(request(f.project.id,'commands',body),context(f.project.id));assert.equal(accepted.status,200);const saved=await accepted.json();assert.equal(saved.state.executions.length,1);
  await rename(f.folder,moved);
  const replay=await commands.POST(request(f.project.id,'commands',body),context(f.project.id));assert.equal(replay.status,200);const recovered=await replay.json();assert.equal(recovered.replayed,true);assert.deepEqual(recovered.state,saved.state);assert.equal((await f.store.getProject()).executions.length,1);
 }finally{await f.close();}
});
