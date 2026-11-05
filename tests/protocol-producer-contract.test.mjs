import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readCommittedConsumerSource} from '../scripts/consumer-delivery/committed-source.mjs';

const origin=fileURLToPath(new URL('../',import.meta.url));
const frozenBase='b957bc95926543e79b4d45f3723f052eaaa04f62';
const producerLockPath='release/protocol-producer/package-lock.json';
const producerMetadataPath='release/protocol-producer/metadata.json';
const oldLockPath='packages/protocol/package-lock.json';
const manifestPath='packages/protocol/package.json';
const canonical=text=>text.replace(/\r\n/g,'\n');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Читает только bounded Git blobs; не запускает scripts из полученного source. */
function git(repository,args,input){
 const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));
 return execFileSync('git',['--no-replace-objects','-C',repository,...args],{input,env:environment,windowsHide:true,shell:false,maxBuffer:32*1024*1024,timeout:30000,stdio:['pipe','pipe','pipe']});
}

/** Замораживает настоящее полное protocol tree и product identity из одного известного commit. */
function canonicalInputs(){
 assert.equal(git(origin,['rev-parse','--verify',frozenBase+'^{commit}']).toString().trim(),frozenBase);
 const rows=new TextDecoder('utf-8',{fatal:true}).decode(git(origin,['ls-tree','-r','-z','--full-tree',frozenBase,'--','package.json','packages/protocol/'])).split('\0').filter(Boolean);
 const entries=rows.map(row=>{
  const match=/^(100644|100755) blob ([a-f0-9]{40,64})\t(.+)$/.exec(row);
  assert(match,'Canonical fixture contains only ordinary tracked blobs');
  return {mode:match[1],blob:match[2],path:match[3]};
 });
 const batch=git(origin,['cat-file','--batch'],entries.map(entry=>entry.blob).join('\n')+'\n');let offset=0;
 const files=entries.map(entry=>{
  const newline=batch.indexOf(10,offset);assert(newline>=0);
  const header=/^([a-f0-9]{40,64}) blob (0|[1-9]\d*)$/.exec(batch.subarray(offset,newline).toString('ascii'));
  assert(header);assert.equal(header[1],entry.blob);
  const size=Number(header[2]),start=newline+1,end=start+size;assert(Number.isSafeInteger(size)&&size<=32*1024*1024&&end<batch.length);assert.equal(batch[end],10);
  offset=end+1;return {...entry,bytes:Buffer.from(batch.subarray(start,end))};
 });
 assert.equal(offset,batch.length);return files;
}

/** Создаёт valid новый input contract, не изменяя ни один canonical source/package byte. */
function producerInputs(files){
 const fileMap=new Map(files.map(file=>[file.path,file])),manifestBytes=fileMap.get(manifestPath)?.bytes,lockBytes=fileMap.get(oldLockPath)?.bytes;
 assert(manifestBytes&&lockBytes,'Frozen real manifest and lock must exist before reader invocation');
 const manifest=JSON.parse(manifestBytes.toString('utf8')),lock=JSON.parse(lockBytes.toString('utf8'));
 assert.equal(manifest.name,'@ouro/protocol');assert.equal(manifest.version,'0.3.0');assert.equal(lock.lockfileVersion,3);
 assert.equal(lock.name,manifest.name);assert.equal(lock.version,manifest.version);assert.equal(lock.packages[''].name,manifest.name);assert.equal(lock.packages[''].version,manifest.version);
 assert.deepEqual(lock.packages[''].dependencies,manifest.dependencies);assert.deepEqual(lock.packages[''].devDependencies,manifest.devDependencies);
 const entries=Object.entries(lock.packages).filter(([key])=>key);
 assert.equal(entries.length,2);assert.equal(lock.packages['node_modules/typescript'].version,'5.9.3');assert.equal(lock.packages['node_modules/zod'].version,'4.6.7');
 for(const[key,value]of entries){assert(key.startsWith('node_modules/'));assert.equal(value.link,undefined);assert(value.resolved.startsWith('https://registry.npmjs.org/'));assert(value.integrity.startsWith('sha512-'));}
 const tuples=entries.map(([key,value])=>[key,value.version,value.resolved,value.integrity].join('|')).sort().join('\n')+'\n';
 const metadata={schemaVersion:1,manifestSha256:sha256(canonical(manifestBytes.toString('utf8'))),lockfileSha256:sha256(canonical(lockBytes.toString('utf8'))),registryTupleSha256:sha256(tuples),registryPackageEntries:entries.length};
 return new Map([[producerLockPath,lockBytes],[producerMetadataPath,Buffer.from(JSON.stringify(metadata,null,2)+'\n')]]);
}

test('PPC01 canonical committed protocol uses separate producer inputs without a development protocol lock',async(t)=>{
 const files=canonicalInputs(),inputs=producerInputs(files),directory=await mkdtemp(path.join(tmpdir(),'ouro-protocol-producer-'));
 const repository=path.join(directory,'canonical source & данные');
 try{
  await mkdir(repository);git(repository,['init','-q']);
  for(const[name,value]of [['user.name','Qualification Fixture'],['user.email','fixture@example.invalid'],['core.autocrlf','false'],['commit.gpgsign','false']])git(repository,['config',name,value]);
  const emptyHooks=path.join(directory,'empty-hooks');await mkdir(emptyHooks);git(repository,['config','core.hooksPath',emptyHooks]);
  const put=async(relative,bytes)=>{const target=path.join(repository,relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);};
  for(const file of files)if(file.path!==oldLockPath)await put(file.path,file.bytes);
  for(const[file,bytes]of inputs)await put(file,bytes);
  git(repository,['add','--all']);for(const file of files)if(file.mode==='100755')git(repository,['update-index','--chmod=+x','--',file.path]);
  git(repository,['commit','-qm','test: commit canonical protocol producer fixture']);
  const commit=git(repository,['rev-parse','HEAD']).toString().trim(),tracked=git(repository,['ls-tree','-r','--name-only',commit]).toString('utf8').split('\n');
  assert(!tracked.includes(oldLockPath),'The development lock is absent from the actual committed fixture');
  assert(tracked.includes(producerLockPath)&&tracked.includes(producerMetadataPath));assert(tracked.includes('packages/protocol/src/index.ts'));
  assert(git(repository,['show',commit+':'+producerLockPath]).equals(inputs.get(producerLockPath)),'New producer lock retains exact old bytes');
  assert(git(repository,['show',commit+':'+manifestPath]).equals(files.find(file=>file.path===manifestPath).bytes));
  t.diagnostic(JSON.stringify({frozenBase,fixtureCommit:commit,canonicalProtocolFiles:files.filter(file=>file.path.startsWith('packages/protocol/')&&file.path!==oldLockPath).length,developmentProtocolLockPresent:false,producerInputs:[...inputs.keys()],metadata:JSON.parse(inputs.get(producerMetadataPath).toString('utf8'))}));

  const source=readCommittedConsumerSource({repository,ref:commit});
  assert.equal(source.commit,commit);assert.equal(source.protocolVersion,'0.3.0');assert(!source.protocolFiles.some(file=>file.path===oldLockPath));
  assert(Array.isArray(source.protocolProducerFiles),'Reader must expose the explicit producer namespace');
  assert.deepEqual(source.protocolProducerFiles.map(file=>file.path).sort(),[producerLockPath,producerMetadataPath].sort());
  for(const[file,bytes]of inputs){const selected=source.protocolProducerFiles.find(entry=>entry.path===file);assert(selected);assert(selected.bytes.equals(bytes));assert.equal(selected.sha256,sha256(bytes));assert.equal(selected.blob,git(repository,['rev-parse',commit+':'+file]).toString().trim());}
  for(const file of files.filter(file=>file.path.startsWith('packages/protocol/')&&file.path!==oldLockPath))assert(source.protocolFiles.find(entry=>entry.path===file.path)?.bytes.equals(file.bytes),file.path+' remains canonical');
 }finally{
  const target=await realpath(directory),temporaryRoot=await realpath(tmpdir());assert.equal(path.dirname(target),temporaryRoot);assert(path.basename(target).startsWith('ouro-protocol-producer-'));await rm(directory,{recursive:true,force:true});
 }
});
