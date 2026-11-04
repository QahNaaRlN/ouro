import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {validateNodeVersion} from '../scripts/runtime-node.mjs';

const repository=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const baseline=require.resolve('@next/env');
const candidate=fileURLToPath(new URL('../scripts/runtime-environment.mjs',import.meta.url));
const osKeys=['SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','HOME'];
/** Next расширяет ProcessEnv обязательным NODE_ENV; fixture намеренно проверяет и его отсутствие. */
const minimalEnvironment=Object.fromEntries(osKeys.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]])) as NodeJS.ProcessEnv;
type Witness={files:string[];values:Record<string,string>;diagnostics:{file:string;code:string}[];nodeEnv?:string;port?:string;demo?:string};
type EnvironmentCase={name:string;files:Record<string,string>;environment?:Record<string,string>;phase?:'production'|'development';expected:Record<string,string>;absent?:string[];expectedFiles:string[]};
const cases:EnvironmentCase[]=[
 {name:'production precedence and empty process key',files:{'.env.production.local':'FIXTURE_SHARED=top\nFIXTURE_TOP=ok\nFIXTURE_EMPTY=file','.env.local':'FIXTURE_SHARED=local\nFIXTURE_LOCAL=ok','.env.production':'FIXTURE_SHARED=production\nFIXTURE_PRODUCTION=ok','.env':'FIXTURE_SHARED=base\nFIXTURE_BASE=ok'},environment:{NODE_ENV:'production',FIXTURE_SHARED:'process',FIXTURE_EMPTY:''},expected:{FIXTURE_SHARED:'process',FIXTURE_EMPTY:'',FIXTURE_TOP:'ok',FIXTURE_LOCAL:'ok',FIXTURE_PRODUCTION:'ok',FIXTURE_BASE:'ok'},expectedFiles:['.env.production.local','.env.local','.env.production','.env']},
 {name:'production phase with inherited development',files:{'.env.production':'FIXTURE_MODE=production','.env.development':'FIXTURE_MODE=development'},environment:{NODE_ENV:'development'},expected:{FIXTURE_MODE:'production'},expectedFiles:['.env.production']},
 {name:'test skips generic local and both other modes',files:{'.env.test.local':'FIXTURE_TOP=test-local','.env.local':'FIXTURE_IGNORED=bad','.env.test':'FIXTURE_MODE=test','.env.production':'FIXTURE_MODE=bad','.env.development':'FIXTURE_DEVELOPMENT=bad','.env':'FIXTURE_BASE=ok'},environment:{NODE_ENV:'test'},expected:{FIXTURE_TOP:'test-local',FIXTURE_MODE:'test',FIXTURE_BASE:'ok'},absent:['FIXTURE_IGNORED','FIXTURE_DEVELOPMENT'],expectedFiles:['.env.test.local','.env.test','.env']},
 {name:'quoted and expanded syntax preserves exact engine semantics',files:{'.env.local':"FIXTURE_FIRST=$FIXTURE_LATER\r\nFIXTURE_LATER=same\r\nFIXTURE_ESCAPED=\\$FIXTURE_LATER\nFIXTURE_DEFAULT=${FIXTURE_MISSING:-fallback}\nFIXTURE_EMPTY_REF=${FIXTURE_EMPTY:-fallback}\nFIXTURE_EMPTY=file\nFIXTURE_DOUBLE=\"line1\\nline2\"\nFIXTURE_SINGLE='line1\\nline2'\nFIXTURE_MULTILINE=\"first\nsecond\"\nFIXTURE_DUP=first\nFIXTURE_DUP=second\nFIXTURE_HASH=\"a#b\" # comment\nexport FIXTURE_EXPORTED=exported\nFIXTURE_COLON: spaced\nFIXTURE_UNKNOWN=$FIXTURE_MISSING\nFIXTURE_BLANK=\nFIXTURE_BACKTICK=`literal value`"},environment:{FIXTURE_EMPTY:''},expected:{FIXTURE_FIRST:'same',FIXTURE_LATER:'same',FIXTURE_ESCAPED:'$FIXTURE_LATER',FIXTURE_DEFAULT:'fallback',FIXTURE_EMPTY_REF:'fallback',FIXTURE_EMPTY:'',FIXTURE_DOUBLE:'line1\nline2',FIXTURE_SINGLE:'line1\\nline2',FIXTURE_MULTILINE:'first\nsecond',FIXTURE_DUP:'second',FIXTURE_HASH:'a#b',FIXTURE_EXPORTED:'exported',FIXTURE_COLON:'spaced',FIXTURE_UNKNOWN:'',FIXTURE_BLANK:'',FIXTURE_BACKTICK:'literal value'},expectedFiles:['.env.local']},
 {name:'references see earlier files but not future files',files:{'.env.production.local':'FIXTURE_FORWARD=$FIXTURE_LOWER\nFIXTURE_EARLIER=earlier\nFIXTURE_LITERAL=\\$FIXTURE_LOWER','.env':'FIXTURE_LOWER=lower\nFIXTURE_BACKWARD=$FIXTURE_EARLIER\nFIXTURE_LITERAL=ignored'},expected:{FIXTURE_FORWARD:'',FIXTURE_EARLIER:'earlier',FIXTURE_LITERAL:'$FIXTURE_LOWER',FIXTURE_LOWER:'lower',FIXTURE_BACKWARD:'earlier'},expectedFiles:['.env.production.local','.env']},
 {name:'inherited dollar reference retains expansion quirk',files:{'.env.production':'FIXTURE_INHERITED=ignored'},environment:{FIXTURE_INHERITED:'$FIXTURE_OTHER',FIXTURE_OTHER:'inherited'},expected:{FIXTURE_INHERITED:'inherited',FIXTURE_OTHER:'inherited'},expectedFiles:['.env.production']},
 {name:'development phase picks development files',phase:'development',files:{'.env.development.local':'FIXTURE_MODE=development-local','.env.local':'FIXTURE_LOCAL=local','.env.development':'FIXTURE_DEVELOPMENT=development','.env.production':'FIXTURE_PRODUCTION=bad','.env':'FIXTURE_BASE=base'},expected:{FIXTURE_MODE:'development-local',FIXTURE_LOCAL:'local',FIXTURE_DEVELOPMENT:'development',FIXTURE_BASE:'base'},absent:['FIXTURE_PRODUCTION'],expectedFiles:['.env.development.local','.env.local','.env.development','.env']},
];

/** Создаёт изолированный root; ни cwd, ни пользовательские env не являются входом loader. */
async function fixture(files:Record<string,string>={}){
 const directory=await mkdtemp(path.join(tmpdir(),'ouro-env-compat-')),root=path.join(directory,"installed root & данные ' $(literal)"),foreign=path.join(directory,'foreign cwd');
 await mkdir(root);await mkdir(foreign);for(const [name,contents]of Object.entries(files))await writeFile(path.join(root,name),contents);
 return {directory,root,foreign,close:async()=>{if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir())||!path.basename(directory).startsWith('ouro-env-compat-'))throw Error('Refused foreign fixture cleanup');await rm(directory,{recursive:true,force:true});}};
}

/** Сравнивает loader в новом процессе, чтобы Next initialEnv/cache не влияли на соседний case. */
function runLoader(f:{root:string;foreign:string},loader:'baseline'|'candidate',environment:Record<string,string>={},phase:'production'|'development'='production',prelude=''){
 const source=`import{createRequire}from'node:module';import{pathToFileURL}from'node:url';${prelude};const loader=process.argv[1],root=process.argv[2],phase=process.argv[3];let files,diagnostics;if(loader==='baseline'){process.env.NODE_ENV=process.env.NODE_ENV||(phase==='development'?'development':'production');const require=createRequire(import.meta.url);const old=require(process.argv[4]);diagnostics=[];const result=old.loadEnvConfig(root,phase==='development',{info(){},error(){diagnostics.push({code:'BASELINE_ERROR'});}});files=result.loadedEnvFiles.map(file=>file.path);}else{const result=await(await import(pathToFileURL(process.argv[4]).href)).loadRuntimeEnvironment({root,phase});files=result.loadedFiles;diagnostics=result.diagnostics;}process.stdout.write(JSON.stringify({files,values:Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('FIXTURE_'))),diagnostics,nodeEnv:process.env.NODE_ENV,port:process.env.PORT,demo:process.env.OURO_LOCAL_DEMO}));`;
 return spawnSync(process.execPath,['--input-type=module','-e',source,loader,f.root,phase,loader==='baseline'?baseline:candidate],{cwd:f.foreign,env:{...minimalEnvironment,...environment},windowsHide:true,shell:false,encoding:'utf8',timeout:15000});
}

test('REC01 seven synthetic cases match the installed old loader and preserve promised values',async()=>{
 for(const item of cases){const f=await fixture(item.files);try{
  const old=runLoader(f,'baseline',item.environment,item.phase),next=runLoader(f,'candidate',item.environment,item.phase);assert.equal(old.status,0,`${item.name}: baseline child`);assert.equal(next.status,0,`${item.name}: candidate child`);
  const before=JSON.parse(old.stdout) as Witness,after=JSON.parse(next.stdout) as Witness;
  assert.deepEqual(before.files,item.expectedFiles,item.name);assert.deepEqual(before.values,item.expected,item.name);for(const key of item.absent??[])assert.equal(before.values[key],undefined,item.name);
  assert.deepEqual(after,before,item.name);
 }finally{await f.close();}}
});

test('REC02 cycle failure skips the file, continues and returns only safe diagnostics',async()=>{
 const secret='SYNTHETIC_ENV_SECRET_NOT_FOR_LOGS';const f=await fixture({'.env.local':`FIXTURE_SECRET=${secret}\nFIXTURE_LOOP=$FIXTURE_LOOP`,'.env':'FIXTURE_LATER=ok'});try{
  const old=runLoader(f,'baseline'),next=runLoader(f,'candidate');assert.equal(old.status,0);assert.equal(next.status,0);
  const before=JSON.parse(old.stdout) as Witness,after=JSON.parse(next.stdout) as Witness;assert.deepEqual(before.values,{FIXTURE_LATER:'ok'});assert.equal(before.diagnostics.length,1);assert.deepEqual(after.values,before.values);assert.deepEqual(after.files,before.files);assert.deepEqual(after.diagnostics,[{code:'ENVIRONMENT_FILE_EXPANSION_FAILED',file:'.env.local'}]);assert(!next.stdout.includes(secret));assert.equal(next.stderr,'');
 }finally{await f.close();}
});

test('REC03 root-only discovery ignores foreign, parent, src, vault and dotenv-config paths',async()=>{
 const f=await fixture({'.env':'FIXTURE_ROOT=only'});try{
  await writeFile(path.join(f.directory,'.env.local'),'FIXTURE_PARENT=bad');await writeFile(path.join(f.foreign,'.env.local'),'FIXTURE_FOREIGN=bad');await mkdir(path.join(f.root,'src'));await writeFile(path.join(f.root,'src','.env.local'),'FIXTURE_SRC=bad');await writeFile(path.join(f.root,'.env.vault'),'FIXTURE_VAULT=bad');
  for(const loader of ['baseline','candidate'] as const){const result=runLoader(f,loader,{DOTENV_CONFIG_PATH:path.join(f.foreign,'.env.local'),DOTENV_KEY:'synthetic-vault-key'});assert.equal(result.status,0);const witness=JSON.parse(result.stdout) as Witness;assert.deepEqual(witness.values,{FIXTURE_ROOT:'only'});assert.deepEqual(witness.files,['.env']);assert.equal(result.stderr,'');}
 }finally{await f.close();}
});

test('REC04 build and start reload independently and do not transfer values through the parent',async()=>{
 const f=await fixture({'.env.local':'FIXTURE_PHASE=build'});try{
  const build=runLoader(f,'candidate');assert.equal(build.status,0);assert.equal((JSON.parse(build.stdout) as Witness).values.FIXTURE_PHASE,'build');await writeFile(path.join(f.root,'.env.local'),'FIXTURE_PHASE=start');const start=runLoader(f,'candidate');assert.equal(start.status,0);assert.equal((JSON.parse(start.stdout) as Witness).values.FIXTURE_PHASE,'start');assert.equal(process.env.FIXTURE_PHASE,undefined);
 }finally{await f.close();}
});

test('REC05 framework-private processed flag is explicitly outside the consumer contract',async()=>{
 const f=await fixture({'.env.local':'FIXTURE_FILE=loaded'});try{
  const old=runLoader(f,'baseline',{__NEXT_PROCESSED_ENV:'true'}),next=runLoader(f,'candidate',{__NEXT_PROCESSED_ENV:'true'});assert.equal(old.status,0);assert.equal(next.status,0);assert.deepEqual((JSON.parse(old.stdout) as Witness).values,{});assert.deepEqual((JSON.parse(next.stdout) as Witness).values,{FIXTURE_FILE:'loaded'});
 }finally{await f.close();}
});

test('REC06 actual old local-next start sets demo and selected PORT before production file loading',async()=>{
 const f=await fixture({'.env.production':'FIXTURE_MODE=production\nOURO_LOCAL_DEMO=0\nPORT=49999','.env.development':'FIXTURE_MODE=development'});try{
  const capture=path.join(f.directory,'capture.json');await writeFile(path.join(f.root,'package.json'),JSON.stringify({private:true,type:'module'}));await writeFile(path.join(f.root,'next.config.mjs'),"import{writeFileSync}from'node:fs';writeFileSync(process.env.FIXTURE_CAPTURE,JSON.stringify({mode:process.env.FIXTURE_MODE,nodeEnv:process.env.NODE_ENV,demo:process.env.OURO_LOCAL_DEMO,port:process.env.PORT}));process.exit(0);export default {};");
  const old=spawnSync(process.execPath,[path.join(repository,'scripts/local-next.mjs'),'start','--port','0'],{cwd:f.root,env:{...minimalEnvironment,FIXTURE_CAPTURE:capture,NODE_ENV:'development',OURO_LOCAL_DEMO:'0'},windowsHide:true,shell:false,encoding:'utf8',timeout:15000});
  assert.equal(old.status,0,'Actual Next must reach only the owned config witness, without opening application storage');const witness=JSON.parse(await readFile(capture,'utf8')) as {mode:string;nodeEnv:string;demo:string;port:string};assert.equal(witness.mode,'production');assert.equal(witness.nodeEnv,'development');assert.equal(witness.demo,'1');assert.match(witness.port,/^\d+$/);assert.notEqual(witness.port,'49999');assert.notEqual(witness.port,'0');
  const next=runLoader(f,'candidate',{NODE_ENV:'development',OURO_LOCAL_DEMO:'1',PORT:witness.port});assert.equal(next.status,0);const after=JSON.parse(next.stdout) as Witness;assert.equal(after.values.FIXTURE_MODE,witness.mode);assert.equal(after.port,witness.port);assert.equal(after.demo,witness.demo);assert.equal(after.nodeEnv,witness.nodeEnv);
 }finally{await f.close();}
});

test('REC07 invalid root/phase rejects safely without loading arbitrary paths',async()=>{
 const f=await fixture();try{
  const source=`import{pathToFileURL}from'node:url';const {loadRuntimeEnvironment}=await import(pathToFileURL(process.argv[1]));for(const options of [{root:'relative-SYNTHETIC_PRIVATE',phase:'production'},{root:process.argv[2],phase:'SYNTHETIC_PRIVATE'}]){try{await loadRuntimeEnvironment(options);process.exitCode=2;}catch(error){if(error.code!=='RUNTIME_ENVIRONMENT_INVALID')throw error;}}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',source,candidate,f.root],{cwd:f.foreign,env:minimalEnvironment,encoding:'utf8',timeout:10000});assert.equal(result.status,0);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
 }finally{await f.close();}
});

test('REC08 an available real unsupported Node refuses before filesystem reads and missing parser imports',async context=>{
 const executable=process.env.OURO_TEST_UNSUPPORTED_NODE??(process.platform==='win32'?path.join(process.env.ProgramFiles??'C:\\Program Files','nodejs','node.exe'):undefined);if(!executable){context.skip('Separate unsupported Node is unavailable.');return;}
 const version=spawnSync(executable,['--version'],{encoding:'utf8',timeout:10000});if(version.error&&'code'in version.error&&version.error.code==='ENOENT'){context.skip('Separate unsupported Node is unavailable.');return;}assert.equal(version.status,0);let unsupported=false;try{validateNodeVersion(version.stdout.trim().replace(/^v/,''));}catch{unsupported=true;}if(!unsupported){context.skip('Separate executable already satisfies the application runtime.');return;}
 const f=await fixture({'.env.local':'FIXTURE_SECRET=SYNTHETIC_PRIVATE'});try{
  await copyFile(candidate,path.join(f.directory,'runtime-environment.mjs'));await copyFile(path.join(repository,'scripts/runtime-node.mjs'),path.join(f.directory,'runtime-node.mjs'));
  const witness=path.join(f.directory,'forbidden-read');const source=`import fs from'node:fs';import{syncBuiltinESMExports}from'node:module';import{pathToFileURL}from'node:url';const stat=fs.statSync,read=fs.readFileSync;for(const name of ['statSync','readFileSync'])fs[name]=(...args)=>{if(String(args[0]).includes('.env')){fs.writeFileSync(process.argv[3],'read');throw Error('SYNTHETIC_PRIVATE');}return(name==='statSync'?stat:read)(...args)};syncBuiltinESMExports();try{await(await import(pathToFileURL(process.argv[1]))).loadRuntimeEnvironment({root:process.argv[2],phase:'production'});process.exitCode=2;}catch(error){process.stderr.write(error.code+'\\n');process.exitCode=1;}`;
  const result=spawnSync(executable,['--input-type=module','-e',source,path.join(f.directory,'runtime-environment.mjs'),f.root,witness],{cwd:f.foreign,env:minimalEnvironment,encoding:'utf8',timeout:10000});assert.equal(result.status,1);assert.equal(result.stderr,'NODE_RUNTIME_UNSUPPORTED\n');assert.equal(result.stdout,'');await assert.rejects(access(witness),{code:'ENOENT'});
 }finally{await f.close();}
});

test('REC09 read failures expose fixed diagnostics and continue without error/path/value logging',async()=>{
 const f=await fixture({'.env.production.local':'FIXTURE_SECRET=SYNTHETIC_PRIVATE','.env':'FIXTURE_LATER=ok'});try{
  const prelude="const fs=(await import('node:fs')).default;const read=fs.readFileSync;fs.readFileSync=(filename,...args)=>{if(String(filename).endsWith('.env.production.local'))throw Object.assign(Error('SYNTHETIC_PRIVATE raw line /secret/path'),{code:'EACCES'});return read(filename,...args);};(await import('node:module')).syncBuiltinESMExports()";
  const old=runLoader(f,'baseline',{},'production',prelude),next=runLoader(f,'candidate',{},'production',prelude);assert.equal(old.status,0);assert.equal(next.status,0);const before=JSON.parse(old.stdout) as Witness,after=JSON.parse(next.stdout) as Witness;assert.deepEqual(before.values,{FIXTURE_LATER:'ok'});assert.deepEqual(after.values,before.values);assert.deepEqual(after.diagnostics,[{code:'ENVIRONMENT_FILE_READ_FAILED',file:'.env.production.local'}]);assert(!next.stdout.includes('SYNTHETIC_PRIVATE'));assert(!next.stdout.includes('/secret/path'));assert.equal(next.stderr,'');
 }finally{await f.close();}
});

test('REC10 loading no files defaults NODE_ENV for the explicit phase without logging',async()=>{
 const f=await fixture();try{for(const phase of ['production','development'] as const){const result=runLoader(f,'candidate',{NODE_ENV:''},phase);assert.equal(result.status,0);const witness=JSON.parse(result.stdout) as Witness;assert.equal(witness.nodeEnv,phase);assert.deepEqual(witness.files,[]);assert.deepEqual(witness.diagnostics,[]);assert.equal(result.stderr,'');}}finally{await f.close();}
});

test('REC11 missing parser fails with a fixed code and does not expose dependency errors',async()=>{
 const f=await fixture({'.env.local':'FIXTURE_SECRET=SYNTHETIC_PRIVATE'});try{
  const source=`import{registerHooks}from'node:module';import{pathToFileURL}from'node:url';registerHooks({resolve(specifier,context,next){if(['dotenv','dotenv-expand'].includes(specifier))throw Error('SYNTHETIC_PRIVATE /private/dependency');return next(specifier,context);}});try{await(await import(pathToFileURL(process.argv[1]))).loadRuntimeEnvironment({root:process.argv[2],phase:'production'});process.exitCode=2;}catch(error){process.stderr.write(error.code+'\\n');process.exitCode=1;}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',source,candidate,f.root],{cwd:f.foreign,env:minimalEnvironment,encoding:'utf8',timeout:10000});assert.equal(result.status,1);assert.equal(result.stderr,'RUNTIME_ENVIRONMENT_PARSER_UNAVAILABLE\n');assert.equal(result.stdout,'');
 }finally{await f.close();}
});

test('REC12 actual hosted wrapper rejects before files can satisfy required process authority',async()=>{
 const f=await fixture({'.env.production.local':'OURO_PUBLIC_URL=https://fixture.invalid\nDATABASE_URL=postgresql://fixture:synthetic@fixture.invalid/fixture\nFIXTURE_SECRET=SYNTHETIC_PRIVATE'});try{
  const result=spawnSync(process.execPath,[path.join(repository,'scripts/hosted-next.mjs')],{cwd:f.root,env:minimalEnvironment,encoding:'utf8',timeout:10000});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr.trim(),'OURO_PUBLIC_URL must be an exact HTTPS origin.');assert(!result.stderr.includes('SYNTHETIC_PRIVATE'));
 }finally{await f.close();}
});

