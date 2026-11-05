import { PROJECT_ID, type GitHubBinding } from '../../packages/core/src';
import { createGitHubClient, type GitHubVerifiedCommit, type NormalizedGitHubPush } from './verification';

export type GitHubClaim={id:string;deliveryId:string;projectId?:string;payload:NormalizedGitHubPush;bindingIds:string[];leaseToken:string;attempts:number};
export type GitHubWorkerStore={
  getProject(projectId?:string):Promise<{githubBindings:GitHubBinding[]}>;
  claimGitHubDelivery(options?:{now?:number;leaseMs?:number;projectId?:string}):Promise<GitHubClaim|null>;
  ingestVerifiedGitHubCommit(input:{jobId:string;leaseToken:string;bindingId:string;commit:GitHubVerifiedCommit},projectId?:string):Promise<unknown>;
  finishGitHubDelivery(jobId:string,leaseToken:string,reason?:string,projectId?:string):Promise<void>;
  failGitHubDelivery(jobId:string,leaseToken:string,error:{code:string;retryAfterMs?:number;permanent?:boolean},projectId?:string):Promise<void>;
};
/** Связывает worker доставок GitHub с хранилищем, проверкой коммитов и ограничениями обработки и lease. */
export type GitHubWorkerDependencies={getStore:()=>Promise<GitHubWorkerStore>;client:{verifyCommit(repository:{id:number;fullName:string},sha:string,signal?:AbortSignal):Promise<GitHubVerifiedCommit>};maxJobs?:number;leaseMs?:number};
/** Создаёт обработчик очереди GitHub с проверкой коммитов и записью результатов в границах действующего lease. */
export function createGitHubWorker(dependencies:GitHubWorkerDependencies){
  let running:Promise<{processed:number}>|null=null;
  return {run:(signal?:AbortSignal):Promise<{processed:number}>=>{
    if(running)return running;
    running=(async()=>{
      const store=await dependencies.getStore();let processed=0;
      const limit=Math.max(1,Math.min(100,dependencies.maxJobs??10));
      for(let count=0;count<limit;count++){
        if(signal?.aborted)break;
        const job=await store.claimGitHubDelivery({leaseMs:dependencies.leaseMs??60_000});if(!job)break;
        const projectId=job.projectId??PROJECT_ID;
        try{
          if(job.payload.disposition==='needs_review'){
            await store.failGitHubDelivery(job.id,job.leaseToken,{code:'INCOMPLETE_PUSH',permanent:true},projectId);continue;
          }
          if(job.payload.disposition==='ignored'){
            await store.finishGitHubDelivery(job.id,job.leaseToken,'IGNORED_PUSH',projectId);processed++;continue;
          }
          let revoked=false;
          for(const bindingId of job.bindingIds){
            const binding=(await store.getProject(projectId)).githubBindings.find(item=>item.id===bindingId);
            if(!binding||binding.revokedAt){revoked=true;continue;}
            if(binding.repositoryId!==job.payload.repositoryId||binding.ref!==job.payload.ref)throw Object.assign(new Error('Несовпавший контекст доставки.'),{code:'VERIFICATION_FAILED'});
            for(const sha of job.payload.commitShas){
              if(signal?.aborted)throw new Error('Worker stopped');
              const repository={id:binding.repositoryId,fullName:binding.repositoryFullName};
              const commit=await(signal?dependencies.client.verifyCommit(repository,sha,signal):dependencies.client.verifyCommit(repository,sha));
              if(signal?.aborted)throw new Error('Worker stopped');
              try{await store.ingestVerifiedGitHubCommit({jobId:job.id,leaseToken:job.leaseToken,bindingId,commit},projectId);}
              catch(error){if((error as {code?:string}).code==='BINDING_REVOKED'){revoked=true;break;}throw error;}
            }
          }
          await store.finishGitHubDelivery(job.id,job.leaseToken,revoked?'BINDING_REVOKED':undefined,projectId);processed++;
        }catch(error){
          if(signal?.aborted)break;
          const code=(error as {code?:string}).code;
          // The current owner alone can change a job. Expired/stolen leases recover in the store.
          if(code==='LEASE_CONFLICT'||code==='LEASE_EXPIRED'||code==='LEASE_LOST')continue;
          const permanent=code==='VERIFICATION_FAILED'||code==='VALIDATION_ERROR';
          const delay=(error as {retryAfterMs?:number}).retryAfterMs;
          try{await store.failGitHubDelivery(job.id,job.leaseToken,{code:permanent?code!:'GITHUB_UNAVAILABLE',permanent,...(typeof delay==='number'&&Number.isFinite(delay)?{retryAfterMs:Math.max(1000,Math.min(3_600_000,delay))}:{})},projectId);}
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
