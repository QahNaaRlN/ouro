import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile,readdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

type Phase={phase:string;args:string[];cwd:string;dataDir?:string};
async function fixture(){
 const directory=await mkdtemp(path.join(tmpdir(),"ouro launch & $(literal) ' запуск ")),repository=path.join(directory,'release app'),foreign=path.join(directory,'another working directory');
 await mkdir(path.join(repository,'scripts'),{recursive:true});await mkdir(foreign);await mkdir(path.join(repository,'.ouro'));
 await writeFile(path.join(repository,'package.json'),JSON.stringify({name:'ouro-launch-fixture',private:true}));await writeFile(path.join(repository,'package-lock.json'),'{}');
 await writeFile(path.join(repository,'.ouro','sentinel'),'PRESERVE_EXISTING_DATA');
 const launcher=path.join(repository,'scripts','launch.mjs');await copyFile(path.resolve('scripts/launch.mjs'),launcher);
 const log=path.join(directory,'phases.jsonl'),heartbeat=path.join(directory,'heartbeat'),descendant=path.join(directory,'descendant.json'),npm=path.join(directory,"npm cli & ' пробел.mjs");
 await writeFile(npm,`import {appendFileSync,writeFileSync} from 'node:fs';import {spawn} from 'node:child_process';
 const args=process.argv.slice(2),phase=args[0]==='run'?args[1]:args[0];appendFileSync(process.env.FAKE_PHASE_LOG,JSON.stringify({phase,args,cwd:process.cwd(),dataDir:process.env.OURO_DATA_DIR})+'\\n');
 if(process.env.FAKE_FAIL_PHASE===phase)process.exit(7);
 if(process.env.FAKE_SIGNAL_PHASE===phase)process.kill(process.pid,'SIGTERM');
 if(process.env.FAKE_WAIT_PHASE===phase){
  const program="const fs=require('node:fs');process.on('SIGINT',()=>{});setInterval(()=>fs.appendFileSync(process.env.FAKE_HEARTBEAT,'x'),20);";
  const nested=spawn(process.execPath,['-e',program],{stdio:'ignore',env:process.env});writeFileSync(process.env.FAKE_DESCENDANT,JSON.stringify({pid:nested.pid}));
  process.on('SIGINT',()=>process.exit(0));setInterval(()=>{},1000);
 }else if(phase==='start'&&process.env.FAKE_READY==='1'){console.log('Preparing fixture server');setTimeout(()=>console.log('✓ Ready in 1ms'),30);}
 `);
 const env={...process.env,npm_execpath:npm,FAKE_PHASE_LOG:log,FAKE_HEARTBEAT:heartbeat,FAKE_DESCENDANT:descendant,OURO_DATA_DIR:path.join(repository,'.ouro','данные & $(literal)')};
 const run=(args:string[]=[],overrides:Record<string,string|undefined>={})=>spawnSync(process.execPath,[launcher,...args],{cwd:foreign,env:{...env,...overrides},encoding:'utf8',timeout:15000});
 const phases=async():Promise<Phase[]>=>{try{return (await readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}};
 return {directory,repository,foreign,launcher,npm,log,heartbeat,descendant,env,run,phases,close:()=>rm(directory,{recursive:true,force:true})};
}

test('FRL03 launcher runs ordered ci/build/start from its own extracted root and preserves literal argv/data',async()=>{
 const f=await fixture();try{
  const result=f.run(['--port','4319']);assert.equal(result.status,0,result.stderr);
  assert.deepEqual(await f.phases(),[
   {phase:'ci',args:['ci'],cwd:f.repository,dataDir:f.env.OURO_DATA_DIR},
   {phase:'build',args:['run','build'],cwd:f.repository,dataDir:f.env.OURO_DATA_DIR},
   {phase:'start',args:['start','--','--port','4319'],cwd:f.repository,dataDir:f.env.OURO_DATA_DIR},
  ]);
  assert.equal(await readFile(path.join(f.repository,'.ouro','sentinel'),'utf8'),'PRESERVE_EXISTING_DATA');assert.deepEqual(await readdir(f.foreign),[]);
 }finally{await f.close();}
});

test('FRL03 a failed install/build/start preserves its code and never starts a later phase',async()=>{
 for(const [failed,count]of [['ci',1],['build',2],['start',3]] as const){const f=await fixture();try{
  const result=f.run([],{FAKE_FAIL_PHASE:failed});assert.equal(result.status,7,result.stderr);assert.equal((await f.phases()).length,count);assert.equal(result.stdout.includes('Open http://'),false);
 }finally{await f.close();}}
});

test('FRL03 malformed launch arguments fail before preparation without echoing unknown values',async()=>{
 for(const args of [['--port','0'],['--port','65536'],['--port','4300;PRIVATE-INPUT'],['--port'],['--port','4300','--port','4301'],['--hostname','PRIVATE-INPUT'],['PRIVATE-INPUT']]){
  const f=await fixture();try{const result=f.run(args);assert.equal(result.status,1);assert.deepEqual(await f.phases(),[]);assert.equal(result.stderr.includes('PRIVATE-INPUT'),false);}finally{await f.close();}
 }
});

test('FRL03 help works without npm while ordinary direct launch explains its required npm entrypoint',async()=>{
 const f=await fixture();try{
  const help=f.run(['--help'],{npm_execpath:undefined});assert.equal(help.status,0,help.stderr);assert.match(help.stdout,/npm run launch/);assert.match(help.stdout,/Node\.js 24/);assert.match(help.stdout,/every launch/);assert.deepEqual(await f.phases(),[]);
  for(const value of [undefined,'relative-npm.mjs']){const result=f.run([],{npm_execpath:value});assert.equal(result.status,1);assert.match(result.stderr,/npm run launch/);assert.deepEqual(await f.phases(),[]);}
 }finally{await f.close();}
});

test('FRL03 launcher announces its local projects URL only after the start phase confirms Ready',async()=>{
 const f=await fixture();try{
  const result=f.run(['--port','4321'],{FAKE_READY:'1'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Open http:\/\/127\.0\.0\.1:4321\/projects/);assert(result.stdout.indexOf('Ready in')<result.stdout.indexOf('Open http://'));assert.match(result.stdout,/this computer/);assert.match(result.stdout,/Ctrl\+C/);
 }finally{await f.close();}
});

test('FRL03 the runtime boundary accepts the supported minimum and rejects older Node versions',async()=>{
 const script=path.resolve('scripts/launch.mjs');
 const source=`import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const {validateNodeVersion}=await import(pathToFileURL(process.argv[2]));for(const version of ['20.9.0','20.19.0','22.0.0','24.19.0','25.0.0'])assert.doesNotThrow(()=>validateNodeVersion(version));for(const version of ['18.20.0','20.8.9','invalid'])assert.throws(()=>validateNodeVersion(version),/20.9/);`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',source,'runtime-fixture',script],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);
});

test('FRL03 a child terminated by SIGTERM preserves the signal exit code without another phase',{skip:process.platform==='win32'},async()=>{
 const f=await fixture();try{const result=f.run([],{FAKE_SIGNAL_PHASE:'build'});assert.equal(result.status,143,result.stderr);assert.deepEqual((await f.phases()).map(item=>item.phase),['ci','build']);}finally{await f.close();}
});

test('FRL03 cancellation stops an owned process group and never starts the build or server',{skip:process.platform==='win32',timeout:12000},async()=>{
 const f=await fixture();let descendantPid:number|undefined;let child:ReturnType<typeof spawn>|undefined;
 try{
  child=spawn(process.execPath,[f.launcher],{cwd:f.foreign,env:{...f.env,FAKE_WAIT_PHASE:'ci'},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr!.on('data',chunk=>{stderr+=String(chunk);});
  const finished=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>child!.once('close',(code,signal)=>resolve({code,signal})));
  for(let attempt=0;attempt<150;attempt++){
   try{descendantPid=JSON.parse(await readFile(f.descendant,'utf8')).pid;if((await readFile(f.heartbeat,'utf8')).length>0)break;}catch{}
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert(descendantPid,'The install fixture must have started its real owned descendant');
  child.kill('SIGINT');const result=await finished;assert.equal(result.code,130,stderr);assert.equal(result.signal,null);assert.deepEqual((await f.phases()).map(item=>item.phase),['ci']);
  const before=await readFile(f.heartbeat,'utf8');await new Promise(resolve=>setTimeout(resolve,150));assert.equal(await readFile(f.heartbeat,'utf8'),before,'A descendant ignoring SIGINT must not keep running after cancellation');
 }finally{
  if(descendantPid)try{process.kill(descendantPid,'SIGKILL');}catch{}
  if(child?.exitCode===null)child.kill('SIGKILL');await f.close();
 }
});
