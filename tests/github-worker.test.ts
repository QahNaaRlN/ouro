import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubWorker, type GitHubClaim, type GitHubWorkerStore } from '../lib/github/worker';
import type { GitHubBinding } from '../packages/core/src';

const sha='a'.repeat(40);
const binding:GitHubBinding={id:'binding-a',projectId:'project',executionId:'execution-a',specId:'spec-a',specRevisionId:'revision-a',repositoryId:42,repositoryFullName:'ouro/demo',ref:'refs/heads/feature',createdAt:new Date().toISOString(),createdBy:'human'};
const proof={repositoryId:42,repositoryFullName:'ouro/demo',fullSha:sha,url:`https://github.com/ouro/demo/commit/${sha}`,title:'Коммит',verifiedAt:new Date().toISOString(),verificationMethod:'github-api-sha' as const};
function fixture(){
  const current={...binding},calls:{ingest:unknown[];finish:unknown[];fail:unknown[]}={ingest:[],finish:[],fail:[]};
  let remaining=true;
  const job:GitHubClaim={id:'job-a',deliveryId:'delivery-a',bindingIds:[binding.id],leaseToken:'lease-a',attempts:1,payload:{repositoryId:42,repositoryFullName:'ouro/demo',ref:binding.ref,before:'b'.repeat(40),after:sha,commitShas:[sha],payloadDigest:'c'.repeat(64),disposition:'pending'}};
  const store:GitHubWorkerStore={getProject:async()=>({githubBindings:[current]}),claimGitHubDelivery:async()=>{if(!remaining)return null;remaining=false;return job;},ingestVerifiedGitHubCommit:async(input)=>{if(current.revokedAt)throw Object.assign(new Error('Revoked'),{code:'BINDING_REVOKED'});calls.ingest.push(input);return {};},finishGitHubDelivery:async(...args)=>{calls.finish.push(args);},failGitHubDelivery:async(...args)=>{calls.fail.push(args);}};
  return {current,calls,job,store};
}

test('G03/G06: worker verifies the bound repository and SHA before one commit, then finishes its lease',async()=>{
  const f=fixture(),verified:unknown[]=[];const worker=createGitHubWorker({getStore:async()=>f.store,client:{verifyCommit:async(...args)=>{verified.push(args);return proof;}}});
  assert.deepEqual(await worker.run(),{processed:1});assert.deepEqual(verified,[[{id:42,fullName:'ouro/demo'},sha]]);assert.deepEqual(f.calls.ingest,[{jobId:'job-a',leaseToken:'lease-a',bindingId:binding.id,commit:proof}]);assert.equal(f.calls.finish.length,1);assert.equal(f.calls.fail.length,0);
});

test('G06: worker singleflight prevents simultaneous kicks from verifying the same claim twice',async()=>{
  const f=fixture();let release!:()=>void,entered!:()=>void,verifications=0;const waiting=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
  const worker=createGitHubWorker({getStore:async()=>f.store,client:{verifyCommit:async()=>{verifications++;entered();await waiting;return proof;}}});
  const first=worker.run();let observed=false;await Promise.race([started.then(()=>{observed=true;}),first]);assert(observed,'Worker returned without starting verification');const second=worker.run();release();await Promise.all([first,second]);assert.equal(verifications,1);assert.equal(f.calls.ingest.length,1);
});

test('G06: revoked bindings are not verified and an in-flight revocation cannot commit',async()=>{
  const f=fixture();f.current.revokedAt=new Date().toISOString();let verified=0;
  await createGitHubWorker({getStore:async()=>f.store,client:{verifyCommit:async()=>{verified++;return proof;}}}).run();assert.equal(verified,0);assert.equal(f.calls.ingest.length,0);assert.match(JSON.stringify(f.calls.finish),/BINDING_REVOKED/);
  const inflight=fixture();await createGitHubWorker({getStore:async()=>inflight.store,client:{verifyCommit:async()=>{inflight.current.revokedAt=new Date().toISOString();return proof;}}}).run();assert.equal(inflight.calls.ingest.length,0);assert.match(JSON.stringify(inflight.calls.finish),/BINDING_REVOKED/);assert.equal(inflight.calls.fail.length,0);
});

test('G06: transient/permanent failures leave explicit safe queue outcomes and never invent a fact',async()=>{
  for(const [code,permanent] of [['GITHUB_UNAVAILABLE',false],['VERIFICATION_FAILED',true]] as const){const f=fixture();await createGitHubWorker({getStore:async()=>f.store,client:{verifyCommit:async()=>{throw Object.assign(new Error('untrusted runtime-secret leaked upstream'),{code,retryAfterMs:3000});}}}).run();assert.equal(f.calls.ingest.length,0);assert.equal(f.calls.finish.length,0);assert.equal(f.calls.fail.length,1);const failure=(f.calls.fail[0] as any[])[2];assert.equal(failure.code,code);assert.equal(failure.permanent,permanent);assert(!JSON.stringify(f.calls).includes('runtime-secret'));}
});

test('G08: review/ignored deliveries cannot be imported even if a malformed claim exposes them',async()=>{
  for(const disposition of ['needs_review','ignored'] as const){const f=fixture();f.job.payload.disposition=disposition;let verified=0;await createGitHubWorker({getStore:async()=>f.store,client:{verifyCommit:async()=>{verified++;return proof;}}}).run();assert.equal(verified,0);assert.equal(f.calls.ingest.length,0);assert(f.calls.fail.length||f.calls.finish.length);}
});

test('G06: a lost lease cannot finish or fail work now owned by another worker',async()=>{
  const f=fixture();f.store.ingestVerifiedGitHubCommit=async()=>{throw Object.assign(new Error('Lease changed'),{code:'LEASE_LOST'});};
  await createGitHubWorker({getStore:async()=>f.store,client:{verifyCommit:async()=>proof}}).run();assert.equal(f.calls.finish.length,0);assert.equal(f.calls.fail.length,0);
});
