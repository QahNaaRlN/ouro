import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createGitHubHandlers, type GitHubHttpStore } from '../lib/github/http';
import { AGENT_ID,PROJECT_ID,type Actor } from '../packages/core/src';

const human:Actor={id:'human',kind:'human',projectIds:[PROJECT_ID]},secret='fixture-webhook-secret',token='fixture-api-token',sha='a'.repeat(40);
function fixture(){
  const effects:{enqueued:unknown[];created:unknown[];commands:unknown[];retried:unknown[];kicks:number}={enqueued:[],created:[],commands:[],retried:[],kicks:0},after:Array<()=>Promise<void>>=[];
  const store:GitHubHttpStore={getProject:async()=>({githubBindings:[]}),listGitHubDeliveries:async()=>[],createGitHubBinding:async(...args)=>{effects.created.push(args);return {ok:true};},executeCommand:async(...args)=>{effects.commands.push(args);return {ok:true};},enqueueGitHubDelivery:async(...args)=>{effects.enqueued.push(args);return {delivery:{id:'delivery-row',status:'pending'},duplicate:false};},retryGitHubDelivery:async(...args)=>{effects.retried.push(args);return {id:args[0],status:'pending'};}};
  const handlers=createGitHubHandlers({getStore:async()=>store,authenticateHuman:()=>human,client:{resolveRepository:async()=>({id:42,fullName:'ouro/demo'})},env:()=>({secret,token}),afterResponse:task=>{after.push(task);},kick:async()=>{effects.kicks++;}});
  return {handlers,effects,after,store};
}
const push={repository:{id:42,full_name:'ouro/demo'},ref:'refs/heads/feature',before:'b'.repeat(40),after:sha,deleted:false,commits:[{id:sha}]};
function webhook(raw=JSON.stringify(push),headers:Record<string,string>={}){return new Request('http://127.0.0.1/api/github/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-GitHub-Delivery':'delivery-fixture','X-GitHub-Event':'push','X-Hub-Signature-256':`sha256=${createHmac('sha256',secret).update(raw).digest('hex')}`,...headers},body:raw});}
function jsonRequest(data:unknown){return new Request('http://127.0.0.1/api/github/bindings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});}

test('G01/G06: valid webhook durably queues and returns202 before any deferred verification kick',async()=>{
  const f=fixture();const response=await f.handlers.webhook(webhook());assert.equal(response.status,202);assert.equal(f.effects.enqueued.length,1);assert.equal(f.effects.kicks,0);assert.equal(f.after.length,1);await f.after[0]();assert.equal(f.effects.kicks,1);assert(!JSON.stringify(f.effects.enqueued).includes(secret));
});

test('G01: invalid signature/JSON/size/content-type never reach the inbox',async()=>{
  const f=fixture();for(const request of [webhook(JSON.stringify(push),{'X-Hub-Signature-256':'sha256='+'0'.repeat(64)}),webhook('{'),webhook('x'.repeat(2*1024*1024+1)),webhook(JSON.stringify(push),{'Content-Type':'text/plain'})]){const response=await f.handlers.webhook(request);assert([400,401,413,415,422].includes(response.status),`unexpected ${response.status}`);}assert.equal(f.effects.enqueued.length,0);assert.equal(f.after.length,0);
});

test('G01/G08: unknown event and unavailable setup have explicit outcomes without API work',async()=>{
  const f=fixture(),ignored=await f.handlers.webhook(webhook('{}',{'X-GitHub-Event':'ping'}));assert.equal(ignored.status,202);assert.equal((await ignored.json()).outcome,'ignored');assert.equal(f.effects.enqueued.length,0);
  const unavailable=createGitHubHandlers({env:()=>({})});const response=await unavailable.webhook(webhook());assert.equal(response.status,503);assert(!JSON.stringify(await response.json()).includes(secret));
});

test('G02: human binding creation uses API repository identity and rejects spoofed input',async()=>{
  const f=fixture(),data={executionId:'execution-a',repositoryFullName:'ouro/demo',ref:'refs/heads/feature',requestId:'binding-request-1',expectedVersion:35};const response=await f.handlers.create(jsonRequest(data));assert.equal(response.status,201);assert.deepEqual((f.effects.created[0] as any[])[0],{...data,repositoryId:42});
  const spoof=await f.handlers.create(jsonRequest({...data,repositoryId:99}));assert.equal(spoof.status,422);assert.equal(f.effects.created.length,1);
});

test('G02/G09: list/revoke/retry stay human-only and setup exposes booleans, never credential values',async()=>{
  const f=fixture(),request=new Request('http://127.0.0.1/api/github');const response=await f.handlers.list(request);assert.equal(response.status,200);const body=await response.json();assert.equal(body.setup.webhookSecretConfigured,true);assert.equal(body.setup.apiTokenConfigured,true);assert.equal(body.setup.webhookUrl,'http://127.0.0.1/api/github/webhook');assert(!JSON.stringify(body).includes(secret));assert(!JSON.stringify(body).includes(token));
  const agent=createGitHubHandlers({getStore:async()=>f.store,authenticateHuman:()=>({id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]})});assert.equal((await agent.list(request)).status,403);assert.equal((await agent.create(jsonRequest({}))).status,403);assert.equal((await agent.revoke(jsonRequest({}),'binding-a')).status,403);assert.equal((await agent.retry(jsonRequest({}),'delivery-a')).status,403);
});

test('G02/G06: revoke uses optimistic human command; retry schedules its own deferred kick',async()=>{
  const f=fixture(),body={requestId:'binding-revoke-1',expectedVersion:42};assert.equal((await f.handlers.revoke(jsonRequest(body),'binding-a')).status,200);assert.deepEqual((f.effects.commands[0] as any[])[0],{...body,type:'revokeGitHubBinding',bindingId:'binding-a'});
  assert.equal((await f.handlers.retry(jsonRequest({}),'delivery-row')).status,200);assert.equal(f.effects.retried.length,1);assert.equal(f.effects.kicks,0);assert.equal(f.after.length,1);await f.after[0]();assert.equal(f.effects.kicks,1);
});

test('G02: an already revoked binding reports conflict without surfacing its raw exception',async()=>{
  const f=fixture();f.store.executeCommand=async()=>{throw Object.assign(new Error('Binding already revoked'),{code:'BINDING_REVOKED'});};
  const response=await f.handlers.revoke(jsonRequest({requestId:'repeat-revoke-id',expectedVersion:42}),'binding-a');assert.equal(response.status,409);assert.equal((await response.json()).error.code,'BINDING_REVOKED');
});

test('G06: a deferred worker failure cannot leak its original exception through Next after',async()=>{
  const f=fixture(),scheduled:Array<()=>Promise<void>>=[];
  const handlers=createGitHubHandlers({getStore:async()=>f.store,env:()=>({secret}),afterResponse:task=>scheduled.push(task),kick:async()=>{throw new Error('sensitive-upstream-runtime-secret');}});
  assert.equal((await handlers.webhook(webhook())).status,202);await assert.doesNotReject(scheduled[0]());assert.equal(f.effects.enqueued.length,1);
});
