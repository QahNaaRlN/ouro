import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,rm,writeFile,readFile,mkdir,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {acquireProfileOwner} from '../src/runtime/profile-owner.js';
import {createOwnedGitHubWorker} from '../src/runtime/owned-github-worker.js';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {runtimeConfiguration} from '../src/runtime/configuration.js';
import {startService} from '../src/runtime/start-service.js';
import {startHttpServer} from '../src/bootstrap/start-http-server.js';
import {tcpRequest} from './http-fixtures.js';
import {throwAfterStartupCleanup} from '../src/runtime/cleanup-startup.js';
const rootRequire=createRequire(import.meta.url);
const {createGitHubWorker}:typeof import('../../../lib/github/worker')=rootRequire('../../../lib/github/worker');
const {createStore}:typeof import('../../../lib/store')=rootRequire('../../../lib/store');

test('embedded profile rejects a second owner and permits a clean restart',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'ouro-owner-fixture-'));
 const profile=join(folder,'postgres');
 try{const first=await acquireProfileOwner(profile);await assert.rejects(acquireProfileOwner(profile),/already owned/);await first.release();await first.release();const second=await acquireProfileOwner(profile);await second.release();}
 finally{await rm(folder,{recursive:true,force:true});}
});

test('ownership refuses a foreign mutex file and directory junction without modifying the target',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'ouro-mutex-foreign-')),profile=join(folder,'profile'),target=join(folder,'foreign');await mkdir(profile);await mkdir(target);
 const mutex=profile+'.ouro-profile-mutex.sqlite',sentinel='foreign fixture bytes';let unexpected:Awaited<ReturnType<typeof acquireProfileOwner>>|undefined;
 try{
  await writeFile(mutex,sentinel);
  await assert.rejects(async()=>{unexpected=await acquireProfileOwner(profile);},/mutex|Ouro/);assert.equal(await readFile(mutex,'utf8'),sentinel);
  await rm(mutex);const foreign=new DatabaseSync(mutex);foreign.exec('CREATE TABLE foreign_data(value TEXT);INSERT INTO foreign_data VALUES(\'retained\')');foreign.close();
  const bytes=await readFile(mutex);await assert.rejects(acquireProfileOwner(profile),/mutex|Ouro/);assert.deepEqual(await readFile(mutex),bytes);
  await rm(mutex);await writeFile(mutex,'');await assert.rejects(acquireProfileOwner(profile),/mutex|Ouro/);assert.equal((await readFile(mutex)).length,0);
  await rm(mutex);await symlink(target,mutex,process.platform==='win32'?'junction':'dir');
  await assert.rejects(async()=>{unexpected=await acquireProfileOwner(profile);},/mutex|symbolic/);
 }finally{await unexpected?.release();await rm(folder,{recursive:true,force:true});}
});

test('failed migrations release only the owned mutex after partial PGlite cleanup',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouro-migration-failure-')),profile=join(directory,'postgres');
 try{
  await assert.rejects(createStore({dataDir:profile,migrationsDir:join(directory,'missing-migrations')}),{code:'ENOENT'});
  const claim=await acquireProfileOwner(profile);await claim.release();
  const root=fileURLToPath(new URL('../../../',import.meta.url));
  const store=await createStore({dataDir:profile,migrationsDir:join(root,'db/migrations')});await store.close();
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('failed listener startup releases storage and a fresh runtime becomes ready on the same fixture',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouro-startup-failure-')),profile=join(directory,'postgres'),root=fileURLToPath(new URL('../../../',import.meta.url));
 const blocker=await startHttpServer({routes:[]});let runtime:Awaited<ReturnType<typeof startService>>|undefined;
 try{
  const environment={OURO_DATA_DIR:profile,PORT:new URL(blocker.url).port,OURO_LOCAL_DEMO:'1'};
  await assert.rejects(startService(runtimeConfiguration(environment,{resourceRoot:root})),{code:'EADDRINUSE'});
  const claim=await acquireProfileOwner(profile);await claim.release();
  runtime=await startService(runtimeConfiguration({...environment,PORT:'0'},{resourceRoot:root}));assert.equal(runtime.isReady(),true);assert.equal((await tcpRequest(runtime.url+'/api/health')).status,200);
  await runtime.stop();await runtime.stop();assert.equal(runtime.isReady(),false);
 }finally{await runtime?.stop();await blocker.stop();await rm(directory,{recursive:true,force:true});}
});

test('unconfirmed startup drain keeps the real profile owned until explicit safe close',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouro-startup-undrained-')),profile=join(directory,'postgres'),root=fileURLToPath(new URL('../../../',import.meta.url));
 const store=await createStore({dataDir:profile,migrationsDir:join(root,'db/migrations'),startObservers:false}),cause=new Error('fixture startup failure');let closeAttempted=false;
 try{
  await assert.rejects(throwAfterStartupCleanup(cause,{stopWorker:async()=>{throw new Error('Unconfirmed fixture worker');},stopHttp:async()=>undefined,stopBackground:()=>store.stopBackgroundWork(),closeStore:async()=>{closeAttempted=true;await store.close();}}),error=>error instanceof Error&&error.cause===cause);
  assert.equal(closeAttempted,false);await assert.rejects(acquireProfileOwner(profile),/already owned/);
 }finally{await store.close();await rm(directory,{recursive:true,force:true});}
});

test('owned recovery stops a real timer and forwards cancellation through the domain worker',async()=>{
 const sha='a'.repeat(40);let requests=0,cancelled=false,release:()=>void=()=>undefined,timer:ReturnType<typeof setInterval>|undefined;
 const claim={id:'job',deliveryId:'delivery',projectId:'project',bindingIds:['binding'],leaseToken:'lease',attempts:1,payload:{disposition:'pending' as const,repositoryId:42,repositoryFullName:'ouro/demo',ref:'refs/heads/feature',commitShas:[sha],before:sha,after:sha,payloadDigest:'c'.repeat(64)}};
 const binding={id:'binding',projectId:'project',executionId:'execution',specId:'spec',specRevisionId:'revision',repositoryId:42,repositoryFullName:'ouro/demo',ref:'refs/heads/feature',createdAt:'2026-11-04',createdBy:'human'};
 const worker=createGitHubWorker({getStore:async()=>({getProject:async()=>({githubBindings:[binding]}),claimGitHubDelivery:async()=>requests++===0?claim:null,ingestVerifiedGitHubCommit:async()=>undefined,finishGitHubDelivery:async()=>undefined,failGitHubDelivery:async()=>undefined}),client:{verifyCommit:async(_repository,_sha,signal?:AbortSignal)=>new Promise(resolve=>{
  timer=setInterval(()=>undefined,10);release=()=>{if(timer)clearInterval(timer);resolve({repositoryId:42,repositoryFullName:'ouro/demo',fullSha:sha,url:'https://github.com/ouro/demo/commit/'+sha,title:'Fixture',verifiedAt:'2026-11-04',verificationMethod:'github-api-sha'});};
  signal?.addEventListener('abort',()=>{cancelled=true;release();},{once:true});
 })}});
 const run:(signal?:AbortSignal)=>ReturnType<typeof worker.run>=worker.run;
 const owner=createOwnedGitHubWorker({enabled:true,intervalMs:10,run:signal=>run(signal)});
 try{owner.start();while(!timer)await delay(5);const stopped=owner.stop();await delay(30);assert.equal(cancelled,true,'worker must propagate its owner signal to upstream work');await stopped;const count=requests;await delay(30);assert.equal(requests,count);}
 finally{release();await owner.stop();}
});
