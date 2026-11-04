import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {materializeConsumerDependencies} from '../scripts/consumer-delivery/dependency-contract.mjs';

/** Читает только committed-data template fixtures, не env или установленные dependencies. */
async function fixture(){
 const [blueprint,template,provenance]=await Promise.all(['dependencies.json','package-lock.template.json','registry-provenance.json'].map(file=>readFile(new URL('../release/consumer/'+file,import.meta.url),'utf8')));
 const protocol={manifest:JSON.stringify({name:'@ouro/protocol',version:'0.3.1',dependencies:{zod:'^4.1.12'},bin:{'ouro-protocol':'./bin/ouro-protocol.mjs'},engines:{node:'>=20.9.0'},license:'UNLICENSED'}),filename:'ouro-protocol-0.3.1.tgz',bytes:Buffer.from('OWNED_FIXTURE_ARTIFACT_BYTES')};
 return {blueprint,template,provenance,productVersion:'0.2.0-beta.1',protocol};
}

test('CDC01 only finite metadata slots change; every registry resolution/integrity stays frozen',async()=>{
 const f=await fixture(),result=materializeConsumerDependencies(f),before=JSON.parse(f.template),after=result.lockfile as {version:string;packages:Record<string,{version?:string;resolved?:string;integrity?:string;dependencies?:Record<string,string>;[key:string]:unknown}>};
 assert.equal(result.manifest.version,f.productVersion);assert.equal(result.manifest.dependencies['@ouro/protocol'],'file:vendor/'+f.protocol.filename);assert.equal(result.manifest.engines.node,'>=24.19.0 <25');assert.equal(result.manifest.dependencies.next,undefined);assert.equal(result.manifest.dependencies['@hono/node-server'],'2.1.6');assert.equal(result.manifest.dependencies.hono,'4.13.16');
 assert.equal(after.version,f.productVersion);assert.equal(after.packages[''].version,f.productVersion);assert.equal(after.packages[''].dependencies?.['@ouro/protocol'],'file:vendor/'+f.protocol.filename);assert.equal(after.packages['node_modules/@ouro/protocol'].version,'0.3.1');assert.equal(after.packages['node_modules/@ouro/protocol'].integrity,'sha512-'+createHash('sha512').update(f.protocol.bytes).digest('base64'));
 for(const[key,value]of Object.entries(before.packages))if(key&&key!=='node_modules/@ouro/protocol')assert.deepEqual(after.packages[key],value,key);
 assert.equal(JSON.stringify(after).includes('__OURO_'),false);assert.deepEqual(JSON.parse(f.template),before,'Input template is immutable');
});

test('CDC02 template/blueprint tampering fails closed without recomputing registry resolutions',async()=>{
 const f=await fixture();for(const changed of [{...f,template:f.template.replace('4.13.16','4.13.99')},{...f,blueprint:f.blueprint.replace('4.13.16','4.13.99')},{...f,provenance:'{}'}])assert.throws(()=>materializeConsumerDependencies(changed),{code:'CONSUMER_DEPENDENCY_INVALID'});
});

test('CDC03 foreign protocol package/dependency/bin/engine and filename are rejected',async()=>{
 const f=await fixture(),original=JSON.parse(f.protocol.manifest);for(const manifest of [{...original,name:'foreign'},{...original,dependencies:{zod:'^5'}},{...original,bin:{'ouro-protocol':'../private.js'}},{...original,engines:{node:'>=25'}}])assert.throws(()=>materializeConsumerDependencies({...f,protocol:{...f.protocol,manifest:JSON.stringify(manifest)}}),{code:'CONSUMER_DEPENDENCY_INVALID'});assert.throws(()=>materializeConsumerDependencies({...f,protocol:{...f.protocol,filename:'../SYNTHETIC_PRIVATE.tgz'}}),error=>error instanceof Error&&!error.message.includes('SYNTHETIC_PRIVATE')&&'code'in error&&error.code==='CONSUMER_DEPENDENCY_INVALID');
});

test('CDC04 malformed product/protocol versions and empty artifact cannot create an install graph',async()=>{
 const f=await fixture();for(const changed of [{...f,productVersion:'0.1.0-01'},{...f,protocol:{...f.protocol,manifest:f.protocol.manifest.replace('0.3.1','bad-version')}},{...f,protocol:{...f.protocol,bytes:Buffer.alloc(0)}}])assert.throws(()=>materializeConsumerDependencies(changed),{code:'CONSUMER_DEPENDENCY_INVALID'});
});

test('CDC05 checkout CRLF changes preserve canonical data hashes and identical registry graph',async()=>{
 const f=await fixture(),original=materializeConsumerDependencies(f),windows=materializeConsumerDependencies({...f,template:f.template.replace(/\r?\n/g,'\r\n'),blueprint:f.blueprint.replace(/\r?\n/g,'\r\n')});assert.deepEqual(windows,original);
});
