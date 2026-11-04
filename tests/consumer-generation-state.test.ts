import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile,rename,symlink,copyFile,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import type {PathLike} from 'node:fs';
import {allocateGeneration,snapshotGeneration,publishBuiltGeneration,readBuiltGeneration} from '../scripts/consumer-delivery/generation-state.mjs';

const runtime=fileURLToPath(new URL('../scripts/consumer-delivery/generation-state.mjs',import.meta.url)),parent=fileURLToPath(new URL('./fixtures/consumer-delivery/generation-parent.mjs',import.meta.url)),writer=fileURLToPath(new URL('./fixtures/consumer-delivery/generation-writer.mjs',import.meta.url));
const delay=(milliseconds:number)=>new Promise(resolve=>setTimeout(resolve,milliseconds));
/** Удаляет только заранее проверенный собственный корень после завершения его fixture children. */
async function cleanup(root:string){assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()));assert(path.basename(root).startsWith('ouro-generation-state-'));await rm(root,{recursive:true,force:true});}

test('CGL01 concurrent preparations allocate disjoint fresh install trees',{timeout:10000},async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{const [first,second]=await Promise.all([allocateGeneration(root),allocateGeneration(root)]);assert.notEqual(first.directory,second.directory);assert.notEqual(first.id,second.id);assert.match(first.id,/^g-[a-f0-9-]{36}$/);await writeFile(path.join(first.directory,'sentinel'),'first');await writeFile(path.join(second.directory,'sentinel'),'second');assert.equal(await readFile(path.join(first.directory,'sentinel'),'utf8'),'first');}
 finally{await cleanup(root);}
});

test('CGL02 parent death with a known surviving writer never reuses or deletes its old generation',{timeout:15000},async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-')),nonce=randomUUID(),child=spawn(process.execPath,[parent,runtime,root,writer,nonce],{stdio:['ignore','pipe','pipe'],windowsHide:true,shell:false});
 let output='',failure='',old:{directory:string;id:string}|undefined,port:number|undefined,writerPid:number|undefined;const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
 child.stdout.on('data',chunk=>{output+=String(chunk);for(const line of output.split('\n').filter(Boolean)){try{const record=JSON.parse(line);if(record.kind==='parent')old=record.generation;if(record.kind==='writer'){port=record.port;writerPid=record.pid;}}catch{}}});child.stderr.on('data',chunk=>failure+=String(chunk));
 try{
  const until=Date.now()+5000;while((!old||!port)&&Date.now()<until)await delay(20);assert(old&&port,failure);child.kill('SIGKILL');await exited;
  const oldFile=path.join(old.directory,'old-writer.txt'),before=(await readFile(oldFile)).length,fresh=await allocateGeneration(root);assert.notEqual(fresh.directory,old.directory);await writeFile(path.join(fresh.directory,'new-owner.txt'),'new');const deadline=Date.now()+3000;while((await readFile(oldFile)).length<=before&&Date.now()<deadline)await delay(20);assert((await readFile(oldFile)).length>before);assert.equal(await readFile(path.join(fresh.directory,'new-owner.txt'),'utf8'),'new');
 }finally{
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;
  if(port){try{await fetch('http://127.0.0.1:'+port+'/stop/'+nonce,{method:'POST',signal:AbortSignal.timeout(3000)});}catch{if(writerPid)try{process.kill(writerPid,'SIGKILL');}catch{}}}
  if(writerPid){const until=Date.now()+3000;for(;;){try{process.kill(writerPid,0);}catch{break;}if(Date.now()>until)throw Error('Owned fixture writer did not exit; retained tree.');await delay(20);}}
  await cleanup(root);
 }
});

const digest=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
/** Создаёт конечную source blueprint без зависимостей, npm или рабочего профиля. */
async function sourceFixture(root:string){
 const files=[{path:'app.ts',bytes:'export const value=1;',editable:true},{path:'package.json',bytes:'{"name":"own-fixture"}',editable:false}];await mkdir(path.join(root,'source'));
 for(const file of files)await writeFile(path.join(root,'source',file.path),file.bytes);
 await writeFile(path.join(root,'consumer-envelope.json'),JSON.stringify({schemaVersion:1,scope:'CONSUMER_GENERATION_ENVELOPE',sourceCommit:'a'.repeat(40),productVersion:'0.1.0-beta.4',protocolVersion:'0.3.0',sourceFiles:files.map(({path:filename,bytes,editable})=>({path:filename,sha256:digest(bytes),editable}))}));
}
/** Имитирует только завершённые artifact bytes для state-machine tests; actual build квалифицируется отдельно. */
async function builtFixture(directory:string){for(const [file,bytes]of Object.entries({'apps/web/dist/index.html':'<div id="root"></div>','apps/service/dist/index.mjs':'export const ready=true;','apps/service/dist/main.mjs':'export {};','apps/service/dist/resources/migrations/001_init.sql':'SELECT 1;','apps/service/dist/resources/verification/playwright-preload.mjs':'export {};','apps/service/dist/resources/mcp/bin/ouro-mcp.mjs':'export {};'})){await mkdir(path.dirname(path.join(directory,file)),{recursive:true});await writeFile(path.join(directory,file),bytes);}}

test('CGL03 unknown or incomplete generation cannot become a runtime selection',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await allocateGeneration(root);await assert.rejects(()=>readBuiltGeneration(root));}finally{await cleanup(root);}
});

test('CGL04 finite snapshot preserves known source edits and ignores unlisted user files',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await sourceFixture(root);await writeFile(path.join(root,'source/app.ts'),'export const value=2;');await writeFile(path.join(root,'source/.env.local'),'OWN_SECRET=not-copied');const generation=await allocateGeneration(root),snapshot=await snapshotGeneration(root,generation);assert.equal(await readFile(path.join(generation.directory,'app.ts'),'utf8'),'export const value=2;');assert.notEqual(snapshot.files.find(file=>file.path==='app.ts')?.sha256,snapshot.files.find(file=>file.path==='app.ts')?.shippedSha256);await assert.rejects(()=>readFile(path.join(generation.directory,'.env.local')));await writeFile(path.join(root,'source/package.json'),'{}');const second=await allocateGeneration(root);await assert.rejects(()=>snapshotGeneration(root,second));}finally{await cleanup(root);}
});

test('CGL05 completed record/pointer admit only exact unmodified artifacts and failed build preserves prior pointer',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await sourceFixture(root);const first=await allocateGeneration(root),snapshot=await snapshotGeneration(root,first);await builtFixture(first.directory);await publishBuiltGeneration(root,first,snapshot);assert.equal((await readBuiltGeneration(root)).id,first.id);const prior=await readFile(path.join(root,'.ouro-runtime/last-built.json'));const second=await allocateGeneration(root),next=await snapshotGeneration(root,second);await assert.rejects(()=>publishBuiltGeneration(root,second,next));assert(prior.equals(await readFile(path.join(root,'.ouro-runtime/last-built.json'))));await writeFile(path.join(first.directory,'apps/web/dist/index.html'),'changed');await assert.rejects(()=>readBuiltGeneration(root));}finally{await cleanup(root);}
});

test('CGL06 foreign pointer and unsafe source identities fail closed',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await sourceFixture(root);await mkdir(path.join(root,'.ouro-runtime'));await writeFile(path.join(root,'.ouro-runtime/last-built.json'),JSON.stringify({schemaVersion:1,generation:'../../foreign',recordSha256:'0'.repeat(64)}));await assert.rejects(()=>readBuiltGeneration(root));const manifest=JSON.parse(await readFile(path.join(root,'consumer-envelope.json'),'utf8'));manifest.sourceFiles.push({path:'../foreign',sha256:'0'.repeat(64),editable:true});await writeFile(path.join(root,'consumer-envelope.json'),JSON.stringify(manifest));const generation=await allocateGeneration(root);await assert.rejects(()=>snapshotGeneration(root,generation));}finally{await cleanup(root);}
});

test('CGL07 source directory aliases cannot redirect a finite snapshot',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await sourceFixture(root);await rename(path.join(root,'source'),path.join(root,'actual-source'));await symlink(path.join(root,'actual-source'),path.join(root,'source'),process.platform==='win32'?'junction':'dir');const generation=await allocateGeneration(root);await assert.rejects(()=>snapshotGeneration(root,generation));assert.equal(await readFile(path.join(root,'actual-source/app.ts'),'utf8'),'export const value=1;');}finally{await cleanup(root);}
});

test('CGL08 concurrent completions publish complete immutable records without replacing an existing record',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await sourceFixture(root);const first=await allocateGeneration(root),second=await allocateGeneration(root),one=await snapshotGeneration(root,first),two=await snapshotGeneration(root,second);await Promise.all([builtFixture(first.directory),builtFixture(second.directory)]);await Promise.all([publishBuiltGeneration(root,first,one),publishBuiltGeneration(root,second,two)]);assert([first.id,second.id].includes((await readBuiltGeneration(root)).id));assert.equal((await readBuiltGeneration(root,first.id)).id,first.id);assert.equal((await readBuiltGeneration(root,second.id)).id,second.id);const prior=await readFile(path.join(root,'.ouro-runtime/last-built.json'));await assert.rejects(()=>publishBuiltGeneration(root,first,one));assert(prior.equals(await readFile(path.join(root,'.ouro-runtime/last-built.json'))));}finally{await cleanup(root);}
});

test('CGL10 issued generation selector remains A after a separate build publishes B and keeps foreign cwd/args',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{
  await sourceFixture(root);const first=await allocateGeneration(root),second=await allocateGeneration(root),one=await snapshotGeneration(root,first),two=await snapshotGeneration(root,second);await builtFixture(first.directory);await builtFixture(second.directory);
  for(const [generation,label]of [[first,'A'],[second,'B']]as const)await writeFile(path.join(generation.directory,'apps/service/dist/resources/mcp/bin/ouro-mcp.mjs'),`process.stdout.write(JSON.stringify({label:${JSON.stringify(label)},cwd:process.cwd(),args:process.argv.slice(2),keyFile:process.env.OURO_AGENT_TOKEN_FILE})+'\\n');`);
  await publishBuiltGeneration(root,first,one);await publishBuiltGeneration(root,second,two);assert.equal((await readBuiltGeneration(root)).id,second.id);
  for(const relative of ['scripts/runtime-node.mjs','scripts/consumer-mcp.mjs','scripts/consumer-delivery/generation-state.mjs']){await mkdir(path.dirname(path.join(root,relative)),{recursive:true});await copyFile(fileURLToPath(new URL('../'+relative,import.meta.url)),path.join(root,relative));}
  const entry=path.join(root,'packages/mcp/bin/ouro-mcp.mjs');await mkdir(path.dirname(entry),{recursive:true});await copyFile(fileURLToPath(new URL('../release/consumer/mcp-entry.mjs.template',import.meta.url)),entry);const foreign=path.join(root,'foreign cwd & данные');await mkdir(foreign);
  const run=(args:string[])=>spawnSync(process.execPath,[entry,...args],{cwd:foreign,env:{...process.env,OURO_AGENT_TOKEN_FILE:'relative-agent.key'},encoding:'utf8',windowsHide:true,shell:false,timeout:10000});
  const bound=run(['--generation',first.id,'--help']);assert.equal(bound.status,0,bound.stderr);assert.deepEqual(JSON.parse(bound.stdout),{label:'A',cwd:foreign,args:['--help'],keyFile:'relative-agent.key'});const manual=run([]);assert.equal(manual.status,0,manual.stderr);assert.equal(JSON.parse(manual.stdout).label,'B');
  for(const args of [['--generation','../../foreign'],['--generation',first.id,'--generation',second.id],['--unknown','PRIVATE']]){const failed=run(args);assert.equal(failed.status,1);assert.equal(failed.stdout,'');assert.equal(failed.stderr.includes('PRIVATE'),false);}
 }finally{await cleanup(root);}
});

let renameFaultOwner:Promise<void>=Promise.resolve();
/** Инъецирует только rename syscall; lease сериализует cleanup даже после отмены test callback. */
async function renameFault(context:TestContext,fault:(source:PathLike,destination:PathLike,original:typeof import('node:fs/promises').rename)=>Promise<void>,work:()=>Promise<void>){
 const prior=renameFaultOwner;let release:()=>void=()=>{};renameFaultOwner=new Promise<void>(resolve=>release=()=>resolve());await prior;
 const filesystem=createRequire(import.meta.url)('node:fs/promises')as typeof import('node:fs/promises'),original=filesystem.rename,platform=Object.getOwnPropertyDescriptor(process,'platform');
 try{assert(platform);context.mock.method(filesystem,'rename',(source,destination)=>fault(source,destination,original));Object.defineProperty(process,'platform',{...platform,value:'win32'});syncBuiltinESMExports();await work();}
 finally{try{context.mock.restoreAll();if(platform)Object.defineProperty(process,'platform',platform);syncBuiltinESMExports();}finally{release();}}
}

test('CGL17 transient Windows pointer rename retries the same closed inode and exact bytes',async context=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await sourceFixture(root);const generation=await allocateGeneration(root),snapshot=await snapshotGeneration(root,generation);await builtFixture(generation.directory);let attempts=0;const identities:string[]=[],contents:string[]=[],sources:string[]=[];
  await renameFault(context,async(source,destination,original)=>{const filesystem=await import('node:fs/promises'),stat=await filesystem.lstat(source);sources.push(String(source));identities.push(stat.dev+':'+stat.ino);contents.push((await filesystem.readFile(source)).toString('hex'));if(++attempts<3)throw Object.assign(Error('Owned transient fault'),{code:'EPERM'});await original(source,destination);},()=>publishBuiltGeneration(root,generation,snapshot).then(()=>{}));assert.equal(attempts,3);assert.equal(new Set(identities).size,1);assert.equal(new Set(contents).size,1);assert.equal(new Set(sources).size,1);assert.equal((await readBuiltGeneration(root)).id,generation.id);
 }finally{await cleanup(root);}
});

test('CGL18 permanent Windows rename failure is bounded and preserves the previous complete pointer',async context=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await sourceFixture(root);const first=await allocateGeneration(root),one=await snapshotGeneration(root,first);await builtFixture(first.directory);await publishBuiltGeneration(root,first,one);const pointer=await readFile(path.join(root,'.ouro-runtime/last-built.json')),second=await allocateGeneration(root),two=await snapshotGeneration(root,second);await builtFixture(second.directory);let attempts=0;
  await renameFault(context,async()=>{attempts++;throw Object.assign(Error('Owned permanent fault'),{code:'EBUSY'});},()=>assert.rejects(()=>publishBuiltGeneration(root,second,two)));assert(attempts>1&&attempts<=41);assert(pointer.equals(await readFile(path.join(root,'.ouro-runtime/last-built.json'))));assert.equal((await readBuiltGeneration(root)).id,first.id);
 }finally{await cleanup(root);}
});

test('CGL19 transformed own pointer temp fails without retry and is never removed as if unchanged',async context=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await sourceFixture(root);const generation=await allocateGeneration(root),snapshot=await snapshotGeneration(root,generation);await builtFixture(generation.directory);let attempts=0,changed='';
  await renameFault(context,async source=>{attempts++;changed=String(source);await writeFile(source,'TRANSFORMED_OWN_FIXTURE');throw Object.assign(Error('Owned transformed fault'),{code:'EPERM'});},()=>assert.rejects(()=>publishBuiltGeneration(root,generation,snapshot)));assert.equal(attempts,1);assert.equal(await readFile(changed,'utf8'),'TRANSFORMED_OWN_FIXTURE');await assert.rejects(()=>readFile(path.join(root,'.ouro-runtime/last-built.json')));
 }finally{await cleanup(root);}
});

test('CGL20 missing pointer temp is an unknown publication and is never recreated or retried',async context=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await sourceFixture(root);const generation=await allocateGeneration(root),snapshot=await snapshotGeneration(root,generation);await builtFixture(generation.directory);let attempts=0;
  await renameFault(context,async source=>{attempts++;await(await import('node:fs/promises')).unlink(source);throw Object.assign(Error('Owned missing fault'),{code:'EPERM'});},()=>assert.rejects(()=>publishBuiltGeneration(root,generation,snapshot),error=>error instanceof Error&&'code'in error&&error.code==='CONSUMER_POINTER_TEMP_CHANGED'));assert.equal(attempts,1);await assert.rejects(()=>readFile(path.join(root,'.ouro-runtime/last-built.json')));
 }finally{await cleanup(root);}
});

test('CGL21 permanent publication failure never restores over another completed writer pointer',async context=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await sourceFixture(root);const first=await allocateGeneration(root),one=await snapshotGeneration(root,first);await builtFixture(first.directory);await publishBuiltGeneration(root,first,one);const firstPointer=await readFile(path.join(root,'.ouro-runtime/last-built.json'));const second=await allocateGeneration(root),two=await snapshotGeneration(root,second);await builtFixture(second.directory);await publishBuiltGeneration(root,second,two);const candidate=await allocateGeneration(root),next=await snapshotGeneration(root,candidate);await builtFixture(candidate.directory);let attempts=0;
  await renameFault(context,async(_source,destination,original)=>{if(++attempts===1){const completed=path.join(root,'.ouro-runtime/other-complete.tmp');await writeFile(completed,firstPointer,{flag:'wx'});await original(completed,destination);}throw Object.assign(Error('Owned permanent fault'),{code:'EBUSY'});},()=>assert.rejects(()=>publishBuiltGeneration(root,candidate,next)));assert(attempts>1);assert(firstPointer.equals(await readFile(path.join(root,'.ouro-runtime/last-built.json'))));assert.equal((await readBuiltGeneration(root)).id,first.id);
 }finally{await cleanup(root);}
});

test('CGL22 replaced pointer temp with identical bytes is retained and never retried under the old identity',async context=>{
 const root=await mkdtemp(path.join(tmpdir(),'ouro-generation-state-'));
 try{await sourceFixture(root);const generation=await allocateGeneration(root),snapshot=await snapshotGeneration(root,generation);await builtFixture(generation.directory);let attempts=0,changed='',previous=0;
  await renameFault(context,async(source,_destination,original)=>{attempts++;changed=String(source);const content=await readFile(source);previous=(await lstat(source)).ino;const replacement=changed+'.replacement';await writeFile(replacement,content,{flag:'wx'});await original(replacement,source);throw Object.assign(Error('Owned replaced fault'),{code:'EPERM'});},()=>assert.rejects(()=>publishBuiltGeneration(root,generation,snapshot),error=>error instanceof Error&&'code'in error&&error.code==='CONSUMER_POINTER_TEMP_CHANGED'));assert.equal(attempts,1);assert.notEqual((await lstat(changed)).ino,previous);assert.equal(JSON.parse(await readFile(changed,'utf8')).generation,generation.id);await assert.rejects(()=>readFile(path.join(root,'.ouro-runtime/last-built.json')));
 }finally{await cleanup(root);}
});
