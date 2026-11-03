import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// npm on Windows loses POSIX executable bits even after chmod. Normalize the
// actual bounded tar headers, not merely the displayed npm file inventory.
export function portableArchive(archive){
 const tar=gunzipSync(archive,{maxOutputLength:32*1024*1024}),files=[];
 if(tar.length%512)throw new Error('Invalid tar alignment');
 for(let offset=0;offset<tar.length;){
  const header=tar.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;
  const name=header.subarray(0,100).toString().replace(/\0.*$/s,''),prefix=header.subarray(345,500).toString().replace(/\0.*$/s,''),filename=prefix?prefix+'/'+name:name;
  const type=String.fromCharCode(header[156]),sizeText=header.subarray(124,136).toString().replace(/\0.*$/s,'').trim();
  if(!filename.startsWith('package/')||filename.split('/').some(part=>part==='..')||!['0','\0','5'].includes(type)||!/^0*[0-7]+$/.test(sizeText))throw new Error('Unsupported tar entry');
  const size=parseInt(sizeText,8),mode=type==='5'||filename.startsWith('package/bin/')?0o755:0o644;
  header.fill(0,100,108);header.write(mode.toString(8).padStart(7,'0'),100);
  header.fill(32,148,156);const checksum=header.reduce((total,byte)=>total+byte,0);header.write(checksum.toString(8).padStart(6,'0')+'\0 ',148);
  if(type!=='5')files.push({path:filename.slice(8),size,mode});
  offset+=512+Math.ceil(size/512)*512;if(offset>tar.length)throw new Error('Truncated tar entry');
 }
 return {archive:gzipSync(tar),files};
}

async function main(){
 const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);let destination=root;
 for(let index=0;index<args.length;index++){if(args[index]==='--json')continue;if(args[index]==='--pack-destination'&&args[index+1]){destination=path.resolve(args[++index]);continue;}throw new Error('Use --json and --pack-destination DIRECTORY only');}
 await mkdir(destination,{recursive:true});if(!process.env.npm_execpath)throw new Error('Use npm run pack:portable');
 const built=spawnSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,encoding:'utf8'});if(built.status!==0)throw new Error(built.stderr||built.stdout);
 const packed=spawnSync(process.execPath,[process.env.npm_execpath,'pack','--ignore-scripts','--json','--pack-destination',destination],{cwd:root,encoding:'utf8'});if(packed.status!==0)throw new Error(packed.stderr);
 const inventory=JSON.parse(packed.stdout),entry=inventory[0],target=path.join(destination,entry.filename),normalized=portableArchive(await readFile(target));
 await writeFile(target,normalized.archive);entry.files=normalized.files;entry.size=normalized.archive.length;
 // Hash the normalized bytes; never retain npm's pre-normalization integrity.
 const {createHash}=await import('node:crypto');entry.shasum=createHash('sha1').update(normalized.archive).digest('hex');entry.integrity='sha512-'+createHash('sha512').update(normalized.archive).digest('base64');
 process.stdout.write(JSON.stringify(inventory,null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
