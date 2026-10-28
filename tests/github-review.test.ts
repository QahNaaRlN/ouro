import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../lib/store';
import {AGENT_ID,PROJECT_ID,type Actor} from '../packages/core/src';

const human:Actor={id:'github-lease-review-human',kind:'human',projectIds:[PROJECT_ID]};
const sha='a'.repeat(40);
const proof={repositoryId:42,repositoryFullName:'review/ouro',fullSha:sha,url:`https://github.com/review/ouro/commit/${sha}`,title:'Проверенный объект коммита',verifiedAt:'2026-10-29T12:00:00.000Z',verificationMethod:'github-api-sha' as const};
async function fixture(){
  const store=await createStore({dataDir:'memory://'});
  const command=async(data:Record<string,unknown>)=>(await store.executeCommand({...data,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},human)).state;
  let state=await command({type:'createSpec',content:{title:'Проверить срок lease',goal:'Просроченный worker не изменяет очередь и факты.',dod:[{id:'lease',text:'Просроченный владелец отклонён',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
  const spec=state.specs.at(-1)!,revision=state.revisions.at(-1)!;
  await command({type:'activateRevision',specId:spec.id,revisionId:revision.id});
  state=await command({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:AGENT_ID});
  const bound=await store.createGitHubBinding({requestId:randomUUID(),expectedVersion:state.version,executionId:state.executions.at(-1)!.id,repositoryId:42,repositoryFullName:'review/ouro',ref:'refs/heads/work'},human);
  const binding=bound.state.githubBindings.at(-1)!;
  await store.enqueueGitHubDelivery(randomUUID(),{repositoryId:42,repositoryFullName:'review/ouro',ref:'refs/heads/work',before:'b'.repeat(40),after:sha,commitShas:[sha],payloadDigest:'f'.repeat(64),disposition:'pending'});
  const job=await store.claimGitHubDelivery();assert(job);
  const input={jobId:job.id,leaseToken:job.leaseToken,bindingId:binding.id,commit:proof};
  const expire=()=>store.inspect("UPDATE ouro_github_jobs SET lease_until='2000-01-01T00:00:00Z' WHERE delivery_id=$1",[job.id]);
  return {store,job,input,expire};
}

for(const operation of ['ingest','finish','fail'] as const)test(`review: expired GitHub lease cannot ${operation} before another worker reclaims it`,async()=>{
  const f=await fixture();try{
    await f.expire();const before=(await f.store.getProject()).version;
    const execute=()=>operation==='ingest'?f.store.ingestVerifiedGitHubCommit(f.input):operation==='finish'?f.store.finishGitHubDelivery(f.job.id,f.job.leaseToken):f.store.failGitHubDelivery(f.job.id,f.job.leaseToken,{code:'GITHUB_UNAVAILABLE'});
    await assert.rejects(execute(),error=>['LEASE_LOST','LEASE_EXPIRED','LEASE_CONFLICT'].includes((error as {code:string}).code));
    assert.equal((await f.store.getProject()).version,before);
    assert.equal((await f.store.listGitHubDeliveries(human))[0].status,'processing');
  }finally{await f.store.close();}
});

test('review: reading an existing GitHub semantic receipt cannot revive an expired lease',async()=>{
  const f=await fixture();try{
    await f.store.ingestVerifiedGitHubCommit(f.input);await f.expire();
    const previous=(await f.store.getProject()).version;
    const replayed=await f.store.ingestVerifiedGitHubCommit(f.input);assert.equal(replayed.replayed,true);
    const row=(await f.store.inspect<{lease_until:string|Date}>('SELECT lease_until FROM ouro_github_jobs WHERE delivery_id=$1',[f.job.id])).rows[0];
    assert(new Date(row.lease_until).getTime()<Date.now(),'idempotent receipt is readable, but the expired worker no longer owns a lease to renew');
    assert.equal((await f.store.getProject()).version,previous);
  }finally{await f.store.close();}
});
