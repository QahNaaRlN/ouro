import {validateNodeVersion} from '../runtime-node.mjs';
import {materializeConsumerBuildTree} from './materialize-build-tree.mjs';
import {readCommittedConsumerSource} from './committed-source.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,lstat,readdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {request} from 'node:http';
import path from 'node:path';

/** Квалификация возвращает только безопасный phase code, без raw SDK/npm/HTTP/config errors. */
export class ConsumerQualificationError extends Error{
 constructor(phase){super('Independent consumer source qualification failed.');this.name='ConsumerQualificationError';this.code='CONSUMER_QUALIFICATION_FAILED';this.phase=phase;}
}

/** Сохраняет tool capability settings, исключая ambient application authority и Node hooks. */
function minimalEnvironment(){
 const keys=['SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','NODE_USE_ENV_PROXY','PLAYWRIGHT_BROWSERS_PATH'];
 const environment=Object.fromEntries(keys.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));environment.PATH=path.dirname(process.execPath)+path.delimiter+(environment.PATH??'');environment.NODE_ENV='production';return environment;
}

/** Сохраняет исходный request-target для negative assets/API/HEAD matrix. */
function raw(url,target,method='GET',accept='text/html'){
 return new Promise((resolve,reject)=>{
  const origin=new URL(url),pending=request({host:origin.hostname,port:origin.port,path:target,method,headers:{Accept:accept},agent:false},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.once('error',reject);response.once('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));});
  pending.setTimeout(10000,()=>pending.destroy(Error('Owned raw request deadline')));pending.once('error',reject);pending.end();
 });
}

/** Проверяет один новый independent install tree; это не end-user launcher или generation protocol. */
export async function qualifyConsumerSource(options){
 validateNodeVersion(process.versions.node);
 const report={schemaVersion:1,scope:'SOURCE_BUILD_QUALIFICATION',overall:'FAILED',endUserRelease:'NOT_QUALIFIED',node:process.versions.node,platform:process.platform,phases:{}};
 let phase='ADMISSION',allocated=false,active,streamAbort,streamPump,streamError,environment,root,consumer;
 const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
 const waitFor=async(predicate,deadline=15000)=>{const end=Date.now()+deadline;while(Date.now()<end){if(predicate())return;await delay(20);}throw new ConsumerQualificationError(phase);};
 const run=(cwd,args,deadline=240000)=>{const result=spawnSync(process.execPath,args,{cwd,env:environment,encoding:'utf8',shell:false,windowsHide:true,timeout:deadline,maxBuffer:8*1024*1024});if(result.status!==0||result.error)throw new ConsumerQualificationError(phase);return result.stdout;};
 const stop=async()=>{
  if(!active)return;const {child,closed}=active;if(child.connected)child.send('ouro:shutdown',()=>{});let exit;void closed.then(value=>exit=value);
  try{await waitFor(()=>exit!==undefined);assert.deepEqual(exit,{code:0,signal:null});active=undefined;}
  catch{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed;active=undefined;throw new ConsumerQualificationError('GRACEFUL_STOP');}
 };
 try{
  if(!options||!['repository','workDirectory','npmCli'].every(key=>typeof options[key]==='string'&&path.isAbsolute(options[key])))throw new Error();
  if(options.installBrowser&&(!options.browser||process.env.CI!=='true'))throw new Error();
  root=path.resolve(options.workDirectory);consumer=path.join(root,'consumer');await mkdir(path.dirname(root),{recursive:true});await mkdir(root);allocated=true;environment=minimalEnvironment();
  try{await lstat(path.join(options.repository,'node_modules'));report.sourceRepositoryInstallAbsent=false;}catch(error){if(error?.code!=='ENOENT')throw error;report.sourceRepositoryInstallAbsent=true;}
  const source=readCommittedConsumerSource({repository:options.repository,ref:options.ref});report.sourceCommit=source.commit;report.sourceFiles=source.consumerFiles.length;
  phase='MATERIALIZATION';const materialized=await materializeConsumerBuildTree({repository:options.repository,ref:source.commit,outputDirectory:consumer,npmCli:options.npmCli});report.productVersion=materialized.productVersion;report.protocolVersion=materialized.protocolVersion;report.phases.materialization='PASS';
  phase='CONSUMER_CI';run(consumer,[options.npmCli,'ci','--include=dev','--no-audit','--no-fund']);report.phases.independentCi='PASS';
  const foreign=path.join(root,'foreign cwd & данные'),workspace=path.join(root,'workspace'),profile=path.join(root,'owned-profile');await mkdir(foreign);await mkdir(workspace);
  phase='FRESH_BUILD';run(foreign,[path.join(consumer,'scripts/build-consumer.mjs')]);report.phases.freshForeignCwdBuild='PASS';report.phases.devToolingWithProductionNodeEnv='PASS';
  const inputManifest=JSON.parse(await readFile(path.join(consumer,'build-source-manifest.json'),'utf8')),copied=new Set([...source.consumerFiles.map(file=>file.path),'scripts/build-consumer.mjs','tsconfig.json','package.json']);
  assert(inputManifest.browserInputs.length>0&&inputManifest.serviceInputs.length>0);for(const file of [...inputManifest.browserInputs,...inputManifest.serviceInputs])assert(copied.has(file));report.phases.sourceInputClosure='PASS';
  const require=createRequire(path.join(consumer,'package.json'));for(const name of ['@ouro/protocol','@modelcontextprotocol/sdk/client/index.js','@playwright/test','@electric-sql/pglite','zod','react','hono'])assert(require.resolve(name).startsWith(path.join(consumer,'node_modules')+path.sep));assert(!(await lstat(path.join(consumer,'node_modules/@ouro/protocol'))).isSymbolicLink());
  assert.deepEqual(Object.keys(require('@ouro/protocol/http')),[]);assert.equal(require('@ouro/protocol').PROTOCOL_VERSION,source.protocolVersion);assert.equal((await import(pathToFileURL(path.join(consumer,'node_modules/@ouro/protocol/dist/esm/index.js')))).PROTOCOL_VERSION,source.protocolVersion);report.phases.localDependencyResolution='PASS';
  phase='BARE_PROTOCOL_CONSUMER';const bare=path.join(root,'portable protocol consumer'),protocolFile=`ouro-protocol-${source.protocolVersion}.tgz`,installedLock=JSON.parse(await readFile(path.join(consumer,'package-lock.json'),'utf8')),barePackage={name:'ouro-portable-protocol-qualification',version:'0.0.0',private:true,type:'module',dependencies:{'@ouro/protocol':'file:vendor/'+protocolFile}};await mkdir(bare);await mkdir(path.join(bare,'vendor'));await writeFile(path.join(bare,'vendor',protocolFile),await readFile(path.join(consumer,'vendor',protocolFile)));await writeFile(path.join(bare,'package.json'),JSON.stringify(barePackage));await writeFile(path.join(bare,'package-lock.json'),JSON.stringify({name:barePackage.name,version:barePackage.version,lockfileVersion:3,requires:true,packages:{'':{name:barePackage.name,version:barePackage.version,dependencies:barePackage.dependencies},'node_modules/@ouro/protocol':installedLock.packages['node_modules/@ouro/protocol'],'node_modules/zod':installedLock.packages['node_modules/zod']}}));run(bare,[options.npmCli,'ci','--ignore-scripts','--no-audit','--no-fund']);
  await writeFile(path.join(bare,'check.mjs'),`import assert from'node:assert/strict';import{PROTOCOL_VERSION}from'@ouro/protocol';assert.equal(PROTOCOL_VERSION,${JSON.stringify(source.protocolVersion)});assert.deepEqual(Object.keys(await import('@ouro/protocol/http')),[]);`);await writeFile(path.join(bare,'check.cjs'),`const assert=require('node:assert/strict');assert.equal(require('@ouro/protocol').PROTOCOL_VERSION,${JSON.stringify(source.protocolVersion)});assert.deepEqual(Object.keys(require('@ouro/protocol/http')),[]);`);run(bare,[path.join(bare,'check.mjs')]);run(bare,[path.join(bare,'check.cjs')]);
  const httpTypes="import type{ProjectRole,ProjectMetadata,ParticipantRegistration,WorkspaceBindingRecoveryInspection}from'@ouro/protocol/http';const role:ProjectRole='Owner';const project:ProjectMetadata={id:'p',name:'P',slug:'p',createdAt:'2026-11-04',createdBy:null,role};const participant:ParticipantRegistration={id:'h',projectId:project.id,name:'H',createdAt:project.createdAt,createdBy:'owner',revokedAt:null,revokedBy:null};const platform:WorkspaceBindingRecoveryInspection['runtime']['platform']='win32';void[participant,platform];";await writeFile(path.join(bare,'types.ts'),httpTypes);await writeFile(path.join(bare,'types.cts'),httpTypes);await writeFile(path.join(bare,'tsconfig.json'),JSON.stringify({compilerOptions:{module:'NodeNext',moduleResolution:'NodeNext',target:'ES2022',strict:true,noEmit:true,types:[]},include:['*.ts','*.cts']}));run(bare,[require.resolve('typescript/bin/tsc'),'-p',path.join(bare,'tsconfig.json')]);
  const protocolCli=path.join(bare,'node_modules/@ouro/protocol/bin/ouro-protocol.mjs'),manifestResult=run(bare,[protocolCli,'manifest']);assert.equal(JSON.parse(manifestResult).version,source.protocolVersion);run(bare,[protocolCli,'validate-flow',path.join(bare,'node_modules/@ouro/protocol/examples/flow-valid.json')]);const invalid=spawnSync(process.execPath,[protocolCli,'validate-flow',path.join(bare,'node_modules/@ouro/protocol/examples/flow-invalid.json')],{cwd:bare,env:environment,encoding:'utf8',shell:false,windowsHide:true,timeout:10000});assert.equal(invalid.status,1);report.phases.bareProtocolEsmCjsTypesCli='PASS';
  const headers={Authorization:'Bearer owned-consumer-qualification-human','Content-Type':'application/json'};
  const start=async()=>{
   const child=spawn(process.execPath,[path.join(consumer,'apps/service/dist/main.mjs')],{cwd:foreign,env:{...environment,PORT:'0',OURO_SERVICE_HOST:'127.0.0.1',OURO_DATA_DIR:profile,OURO_LOCAL_DEMO:'1',OURO_HUMAN_TOKEN:'owned-consumer-qualification-human',OURO_STATIC_ROOT:path.join(consumer,'apps/web/dist'),OURO_VERIFICATION_RUNTIME_DIR:path.join(root,'verification')},stdio:['ignore','pipe','pipe','ipc'],shell:false,windowsHide:true});
   const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));let stdout='';child.stdout.on('data',chunk=>stdout=(stdout+String(chunk)).slice(-16000));child.stderr.on('data',()=>{});active={child,closed};await waitFor(()=>/^OURO_SERVICE_READY (.+)$/m.test(stdout)||child.exitCode!==null,30000);const match=stdout.match(/^OURO_SERVICE_READY (.+)$/m);assert(match);const url=JSON.parse(match[1]).url;assert.equal(new URL(url).hostname,'127.0.0.1');active.url=url;assert.equal((await fetch(url+'/api/health',{signal:AbortSignal.timeout(10000)})).status,200);return active;
  };
  const json=async(url,method='GET',body)=>{const response=await fetch(url,{method,body,headers,signal:AbortSignal.timeout(10000)});assert([200,201].includes(response.status));return response.json();};
  phase='ARTIFACT_RUNTIME';let running=await start();const creation={requestId:randomUUID(),rootPath:workspace,name:'Independent consumer project'},created=await json(running.url+'/api/projects','POST',JSON.stringify(creation)),base='/api/projects/'+created.project.id,before=await json(running.url+base);
  const ui=await raw(running.url,'/projects');assert.equal(ui.status,200);assert(ui.body.includes(Buffer.from('<div id="root"></div>')));assert.equal((await raw(running.url,'/projects','HEAD')).body.length,0);
  const assetDirectory=path.join(consumer,'apps/web/dist/assets'),assets=await readdir(assetDirectory);
  for(const extension of ['.js','.css','.woff2']){
   const filename=assets.find(file=>file.endsWith(extension));assert(filename);const bytes=await readFile(path.join(assetDirectory,filename)),target='/assets/'+encodeURIComponent(filename),get=await raw(running.url,target,'GET','*/*'),head=await raw(running.url,target,'HEAD','*/*');
   assert.equal(get.status,200);assert.equal(head.status,200);assert(get.body.equals(bytes));assert.equal(get.headers['content-length'],String(bytes.length));assert.equal(head.headers['content-length'],String(bytes.length));assert.equal(head.body.length,0);assert.equal(get.headers['cache-control'],'public, max-age=3600');
  }
  report.phases.jsCssFontByteIntegrity='PASS';
  for(const[target,method,accept,status]of [['/assets/missing.json','GET','text/html',404],['/assets/missing.wasm','GET','text/html',404],['/assets/missing.mjs','HEAD','text/html',404],['/assets/missing.anything','GET','text/html',404],['/api/missing','GET','text/html',404],['/api/missing','HEAD','text/html',404],['/projects/help','GET','application/json',404],['/projects/help','GET','*/*',404],['/projects/help','POST','text/html',404],['/assets/%2e%2e/forbidden','GET','text/html',404]])assert.equal((await raw(running.url,target,method,accept)).status,status);
  const expectedHtml=await readFile(path.join(consumer,'apps/web/dist/index.html')),html=await raw(running.url,'/'),head=await raw(running.url,'/','HEAD');
  report.htmlIntegrity={status:html.body.equals(expectedHtml)&&html.headers['content-length']===String(expectedHtml.length)&&head.headers['content-length']===String(expectedHtml.length)&&head.body.length===0?'PASS':'FAIL',expectedBytes:expectedHtml.length,receivedBytes:html.body.length};report.phases.staticAndNegativeMatrix='PASS';
  streamAbort=new AbortController();const stream=await fetch(running.url+base+'/stream',{headers,signal:streamAbort.signal});assert.equal(stream.status,200);let text='';const reader=stream.body.getReader();streamPump=(async()=>{try{for(;;){const next=await reader.read();if(next.done)return;text+=Buffer.from(next.value).toString();}}catch(error){if(!streamAbort.signal.aborted)streamError=error;}})();await waitFor(()=>text.includes('event: snapshot'));
  const command={type:'createSpec',requestId:randomUUID(),expectedVersion:before.cursor,content:{title:'Independent fresh build',goal:'Persist source artifact',dod:[{id:'one',text:'Receipt after restart',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}},body=' '+JSON.stringify(command)+'\n',receipt=await json(running.url+base+'/commands','POST',body);assert.equal(receipt.replayed,false);await waitFor(()=>text.includes('id: '+receipt.cursor+'\n'));report.phases.progressiveSse='PASS';
  const registration=await json(running.url+base+'/agents','POST',JSON.stringify({name:'Independent stdio'}));assert(registration.connection.stdioArgs[0].startsWith(path.join(consumer,'apps/service/dist/resources')));
  const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js'),client=new Client({name:'independent-consumer-qualification',version:'1'});
  try{await client.connect(new StdioClientTransport({command:process.execPath,args:registration.connection.stdioArgs,cwd:foreign,env:{...environment,OURO_URL:running.url+base+'/mcp',OURO_PROJECT_ID:created.project.id,OURO_AGENT_TOKEN:registration.token}}));assert((await client.listTools()).tools.some(tool=>tool.name==='ouro.get_context'));assert.notEqual((await client.callTool({name:'ouro.get_context',arguments:{}})).isError,true);}finally{await client.close();}report.phases.issuedMcpStdio='PASS';
  await stop();streamAbort.abort();await streamPump;assert.equal(streamError,undefined);running=await start();const restored=await json(running.url+base);assert.equal(restored.cursor,receipt.cursor);assert.deepEqual(restored.state.specs,receipt.state.specs);const replay=await json(running.url+base+'/commands','POST',body);assert.equal(replay.replayed,true);assert.deepEqual(replay.events,receipt.events);assert.deepEqual(replay.state,receipt.state);report.phases.persistedRestartExactReceipt='PASS';
  phase='RUNNER_AND_BROWSER';const scratch=path.join(root,'runner outside install');await mkdir(scratch);await writeFile(path.join(scratch,'package.json'),JSON.stringify({type:'module'}));const specs={'common.spec.cjs':"const{test,expect}=require('@playwright/test');test('common owned resolution',()=>expect(1).toBe(1));\n",'module.spec.mjs':"import{test,expect}from'@playwright/test';test('module owned resolution',()=>expect(2).toBe(2));\n",'typed.spec.ts':"import{test,expect}from'@playwright/test';test('typed owned resolution',()=>{const value:number=3;expect(value).toBe(3);});\n"};for(const[file,contents]of Object.entries(specs))await writeFile(path.join(scratch,file),contents);
  if(options.browser){const navigation=source.qualificationFiles.find(file=>file.path==='apps/web/tests/navigation.spec.ts');assert(navigation);await writeFile(path.join(scratch,'navigation.spec.ts'),navigation.bytes);}
  const preload=pathToFileURL(path.join(consumer,'apps/service/dist/resources/verification/playwright-preload.mjs'));preload.searchParams.set('package',pathToFileURL(path.join(consumer,'apps/service/package.json')).href);
  if(options.installBrowser)run(foreign,[require.resolve('@playwright/test/cli'),'install','--with-deps','chromium']);
  await writeFile(path.join(scratch,'playwright.config.mjs'),`export default {testDir:${JSON.stringify(scratch)},testMatch:'*.spec.*',workers:1,retries:0,reporter:'list',outputDir:${JSON.stringify(path.join(root,'runner-output'))},use:{baseURL:${JSON.stringify(running.url)},headless:true,viewport:{width:1440,height:1000}}};`);
  const runner=run(foreign,['--import',preload.href,require.resolve('@playwright/test/cli'),'test','--config',path.join(scratch,'playwright.config.mjs')],180000);assert.match(runner,new RegExp((options.browser?9:3)+' passed'));for(const[file,contents]of Object.entries(specs))assert.equal(createHash('sha256').update(await readFile(path.join(scratch,file))).digest('hex'),createHash('sha256').update(contents).digest('hex'));if(options.browser)assert((await readFile(path.join(scratch,'navigation.spec.ts'))).equals(source.qualificationFiles[0].bytes));report.phases.ownedRunnerCjsEsmTs='PASS';report.phases.navigationCookieBrowser6=options.browser?'PASS':'NOT_RUN';
  await stop();report.phases.gracefulShutdown='PASS';report.overall=report.htmlIntegrity.status==='PASS'?'PASS':'PARTIAL_HTML_INTEGRITY_FAILED';return report;
 }catch{report.error={code:'CONSUMER_QUALIFICATION_FAILED',phase};throw new ConsumerQualificationError(phase);}
 finally{
  streamAbort?.abort();await streamPump?.catch(()=>{});
  if(active)try{await stop();}catch{report.phases.gracefulShutdown='FAILED';}
  if(allocated)await writeFile(path.join(root,'qualification-report.json'),JSON.stringify(report,null,2)+'\n');
 }
}
