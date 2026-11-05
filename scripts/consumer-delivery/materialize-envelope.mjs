import {applicationNodeEngine,validateNodeVersion} from '../runtime-node.mjs';
import {readCommittedConsumerSource} from './committed-source.mjs';
import {materializeConsumerBuildTree} from './materialize-build-tree.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

/** Не раскрывает raw producer/config output при неполной envelope materialization. */
export class ConsumerEnvelopeError extends Error{constructor(){super('Consumer envelope materialization failed.');this.name='ConsumerEnvelopeError';this.code='CONSUMER_ENVELOPE_FAILED';}}

/** Создаёт отдельный dependency-free envelope и один source blueprint из того же committed producer. */
export async function materializeConsumerEnvelope(options){
 validateNodeVersion(process.versions.node);
 try{
  if(!options||typeof options.outputDirectory!=='string'||!path.isAbsolute(options.outputDirectory))throw Error();const source=readCommittedConsumerSource({repository:options.repository,ref:options.ref}),output=path.resolve(options.outputDirectory);
  const required=['scripts/runtime-node.mjs','scripts/consumer-launch.mjs','scripts/consumer-worker.mjs','scripts/consumer-mcp.mjs','scripts/consumer-delivery/consumer-owner.mjs','scripts/consumer-delivery/generation-state.mjs','scripts/consumer-delivery/consumer-port.mjs','scripts/consumer-delivery/owned-http-listener.mjs'];if(required.some(file=>!source.envelopeFiles.some(entry=>entry.path===file)))throw Error();const wrapper=source.deliveryFiles.find(file=>file.path==='release/consumer/mcp-entry.mjs.template');if(!wrapper)throw Error();
  await mkdir(path.dirname(output),{recursive:true});await mkdir(output);const sourceRoot=path.join(output,'source');await materializeConsumerBuildTree({...options,ref:source.commit,outputDirectory:sourceRoot,producerScratchRoot:path.dirname(output)});
  const put=async(relative,content)=>{await mkdir(path.dirname(path.join(output,relative)),{recursive:true});await writeFile(path.join(output,relative),content,{flag:'wx'});};
  for(const file of source.envelopeFiles)await put(file.path,file.bytes);await put('packages/mcp/bin/ouro-mcp.mjs',wrapper.bytes);
  const product={name:'ouro',version:source.productVersion,private:true,type:'module',engines:{node:applicationNodeEngine},scripts:{launch:'node scripts/consumer-launch.mjs launch',build:'node scripts/consumer-launch.mjs build',start:'node scripts/consumer-launch.mjs start',mcp:'node packages/mcp/bin/ouro-mcp.mjs'}};await put('package.json',JSON.stringify(product,null,2)+'\n');
  const editable=new Set(source.consumerFiles.map(file=>file.path)),filenames=[...editable,'scripts/build-consumer.mjs','tsconfig.json','package.json','package-lock.json','vendor/ouro-protocol-'+source.protocolVersion+'.tgz','delivery-manifest.json'].sort(),sourceFiles=[];
  if(new Set(filenames).size!==filenames.length)throw Error();for(const file of filenames){const content=await readFile(path.join(sourceRoot,file));sourceFiles.push({path:file,sha256:createHash('sha256').update(content).digest('hex'),editable:editable.has(file)});}
  await put('consumer-envelope.json',JSON.stringify({schemaVersion:1,scope:'CONSUMER_GENERATION_ENVELOPE',sourceCommit:source.commit,productVersion:source.productVersion,protocolVersion:source.protocolVersion,sourceFiles,launcherQualification:'PENDING',archiveQualification:'NOT_IMPLEMENTED'},null,2)+'\n');
  await put('README.md','# Ouro independent source delivery\n\nUse stable Node.js 24, minimum24.19.0. Run `npm run launch` to install build tools, produce a fresh isolated build and start the local application. Every launch creates a new generation. Keep the terminal open; Ctrl+C stops the owned server.\n\n`npm run build` prepares a new completed build; `npm start` runs the last completed build. Put optional `.env.local` and agent key files in this outer folder. Stable local data is `.ouro/postgres`; no generation is automatically deleted or reused after an interrupted preparation. Disk usage accumulates until a separate explicit cleanup policy is provided. Source ZIP/cutover/production acceptance is a separate qualification.\n');
  return {directory:output,commit:source.commit};
 }catch{throw new ConsumerEnvelopeError();}
}
