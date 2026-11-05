import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {validateNodeVersion} from '../runtime-node.mjs';
import {admitConsumerEnvelope} from './generation-state.mjs';

export const AGENT_TOOL_PATHS=Object.freeze({'agent-config':'resources/cli/agent-config.mjs','agent-check':'resources/cli/agent-check.mjs','mcp-bridge':'resources/cli/mcp-bridge.mjs'});
export const AGENT_TOOL_EXPORTS=Object.freeze({'agent-config':'runAgentConfig','agent-check':'runAgentCheck','mcp-bridge':'runMcpBridge'});
export const AGENT_TOOL_GENERATION_PATHS=Object.freeze({'agent-config':'apps/service/dist/cli/agent-config.mjs','agent-check':'apps/service/dist/cli/agent-check.mjs','mcp-bridge':'apps/service/dist/resources/mcp/bin/ouro-mcp.mjs'});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sha=/^[a-f0-9]{64}$/;

/** Отказывает без raw filesystem, descriptor или credential values. */
export class ConsumerAgentToolError extends Error{constructor(){super('Installed agent tool is unavailable.');this.name='ConsumerAgentToolError';this.code='CONSUMER_AGENT_TOOL_UNAVAILABLE';}}

/** Проверяет точный набор полей вместо разрешения произвольного executable descriptor. */
function fields(value,names){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...names].sort().join(',');}

/** Читает только fixed owned resource без symlink и неограниченного allocation. */
async function ownedBytes(root,relative,maximum=32*1024*1024){
 let current=root;const parts=relative.split('/');
 for(let index=0;index<parts.length;index++){current=path.join(current,parts[index]);const stat=await lstat(current);if(stat.isSymbolicLink()||index<parts.length-1&&!stat.isDirectory()||index===parts.length-1&&(!stat.isFile()||stat.size>maximum))throw new ConsumerAgentToolError();}
 return readFile(current);
}

/** Проверяет весь immutable set; это локальная integrity admission, не remote attestation. */
export async function readAgentToolSupplement(root){
 validateNodeVersion(process.versions.node);
 try{
  const canonical=await admitConsumerEnvelope(root),manifest=JSON.parse((await ownedBytes(canonical,'consumer-envelope.json',1024*1024)).toString('utf8')),product=JSON.parse((await ownedBytes(canonical,'package.json',1024*1024)).toString('utf8')),descriptor=manifest.agentTools;
  if(!fields(descriptor,['schemaVersion','sourceCommit','productVersion','protocolVersion','inputDigest','tools'])||descriptor.schemaVersion!==1||typeof descriptor.sourceCommit!=='string'||typeof descriptor.productVersion!=='string'||typeof descriptor.protocolVersion!=='string'||typeof descriptor.inputDigest!=='string'||descriptor.sourceCommit!==manifest.sourceCommit||descriptor.productVersion!==manifest.productVersion||descriptor.protocolVersion!==manifest.protocolVersion||product.name!=='ouro'||product.version!==descriptor.productVersion||!sha.test(descriptor.inputDigest)||!Array.isArray(descriptor.tools)||descriptor.tools.length!==3)throw new ConsumerAgentToolError();
  const seen=new Set();
  for(const tool of descriptor.tools){if(!fields(tool,['id','path','sha256'])||typeof tool.id!=='string'||typeof tool.path!=='string'||typeof tool.sha256!=='string'||!Object.hasOwn(AGENT_TOOL_PATHS,tool.id)||seen.has(tool.id)||tool.path!==AGENT_TOOL_PATHS[tool.id]||!sha.test(tool.sha256))throw new ConsumerAgentToolError();seen.add(tool.id);const content=await ownedBytes(canonical,AGENT_TOOL_PATHS[tool.id]);if(hash(content)!==tool.sha256)throw new ConsumerAgentToolError();}
  if(Object.keys(AGENT_TOOL_PATHS).some(id=>!seen.has(id)))throw new ConsumerAgentToolError();
  if(await realpath(canonical)!==canonical)throw new ConsumerAgentToolError();return {root:canonical,descriptor};
 }catch{throw new ConsumerAgentToolError();}
}

/** Отделяет единственный leading selector; остальные аргументы остаются у прежнего main. */
export function selectAgentToolArguments(argv){
 if(!Array.isArray(argv)||argv.some(value=>typeof value!=='string'||value.startsWith('--generation=')))throw new ConsumerAgentToolError();let generation;
 if(argv[0]==='--generation'){generation=argv[1];if(!/^g-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(generation??''))throw new ConsumerAgentToolError();argv=argv.slice(2);}
 if(argv.includes('--generation'))throw new ConsumerAgentToolError();return {generation,argv};
}
