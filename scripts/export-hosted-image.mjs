import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,open,readFile,readdir,rename,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {createGzip} from 'node:zlib';

const root=fileURLToPath(new URL('../',import.meta.url));
const outputDirectory=path.join(root,'artifacts','hosted-image');
const qualifiedTag='ouro:qualification';
const digest=value=>createHash('sha256').update(value).digest('hex');

function command(binary,args){
 const result=spawnSync(binary,args,{cwd:root,encoding:'utf8',maxBuffer:1024*1024,windowsHide:true});
 if(result.error||result.status!==0)throw new Error(`${binary} ${args[0]} failed; no environment or credentials are included in export diagnostics.`);
 return result.stdout.trim();
}

export function validateImageMetadata(image){
 assert(image&&/^sha256:[0-9a-f]{64}$/.test(image.id),'An exact qualified image ID is required.');
 assert.equal(image.os,'linux','The deployment image must run Linux.');
 assert.equal(image.architecture,'amd64','The deployment image must match the amd64 production host.');
 assert.equal(image.user,'node','The production image must run as node.');
 return image;
}

function inspectImage(reference){
 const format='{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}},"user":{{json .Config.User}}}';
 return validateImageMetadata(JSON.parse(command('docker',['image','inspect','--format',format,reference])));
}

/** Stream gzip without filename/timestamp, hashing the exact compressed bytes. */
export async function writeGzipArchive(input,target){
 const hash=createHash('sha256');let bytes=0;
 const count=new Transform({transform(chunk,_encoding,callback){hash.update(chunk);bytes+=chunk.length;callback(null,chunk);}});
 // Node's gzip stream omits original filename/time; verify that wire header
 // below rather than relying only on a displayed option or filename suffix.
 await pipeline(input,createGzip({level:6}),count,createWriteStream(target,{flags:'wx',mode:0o600}));
 const file=await open(target,'r'),header=Buffer.alloc(10);
 try{const read=await file.read(header,0,header.length,0);assert.equal(read.bytesRead,10);}finally{await file.close();}
 assert.equal(header.readUInt16BE(0),0x1f8b,'The archive must contain gzip bytes.');
 assert.equal(header[2],8);assert.equal(header[3],0,'No filename, comment or optional metadata is admitted.');
 assert.equal(header.readUInt32LE(4),0,'The gzip timestamp must be zero, matching gzip -n.');
 assert.equal((await stat(target)).size,bytes);
 return {bytes,sha256:hash.digest('hex')};
}

async function saveImage(reference,target){
 const child=spawn('docker',['image','save',reference],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 // Drain Docker diagnostics, but never publish daemon/configuration text as a
 // substitute for the bounded manifest. The exit status remains mandatory.
 child.stderr.resume();
 const finished=new Promise((resolve,reject)=>{
  child.once('error',()=>reject(new Error('Unable to start Docker image export.')));
  child.once('close',(code,signal)=>code===0?resolve():reject(new Error(`Docker image export failed (${signal??code}).`)));
 });
 const transfer=writeGzipArchive(child.stdout,target);
 try{const [,archive]=await Promise.all([finished,transfer]);return archive;}
 catch(error){child.kill();await Promise.allSettled([finished,transfer]);throw error;}
}

async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true','Hosted image export runs only inside a GitHub Actions run.');
 const runId=process.env.GITHUB_RUN_ID,runAttempt=process.env.GITHUB_RUN_ATTEMPT;
 assert(runId&&/^\d+$/.test(runId),'A GitHub run ID is required.');
 assert(runAttempt&&/^\d+$/.test(runAttempt),'A GitHub run attempt is required.');
 const sourceCommit=command('git',['rev-parse','HEAD']),sourceTree=command('git',['rev-parse','HEAD^{tree}']);
 assert(/^[0-9a-f]{40}$/.test(sourceCommit)&&/^[0-9a-f]{40}$/.test(sourceTree),'Exact repository commit/tree identities are required.');
 command('git',['diff','--quiet','HEAD','--']);
 const image=inspectImage(qualifiedTag),imageTag=`ouro-cloud-ci:${sourceCommit}`;
 const app=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 const protocol=JSON.parse(await readFile(path.join(root,'packages','protocol','package.json'),'utf8'));
 const imageVersions=JSON.parse(command('docker',['run','--rm','--network','none','--memory','128m','--cap-drop','ALL','--security-opt','no-new-privileges:true','--entrypoint','node',image.id,'--input-type=module','-e',
  'import fs from "node:fs";const app=JSON.parse(fs.readFileSync("/app/package.json","utf8")),protocol=JSON.parse(fs.readFileSync("/app/packages/protocol/package.json","utf8"));console.log(JSON.stringify({appName:app.name,appVersion:app.version,protocolName:protocol.name,protocolVersion:protocol.version}));']));
 assert.deepEqual(imageVersions,{appName:'ouro',appVersion:app.version,protocolName:'@ouro/protocol',protocolVersion:protocol.version},'The qualified image must contain the checked-out application/protocol versions.');
 assert(typeof app.version==='string'&&typeof protocol.version==='string');
 command('docker',['image','tag',image.id,imageTag]);
 assert.deepEqual(inspectImage(imageTag),image,'Retagging must retain the same qualified image identity.');
 await mkdir(outputDirectory,{recursive:true,mode:0o700});
 assert.equal((await readdir(outputDirectory)).length,0,'Refusing to overwrite or upload an existing export directory.');
 const filename=`ouro-hosted-image-${sourceCommit}.tar.gz`,partial=path.join(outputDirectory,filename+'.partial');
 const archive=await saveImage(imageTag,partial);
 assert.equal(inspectImage(imageTag).id,image.id,'The exported tag must still resolve to the qualified image.');
 await rename(partial,path.join(outputDirectory,filename));
 const manifest={format:'ouro-hosted-image/v1',sourceCommit,sourceTree,imageId:image.id,imageTag,qualifiedTag,os:image.os,architecture:image.architecture,user:image.user,appVersion:app.version,protocolVersion:protocol.version,archive:{filename,...archive,format:'docker-save',compression:'gzip-no-name-no-time'},runId,runAttempt};
 const text=JSON.stringify(manifest,null,2)+'\n';
 await writeFile(path.join(outputDirectory,'manifest.json'),text,{flag:'wx',mode:0o600});
 await writeFile(path.join(outputDirectory,'SHA256SUMS'),`${archive.sha256}  ${filename}\n${digest(text)}  manifest.json\n`,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({ok:true,sourceCommit,sourceTree,imageId:image.id,imageTag,appVersion:app.version,protocolVersion:protocol.version,archive:manifest.archive,runId,runAttempt}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
