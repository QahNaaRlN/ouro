import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {runnerFixture,runnerContract,servicePackageRoot,sourceRoot} from './runner-fixtures.js';

const ownedRequire=createRequire(import.meta.url);
const {runLocalVerification}:typeof import('../../../lib/verification/local-runner')=ownedRequire('../../../lib/verification/local-runner');

for(const format of ['cjs','esm','ts'] as const)test('SRP01 actual '+format+' snapshot resolves the owned package inside its Playwright worker',async()=>{
 const fixture=await runnerFixture(format);
 try{
  const result=await runLocalVerification({binding:fixture.binding,config:fixture.observation,contract:runnerContract(),scopeCaseIds:['case-0'],submittedBy:'synthetic-operator',shouldStop:async()=>false,runtimeDirectory:fixture.runtime,packageRoot:servicePackageRoot,preloadPath:path.join(sourceRoot,'lib/verification/runtime/playwright-preload.mjs'),timeoutMs:30000});
  assert.equal(result.proof.source.exitCode,0,result.proof.source.rawReport);
  const report=JSON.parse(result.proof.source.rawReport) as {errors:unknown[];stats:{expected:number;unexpected:number;skipped:number}};
  assert.deepEqual(report.errors,[]);assert.equal(report.stats.expected,1);assert.equal(report.stats.unexpected,0);assert.equal(report.stats.skipped,0);
  assert.equal(result.proof.source.inputStability,'unchanged');await fixture.assertUnchanged();assert.deepEqual(await readdir(fixture.runtime),[]);
  assert.throws(()=>createRequire(path.join(fixture.workspace,'probe.cjs')).resolve('@playwright/test'),{code:'MODULE_NOT_FOUND'},'service process never receives the child hook');
 }finally{await fixture.close();}
});
