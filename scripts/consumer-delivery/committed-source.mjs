import {validateNodeVersion} from '../runtime-node.mjs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {isReleaseVersion} from './release-version.mjs';

const privateDirectories=new Set(['.git','.operations','.ouro','.ouro-runtime','.next','node_modules','artifacts','test-results','playwright-report','.ssh','.aws','.azure','.kube','.docker','.gnupg']);
const privateNames=new Set(['.npmrc','.pypirc','.netrc','.git-credentials','.credentials.json','.claude.json','credentials','credentials.json','credential.json','auth.json','secrets.json']);
const prefixes=['apps/web/src/','apps/service/src/','apps/service/resources/','apps/service/scripts/','app/human-view/','components/','lib/','packages/client/src/','packages/frontend/src/','packages/core/src/','packages/collaboration/src/','packages/mcp/src/','public/','db/migrations/'];
const exactFiles=new Set(['app/page.tsx','app/projects/layout.tsx','app/projects/help/page.tsx','postcss.config.mjs','apps/web/index.html','apps/web/vite.config.ts','apps/web/tsconfig.json','apps/web/package.json','apps/service/tsconfig.json','apps/service/package.json','packages/client/package.json','packages/frontend/package.json','packages/core/package.json','packages/collaboration/package.json','packages/meridian/src/context.ts','packages/meridian/src/theme.ts','packages/mcp/bin/ouro-mcp.mjs','scripts/runtime-node.mjs','scripts/runtime-node.d.mts','scripts/runtime-environment.mjs','scripts/runtime-environment.d.mts']);
const envelopeFiles=new Set(['scripts/runtime-node.mjs','scripts/consumer-launch.mjs','scripts/consumer-worker.mjs','scripts/consumer-mcp.mjs','scripts/consumer-delivery/consumer-owner.mjs','scripts/consumer-delivery/generation-state.mjs','scripts/consumer-delivery/consumer-port.mjs','scripts/consumer-delivery/owned-http-listener.mjs']);

/** Фиксированный producer diagnostic не раскрывает Git stderr, file bytes или исходные arguments. */
export class ConsumerSourceError extends Error{
 constructor(code){super(code==='CONSUMER_SOURCE_UNSAFE_TREE'?'Committed source tree contains unsupported or private paths.':'Unable to read the requested committed consumer source.');this.name='ConsumerSourceError';this.code=code;}
}

/** Исключает checkout overrides и replacement objects; hash связывается с исходными commit/blob bytes. */
function git(repository,args,{input,maxBuffer=32*1024*1024}={}){
 const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));
 try{return execFileSync('git',['--no-replace-objects','-C',repository,...args],{input,env:environment,maxBuffer,timeout:30000,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});}
 catch{throw new ConsumerSourceError('CONSUMER_SOURCE_INVALID');}
}

/** Аудирует полное дерево, включая файлы за пределами выбранного consumer closure. */
function unsafePath(file){
 const parts=file.split('/'),lower=parts.map(part=>part.toLowerCase());
 return !file||file.includes('\\')||/[\u0000-\u001f\u007f:]/.test(file)||parts.some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))||lower.some(name=>privateDirectories.has(name)||privateNames.has(name)||name.startsWith('.env')&&name!=='.env.example'||/^(?:id_(?:rsa|dsa|ecdsa|ed25519)|.*(?:private[-_]?key|service[-_]?account|secrets?)(?:\.|$))/i.test(name)||/\.(?:pem|key|p12|pfx|jks|keystore|tsbuildinfo)$/i.test(name))||file.startsWith('packages/protocol/dist/')||file.startsWith('apps/web/dist/')||file.startsWith('apps/service/dist/');
}

/** Выбирает конечные reviewed roots; legacy Next routes и nested install locks не включаются. */
function consumerFile(file){return exactFiles.has(file)||prefixes.some(prefix=>file.startsWith(prefix))&&!file.endsWith('/package-lock.json')||file.startsWith('app/')&&file.endsWith('.css');}

/** Читает bounded blob batch без повторного разрешения ref или обращения к dirty working files. */
function readBlobs(repository,entries){
 if(entries.length===0)return [];
 const output=git(repository,['cat-file','--batch'],{input:entries.map(entry=>entry.blob).join('\n')+'\n',maxBuffer:64*1024*1024}),files=[];
 let offset=0;
 for(const entry of entries){
  const newline=output.indexOf(10,offset);if(newline<0)throw new ConsumerSourceError('CONSUMER_SOURCE_INVALID');
  const header=output.subarray(offset,newline).toString('ascii'),match=/^([a-f0-9]{40,64}) blob (0|[1-9]\d*)$/.exec(header);
  const size=match?Number(match[2]):-1,start=newline+1,end=start+size;
  if(!match||match[1]!==entry.blob||!Number.isSafeInteger(size)||size<0||size>32*1024*1024||end>=output.length||output[end]!==10)throw new ConsumerSourceError('CONSUMER_SOURCE_INVALID');
  const bytes=Buffer.from(output.subarray(start,end));files.push({...entry,sha256:createHash('sha256').update(bytes).digest('hex'),bytes});offset=end+1;
 }
 if(offset!==output.length)throw new ConsumerSourceError('CONSUMER_SOURCE_INVALID');return files;
}

/** Проверяет product/protocol identity и release version по выбранным immutable metadata bytes. */
function packageVersion(files,file,name){
 try{
  const metadata=JSON.parse(files.find(entry=>entry.path===file).bytes.toString('utf8'));
  if(metadata.name!==name||!isReleaseVersion(metadata.version))throw new Error();return metadata.version;
 }catch{throw new ConsumerSourceError('CONSUMER_SOURCE_INVALID');}
}

/** Читает конечный consumer source inventory из одного immutable committed tree. */
export function readCommittedConsumerSource(options){
 validateNodeVersion(process.versions.node);
 if(!options||typeof options.repository!=='string'||!path.isAbsolute(options.repository)||/[\u0000-\u001f\u007f]/.test(options.repository)||typeof options.ref!=='string'||!options.ref||options.ref.length>200||options.ref.startsWith('-')||/[\u0000-\u0020\u007f]/.test(options.ref))throw new ConsumerSourceError('CONSUMER_SOURCE_INVALID');
 const {repository,ref}=options;
 const commit=git(repository,['rev-parse','--verify','--end-of-options',`${ref}^{commit}`]).toString('ascii').trim();if(!/^[a-f0-9]{40,64}$/.test(commit))throw new ConsumerSourceError('CONSUMER_SOURCE_INVALID');
 let listing;try{listing=new TextDecoder('utf-8',{fatal:true}).decode(git(repository,['ls-tree','-r','-z','--full-tree',commit]));}catch{throw new ConsumerSourceError('CONSUMER_SOURCE_INVALID');}
 const entries=[],identities=new Map();
 for(const row of listing.split('\0').filter(Boolean)){
  const split=row.indexOf('\t'),header=row.slice(0,split),file=row.slice(split+1),match=/^(100644|100755) blob ([a-f0-9]{40,64})$/.exec(header);
  if(split<0||!match||unsafePath(file))throw new ConsumerSourceError('CONSUMER_SOURCE_UNSAFE_TREE');
  const parts=file.split('/');
  for(let index=0;index<parts.length;index++){
   const spelling=parts.slice(0,index+1).join('/'),identity=spelling.toLowerCase(),kind=index===parts.length-1?'file':'directory',previous=identities.get(identity);
   if(previous&&(previous.spelling!==spelling||previous.kind!==kind||kind==='file'))throw new ConsumerSourceError('CONSUMER_SOURCE_UNSAFE_TREE');
   if(!previous)identities.set(identity,{spelling,kind});
  }
  entries.push({path:file,mode:match[1],blob:match[2]});
 }
 const selected=entries.filter(entry=>consumerFile(entry.path)||envelopeFiles.has(entry.path)||entry.path.startsWith('packages/protocol/')||entry.path.startsWith('release/consumer/')||entry.path==='apps/web/tests/navigation.spec.ts'||entry.path==='package.json');
 const files=readBlobs(repository,selected);
 const productVersion=packageVersion(files,'package.json','ouro'),protocolVersion=packageVersion(files,'packages/protocol/package.json','@ouro/protocol');
 if(!files.some(file=>file.path==='packages/protocol/package-lock.json'))throw new ConsumerSourceError('CONSUMER_SOURCE_INVALID');
 return {commit,productVersion,protocolVersion,consumerFiles:files.filter(entry=>consumerFile(entry.path)),protocolFiles:files.filter(entry=>entry.path.startsWith('packages/protocol/')),deliveryFiles:files.filter(entry=>entry.path.startsWith('release/consumer/')),qualificationFiles:files.filter(entry=>entry.path==='apps/web/tests/navigation.spec.ts'),envelopeFiles:files.filter(entry=>envelopeFiles.has(entry.path))};
}
