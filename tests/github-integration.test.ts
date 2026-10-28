import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac,randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../lib/store';
import { createGitHubClient } from '../lib/github/verification';
import { createGitHubHandlers } from '../lib/github/http';
import { createGitHubWorker } from '../lib/github/worker';
import { AGENT_ID,PROJECT_ID,type Actor } from '../packages/core/src';

const human:Actor={id:'github-integration-human',kind:'human',projectIds:[PROJECT_ID]},sha='a'.repeat(40),secondSha='c'.repeat(40),secret='integration-fixture-webhook-secret',token='integration-fixture-api-token';
const push=(shas=[sha],extra:Record<string,unknown>={})=>({repository:{id:42,full_name:'ouro/demo',url:'https://attacker.invalid/api',secret:'RAW_BODY_MUST_NOT_PERSIST'},ref:'refs/heads/work',before:'b'.repeat(40),after:shas.at(-1),deleted:false,commits:shas.map(id=>({id,url:'https://attacker.invalid/commit'})),...extra});
const request=(body:unknown)=>new Request('http://127.0.0.1/api/github/bindings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const webhook=(deliveryId:string,body=push())=>{const raw=JSON.stringify(body);return new Request('http://127.0.0.1/api/github/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-GitHub-Delivery':deliveryId,'X-GitHub-Event':'push','X-Hub-Signature-256':`sha256=${createHmac('sha256',secret).update(raw).digest('hex')}`},body:raw});};
async function setup(directory='memory://',intercept?:(url:string)=>Promise<Response|undefined>){
  let store=await createStore({dataDir:directory});const calls:string[]=[];
  const fetcher:typeof fetch=async input=>{
    const url=String(input);calls.push(url);assert.equal(new URL(url).origin,'https://api.github.com');
    const override=await intercept?.(url);if(override)return override;
    if(url==='https://api.github.com/repos/ouro/demo')return Response.json({id:42,full_name:'ouro/demo'});
    const match=url.match(/\/commits\/([a-f0-9]{40})$/);assert(match,'Only fixed repository/commit API requests are permitted');return Response.json({sha:match[1],html_url:'https://attacker.invalid/forged'});
  };
  const client=createGitHubClient({fetch:fetcher,token}),after:Array<()=>Promise<void>>=[];
  const worker=createGitHubWorker({getStore:async()=>store,client});
  const handlers=createGitHubHandlers({getStore:async()=>store,client,authenticateHuman:()=>human,env:()=>({secret,token}),afterResponse:task=>after.push(task),kick:async()=>{await worker.run();}});
  const command=async(data:Record<string,unknown>)=>(await store.executeCommand({...data,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},human)).state;
  let state=await command({type:'createSpec',content:{title:'Наблюдать GitHub интеграционно',goal:'Получать только проверенные факты.',dod:[{id:'checked',text:'Человек проверил результат',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
  const spec=state.specs.at(-1)!,revision=state.revisions.at(-1)!;await command({type:'activateRevision',specId:spec.id,revisionId:revision.id});state=await command({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:AGENT_ID});const execution=state.executions.at(-1)!;
  const created=await handlers.create(request({executionId:execution.id,repositoryFullName:'ouro/demo',ref:'refs/heads/work',requestId:randomUUID(),expectedVersion:state.version}));assert.equal(created.status,201);const binding=(await store.getProject()).githubBindings.at(-1)!;
  return {handlers,after,calls,worker,command,spec,revision,execution,binding,get store(){return store;},reopen:async()=>{await store.close();store=await createStore({dataDir:directory});}};
}
const sources=async(f:Awaited<ReturnType<typeof setup>>)=>(await f.store.getProject()).events.filter(event=>(event.payload.source as any)?.kind==='github_commit');

test('G01–G07: signed HTTP→durable reopen→API worker→one scoped Action; deliveries and human writes do not duplicate it',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ouro-github-full-'));let f:Awaited<ReturnType<typeof setup>>|undefined;
  try{
    f=await setup(directory);assert.equal(f.calls.length,1,'Binding used a real API client with controlled fetch');
    const accepted=await f.handlers.webhook(webhook('integration-delivery-a'));assert.equal(accepted.status,202);assert.equal((await f.store.listGitHubDeliveries(human))[0].status,'pending');assert.equal((await sources(f)).length,0);assert.equal(f.calls.length,1,'No commit verification before afterResponse');
    await f.reopen();assert.equal((await f.store.listGitHubDeliveries(human))[0].status,'pending');await f.after.shift()!();
    const [fact]=await sources(f);assert(fact);assert.equal(fact.actor.kind,'service');assert.equal(fact.specRevisionId,f.revision.id);assert.equal(fact.executionId,f.execution.id);assert.equal((fact.payload.source as any).fullSha,sha);assert.equal((fact.payload.source as any).url,`https://github.com/ouro/demo/commit/${sha}`);assert.equal((await f.store.listGitHubDeliveries(human))[0].status,'processed');
    let state=await f.store.getProject();assert.equal(state.executions.find(e=>e.id===f!.execution.id)!.state,'queued');assert.equal(state.specs.find(s=>s.id===f!.spec.id)!.acceptance,undefined);
    await f.command({type:'proposeRevision',specId:f.spec.id,content:{...f.revision,title:'Более поздняя человеческая запись'}});
    const replay=await f.handlers.webhook(webhook('integration-delivery-a'));assert.equal(replay.status,202);assert.equal((await replay.json()).duplicate,true);await f.after.shift()!();
    const otherDelivery=await f.handlers.webhook(webhook('integration-delivery-b'));assert.equal(otherDelivery.status,202);await f.after.shift()!();assert.equal((await sources(f)).length,1);
    const conflict=await f.handlers.webhook(webhook('integration-delivery-a',push([sha],{description:'changed signed body'})));assert.equal(conflict.status,409);
    const persisted=await f.store.inspect<{event:unknown}>('SELECT event FROM ouro_domain_events');const inbox=await f.store.inspect<{payload:unknown}>('SELECT payload FROM ouro_github_deliveries');const serialized=JSON.stringify([persisted.rows,inbox.rows]);for(const forbidden of [secret,token,'RAW_BODY_MUST_NOT_PERSIST','attacker.invalid'])assert(!serialized.includes(forbidden));
  }finally{if(f)await f.store.close();await rm(directory,{recursive:true,force:true});}
});

test('G06: a human revoke during real API await prevents the SQL Action and leaves an explicit processed reason',async()=>{
  let entered!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;}),waiting=new Promise<void>(resolve=>{release=resolve;});
  const f=await setup('memory://',async url=>{if(!url.endsWith(`/commits/${sha}`))return;entered();await waiting;return Response.json({sha});});
  try{
    assert.equal((await f.handlers.webhook(webhook('integration-revoked'))).status,202);const processing=f.after.shift()!();await started;
    const response=await f.handlers.revoke(request({requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version}),f.binding.id);assert.equal(response.status,200);release();await processing;
    assert.equal((await sources(f)).length,0);const job=(await f.store.listGitHubDeliveries(human))[0];assert.equal(job.status,'processed');assert.equal(job.reason,'BINDING_REVOKED');
  }finally{release();await f.store.close();}
});

test('G04/G06: a partial two-commit delivery retries through HTTP and keeps the first semantic receipt',async()=>{
  let unavailable=true;const f=await setup('memory://',async url=>{if(url.endsWith(`/commits/${secondSha}`)&&unavailable){unavailable=false;return new Response(null,{status:503});}});
  try{
    assert.equal((await f.handlers.webhook(webhook('integration-partial',push([sha,secondSha])))).status,202);await f.after.shift()!();const first=await sources(f);assert.equal(first.length,1);let job=(await f.store.listGitHubDeliveries(human))[0];assert.equal(job.status,'retryable');assert.equal(job.lastError,'GITHUB_UNAVAILABLE');
    assert.equal((await f.handlers.retry(request({}),job.id)).status,200);assert.equal((await sources(f)).length,1);await f.after.shift()!();const completed=await sources(f);assert.equal(completed.length,2);assert.equal(completed.filter(event=>event.id===first[0].id).length,1);job=(await f.store.listGitHubDeliveries(human))[0];assert.equal(job.status,'processed');assert.equal(job.lastError,null);
    assert.equal((await f.store.inspect('SELECT * FROM ouro_github_commit_receipts')).rows.length,2);
  }finally{await f.store.close();}
});
