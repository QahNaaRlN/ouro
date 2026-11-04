import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../lib/store';
import {PROJECT_ID,getVerificationReadiness,type Actor} from '../packages/core/src';
import {resolveWorkspaceFolder} from '../lib/workspace-files';
import {observeVerificationWorkspace,runnerCapabilities,type ObservationConfig} from '../lib/verification/observation';
import {runLocalVerification} from '../lib/verification/local-runner';

test('native Playwright package and CLI resolution survive the production Webpack compiler',async()=>{
 const parent=path.resolve('artifacts');await mkdir(parent,{recursive:true});const folder=await mkdtemp(path.join(parent,'verification-webpack-fixture-'));
 try{
  const nativeRequire=createRequire(import.meta.url),webpack=nativeRequire('next/dist/compiled/webpack/webpack').webpack;
  const loader=path.join(folder,'typescript-loader.cjs'),entry=path.join(folder,'entry.cjs');
  await writeFile(loader,`const ts=require(${JSON.stringify(nativeRequire.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await writeFile(entry,`const observation=require(${JSON.stringify(path.resolve('lib/verification/observation.ts'))});module.exports={capabilities:observation.runnerCapabilities(),cli:observation.resolvePlaywrightCli()};`);
  await new Promise<void>((resolve,reject)=>{const compiler=webpack({mode:'production',target:'node',entry,optimization:{minimize:false},output:{path:folder,filename:'bundle.cjs',library:{type:'commonjs2'}},resolve:{extensions:['.ts','.js','.json']},module:{rules:[{test:/\.ts$/,use:[loader]}]}});compiler.run((error:Error|null,stats:{hasErrors():boolean;toString():string})=>{compiler.close((closeError:Error|null)=>{if(error||closeError||stats.hasErrors())reject(error??closeError??new Error(stats.toString()));else resolve();});});});
  const bundled=nativeRequire(path.join(folder,'bundle.cjs'));assert.equal(bundled.capabilities.playwright,runnerCapabilities().playwright);assert.equal(bundled.cli,nativeRequire.resolve('@playwright/test/cli'));
 }finally{const absolute=path.resolve(folder);assert.equal(path.dirname(absolute),parent);await rm(absolute,{recursive:true,force:true});}
});

async function poll<T>(read:()=>Promise<T>,ready:(value:T)=>boolean,timeout=6000){const until=Date.now()+timeout;let value:T;do{value=await read();if(ready(value))return value;await new Promise(resolve=>setTimeout(resolve,40));}while(Date.now()<until);assert.fail('Timed out waiting for observation');}
async function files(){
 const parent=path.resolve('artifacts');await mkdir(parent,{recursive:true});const folder=await mkdtemp(path.join(parent,'verification-runtime-fixture-'));
 const playwright=createRequire(import.meta.url).resolve('@playwright/test');
 await writeFile(path.join(folder,'product.cjs'),'exports.add=(a,b)=>a+b;\n');
 await writeFile(path.join(folder,'data.json'),'{"fixture":"synthetic"}\n');
 await writeFile(path.join(folder,'behavior.spec.cjs'),`const {test,expect}=require(${JSON.stringify(playwright)});const {add}=require('./product.cjs');test('first',async()=>{expect(add(2,3)).toBe(5)});test('second',async()=>{expect(add(3,4)).toBe(7)});`);
 const counter=path.join(folder,'runner-process-count.txt');
 await writeFile(path.join(folder,'playwright.config.cjs'),`if(process.env.TEST_WORKER_INDEX===undefined)require('node:fs').appendFileSync(${JSON.stringify(counter)},'process\\n');module.exports={testDir:__dirname,testMatch:'behavior.spec.cjs',workers:1,retries:0,reporter:'json'};\n`);
 const config:ObservationConfig={files:[{path:'product.cjs',role:'product'},{path:'behavior.spec.cjs',role:'test'},{path:'data.json',role:'fixture'},{path:'playwright.config.cjs',role:'config'}],playwrightConfigPath:'playwright.config.cjs'};
 const cli=createRequire(import.meta.url).resolve('@playwright/test/cli'),listed=spawnSync(process.execPath,[cli,'test','--config',path.join(folder,config.playwrightConfigPath),'--list','--reporter=json'],{cwd:folder,encoding:'utf8',timeout:20000});assert.equal(listed.status,0,listed.stderr);
 const raw=JSON.parse(listed.stdout),testIds:string[]=[];const queue=[...raw.suites];while(queue.length){const suite=queue.pop();queue.push(...suite.suites??[]);testIds.push(...(suite.specs??[]).map((item:{id:string})=>item.id));}assert.equal(testIds.length,2);
 return {folder,config,testIds,counter,close:async()=>{const absolute=path.resolve(folder);assert.equal(path.dirname(absolute),parent);await rm(absolute,{recursive:true,force:true});}};
}
async function fixture(){
 const f=await files(),owner=await createStore({dataDir:'memory://',seedEvents:[]}),operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
 const {project}=await owner.createWorkspaceProject({requestId:randomUUID(),name:'Isolated runtime qualification',rootPath:f.folder},operator),store=await owner.forProject(project.id),human={...operator,projectIds:[project.id]};
 const send=async(body:Record<string,unknown>,actor=human)=>store.executeCommand({...body,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},actor);
 const content={title:'Observed work',goal:'Verify exact bounded fixture inputs',dod:[{id:'sum',text:'Both additions work',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
 let result=await send({type:'createSpec',content});const work=result.state.specs[0],workRevision=result.state.revisions[0];await send({type:'activateRevision',specId:work.id,revisionId:workRevision.id});
 const verification={version:1,targetSpecId:work.id,targetRevisionId:workRevision.id,criterionIds:['sum'],workflow:'verification',cases:f.testIds.map((testId,index)=>({id:'case-'+index,criterionIds:['sum'],given:'Synthetic fixture',action:'Add two numbers',expected:'Correct sum',data:'data.json',prerequisites:'Playwright runner available',level:'e2e',purpose:'acceptance',required:true,procedure:{kind:'playwright',testId}}))};
 result=await send({type:'createSpec',content:{...content,title:'Observed verification',verification}});const spec=result.state.specs[1],revision=result.state.revisions[1];await send({type:'activateRevision',specId:spec.id,revisionId:revision.id});
 const registration=await store.createAgent('Bound runtime test agent',human),agent:Actor={id:registration.agent.id,kind:'agent',projectIds:[project.id]};result=await send({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.id});const execution=result.state.executions.at(-1)!;await send({type:'confirmResumed',executionId:execution.id,ackPhase:'start'},agent);
 const observe=()=>store.observeVerification({requestId:randomUUID(),expectedVersion:0,verificationRevisionId:revision.id,config:f.config,reason:'Explicit human-approved bounded file manifest'} as any,human);
 const configInput=async()=>({requestId:randomUUID(),expectedVersion:(await store.getProject()).version,verificationRevisionId:revision.id,config:f.config,reason:'Explicit human-approved bounded file manifest'});
 await store.observeVerification(await configInput(),human);
 return {...f,owner,store,human,agent,send,work,workRevision,spec,revision,execution,configInput,close:async()=>{await owner.close();await f.close();}};
}

test('observed manifests hash real bounded bytes/capabilities, retain role slices, reject unsafe/missing input without reading secrets',async()=>{
 const f=await files();try{
  const root=await resolveWorkspaceFolder(f.folder),binding={id:'isolated-binding',canonicalPath:root.canonicalPath,identity:root.identity},first=await observeVerificationWorkspace(binding,f.config);
  assert.equal(first.status,'observed');assert.equal(first.files.length,4);assert.equal(first.capabilities.node,process.version);
  await writeFile(path.join(f.folder,'product.cjs'),'exports.add=(a,b)=>a-b;\n');const product=await observeVerificationWorkspace(binding,f.config);assert.notEqual(product.slice.productRevision,first.slice.productRevision);assert.equal(product.slice.testRevision,first.slice.testRevision);
  await writeFile(path.join(f.folder,'data.json'),'{"fixture":"changed"}');const fixtureChanged=await observeVerificationWorkspace(binding,f.config);assert.notEqual(fixtureChanged.slice.fixtureRevision,first.slice.fixtureRevision);
  const environment=await observeVerificationWorkspace(binding,f.config,{...runnerCapabilities(),platform:'other-platform'});assert.notEqual(environment.slice.environmentDigest,first.slice.environmentDigest);
  const runtimeUnavailable=await observeVerificationWorkspace(binding,f.config,()=>{throw new Error('Synthetic runtime dependency unavailable');});assert.equal(runtimeUnavailable.status,'unavailable');assert.match(runtimeUnavailable.reason??'',/runtime dependency unavailable/);assert.notEqual(runtimeUnavailable.digest,first.digest);assert.deepEqual(runtimeUnavailable.capabilities,{});
  await writeFile(path.join(f.folder,'.env'),'SECRET_NOT_READ=123');const denied=await observeVerificationWorkspace(binding,{...f.config,files:[...f.config.files,{path:'.env',role:'config'}]});assert.equal(denied.status,'unavailable');assert(!JSON.stringify(denied).includes('SECRET_NOT_READ'));
  const escaped=await observeVerificationWorkspace(binding,{...f.config,files:[...f.config.files,{path:'../outside.cjs',role:'product'}]});assert.equal(escaped.status,'unavailable');
 }finally{await f.close();}
});

test('server-owned runner creates authenticated immutable evidence, exact recovery never reruns, observer detects changes without GET writes',async()=>{
 const f=await fixture();try{
  const before=await f.store.getProject();for(let i=0;i<5;i++)assert.equal((await f.store.getProject()).version,before.version,'Read-only GET/projection does not write observations');
  const body={requestId:randomUUID(),expectedVersion:before.version,executionId:f.execution.id,scopeCaseIds:['case-0','case-1']};
  const starts=(await readFile(f.counter,'utf8')).split('\n').filter(Boolean).length;
  await f.store.inspect("CREATE FUNCTION ouro_test_fail_runtime_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='completed' THEN RAISE EXCEPTION 'injected runtime receipt completion failure'; END IF; RETURN NEW; END $$");await f.store.inspect('CREATE TRIGGER ouro_test_fail_runtime_completion BEFORE UPDATE ON ouro_verification_runner_requests FOR EACH ROW EXECUTE FUNCTION ouro_test_fail_runtime_completion()');
  await assert.rejects(f.store.runVerification(body,f.human),(error:any)=>error.code==='RUNNER_OUTCOME_UNKNOWN'&&error.details?.outcomeUnknown===true);
  assert.equal((await f.store.getProject()).verificationRuns.length,1,'The immutable domain receipt committed before the operational write failed');
  await f.store.inspect('DROP TRIGGER ouro_test_fail_runtime_completion ON ouro_verification_runner_requests');await f.store.inspect('DROP FUNCTION ouro_test_fail_runtime_completion()');
  const result=await f.store.runVerification(body,f.human),run=result.state.verificationRuns.at(-1)!;assert.equal(result.replayed,true);
  assert.equal((await readFile(f.counter,'utf8')).split('\n').filter(Boolean).length,starts+1,'Exact recovery must not launch a second process');
  assert.equal(run.outcome,'passed');assert.equal(run.source.kind,'local_runner');if(run.source.kind!=='local_runner')assert.fail();assert.equal(run.source.verificationMethod,'server-owned-playwright-process');assert.equal(run.source.exitCode,0);assert.equal(run.source.inputStability,'unchanged');assert.equal(run.artifactManifest?.files.length,4);assert.equal(getVerificationReadiness(result.state,f.revision).ready,true);
  assert.equal(result.state.specs[0].acceptance,undefined);
  const replayed=await f.store.runVerification(body,f.human);assert.equal(replayed.replayed,true);assert.deepEqual(replayed.events,result.events);assert.equal((await f.store.getProject()).verificationRuns.length,1);
  await assert.rejects(f.store.runVerification({...body,scopeCaseIds:['case-0']},f.human),(error:any)=>error.code==='IDEMPOTENCY_CONFLICT');
  await assert.rejects(f.store.executeCommand({type:'createSpec',content:{title:'Conflicting command',goal:'Do not reuse runtime key',dod:[{id:'one',text:'Never committed',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''},requestId:body.requestId,expectedVersion:result.cursor},f.human),(error:any)=>error.code==='IDEMPOTENCY_CONFLICT');
  await assert.rejects(f.store.runVerification({...body,requestId:randomUUID(),command:'echo forbidden'},f.human),(error:any)=>error.code==='VALIDATION_ERROR');
  await assert.rejects(f.store.runVerification({...body,requestId:randomUUID()},f.agent),(error:any)=>error.code==='FORBIDDEN');
  // Simulate a response lost after the immutable run committed but before operational status persisted.
  await f.store.inspect("UPDATE ouro_verification_runner_requests SET status='pending',response=NULL WHERE request_id=$1",[body.requestId]);const recovered=await f.store.runVerification(body,f.human);assert.equal(recovered.replayed,true);assert.equal((await f.store.getProject()).verificationRuns.length,1);
  const immutable=structuredClone(run);await writeFile(path.join(f.folder,'product.cjs'),'exports.add=(a,b)=>a-b;\n');
  const changed=await poll(()=>f.store.getProject(),state=>getVerificationReadiness(state,f.revision).applicability==='stale');assert.deepEqual(changed.verificationRuns[0],immutable);assert(changed.verificationObservations.length>=2);
  await rm(path.join(f.folder,'data.json'));const unavailable=await poll(()=>f.store.getProject(),state=>state.verificationObservations.at(-1)?.observation.status==='unavailable');assert.equal(getVerificationReadiness(unavailable,f.revision).ready,false);
 }finally{await f.close();}
});

test('configuration+initial observation rollback atomically and their exact pending receipt recovers without duplicate admission',async()=>{
 const f=await fixture();try{
  const before=await f.store.getProject(),body=await f.configInput();
  await f.store.inspect("CREATE FUNCTION ouro_test_fail_observation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='VerificationWorkspaceObserved' THEN RAISE EXCEPTION 'injected observation append failure'; END IF; RETURN NEW; END $$");await f.store.inspect('CREATE TRIGGER ouro_test_fail_observation BEFORE INSERT ON ouro_domain_events FOR EACH ROW EXECUTE FUNCTION ouro_test_fail_observation()');
  await assert.rejects(f.store.observeVerification(body,f.human),/injected observation append failure/);assert.deepEqual(await f.store.getProject(),before);
  await f.store.inspect('DROP TRIGGER ouro_test_fail_observation ON ouro_domain_events');await f.store.inspect('DROP FUNCTION ouro_test_fail_observation()');
  const completedBody={...body,requestId:randomUUID()},saved=await f.store.observeVerification(completedBody,f.human),configs=saved.state.verificationObservationConfigs.length;
  await f.store.inspect("UPDATE ouro_verification_runner_requests SET status='pending',response=NULL WHERE request_id=$1",[completedBody.requestId]);const recovered=await f.store.observeVerification(completedBody,f.human);assert.equal(recovered.replayed,true);assert.deepEqual(recovered.events,saved.events);assert.equal((await f.store.getProject()).verificationObservationConfigs.length,configs);
  await assert.rejects(f.store.observeVerification({...completedBody,reason:'Changed approval'},f.human),(error:any)=>error.code==='IDEMPOTENCY_CONFLICT');
 }finally{await f.close();}
});

test('stop during the bounded process kills owned runner and records a late error fact without resuming execution',async()=>{
 const f=await fixture();try{
  await writeFile(path.join(f.folder,'behavior.spec.cjs'),(await readFile(path.join(f.folder,'behavior.spec.cjs'),'utf8')).replace("expect(add(2,3))","await new Promise(resolve=>setTimeout(resolve,5000));expect(add(2,3))"));
  await poll(()=>f.store.getProject(),state=>state.verificationObservations.at(-1)?.observation.slice.testRevision!==state.verificationRuns.at(-1)?.slice.testRevision);
  const state=await f.store.getProject(),pending=f.store.runVerification({requestId:randomUUID(),expectedVersion:state.version,executionId:f.execution.id,scopeCaseIds:['case-0','case-1']},f.human);
  await new Promise(resolve=>setTimeout(resolve,300));await f.send({type:'requestStop',executionId:f.execution.id,reason:'Explicit stop while local runner owns a child process'});
  const result=await pending,run=result.state.verificationRuns.at(-1)!;assert.equal(run.outcome,'error');assert.equal(result.state.executions.find(item=>item.id===f.execution.id)?.stopRequested,true);assert(!result.events.some(item=>item.type==='ExecutionResumed'));assert.equal(getVerificationReadiness(result.state,f.revision).ready,false);
 }finally{await f.close();}
});

test('store shutdown aborts and drains its owned runner before closing SQL',async()=>{
 const f=await fixture();
 try{
  await writeFile(path.join(f.folder,'behavior.spec.cjs'),(await readFile(path.join(f.folder,'behavior.spec.cjs'),'utf8')).replace("expect(add(2,3))","await new Promise(resolve=>setTimeout(resolve,5000));expect(add(2,3))"));
  const state=await f.store.getProject();
  const pending=f.store.runVerification({requestId:randomUUID(),expectedVersion:state.version,executionId:f.execution.id,scopeCaseIds:['case-0','case-1']},f.human);
  void pending.catch(()=>undefined);
  await new Promise(resolve=>setTimeout(resolve,300));
  await f.owner.close();
  const result=await pending;
  assert.equal(result.state.verificationRuns.at(-1)?.outcome,'error');
  assert.equal(result.events.some(event=>event.type==='ExecutionResumed'),false);
  await assert.rejects(f.store.getProject(),{code:'STORE_CLOSED'});
 }finally{await f.close();}
});

test('changed checkout cannot alter the copied test input or reuse its former GREEN as current evidence',async()=>{
 const f=await fixture();try{
  const original=await readFile(path.join(f.folder,'behavior.spec.cjs'),'utf8');await writeFile(path.join(f.folder,'behavior.spec.cjs'),original.replace("expect(add(2,3))","await new Promise(resolve=>setTimeout(resolve,1300));expect(add(2,3))"));
  // Explicit refresh avoids relying on a timing assumption for the initial test snapshot.
  await f.store.observeVerification({requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version,verificationRevisionId:f.revision.id},f.human);
  const body={requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version,executionId:f.execution.id,scopeCaseIds:['case-0','case-1']},pending=f.store.runVerification(body,f.human);
  await new Promise(resolve=>setTimeout(resolve,400));await writeFile(path.join(f.folder,'product.cjs'),'exports.add=(a,b)=>a-b;\n');
  const result=await pending,run=result.state.verificationRuns.at(-1)!;assert.equal(run.outcome,'passed','Immutable copied input still contains addition, even while original product changes');assert.equal(run.source.kind,'local_runner');if(run.source.kind==='local_runner')assert.equal(run.source.inputStability,'changed');assert.equal(getVerificationReadiness(result.state,f.revision).ready,false);assert.equal(getVerificationReadiness(result.state,f.revision).applicability,'stale');
 }finally{await f.close();}
});

test('agent revocation during a run cancels the owned process but retains a server-attributed late fact; generic spoofed observations are forbidden',async()=>{
 const f=await fixture();try{
  await writeFile(path.join(f.folder,'behavior.spec.cjs'),(await readFile(path.join(f.folder,'behavior.spec.cjs'),'utf8')).replace("expect(add(2,3))","await new Promise(resolve=>setTimeout(resolve,5000));expect(add(2,3))"));
  const state=await f.store.getProject(),pending=f.store.runVerification({requestId:randomUUID(),expectedVersion:state.version,executionId:f.execution.id,scopeCaseIds:['case-0','case-1']},f.human);
  await new Promise(resolve=>setTimeout(resolve,300));await f.store.revokeAgent(f.agent.id,f.human);
  const result=await pending;assert.equal(result.state.verificationRuns.at(-1)?.outcome,'error');assert.equal(result.events.at(-1)?.actor.kind,'service');assert.equal(getVerificationReadiness(result.state,f.revision).ready,false);
  const observation=result.state.verificationObservations.at(-1)!;
  await assert.rejects(f.store.executeCommand({type:'observeVerificationWorkspace',verificationRevisionId:f.revision.id,configId:observation.configId,observation:observation.observation,requestId:randomUUID(),expectedVersion:result.cursor},{id:'ouro-verification-observer',kind:'service',projectIds:[result.state.projectId]}),(error:any)=>error.code==='FORBIDDEN');
  await assert.rejects(f.store.runVerification({requestId:randomUUID(),expectedVersion:result.cursor,executionId:f.execution.id,scopeCaseIds:['case-0','case-1']},{...f.human,projectIds:['foreign-project']}),(error:any)=>error.code==='FORBIDDEN');
 }finally{await f.close();}
});

test('in-flight exact requests coalesce only after current human/project authority is rechecked',async()=>{
 const f=await fixture();try{
  const {participant}=await f.store.createParticipant('Temporary synthetic runner operator',f.human),human:Actor={id:participant.id,kind:'human',projectIds:f.human.projectIds};
  await writeFile(path.join(f.folder,'behavior.spec.cjs'),(await readFile(path.join(f.folder,'behavior.spec.cjs'),'utf8')).replace("expect(add(2,3))","await new Promise(resolve=>setTimeout(resolve,5000));expect(add(2,3))"));
  await f.store.observeVerification({requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version,verificationRevisionId:f.revision.id},f.human);
  const body={requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version,executionId:f.execution.id,scopeCaseIds:['case-0','case-1']},starts=(await readFile(f.counter,'utf8')).split('\n').filter(Boolean).length;
  const pending=f.store.runVerification(body,human),coalesced=f.store.runVerification(body,human);
  await assert.rejects(f.store.runVerification(body,{...human,kind:'agent'}),(error:any)=>error.code==='FORBIDDEN');
  await assert.rejects(f.store.runVerification(body,{...human,projectIds:['foreign-project']}),(error:any)=>error.code==='FORBIDDEN');
  await poll(async()=>(await readFile(f.counter,'utf8')).split('\n').filter(Boolean).length,count=>count===starts+1);
  await f.store.revokeParticipant(human.id,f.human);
  await assert.rejects(f.store.runVerification(body,human),(error:any)=>error.code==='FORBIDDEN');
  const [result,repeated]=await Promise.all([pending,coalesced]);assert.deepEqual(repeated,result);assert.equal(result.state.verificationRuns.at(-1)?.outcome,'error');assert.equal((await readFile(f.counter,'utf8')).split('\n').filter(Boolean).length,starts+1);
  await assert.rejects(f.store.runVerification(body,human),(error:any)=>error.code==='FORBIDDEN');
 }finally{await f.close();}
});

test('a passing test that rewrites its copied product cannot qualify the original observed manifest',async()=>{
 const f=await fixture();try{
  await writeFile(path.join(f.folder,'product.cjs'),'exports.add=(a,b)=>a-b;\n');
  const originalTest=await readFile(path.join(f.folder,'behavior.spec.cjs'),'utf8');
  await writeFile(path.join(f.folder,'behavior.spec.cjs'),"require('node:fs').writeFileSync(require.resolve('./product.cjs'),'exports.add=(a,b)=>a+b;\\n');"+originalTest);
  await f.store.observeVerification({requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version,verificationRevisionId:f.revision.id},f.human);
  const result=await f.store.runVerification({requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version,executionId:f.execution.id,scopeCaseIds:['case-0','case-1']},f.human),run=result.state.verificationRuns.at(-1)!;
  assert.equal(run.outcome,'passed');assert.equal(run.source.kind,'local_runner');if(run.source.kind==='local_runner')assert.equal(run.source.inputStability,'changed');assert.equal(getVerificationReadiness(result.state,f.revision).ready,false);assert.equal(await readFile(path.join(f.folder,'product.cjs'),'utf8'),'exports.add=(a,b)=>a-b;\n');
 }finally{await f.close();}
});

test('a declared filename resembling a CLI option cannot override fixed runner arguments',async()=>{
 const f=await fixture();try{
  await writeFile(path.join(f.folder,'--workers=9'),'// A literal admitted filename, never a CLI option.\n');
  const config:ObservationConfig={...f.config,files:[...f.config.files,{path:'--workers=9',role:'test'}]};
  await f.store.observeVerification({...await f.configInput(),config},f.human);
  const result=await f.store.runVerification({requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version,executionId:f.execution.id,scopeCaseIds:['case-0','case-1']},f.human),run=result.state.verificationRuns.at(-1)!;
  assert.equal(run.outcome,'passed');assert.equal(run.source.kind,'local_runner');if(run.source.kind==='local_runner'){assert.equal(JSON.parse(run.source.rawReport).config.workers,1);assert.equal(run.source.inputStability,'unchanged');}
 }finally{await f.close();}
});

test('regex punctuation in a declared test filename selects exactly that file',async()=>{
 const f=await files();try{
  const selected='behavior[0].spec.cjs',decoy='behavior0.spec.cjs',text=await readFile(path.join(f.folder,'behavior.spec.cjs'),'utf8');
  await writeFile(path.join(f.folder,selected),text);await rm(path.join(f.folder,'behavior.spec.cjs'));
  await writeFile(path.join(f.folder,decoy),`const {test}=require(${JSON.stringify(createRequire(import.meta.url).resolve('@playwright/test'))});test('must never execute',()=>{throw new Error('Unlisted fixture was incorrectly selected');});`);
  await writeFile(path.join(f.folder,'playwright.config.cjs'),"module.exports={testDir:__dirname,testMatch:/.*\\.spec\\.cjs$/,workers:1,retries:0,reporter:'json'};\n");
  const listed=spawnSync(process.execPath,[createRequire(import.meta.url).resolve('@playwright/test/cli'),'test','--config',path.join(f.folder,'playwright.config.cjs'),'--list','--reporter=json','behavior\\[0\\]\\.spec\\.cjs$','--'],{cwd:f.folder,encoding:'utf8',timeout:20000});assert.equal(listed.status,0,listed.stderr);
  const raw=JSON.parse(listed.stdout),ids=raw.suites.flatMap((suite:{specs:{id:string}[]})=>suite.specs.map(item=>item.id));assert.equal(ids.length,2);
  const config:ObservationConfig={...f.config,files:f.config.files.map(item=>item.role==='test'?{...item,path:selected}:item).concat([{path:decoy,role:'fixture'}])};
  const contract:Parameters<typeof runLocalVerification>[0]['contract']={version:1,targetSpecId:'synthetic-work',targetRevisionId:'synthetic-work-r1',criterionIds:['sum'],workflow:'verification',cases:ids.map((testId:string,index:number)=>({id:'case-'+index,criterionIds:['sum'],given:'Synthetic input',action:'Add numbers',expected:'Correct sum',data:'data.json',prerequisites:'Local runner',level:'e2e',purpose:'acceptance',required:true,procedure:{kind:'playwright',testId}}))};
  const root=await resolveWorkspaceFolder(f.folder),result=await runLocalVerification({binding:{id:'literal-file-fixture',canonicalPath:root.canonicalPath,identity:root.identity},config,contract,scopeCaseIds:['case-0','case-1'],submittedBy:'synthetic-human',shouldStop:async()=>false});
  assert.equal(result.proof.outcome,'passed');assert.equal(result.proof.source.inputStability,'unchanged');const report=JSON.parse(result.proof.source.rawReport);assert.deepEqual(report.suites.map((suite:{title:string})=>suite.title),[selected]);
 }finally{await f.close();}
});
