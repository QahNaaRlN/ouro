import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../lib/store';
import { PROJECT_ID,AGENT_ID,type Actor } from '../packages/core/src';
const human:Actor={id:'github-store-human',kind:'human',projectIds:[PROJECT_ID]};
const agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const hasCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;
const sha='a'.repeat(40);
const push=(extra:Record<string,unknown>={})=>({repositoryId:123,repositoryFullName:'example/ouro',ref:'refs/heads/work',before:'b'.repeat(40),after:sha,commitShas:[sha],payloadDigest:'f'.repeat(64),disposition:'pending' as const,...extra});
const proof={repositoryId:123,repositoryFullName:'example/ouro',fullSha:sha,url:`https://github.com/example/ouro/commit/${sha}`,title:'Изменить код',verifiedAt:'2026-10-29T12:00:00.000Z',verificationMethod:'github-api-sha' as const};
async function fixture(directory='memory://'){
  const store=await createStore({dataDir:directory});
  const command=async(payload:Record<string,unknown>)=>(await store.executeCommand({...payload,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},human)).state;
  let state=await command({type:'createSpec',content:{title:'Наблюдать коммиты',goal:'Записывать проверенный объект GitHub.',dod:[{id:'checked',text:'Результат принят человеком',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
  const spec=state.specs.at(-1)!,revision=state.revisions.at(-1)!;await command({type:'activateRevision',specId:spec.id,revisionId:revision.id});state=await command({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:AGENT_ID});const execution=state.executions.at(-1)!;
  const created=await store.createGitHubBinding({requestId:randomUUID(),expectedVersion:state.version,executionId:execution.id,repositoryId:123,repositoryFullName:'example/ouro',ref:'refs/heads/work'},human);
  const binding=created.state.githubBindings.at(-1)!;
  return {store,command,spec,revision,execution,binding};
}
async function claimed(f:Awaited<ReturnType<typeof fixture>>,deliveryId=randomUUID()){
  await f.store.enqueueGitHubDelivery(deliveryId,push());const job=await f.store.claimGitHubDelivery();assert(job);return job;
}

test('G02: verified binding creation has a dedicated server path and ordinary commands cannot forge it',async()=>{
  const f=await fixture();try{
    assert.equal(f.binding.specRevisionId,f.revision.id);
    const state=await f.store.getProject();await assert.rejects(f.store.executeCommand({type:'createGitHubBinding',requestId:randomUUID(),expectedVersion:state.version,executionId:f.execution.id,repositoryId:999,repositoryFullName:'other/repo',ref:'refs/heads/main'},human),hasCode('FORBIDDEN'));
    await assert.rejects(f.store.createGitHubBinding({requestId:randomUUID(),expectedVersion:state.version,executionId:f.execution.id,repositoryId:999,repositoryFullName:'other/repo',ref:'refs/heads/main'},agent),hasCode('FORBIDDEN'));
  }finally{await f.store.close();}
});

test('G04/G08: transport receipt is immutable, digest conflicts and ignored/incomplete pushes have explicit outcomes',async()=>{
  const f=await fixture();try{
    const id=randomUUID(),first=await f.store.enqueueGitHubDelivery(id,push({signature:'MUST_NOT_PERSIST',rawBody:'MUST_NOT_PERSIST'}));assert.equal(first.delivery.status,'pending');assert.equal(first.duplicate,false);
    const repeat=await f.store.enqueueGitHubDelivery(id,push());assert.equal(repeat.duplicate,true);assert.equal(repeat.delivery.id,first.delivery.id);
    await assert.rejects(f.store.enqueueGitHubDelivery(id,push({payloadDigest:'e'.repeat(64)})),hasCode('IDEMPOTENCY_CONFLICT'));
    const unknown=await f.store.enqueueGitHubDelivery(randomUUID(),push({repositoryId:456}));assert.equal(unknown.delivery.status,'processed');assert.equal(unknown.delivery.reason,'NO_ACTIVE_BINDING');
    const incomplete=await f.store.enqueueGitHubDelivery(randomUUID(),push({disposition:'needs_review',reason:'INCOMPLETE_PUSH'}));assert.equal(incomplete.delivery.status,'needs_review');
    const ignored=await f.store.enqueueGitHubDelivery(randomUUID(),push({disposition:'ignored',reason:'DELETION_IGNORED'}));assert.equal(ignored.delivery.status,'processed');assert.equal(ignored.delivery.reason,'DELETION_IGNORED');
    const raw=await f.store.inspect<{payload:unknown}>('SELECT payload FROM ouro_github_deliveries');assert(!JSON.stringify(raw).includes('MUST_NOT_PERSIST'));
    await assert.rejects(f.store.inspect('UPDATE ouro_github_deliveries SET payload_digest=payload_digest'),/append-only/);
    await assert.rejects(f.store.listGitHubDeliveries(agent),hasCode('FORBIDDEN'));
  }finally{await f.store.close();}
});

test('G04: semantic receipt survives later human writes and another delivery without duplicate Action',async()=>{
  const f=await fixture();try{
    const job=await claimed(f),input={jobId:job.id,leaseToken:job.leaseToken,bindingId:f.binding.id,commit:proof};
    const results=await Promise.all(Array.from({length:3},()=>f.store.ingestVerifiedGitHubCommit(input)));assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal(new Set(results.map(r=>r.event.id)).size,1);
    await f.command({type:'proposeRevision',specId:f.spec.id,content:{...f.revision,title:'Более поздняя человеческая запись'}});
    const activeDeadline=new Date(Date.now()+5000).toISOString();
    await f.store.inspect('UPDATE ouro_github_jobs SET lease_until=$2 WHERE delivery_id=$1',[job.id,activeDeadline]);
    const replay=await f.store.ingestVerifiedGitHubCommit(input);assert.equal(replay.replayed,true);assert.equal(replay.cursor,results[0].cursor);
    const lease=(await f.store.inspect<{lease_until:Date|string}>('SELECT lease_until FROM ouro_github_jobs WHERE delivery_id=$1',[job.id])).rows[0].lease_until;assert(new Date(lease).getTime()>new Date(activeDeadline).getTime(),'semantic replay renews its still-valid lease so a large retry makes progress');
    await f.store.finishGitHubDelivery(job.id,job.leaseToken);
    const second=await claimed(f);const other=await f.store.ingestVerifiedGitHubCommit({...input,jobId:second.id,leaseToken:second.leaseToken});assert.equal(other.event.id,replay.event.id);
    const state=await f.store.getProject();assert.equal(state.events.filter(e=>(e.payload.source as any)?.kind==='github_commit').length,1);assert.notEqual(state.specs.find(s=>s.id===f.spec.id)!.state,'done');
  }finally{await f.store.close();}
});

test('G05: outbox failure rolls back Action and semantic receipt, then the same job can be retried',async()=>{
  const f=await fixture();try{
    const job=await claimed(f),input={jobId:job.id,leaseToken:job.leaseToken,bindingId:f.binding.id,commit:proof},version=(await f.store.getProject()).version;
    await f.store.inspect("CREATE FUNCTION github_test_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'github test outbox failure'; END $$");
    await f.store.inspect('CREATE TRIGGER github_test_fail BEFORE INSERT ON ouro_outbox FOR EACH ROW EXECUTE FUNCTION github_test_fail_outbox()');
    await assert.rejects(f.store.ingestVerifiedGitHubCommit(input),/github test outbox failure/);
    assert.equal((await f.store.getProject()).version,version);assert.equal((await f.store.inspect('SELECT * FROM ouro_github_commit_receipts')).rows.length,0);
    await f.store.inspect('DROP TRIGGER github_test_fail ON ouro_outbox');const saved=await f.store.ingestVerifiedGitHubCommit(input);assert.equal(saved.replayed,false);
  }finally{await f.store.close();}
});

test('G06: revoke during external verification is checked again when committing the fact',async()=>{
  const f=await fixture();try{
    const job=await claimed(f);let verified!:(value:typeof proof)=>void;const apiResponse=new Promise<typeof proof>(resolve=>{verified=resolve;});
    const pending=apiResponse.then(commit=>f.store.ingestVerifiedGitHubCommit({jobId:job.id,leaseToken:job.leaseToken,bindingId:f.binding.id,commit}));
    await f.command({type:'revokeGitHubBinding',bindingId:f.binding.id});verified(proof);await assert.rejects(pending,hasCode('BINDING_REVOKED'));
    assert.equal((await f.store.getProject()).events.filter(e=>(e.payload.source as any)?.kind==='github_commit').length,0);
  }finally{await f.store.close();}
});

test('G06: durable queue reopens, recovers expired leases and exposes only sanitized retry state',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ouro-github-inbox-'));let f:Awaited<ReturnType<typeof fixture>>|undefined;let reopened:Awaited<ReturnType<typeof createStore>>|undefined;
  try{
    f=await fixture(directory);const id=randomUUID();await f.store.enqueueGitHubDelivery(id,push());const first=await f.store.claimGitHubDelivery({leaseMs:1000});assert(first);
    await f.store.close();f=undefined;reopened=await createStore({dataDir:directory});
    const recovered=await reopened.claimGitHubDelivery({now:Date.now()+2000});assert(recovered);assert.equal(recovered.id,first.id);assert.notEqual(recovered.leaseToken,first.leaseToken);assert.equal(recovered.attempts,2);
    await assert.rejects(reopened.finishGitHubDelivery(first.id,first.leaseToken),hasCode('LEASE_LOST'));
    await reopened.failGitHubDelivery(recovered.id,recovered.leaseToken,{code:'GITHUB_UNAVAILABLE',retryAfterMs:1000});
    const list=await reopened.listGitHubDeliveries(human);assert.equal(list[0].status,'retryable');assert.equal(list[0].lastError,'GITHUB_UNAVAILABLE');assert(!('leaseToken' in list[0]));assert(!('payload' in list[0]));
    const retry=await reopened.retryGitHubDelivery(first.id,human);assert.equal(retry.status,'pending');assert.equal(retry.attempts,0);
    const again=await reopened.claimGitHubDelivery();assert(again);await reopened.finishGitHubDelivery(again.id,again.leaseToken);assert.equal((await reopened.listGitHubDeliveries(human))[0].status,'processed');
  }finally{if(f)await f.store.close();if(reopened)await reopened.close();await rm(directory,{recursive:true,force:true});}
});
