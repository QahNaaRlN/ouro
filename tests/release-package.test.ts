import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile,mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';

const packaging=import(pathToFileURL(path.resolve('scripts/pack-release.mjs')).href);
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const run=(cwd:string,args:string[])=>{
 const result=spawnSync('git',args,{cwd,encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);return result.stdout.trim();
};
async function fixture(){
 const directory=await mkdtemp(path.join(tmpdir(),"ouro release & данные ' ")),repo=path.join(directory,'repository'),out=path.join(directory,'output');await mkdir(repo);
 run(repo,['init','-q']);run(repo,['config','user.name','Release fixture']);run(repo,['config','user.email','release-fixture@example.invalid']);
 await mkdir(path.join(repo,'packages/protocol'),{recursive:true});
 await writeFile(path.join(repo,'package.json'),JSON.stringify({name:'ouro',version:'0.1.0-beta.1'}));await writeFile(path.join(repo,'packages/protocol/package.json'),JSON.stringify({name:'@ouro/protocol',version:'0.1.2'}));
 await writeFile(path.join(repo,'README.md'),'# Committed release\n');await writeFile(path.join(repo,'.env.example'),'EXAMPLE=value\n');
 await writeFile(path.join(repo,'.gitignore'),'.ouro/\nnode_modules/\n.next/\n.env*\n!.env.example\n');run(repo,['add','.']);run(repo,['commit','-qm','feat: seed release fixture']);
 return {directory,repo,out,commit:run(repo,['rev-parse','HEAD']),close:()=>rm(directory,{recursive:true,force:true})};
}
function names(zip:string){const result=spawnSync('unzip',['-Z1',zip],{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);return result.stdout.split('\n').filter(Boolean);}
function zipped(zip:string,file:string){const result=spawnSync('unzip',['-p',zip,file],{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);return result.stdout;}
function protocolTarball(metadata:Record<string,unknown>,extra?:{name:string;text:string}){
 const files=[{name:'package/package.json',text:JSON.stringify(metadata)},...(extra?[extra]:[])],parts:Buffer[]=[];
 for(const file of files){
  const content=Buffer.from(file.text),header=Buffer.alloc(512);header.write(file.name);header.write('0000644\0',100);header.write(content.length.toString(8).padStart(11,'0')+'\0',124);header[156]=48;header.write('ustar\0',257);header.write('00',263);header.fill(32,148,156);
  const sum=header.reduce((result,byte)=>result+byte,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);parts.push(header,content,Buffer.alloc((512-content.length%512)%512));
 }
 return gzipSync(Buffer.concat([...parts,Buffer.alloc(1024)]));
}

test('FRL04 source packaging uses the exact commit and excludes untracked credentials/runtime data',async()=>{
 const {packRelease}=await packaging;
 const f=await fixture();try{
  for(const folder of ['.ouro','node_modules','.next']){await mkdir(path.join(f.repo,folder));await writeFile(path.join(f.repo,folder,'PRIVATE.txt'),'NOT-FOR-DISTRIBUTION');}
  await writeFile(path.join(f.repo,'.env.local'),'PRIVATE=value');await writeFile(path.join(f.repo,'README.md'),'UNCOMMITTED PRIVATE TEXT');
  const packed=await packRelease({repoDir:f.repo,ref:f.commit,outDir:f.out}),manifest=JSON.parse(await readFile(packed.manifestPath,'utf8'));
  assert.equal(manifest.productVersion,'0.1.0-beta.1');assert.equal(manifest.protocolVersion,'0.1.2');assert.equal(manifest.commitSHA,f.commit);
  assert.deepEqual(names(packed.sourcePath).filter(name=>!name.endsWith('/')).sort(),['.env.example','.gitignore','README.md','package.json','packages/protocol/package.json'].map(name=>`ouro-0.1.0-beta.1/${name}`).sort());
  assert.equal(zipped(packed.sourcePath,'ouro-0.1.0-beta.1/README.md'),'# Committed release\n');assert.equal(zipped(packed.sourcePath,'ouro-0.1.0-beta.1/.env.example'),'EXAMPLE=value\n');
  const source=await readFile(packed.sourcePath);assert.deepEqual(manifest.assets,[{name:path.basename(packed.sourcePath),sha256:hash(source),bytes:source.length}]);
  const sums=await readFile(packed.checksumsPath,'utf8');assert.equal(sums,`${hash(source)}  ${path.basename(packed.sourcePath)}\n${hash(await readFile(packed.manifestPath))}  release-manifest.json\n`);
  const repeat=await packRelease({repoDir:f.repo,ref:f.commit,outDir:f.out});assert.deepEqual(await readFile(repeat.sourcePath),source);
 }finally{await f.close();}
});

test('FRL04 a tracked credential file rejects packaging instead of distributing a private committed path',async()=>{
 const {packRelease}=await packaging;
 const f=await fixture();try{
  await writeFile(path.join(f.repo,'.env.local'),'FAKE-SECRET-FIXTURE');run(f.repo,['add','-f','.env.local']);run(f.repo,['commit','-qm','test: add forbidden fixture path']);
  await assert.rejects(packRelease({repoDir:f.repo,ref:'HEAD',outDir:f.out}),/tracked|private|runtime/i);
  await assert.rejects(readdir(f.out),{code:'ENOENT'});
 }finally{await f.close();}
});

test('FRL04 tracked runtime, key files and symlink entries are refused before any artifact is written',async()=>{
 const {packRelease}=await packaging;
 for(const candidate of ['.ouro/postgres/data','node_modules/package.json','.next/BUILD_ID','credentials.json','keys/id_ed25519','private.key','packages/protocol/dist/index.mjs','linked-source']){
  const f=await fixture();try{
   const file=path.join(f.repo,candidate);await mkdir(path.dirname(file),{recursive:true});
   if(candidate==='linked-source')await symlink('README.md',file);else await writeFile(file,'FAKE-PRIVATE-FIXTURE');
   run(f.repo,['add','-f',candidate]);run(f.repo,['commit','-qm','test: add forbidden tracked fixture']);
   await assert.rejects(packRelease({repoDir:f.repo,outDir:f.out}),/tracked|private|runtime|links/i);
   await assert.rejects(readdir(f.out),{code:'ENOENT'});
  }finally{await f.close();}
 }
});

test('FRL04 hidden Claude credential and local account configuration files cannot enter the source archive',async()=>{
 const {packRelease}=await packaging;
 for(const file of ['.credentials.json','.claude.json']){
  const f=await fixture();try{
   await writeFile(path.join(f.repo,file),JSON.stringify({accessToken:'FAKE-OAUTH-PRIVATE-FIXTURE'}));run(f.repo,['add',file]);run(f.repo,['commit','-qm','test: add hidden account fixture']);
   await assert.rejects(packRelease({repoDir:f.repo,outDir:f.out}),/private|runtime/i);await assert.rejects(readdir(f.out),{code:'ENOENT'});
  }finally{await f.close();}
 }
});

test('FRL04 optional protocol asset is version-checked and included in manifest/checksums byte for byte',async()=>{
 const {packRelease}=await packaging,f=await fixture();try{
  const protocol=path.join(f.directory,'ouro-protocol-0.1.2.tgz'),bytes=protocolTarball({name:'@ouro/protocol',version:'0.1.2'});await writeFile(protocol,bytes);
  const packed=await packRelease({repoDir:f.repo,ref:f.commit,outDir:f.out,protocolFile:protocol});
  assert.deepEqual(await readFile(packed.protocolPath),bytes);assert.equal(packed.manifest.assets.length,2);assert.deepEqual(packed.manifest.assets[1],{name:path.basename(protocol),sha256:hash(bytes),bytes:bytes.length});
  const sums=await readFile(packed.checksumsPath,'utf8');assert(sums.includes(`${hash(bytes)}  ${path.basename(protocol)}\n`));assert(sums.includes(`${hash(await readFile(packed.manifestPath))}  release-manifest.json\n`));
  assert.deepEqual((await readdir(f.out)).sort(),[path.basename(packed.sourcePath),path.basename(protocol),'release-manifest.json','SHA256SUMS'].sort());
 }finally{await f.close();}
});

test('FRL04 mislabeled or invalid protocol bytes and changed existing output are never silently published',async()=>{
 const {packRelease}=await packaging,f=await fixture();try{
  const protocol=path.join(f.directory,'ouro-protocol-0.1.2.tgz');
  for(const bytes of [Buffer.from('not a package'),protocolTarball({name:'wrong-package',version:'0.1.2'}),protocolTarball({name:'@ouro/protocol',version:'0.1.1'})]){
   await writeFile(protocol,bytes);await assert.rejects(packRelease({repoDir:f.repo,outDir:f.out,protocolFile:protocol}),/protocol/i);await assert.rejects(readdir(f.out),{code:'ENOENT'});
  }
  const packed=await packRelease({repoDir:f.repo,ref:f.commit,outDir:f.out});await writeFile(packed.sourcePath,'DO-NOT-REPLACE');
  await assert.rejects(packRelease({repoDir:f.repo,ref:f.commit,outDir:f.out}),/already exists/i);assert.equal(await readFile(packed.sourcePath,'utf8'),'DO-NOT-REPLACE');assert.equal((await readdir(f.out)).some(name=>name.startsWith('.ouro-pack-')),false);
 }finally{await f.close();}
});

test('FRL04 valid protocol metadata cannot hide an extra private path later in its tarball',async()=>{
 const {packRelease}=await packaging,f=await fixture();try{
  const protocol=path.join(f.directory,'ouro-protocol-0.1.2.tgz');await writeFile(protocol,protocolTarball({name:'@ouro/protocol',version:'0.1.2'},{name:'package/.env.local',text:'FAKE-PRIVATE-PROTOCOL-FIXTURE'}));
  await assert.rejects(packRelease({repoDir:f.repo,outDir:f.out,protocolFile:protocol}),/protocol|private/i);await assert.rejects(readdir(f.out),{code:'ENOENT'});
 }finally{await f.close();}
});

test('FRL04 committed metadata and refs are validated without executing or echoing hostile input',async()=>{
 const {packRelease}=await packaging,f=await fixture();try{
  for(const ref of ['--output=PRIVATE-INPUT','HEAD\nPRIVATE-INPUT','not-a-commit'])await assert.rejects(packRelease({repoDir:f.repo,outDir:f.out,ref}),error=>error instanceof Error&&!error.message.includes('PRIVATE-INPUT'));
  for(const version of ['../../outside','01.0.0','1.0','1.0.0-beta.01']){
   await writeFile(path.join(f.repo,'package.json'),JSON.stringify({name:'ouro',version}));run(f.repo,['add','package.json']);run(f.repo,['commit','-qm','test: add invalid version fixture']);
   await assert.rejects(packRelease({repoDir:f.repo,outDir:f.out}),/version/i);
  }
  await assert.rejects(readdir(f.out),{code:'ENOENT'});
 }finally{await f.close();}
});

test('FRL04 CLI resolves its own repository and emits reviewable paths without shell interpolation',async()=>{
 const f=await fixture();try{
  const script=path.join(f.repo,'scripts/pack-release.mjs');await mkdir(path.dirname(script));await copyFile(path.resolve('scripts/pack-release.mjs'),script);
  const result=spawnSync(process.execPath,[script,'--ref',f.commit,'--out',f.out],{cwd:f.directory,encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);
  const packed=JSON.parse(result.stdout);assert.equal(packed.manifest.commitSHA,f.commit);assert.equal(packed.manifest.productVersion,'0.1.0-beta.1');assert.equal(zipped(packed.sourcePath,'ouro-0.1.0-beta.1/README.md'),'# Committed release\n');
  const invalid=spawnSync(process.execPath,[script,'--token','PRIVATE-INPUT'],{cwd:f.directory,encoding:'utf8',timeout:15000});assert.notEqual(invalid.status,0);assert.equal(invalid.stdout,'');assert.equal(invalid.stderr.includes('PRIVATE-INPUT'),false);
 }finally{await f.close();}
});
