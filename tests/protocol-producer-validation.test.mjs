import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {materializeProtocolProducerDependencies,ProtocolProducerDependencyError} from '../scripts/consumer-delivery/protocol-producer-contract.mjs';

const [manifest,lockfile,metadata]=await Promise.all(['../packages/protocol/package.json','../release/protocol-producer/package-lock.json','../release/protocol-producer/metadata.json'].map(file=>readFile(new URL(file,import.meta.url),'utf8')));
const input={manifest,lockfile,metadata},canonical=text=>text.replace(/\r\n/g,'\n'),sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const message='Invalid committed protocol producer dependency contract.';

/** Новая печать hashes делает semantic attacks независимыми от простого hash mismatch. */
function seal(manifestValue,lockValue){
 const manifest=JSON.stringify(manifestValue,null,2)+'\n',lockfile=JSON.stringify(lockValue,null,2)+'\n';
 const entries=Object.entries(lockValue?.packages??{}).filter(([key])=>key),tuples=entries.map(([key,value])=>[key,value?.version,value?.resolved,value?.integrity].join('|')).sort().join('\n')+'\n';
 return {manifest,lockfile,metadata:JSON.stringify({schemaVersion:1,manifestSha256:sha256(manifest),lockfileSha256:sha256(lockfile),registryTupleSha256:sha256(tuples),registryPackageEntries:entries.length})};
}
function mutate(change){const manifest=JSON.parse(input.manifest),lockfile=JSON.parse(input.lockfile);change(manifest,lockfile);return seal(manifest,lockfile);}
function rejected(candidate,label){assert.throws(()=>materializeProtocolProducerDependencies(candidate),error=>error instanceof ProtocolProducerDependencyError&&error.code==='PROTOCOL_PRODUCER_DEPENDENCY_INVALID'&&error.message===message,label);}

test('PPV01 real frozen protocol graph preserves exact versions, tuples and portable manifest',()=>{
 const before=JSON.parse(input.lockfile),result=materializeProtocolProducerDependencies(input);
 assert.equal(result.lockfile,canonical(input.lockfile));assert.deepEqual(JSON.parse(result.lockfile),before);
 assert.equal(before.packages['node_modules/typescript'].version,'5.9.3');assert.equal(before.packages['node_modules/zod'].version,'4.6.7');
 assert.equal(JSON.parse(input.manifest).engines.node,'>=20.9.0');assert.equal(input.manifest,manifest);assert.equal(input.lockfile,lockfile);
});

test('PPV02 checkout CRLF yields the same canonical immutable lock',()=>{
 const windows=Object.fromEntries(Object.entries(input).map(([key,text])=>[key,text.replace(/\r?\n/g,'\r\n')]));
 assert.equal(materializeProtocolProducerDependencies(windows).lockfile,canonical(input.lockfile));
});

test('PPV03 only the single npm dot-slash bin prefix is normalized',()=>{
 for(const prefix of ['', './']){
  const candidate=mutate((manifest,lock)=>{manifest.bin['ouro-protocol']=prefix+'bin/ouro-protocol.mjs';lock.packages[''].bin['ouro-protocol']='bin/ouro-protocol.mjs';});
  assert.equal(typeof materializeProtocolProducerDependencies(candidate).lockfile,'string');
 }
 for(const file of ['../bin/ouro-protocol.mjs','././bin/ouro-protocol.mjs','/bin/ouro-protocol.mjs','C:/bin/ouro-protocol.mjs','bin\\ouro-protocol.mjs','bin//ouro-protocol.mjs'])rejected(mutate((manifest,lock)=>{manifest.bin['ouro-protocol']=file;lock.packages[''].bin['ouro-protocol']=file;}),file);
});

test('PPV04 wrong scalar metadata, missing bytes and hash mismatch always return the neutral diagnostic',()=>{
 for(const candidate of [undefined,null,{},[],{...input,manifest:3},{...input,lockfile:false},{...input,metadata:{}},{...input,manifest:'SECRET invalid JSON'},{...input,lockfile:'[]'},{...input,metadata:'null'},{...input,manifest:input.manifest+' '},{...input,lockfile:input.lockfile+' '}])rejected(candidate,'invalid top-level input');
 for(const [key,value]of [['schemaVersion',true],['schemaVersion','1'],['manifestSha256',{}],['lockfileSha256',null],['registryTupleSha256','A'.repeat(64)],['registryTupleSha256','0'.repeat(64)],['registryPackageEntries','2'],['registryPackageEntries',-1],['registryPackageEntries',3],['foreign','SECRET']]){
  const metadata={...JSON.parse(input.metadata),[key]:value};rejected({...input,metadata:JSON.stringify(metadata)},key);
 }
});

test('PPV05 rehashed manifest and lock mismatches cannot alter portable identity or declarations',()=>{
 const changes=[
  (m,l)=>{m.name=l.name=l.packages[''].name='foreign';},
  (_m,l)=>{l.version='0.3.1';},(_m,l)=>{l.packages[''].version=3;},(_m,l)=>{l.lockfileVersion='3';},(_m,l)=>{l.requires=false;},
  (_m,l)=>{l.packages[''].dependencies.zod='^4.1.11';},(_m,l)=>{l.packages[''].devDependencies.typescript='^5.9.2';},
  (m,l)=>{m.dependencies.zod=l.packages[''].dependencies.zod={value:'SECRET'};},
  (m,l)=>{m.devDependencies.typescript=l.packages[''].devDependencies.typescript='workspace:*';},
  (m,l)=>{m.optionalDependencies=l.packages[''].optionalDependencies={foreign:'file:../SECRET'};},
  (_m,l)=>{l.packages[''].peerDependencies={foreign:'*'};},
  (m,l)=>{m.engines=l.packages[''].engines={};},(m,l)=>{m.engines=l.packages[''].engines={node:false};},
  (_m,l)=>{l.packages[''].engines.node='>=24';},(_m,l)=>{l.packages[''].license='foreign';},
  (m,l)=>{m.bin=l.packages[''].bin=[];},(m,l)=>{m.bin=l.packages[''].bin={'ouro-protocol':{path:'SECRET'}};},
  (_m,l)=>{l.packages[''].link=false;},(_m,l)=>{l.packages[''].resolved='file:../SECRET';},
 ];
 for(const change of changes)rejected(mutate(change),'rehashed identity/declaration mutation');
});

test('PPV06 rehashed registry scalar, URL, integrity and link attacks remain rejected',()=>{
 const versionValues=[null,false,3,{},[],'01.2.3','git:SECRET'];
 const resolvedValues=[null,false,3,{},[],'file:../SECRET','git+https://registry.npmjs.org/SECRET','https://registry.npmjs.org.evil.invalid/typescript/-/typescript-5.9.3.tgz','https://user:SECRET@registry.npmjs.org/typescript/-/typescript-5.9.3.tgz','http://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz','https://registry.npmjs.org:443/typescript/-/typescript-5.9.3.tgz','https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz?SECRET','https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz#SECRET','https://registry.npmjs.org/zod/-/zod-4.6.7.tgz'];
 const integrityValues=[null,false,{},[],3,'sha1-SECRET','sha512-SECRET','sha512-'+'A'.repeat(85)+'B=='];
 for(const [field,values]of [['version',versionValues],['resolved',resolvedValues],['integrity',integrityValues],['link',[true,false,null,{},'false']]])for(const value of values)rejected(mutate((_m,l)=>{l.packages['node_modules/typescript'][field]=value;}),field);
 for(const field of ['dev','optional','devOptional','hasInstallScript'])rejected(mutate((_m,l)=>{l.packages['node_modules/typescript'][field]='false';}),field);
 for(const field of ['dependencies','devDependencies','optionalDependencies','peerDependencies'])rejected(mutate((_m,l)=>{l.packages['node_modules/typescript'][field]={foreign:'file:../SECRET'};}),field);
});

test('PPV07 rehashed package inventory cannot escape node_modules or hide malformed records',()=>{
 for(const name of ['node_modules/typescript','node_modules/zod'])rejected(mutate((_m,l)=>{delete l.packages[name];}),'missing declared direct package');
 for(const name of ['../node_modules/typescript','node_modules/typescript/../SECRET','node_modules/@scope','node_modules/typescript/lib','node_modules/../SECRET'])rejected(mutate((_m,l)=>{l.packages[name]=l.packages['node_modules/typescript'];delete l.packages['node_modules/typescript'];}),name);
 for(const value of [null,false,3,'SECRET',[]])rejected(mutate((_m,l)=>{l.packages['node_modules/typescript']=value;}),'malformed registry record');
 for(const value of [null,[],false,'SECRET'])rejected(mutate((_m,l)=>{l.packages=value;}),'malformed package inventory');
});

test('PPV08 rehashed bin paths and commands reject the finite Windows alias set',()=>{
 for(const file of ['bin/CON','bin/aux.txt','bin/tool./x','bin/tool /x'])rejected(mutate((m,l)=>{m.bin['ouro-protocol']=file;l.packages[''].bin['ouro-protocol']=file;}),file);
 rejected(mutate((m,l)=>{m.bin=l.packages[''].bin={con:'bin/ouro-protocol.mjs'};}),'reserved bin command');
});

test('PPV09 rehashed registry paths reject reserved and trailing-dot package segments',()=>{
 for(const name of ['con','aux.txt','tool.','@scope/con','@scope./tool'])rejected(mutate((_m,l)=>{
  const entry=structuredClone(l.packages['node_modules/typescript']);entry.resolved='https://registry.npmjs.org/'+name+'/-/'+name.split('/').at(-1)+'-'+entry.version+'.tgz';l.packages['node_modules/'+name]=entry;
 }),name);
});
