import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

async function fixture(mode:'dev'|'start'){
 const pkg=JSON.parse(await readFile(path.join(process.cwd(),'package.json'),'utf8'));
 const invocation=/^node ([\w./-]+\.mjs) (dev|start)$/.exec(pkg.scripts[mode]);
 assert(invocation,`npm ${mode} must use a Node entrypoint without shell environment assignments`);
 assert.equal(invocation[2],mode);
 const directory=await mkdtemp(path.join(tmpdir(),'ouro local & запуск '));
 try{
  const launcher=path.join(directory,invocation[1]);
  await mkdir(path.dirname(launcher),{recursive:true});
  await copyFile(path.join(process.cwd(),invocation[1]),launcher);
  const cli=path.join(directory,'node_modules/next/dist/bin/next');
  await mkdir(path.dirname(cli),{recursive:true});
  await writeFile(path.join(directory,'node_modules/next/package.json'),JSON.stringify({name:'next',version:'0.0.0-test'}));
  await writeFile(cli,`process.stdout.write(JSON.stringify({args:process.argv.slice(2),localDemo:process.env.OURO_LOCAL_DEMO,dataDir:process.env.OURO_DATA_DIR})); if(process.argv.includes('--fixture-failure'))process.exit(7);`);
  return {directory,launcher};
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}

test('local dev/start preserve literal CLI arguments and environment in a project path with spaces',async()=>{
 for(const mode of ['dev','start'] as const){
  const {directory,launcher}=await fixture(mode);
  try{
   const literal='folder & $(echo untouched)',dataDir=path.join(directory,'данные с пробелами');
   const result=spawnSync(process.execPath,[launcher,mode,'--port','4301',literal],{cwd:directory,env:{...process.env,OURO_DATA_DIR:dataDir},encoding:'utf8',timeout:10000});
   assert.equal(result.status,0,result.stderr);
   assert.deepEqual(JSON.parse(result.stdout),{args:[mode,'--hostname','127.0.0.1','--port','4301',literal],localDemo:'1',dataDir});
  }finally{await rm(directory,{recursive:true,force:true});}
 }
});

test('local start preserves the Next CLI failure exit code',async()=>{
 const {directory,launcher}=await fixture('start');
 try{
  const result=spawnSync(process.execPath,[launcher,'start','--fixture-failure'],{cwd:directory,encoding:'utf8',timeout:10000});
  assert.equal(result.status,7,result.stderr);
 }finally{await rm(directory,{recursive:true,force:true});}
});
