import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,copyFile,writeFile,readFile,access,rm,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateNodeVersion} from '../../../scripts/runtime-node.mjs';

const artifact=fileURLToPath(new URL('../dist/',import.meta.url));

/** Копирует настоящую entry-границу; witness отличает загрузку application от проверки runtime. */
async function entryFixture(){
 const directory=await mkdtemp(path.join(tmpdir(),'ouro-node-entry-')),entry=path.join(directory,'main.mjs'),witness=path.join(directory,'application-loaded');
 await mkdir(path.join(directory,'resources'));await copyFile(path.join(artifact,'main.mjs'),entry);await copyFile(path.join(artifact,'resources/runtime-node.mjs'),path.join(directory,'resources/runtime-node.mjs'));
 await writeFile(path.join(directory,'application.mjs'),"import{writeFileSync}from'node:fs';writeFileSync(process.env.OURO_TEST_ENTRY_WITNESS,'application imported',{flag:'wx'});");
 return {entry,witness,directory,run:(executable:string)=>spawnSync(executable,[entry],{cwd:tmpdir(),windowsHide:true,shell:false,encoding:'utf8',timeout:10000,env:{SystemRoot:process.env.SystemRoot,OURO_TEST_ENTRY_WITNESS:witness}}),close:async()=>{
  if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir())||!path.basename(directory).startsWith('ouro-node-entry-'))throw Error('Refused foreign fixture cleanup');await rm(directory,{recursive:true,force:true});
 }};
}

test('RNC01 built entry and helper preserve canonical bytes and explicit manifest ownership',async()=>{
 assert.deepEqual(await readFile(path.join(artifact,'main.mjs')),await readFile(new URL('../resources/main-cli.mjs',import.meta.url)));
 assert.deepEqual(await readFile(path.join(artifact,'resources/runtime-node.mjs')),await readFile(new URL('../../../scripts/runtime-node.mjs',import.meta.url)));
 const manifest=JSON.parse(await readFile(path.join(artifact,'build-manifest.json'),'utf8')) as {entries:string[];resources:string[];inputs:string[]};
 assert(manifest.entries.includes('main.mjs'));assert(manifest.resources.includes('application.mjs'));assert(manifest.resources.includes('resources/runtime-node.mjs'));assert(manifest.inputs.includes('apps/service/resources/main-cli.mjs'));assert(manifest.inputs.includes('scripts/runtime-node.mjs'));
 assert(manifest.inputs.every(file=>!file.startsWith('../')&&!path.isAbsolute(file)&&!file.includes('\\')),'Artifact inputs must use one repository-root coordinate system.');
});

test('RNC02 supported ordinary Node loads the application only after its artifact gate',async()=>{
 const f=await entryFixture();try{const result=f.run(process.execPath);assert.equal(result.status,0,result.stderr);assert.equal(await readFile(f.witness,'utf8'),'application imported');}finally{await f.close();}
});

test('RNC03 an available real unsupported Node refuses before application import',async context=>{
 const executable=process.env.OURO_TEST_UNSUPPORTED_NODE??(process.platform==='win32'?path.join(process.env.ProgramFiles??'C:\\Program Files','nodejs','node.exe'):undefined);
 if(!executable){context.skip('Separate unsupported Node executable is unavailable; strict version matrix still runs.');return;}
 const version=spawnSync(executable,['--version'],{windowsHide:true,shell:false,encoding:'utf8',timeout:10000});
 if(version.error&&'code' in version.error&&version.error.code==='ENOENT'){context.skip('Separate unsupported Node executable is unavailable.');return;}
 assert.equal(version.status,0,version.stderr);const actual=version.stdout.trim().replace(/^v/,'');let unsupported=false;try{validateNodeVersion(actual);}catch{unsupported=true;}
 if(!unsupported){context.skip('Separate executable already satisfies the application runtime; strict version matrix still runs.');return;}
 const f=await entryFixture();try{const result=f.run(executable);assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/NODE_RUNTIME_UNSUPPORTED.*24\.19\.0/);await assert.rejects(access(f.witness),{code:'ENOENT'});}finally{await f.close();}
});

test('RNC04 an incomplete entry artifact cannot bypass its missing runtime helper',async()=>{
 const f=await entryFixture();try{await unlink(path.join(f.directory,'resources/runtime-node.mjs'));const result=f.run(process.execPath);assert.equal(result.status,1);await assert.rejects(access(f.witness),{code:'ENOENT'});}finally{await f.close();}
});
