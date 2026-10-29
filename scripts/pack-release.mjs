import {constants} from 'node:fs';
import {copyFile,chmod,lstat,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';

const repositoryRoot=fileURLToPath(new URL('../',import.meta.url));
const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
export class ReleasePackageError extends Error{constructor(message){super(message);this.name='ReleasePackageError';this.code='RELEASE_PACKAGE_ERROR';}}
const fail=message=>{throw new ReleasePackageError(message);};
function git(repoDir,args,{binary=false}={}){
 const result=spawnSync('git',['-C',repoDir,...args],{encoding:binary?undefined:'utf8',maxBuffer:16*1024*1024,timeout:30000});
 if(result.error||result.status!==0)fail('Unable to read the requested committed Git tree.');
 return result.stdout;
}
function version(value){
 if(typeof value!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value))fail('The committed package needs a valid release version.');
 return value;
}
const privateDirectories=new Set(['.git','.ouro','.next','node_modules','artifacts','test-results','playwright-report','.ssh','.aws','.azure','.kube','.docker','.gnupg']);
const privateNames=new Set(['.npmrc','.pypirc','.netrc','.git-credentials','.credentials.json','.claude.json','credentials','credentials.json','credential.json','auth.json','secrets.json']);
function unsafePath(file){
 const parts=file.split('/'),names=parts.map(part=>part.toLowerCase());
 return !file||file.includes('\\')||/[\u0000-\u001f\u007f]/.test(file)||parts.some(part=>!part||part==='.'||part==='..')||names.some(name=>privateDirectories.has(name)||privateNames.has(name)||name.startsWith('.env')&&name!=='.env.example'||/^(?:id_(?:rsa|dsa|ecdsa|ed25519)|.*(?:private[-_]?key|service[-_]?account|secrets?)(?:\.|$))/i.test(name)||/\.(?:pem|key|p12|pfx|jks|keystore|tsbuildinfo)$/i.test(name));
}
function auditCommittedTree(repoDir,commit){
 let listing;try{listing=new TextDecoder('utf-8',{fatal:true}).decode(git(repoDir,['ls-tree','-r','-z','--full-tree',commit],{binary:true}));}catch{fail('The tracked release tree contains an invalid path.');}
 for(const row of listing.split('\0').filter(Boolean)){
  const split=row.indexOf('\t'),header=row.slice(0,split),file=row.slice(split+1);
  if(split<0||!/^(100644|100755) blob [0-9a-f]{40,64}$/.test(header))fail('Unsupported tracked links or file modes cannot enter a release archive.');
  if(unsafePath(file)||file.startsWith('packages/protocol/dist/'))fail('Tracked private or runtime paths must be removed before release packaging.');
 }
}
function committedPackage(repoDir,commit,file){
 try{return JSON.parse(git(repoDir,['show',`${commit}:${file}`]));}catch{fail('The committed tree must include readable product and protocol package metadata.');}
}
async function asset(file,name=path.basename(file)){
 const bytes=await readFile(file);return {name,sha256:checksum(bytes),bytes:bytes.length};
}
function protocolMetadata(bytes){
 let tar;try{tar=gunzipSync(bytes,{maxOutputLength:32*1024*1024});}catch{fail('The protocol asset must be a valid bounded npm tarball.');}
 if(tar.length%512!==0)fail('The protocol tarball is truncated.');
 let metadata;
 for(let offset=0;offset+512<=tar.length;){
  const header=tar.subarray(offset,offset+512);
  if(header.every(byte=>byte===0)){if(!tar.subarray(offset).every(byte=>byte===0))fail('The protocol tarball contains unexpected data after its footer.');break;}
  let name,prefix;try{name=new TextDecoder('utf-8',{fatal:true}).decode(header.subarray(0,100)).replace(/\0.*$/s,'');prefix=new TextDecoder('utf-8',{fatal:true}).decode(header.subarray(345,500)).replace(/\0.*$/s,'');}catch{fail('The protocol tarball contains an invalid path.');}
  const full=prefix?`${prefix}/${name}`:name,type=String.fromCharCode(header[156]);
  const sumText=header.subarray(148,156).toString('ascii').replace(/\0.*$/s,'').trim(),actualSum=header.reduce((sum,byte,index)=>sum+(index>=148&&index<156?32:byte),0);
  if(!/^[0-7]+$/.test(sumText)||parseInt(sumText,8)!==actualSum)fail('The protocol tarball has an invalid header checksum.');
  if(!['0','\0'].includes(type)||!/^package\/(?:package\.json|README\.md|LICENSE)$|^package\/(?:dist|schemas|examples|bin)\//.test(full)||unsafePath(full))fail('The protocol tarball contains unsupported or private package paths.');
  const sizeText=header.subarray(124,136).toString('ascii').replace(/\0.*$/s,'').trim();
  if(!/^[0-7]+$/.test(sizeText))fail('The protocol tarball has invalid package metadata.');
  const size=parseInt(sizeText,8),start=offset+512,end=start+size;
  if(end>tar.length)fail('The protocol tarball is truncated.');
  if(full==='package/package.json'){
   if(metadata!==undefined)fail('The protocol tarball contains duplicate package metadata.');
   try{metadata=JSON.parse(tar.subarray(start,end).toString('utf8'));}catch{fail('The protocol tarball has invalid package metadata.');}
  }
  offset=start+Math.ceil(size/512)*512;
 }
 if(metadata===undefined)fail('The protocol tarball must include package/package.json.');
 return metadata;
}
async function verifyExisting(destination,bytes){
 try{
  const stat=await lstat(destination);
  if(!stat.isFile()||stat.isSymbolicLink()||!Buffer.from(await readFile(destination)).equals(bytes))fail('Release output already exists with different contents; choose a new output directory.');
  return true;
 }catch(error){if(error?.code==='ENOENT')return false;throw error;}
}

/** Package only one resolved committed tree. The current working tree is never copied. */
export async function packRelease({repoDir=repositoryRoot,ref='HEAD',outDir='artifacts',protocolFile}={}){
 if(typeof repoDir!=='string'||typeof outDir!=='string'||!repoDir||!outDir||/[\0\r\n]/.test(repoDir+outDir))fail('Use valid repository and output paths.');
 if(typeof ref!=='string'||!ref||ref.length>200||ref.startsWith('-')||/[\u0000-\u0020\u007f]/.test(ref))fail('Use a valid commit or tag reference.');
 const root=path.resolve(repoDir),out=path.resolve(root,outDir);
 const commitSHA=git(root,['rev-parse','--verify','--end-of-options',`${ref}^{commit}`]).trim();
 if(!/^[0-9a-f]{40,64}$/.test(commitSHA))fail('Unable to resolve one exact release commit.');
 auditCommittedTree(root,commitSHA);
 const product=committedPackage(root,commitSHA,'package.json'),protocol=committedPackage(root,commitSHA,'packages/protocol/package.json');
 if(product.name!=='ouro'||protocol.name!=='@ouro/protocol')fail('The committed tree must describe Ouro and @ouro/protocol.');
 const productVersion=version(product.version),protocolVersion=version(protocol.version),sourcePrefix=`ouro-${productVersion}/`,sourceName=`ouro-${productVersion}-source.zip`;
 let protocolBytes,protocolName;
 if(protocolFile!==undefined){
  if(typeof protocolFile!=='string'||!protocolFile||/[\0\r\n]/.test(protocolFile))fail('Use a valid protocol tarball path.');
  const source=path.resolve(root,protocolFile),stat=await lstat(source);protocolName=`ouro-protocol-${protocolVersion}.tgz`;
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024||path.basename(source)!==protocolName)fail('The protocol asset name must match the committed protocol version.');
  protocolBytes=await readFile(source);const metadata=protocolMetadata(protocolBytes);
  if(metadata.name!=='@ouro/protocol'||metadata.version!==protocolVersion)fail('The protocol asset must match the committed protocol package.');
 }
 await mkdir(out,{recursive:true});const staging=await mkdtemp(path.join(out,'.ouro-pack-'));
 try{
  const stagedSource=path.join(staging,sourceName);git(root,['archive','--format=zip',`--prefix=${sourcePrefix}`,`--output=${stagedSource}`,commitSHA]);
  const assets=[await asset(stagedSource,sourceName)];
  if(protocolBytes){await writeFile(path.join(staging,protocolName),protocolBytes,{mode:0o644});assets.push(await asset(path.join(staging,protocolName),protocolName));}
  const manifest={schemaVersion:1,product:'ouro',productVersion,protocolVersion,commitSHA,sourcePrefix,assets};
  const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await writeFile(path.join(staging,'release-manifest.json'),manifestBytes,{mode:0o644});
  const sums=assets.map(item=>`${item.sha256}  ${item.name}`).concat(`${checksum(manifestBytes)}  release-manifest.json`).join('\n')+'\n';
  await writeFile(path.join(staging,'SHA256SUMS'),sums,{mode:0o644});
  const names=[...assets.map(item=>item.name),'release-manifest.json','SHA256SUMS'],existing=new Set();
  for(const name of names)if(await verifyExisting(path.join(out,name),await readFile(path.join(staging,name))))existing.add(name);
  for(const name of names){if(existing.has(name))continue;await copyFile(path.join(staging,name),path.join(out,name),constants.COPYFILE_EXCL);await chmod(path.join(out,name),0o644);}
  return {manifest,sourcePath:path.join(out,sourceName),...(protocolName?{protocolPath:path.join(out,protocolName)}:{}),manifestPath:path.join(out,'release-manifest.json'),checksumsPath:path.join(out,'SHA256SUMS')};
 }finally{await rm(staging,{recursive:true,force:true});}
}

async function main(){
 const help='Ouro release packaging\n\nnode scripts/pack-release.mjs [--ref COMMIT_OR_TAG] [--out DIRECTORY] [--protocol-file ouro-protocol-VERSION.tgz]\n\nPackages an exact committed tree, not local data. Existing different output is never replaced.\n';
 const argv=process.argv.slice(2);if(argv.length===1&&argv[0]==='--help'){process.stdout.write(help);return;}
 const accepted=new Map([['--ref','ref'],['--out','outDir'],['--protocol-file','protocolFile']]),options={};
 for(let index=0;index<argv.length;index++){
  const field=accepted.get(argv[index]);if(!field||options[field]!==undefined||!argv[index+1]||argv[index+1].startsWith('--'))fail('Use --ref, --out and --protocol-file with one value each; see --help.');
  options[field]=argv[++index];
 }
 const packed=await packRelease(options);process.stdout.write(JSON.stringify(packed,null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{process.stderr.write(`Ouro release: ${error instanceof ReleasePackageError?error.message:'Packaging failed; check the committed tree and destination.'}\n`);process.exitCode=1;});
}
