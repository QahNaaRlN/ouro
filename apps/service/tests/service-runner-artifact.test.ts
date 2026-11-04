import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm,access,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {runtimeConfiguration} from '../src/runtime/configuration.js';
import {startService} from '../src/runtime/start-service.js';
import {runnerFixture,sourceRoot,servicePackageRoot,installedPlaywright} from './runner-fixtures.js';
import {artifactPreload,launchRunnerArtifact,stopRunnerArtifact,listRunnerTests,runArtifactVerification} from './runner-artifact-fixtures.js';

test('SRP02 built service executes CJS/ESM/TS snapshots via HTTP/MCP guards outside source cwd and exact replay never reruns',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ouro-runner-artifact-'));
 let running:Awaited<ReturnType<typeof launchRunnerArtifact>>|undefined;
 try{
  const manifest=JSON.parse(await readFile(new URL('../dist/build-manifest.json',import.meta.url),'utf8')) as {resources:string[]};
  assert(manifest.resources.includes('resources/verification/playwright-preload.mjs'));
  assert.deepEqual(await readFile(artifactPreload),await readFile(path.join(sourceRoot,'lib/verification/runtime/playwright-preload.mjs')));
  running=await launchRunnerArtifact(directory);
  for(const format of ['cjs','esm','ts'] as const){
   const fixture=await runnerFixture(format);
   try{
    const ids=await listRunnerTests(fixture),result=await runArtifactVerification(running.url,fixture,ids);
    const index=result.witness.execArgv.indexOf('--import');assert(index>=0);
    const preload=new URL(result.witness.execArgv[index+1]);assert.equal(fileURLToPath(preload),artifactPreload);assert.equal(fileURLToPath(new URL(preload.searchParams.get('package')!)),path.join(servicePackageRoot,'package.json'));
    assert(result.witness.pid>0);assert.notEqual(result.witness.worker,undefined);assert(result.witness.cwd.startsWith(path.join(directory,'snapshots')+path.sep));
    assert.equal(result.run.artifactManifest?.capabilities.playwrightResolution,'ouro-owned-preload/v1');
   }finally{await fixture.close();}
  }
 }finally{if(running)await stopRunnerArtifact(running.child,running.exited);if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir())||!path.basename(directory).startsWith('ouro-runner-artifact-'))throw new Error('Refused artifact fixture cleanup.');await rm(directory,{recursive:true,force:true});}
});

test('SRP03 missing owned preload fails before opening a storage profile with no fallback',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ouro-runner-missing-')),dataDir=path.join(directory,'postgres');
 try{
  const configuration=runtimeConfiguration({OURO_DATA_DIR:dataDir,PORT:'0'},{resourceRoot:sourceRoot,packageRoot:servicePackageRoot,playwrightPreloadPath:path.join(directory,'absent.mjs')});
  await assert.rejects(startService(configuration),{code:'ENOENT'});await assert.rejects(access(dataDir),{code:'ENOENT'});
 }finally{if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir())||!path.basename(directory).startsWith('ouro-runner-missing-'))throw new Error('Refused missing-resource fixture cleanup.');await rm(directory,{recursive:true,force:true});}
});

test('SRP04 counterfeit local Playwright cannot shadow the owner while non-allowlisted imports retain normal resolution',async()=>{
 const fixture=await runnerFixture('cjs');
 try{
  const fake=path.join(fixture.workspace,'node_modules/@playwright/test'),local=path.join(fixture.workspace,'node_modules/zod');await mkdir(fake,{recursive:true});await mkdir(local,{recursive:true});
  await writeFile(path.join(fake,'package.json'),JSON.stringify({name:'@playwright/test',version:'0.0.0-foreign',exports:{'.':'./fake.cjs','./package.json':'./package.json','./reporter':'./reporter.cjs'}}));
  await writeFile(path.join(fake,'fake.cjs'),"module.exports={test:'foreign'};");await writeFile(path.join(fake,'reporter.cjs'),"module.exports='fixture-reporter';");
  await writeFile(path.join(local,'package.json'),JSON.stringify({name:'zod',main:'index.cjs'}));await writeFile(path.join(local,'index.cjs'),"module.exports='fixture-zod';");await writeFile(path.join(fixture.workspace,'relative.mjs'),'export default 42;');
  const anchor=pathToFileURL(path.join(servicePackageRoot,'package.json')),preload=pathToFileURL(artifactPreload);preload.searchParams.set('package',anchor.href);
  const expected=createRequire(import.meta.url).resolve('@playwright/test');
  const script=`const assert=require('node:assert/strict');(async()=>{assert.equal(typeof require('@playwright/test').test,'function');assert.equal(require.resolve('@playwright/test'),${JSON.stringify(expected)});assert.equal(require('@playwright/test/package.json').version,${JSON.stringify(installedPlaywright.version)});assert.equal(typeof (await import('@playwright/test')).test,'function');assert.equal((await import('@playwright/test/package.json',{with:{type:'json'}})).default.version,${JSON.stringify(installedPlaywright.version)});assert.equal(require('zod'),'fixture-zod');assert.equal(require('@playwright/test/reporter'),'fixture-reporter');assert.equal((await import('./relative.mjs')).default,42);process.stdout.write('owned provider and normal fallback passed');})().catch(error=>{process.stderr.write(error.stack);process.exitCode=1;});`;
  const environment=Object.fromEntries(['PATH','SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','HOME','LOCALAPPDATA','APPDATA'].flatMap(name=>process.env[name]===undefined?[]:[[name,process.env[name]!] ]));
  const child=spawn(process.execPath,['--import',preload.href,'--eval',script],{cwd:fixture.workspace,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timer:ReturnType<typeof setTimeout>|undefined;
  child.stdout!.on('data',chunk=>{stdout+=String(chunk);});child.stderr!.on('data',chunk=>{stderr+=String(chunk);});
  const exited=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  try{assert.equal(await Promise.race([exited,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{child.kill();reject(new Error('Owned resolver probe deadline'));},10000);})]),0,stderr);assert.equal(stdout,'owned provider and normal fallback passed');}
  finally{if(timer)clearTimeout(timer);if(child.exitCode===null){child.kill();await exited;}}
 }finally{await fixture.close();}
});
