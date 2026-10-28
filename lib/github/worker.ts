import type { GitHubBinding } from '../../packages/core/src';
import { createGitHubClient, type GitHubVerifiedCommit, type NormalizedGitHubPush } from './verification';

export type GitHubClaim={id:string;deliveryId:string;payload:NormalizedGitHubPush;bindingIds:string[];leaseToken:string;attempts:number};
export type GitHubWorkerStore={
  getProject():Promise<{githubBindings:GitHubBinding[]}>;
  claimGitHubDelivery(options?:{now?:number;leaseMs?:number}):Promise<GitHubClaim|null>;
  ingestVerifiedGitHubCommit(input:{jobId:string;leaseToken:string;bindingId:string;commit:GitHubVerifiedCommit}):Promise<unknown>;
  finishGitHubDelivery(jobId:string,leaseToken:string,reason?:string):Promise<void>;
  failGitHubDelivery(jobId:string,leaseToken:string,error:{code:string;retryAfterMs?:number;permanent?:boolean}):Promise<void>;
};
export type GitHubWorkerDependencies={getStore:()=>Promise<GitHubWorkerStore>;client:{verifyCommit(repository:{id:number;fullName:string},sha:string):Promise<GitHubVerifiedCommit>};maxJobs?:number;leaseMs?:number};
export function createGitHubWorker(dependencies:GitHubWorkerDependencies){
  let running:Promise<{processed:number}>|null=null;
  return {run:():Promise<{processed:number}>=>{
    if(running)return running;
    running=(async()=>{
      const store=await dependencies.getStore();let processed=0;
      const limit=Math.max(1,Math.min(100,dependencies.maxJobs??10));
      for(let count=0;count<limit;count++){
        const job=await store.claimGitHubDelivery({leaseMs:dependencies.leaseMs??60_000});if(!job)break;
        try{
          if(job.payload.disposition==='needs_review'){
            await store.failGitHubDelivery(job.id,job.leaseToken,{code:'INCOMPLETE_PUSH',permanent:true});continue;
          }
          if(job.payload.disposition==='ignored'){
            await store.finishGitHubDelivery(job.id,job.leaseToken,'IGNORED_PUSH');processed++;continue;
          }
          let revoked=false;
          for(const bindingId of job.bindingIds){
            const binding=(await store.getProject()).githubBindings.find(item=>item.id===bindingId);
            if(!binding||binding.revokedAt){revoked=true;continue;}
            if(binding.repositoryId!==job.payload.repositoryId||binding.ref!==job.payload.ref)throw Object.assign(new Error('Несовпавший контекст доставки.'),{code:'VERIFICATION_FAILED'});
            for(const sha of job.payload.commitShas){
              const commit=await dependencies.client.verifyCommit({id:binding.repositoryId,fullName:binding.repositoryFullName},sha);
              try{await store.ingestVerifiedGitHubCommit({jobId:job.id,leaseToken:job.leaseToken,bindingId,commit});}
              catch(error){if((error as {code?:string}).code==='BINDING_REVOKED'){revoked=true;break;}throw error;}
            }
          }
          await store.finishGitHubDelivery(job.id,job.leaseToken,revoked?'BINDING_REVOKED':undefined);processed++;
        }catch(error){
          const code=(error as {code?:string}).code;
          // The current owner alone can change a job. Expired/stolen leases recover in the store.
          if(code==='LEASE_CONFLICT'||code==='LEASE_EXPIRED'||code==='LEASE_LOST')continue;
          const permanent=code==='VERIFICATION_FAILED'||code==='VALIDATION_ERROR';
          const delay=(error as {retryAfterMs?:number}).retryAfterMs;
          try{await store.failGitHubDelivery(job.id,job.leaseToken,{code:permanent?code!:'GITHUB_UNAVAILABLE',permanent,...(typeof delay==='number'&&Number.isFinite(delay)?{retryAfterMs:Math.max(1000,Math.min(3_600_000,delay))}:{})});}
          catch{/* A new owner/restart can recover the durable job; never log upstream errors or credentials. */}
        }
      }
      return {processed};
    })().finally(()=>{running=null;});
    return running;
  }};
}

type WorkerRuntime={worker?:ReturnType<typeof createGitHubWorker>;timer?:ReturnType<typeof setInterval>};
const runtimeState=()=>{
  const global=globalThis as typeof globalThis & {__ouroGitHubWorker?:WorkerRuntime};
  return global.__ouroGitHubWorker??={};
};
export async function kickGitHubWorker():Promise<void>{
  if(!process.env.OURO_GITHUB_WEBHOOK_SECRET)return;
  const state=runtimeState();
  state.worker??=createGitHubWorker({getStore:async()=>(await import('../store')).getGitHubStore(),client:createGitHubClient({token:process.env.OURO_GITHUB_TOKEN})});
  await state.worker.run();
}
export function startGitHubWorker():void{
  if(!process.env.OURO_GITHUB_WEBHOOK_SECRET)return;
  const state=runtimeState();if(state.timer)return;
  const recover=()=>{void kickGitHubWorker().catch(()=>{/* pending rows and expired leases remain durable for recovery */});};
  state.timer=setInterval(recover,5000);state.timer.unref();
  // register returns promptly; the server owns one existing store singleton.
  const startup=setTimeout(recover,0);startup.unref();
}
