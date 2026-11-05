import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {materializeConsumerBuildTree} from '../scripts/consumer-delivery/materialize-build-tree.mjs';
import {readCommittedConsumerSource} from '../scripts/consumer-delivery/committed-source.mjs';
import {createCommittedProjectFixture} from './fixtures/consumer-delivery/committed-project.mjs';

test('CMT01 materializes one independent source tree and a canonical same-commit protocol artifact', {timeout:180000},async()=>{
 const origin=fileURLToPath(new URL('../',import.meta.url)),fixture=await createCommittedProjectFixture(origin),outputDirectory=path.join(fixture.directory,'materialized output');let complete=false;
 try{
  const npmCli=process.env.npm_execpath;assert(npmCli,'Use npm or an explicit own npm_execpath for this integration fixture.');const result=await materializeConsumerBuildTree({repository:fixture.repository,ref:fixture.commit,outputDirectory,npmCli});assert.equal(result.commit,fixture.commit);assert.equal(result.productVersion,'0.1.0-beta.4');assert.equal(result.protocolVersion,'0.3.0');
  const source=readCommittedConsumerSource({repository:fixture.repository,ref:fixture.commit});for(const file of source.consumerFiles)assert(file.bytes.equals(await readFile(path.join(outputDirectory,file.path))),file.path);
  const product=JSON.parse(await readFile(path.join(outputDirectory,'package.json'),'utf8')),lock=JSON.parse(await readFile(path.join(outputDirectory,'package-lock.json'),'utf8')),manifest=JSON.parse(await readFile(path.join(outputDirectory,'delivery-manifest.json'),'utf8'));
  assert.equal(product.dependencies.next,undefined);assert.equal(product.dependencies['@ouro/protocol'],'file:vendor/ouro-protocol-0.3.0.tgz');assert.equal(lock.packages['node_modules/@ouro/protocol'].link,undefined);assert.equal(manifest.sourceCommit,fixture.commit);assert.equal(manifest.stage,'SOURCE_BUILD_MATERIALIZED');assert.equal(manifest.endUserRelease,'NOT_QUALIFIED');assert.equal(manifest.producerScratch,'UNIQUE_SIBLING_RETAINED');assert.equal((await readdir(outputDirectory)).includes('node_modules'),false);assert.equal((await readdir(outputDirectory)).includes('.env.local'),false);assert((await readdir(path.dirname(outputDirectory))).some(file=>file.startsWith('.ouro-protocol-stage-')));
  complete=true;
 }finally{if(complete)await fixture.close();else process.stderr.write('Retained own failed consumer fixture for bounded diagnosis.\n');}
});

test('CMT02 rejects relative or nested producer scratch before creating output',async()=>{
 const fixture=await createCommittedProjectFixture(fileURLToPath(new URL('../',import.meta.url))),outputDirectory=path.join(fixture.directory,'not-created output');let complete=false;
 try{const npmCli=process.env.npm_execpath;assert(npmCli);for(const producerScratchRoot of ['relative-root',outputDirectory,path.join(outputDirectory,'producer'),path.join(fixture.directory,'invalid\nroot')]){await assert.rejects(()=>materializeConsumerBuildTree({repository:fixture.repository,ref:fixture.commit,outputDirectory,npmCli,producerScratchRoot}),{code:'CONSUMER_MATERIALIZATION_FAILED'});await assert.rejects(()=>lstat(outputDirectory));}complete=true;}
 finally{if(complete)await fixture.close();else process.stderr.write('Retained own scratch admission fixture.\n');}
});
