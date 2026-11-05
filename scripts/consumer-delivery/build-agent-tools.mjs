import {validateNodeVersion} from '../runtime-node.mjs';
import {AGENT_TOOL_PATHS,ConsumerAgentToolError} from './agent-tool-contract.mjs';
import {mkdir,mkdtemp,readFile,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Собирает только fixed three tools в отдельном install tree; blueprint остаётся read-only. */
export async function buildAgentTools({source,sourceRoot,sourceFiles,outputRoot,scratchRoot,npmCli}){
 validateNodeVersion(process.versions.node);
 try{
  if(![sourceRoot,outputRoot,scratchRoot,npmCli].every(value=>typeof value==='string'&&path.isAbsolute(value)&&!/[\u0000-\u001f\u007f]/.test(value))||path.basename(npmCli)!=='npm-cli.js')throw new ConsumerAgentToolError();
  const relative=path.relative(outputRoot,scratchRoot);if(!relative||relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))throw new ConsumerAgentToolError();
  const recipe=source.deliveryFiles.find(file=>file.path==='release/consumer/build-agent-tools.mjs.template');if(!recipe||source.agentToolFiles.length!==2)throw new ConsumerAgentToolError();
  const stage=await mkdtemp(path.join(scratchRoot,'.ouro-cli-stage-'));
  const put=async(relative,content)=>{await mkdir(path.dirname(path.join(stage,relative)),{recursive:true});await writeFile(path.join(stage,relative),content,{flag:'wx'});};
  if(!Array.isArray(sourceFiles)||sourceFiles.length>4096)throw new ConsumerAgentToolError();let total=0;
  for(const file of sourceFiles){if(typeof file.path!=='string'||path.isAbsolute(file.path)||/[\\\u0000-\u001f\u007f:]/.test(file.path)||file.path.split('/').some(part=>!part||part==='.'||part==='..'))throw new ConsumerAgentToolError();let current=sourceRoot;const parts=file.path.split('/');for(let index=0;index<parts.length;index++){current=path.join(current,parts[index]);const stat=await lstat(current);if(stat.isSymbolicLink()||index<parts.length-1&&!stat.isDirectory()||index===parts.length-1&&(!stat.isFile()||stat.size>32*1024*1024))throw new ConsumerAgentToolError();}const bytes=await readFile(current);total+=bytes.length;if(total>256*1024*1024||hash(bytes)!==file.sha256)throw new ConsumerAgentToolError();await put(file.path,bytes);}
  await put('scripts/build-agent-tools.mjs',recipe.bytes);
  const keys=['SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','NODE_USE_ENV_PROXY'],env=Object.fromEntries(keys.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));env.PATH=path.dirname(process.execPath)+path.delimiter+(env.PATH??'');env.npm_execpath=npmCli;env.NODE_ENV='production';
  const invoke=args=>{const result=spawnSync(process.execPath,args,{cwd:stage,env,encoding:'utf8',shell:false,windowsHide:true,timeout:180000,maxBuffer:4*1024*1024});if(result.error||result.status!==0)throw new ConsumerAgentToolError();};
  invoke([npmCli,'ci','--include=dev','--no-audit','--no-fund']);
  const assertUnchanged=async()=>{for(const file of [...sourceFiles,{path:'scripts/build-agent-tools.mjs',sha256:recipe.sha256}]){let current=stage;const parts=file.path.split('/');for(let index=0;index<parts.length;index++){current=path.join(current,parts[index]);const stat=await lstat(current);if(stat.isSymbolicLink()||index<parts.length-1&&!stat.isDirectory()||index===parts.length-1&&(!stat.isFile()||stat.size>32*1024*1024))throw new ConsumerAgentToolError();}if(hash(await readFile(current))!==file.sha256)throw new ConsumerAgentToolError();}};
  await assertUnchanged();
  invoke([path.join(stage,'scripts/build-agent-tools.mjs')]);
  await assertUnchanged();
  const inputs=JSON.parse(await readFile(path.join(stage,'tool-dist/inputs.json'),'utf8')),actualInputs=[];
  if(!Array.isArray(inputs)||inputs.length>4096)throw new ConsumerAgentToolError();
  for(const input of inputs){if(typeof input.path!=='string'||path.isAbsolute(input.path)||/[\\\u0000-\u001f\u007f:]/.test(input.path)||input.path.split('/').some(part=>!part||part==='.'||part==='..'))throw new ConsumerAgentToolError();actualInputs.push({path:input.path,sha256:hash(await readFile(path.join(stage,input.path)))});}
  const inputDigest=hash(JSON.stringify({recipe:recipe.sha256,source:sourceFiles.map(file=>({path:file.path,sha256:file.sha256})),compiler:actualInputs})),tools=[];
  for(const [id,relative]of Object.entries(AGENT_TOOL_PATHS)){const bytes=await readFile(path.join(stage,'tool-dist',id+'.mjs'));if(bytes.length>32*1024*1024)throw new ConsumerAgentToolError();await mkdir(path.dirname(path.join(outputRoot,relative)),{recursive:true});await writeFile(path.join(outputRoot,relative),bytes,{flag:'wx'});tools.push({id,path:relative,sha256:hash(bytes)});}
  return {schemaVersion:1,sourceCommit:source.commit,productVersion:source.productVersion,protocolVersion:source.protocolVersion,inputDigest,tools};
 }catch{throw new ConsumerAgentToolError();}
}
