import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {AGENT_TOOL_PATHS,readAgentToolSupplement,selectAgentToolArguments} from '../scripts/consumer-delivery/agent-tool-contract.mjs';

const digest=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
/** Создаёт только admission fixture с действительным exact3 hash set, без SDK/app/profile. */
async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'ouro-agent-tool-admission-')),tools=[];
 for(const[id,relative]of Object.entries(AGENT_TOOL_PATHS)){const content='export const fixture='+JSON.stringify(id)+';\n';await mkdir(path.dirname(path.join(root,relative)),{recursive:true});await writeFile(path.join(root,relative),content);tools.push({id,path:relative,sha256:digest(content)});}
 const manifest={schemaVersion:1,scope:'CONSUMER_GENERATION_ENVELOPE',sourceCommit:'a'.repeat(40),productVersion:'0.1.0-beta.4',protocolVersion:'0.3.0',sourceFiles:[{path:'app.ts',sha256:digest('fixture'),editable:true}],agentTools:{schemaVersion:1,sourceCommit:'a'.repeat(40),productVersion:'0.1.0-beta.4',protocolVersion:'0.3.0',inputDigest:'b'.repeat(64),tools}};
 await writeFile(path.join(root,'package.json'),JSON.stringify({name:'ouro',version:manifest.productVersion}));await writeFile(path.join(root,'consumer-envelope.json'),JSON.stringify(manifest));
 await readAgentToolSupplement(root);
 return {root,manifest,save:()=>writeFile(path.join(root,'consumer-envelope.json'),JSON.stringify(manifest)),close:async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()));assert(path.basename(root).startsWith('ouro-agent-tool-admission-'));await rm(root,{recursive:true,force:true});}};
}

test('CAA01 nonstring IDs cannot replace exact closure and leave other tool bytes unchecked',async()=>{
 const f=await fixture();try{const bridge=f.manifest.agentTools.tools.find(tool=>tool.id==='mcp-bridge');assert(bridge);const bad={...f.manifest,agentTools:{...f.manifest.agentTools,tools:[0,1,2].map(()=>({...bridge,id:['mcp-bridge']}))}};await writeFile(path.join(f.root,AGENT_TOOL_PATHS['agent-config']),'UNVERIFIED_TOOL_BYTES');await writeFile(path.join(f.root,'consumer-envelope.json'),JSON.stringify(bad));await assert.rejects(()=>readAgentToolSupplement(f.root),{code:'CONSUMER_AGENT_TOOL_UNAVAILABLE'});}finally{await f.close();}
});

test('CAA02 input digest must be a scalar string, never a regexp-coerced array',async()=>{
 const f=await fixture();try{const bad={...f.manifest,agentTools:{...f.manifest.agentTools,inputDigest:[f.manifest.agentTools.inputDigest]}};await writeFile(path.join(f.root,'consumer-envelope.json'),JSON.stringify(bad));await assert.rejects(()=>readAgentToolSupplement(f.root),{code:'CONSUMER_AGENT_TOOL_UNAVAILABLE'});}finally{await f.close();}
});

test('CAA03 reserved equal-form selector cannot fall back to manual tools',()=>{
 const id='g-00000000-0000-0000-0000-000000000001';
 for(const argv of [['--generation=invalid'],['--generation',id,'--generation=invalid']])assert.throws(()=>selectAgentToolArguments(argv),{code:'CONSUMER_AGENT_TOOL_UNAVAILABLE'});
 assert.deepEqual(selectAgentToolArguments(['--unknown=value']),{generation:undefined,argv:['--unknown=value']});
});
