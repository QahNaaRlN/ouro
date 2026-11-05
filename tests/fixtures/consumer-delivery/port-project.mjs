import {mkdtemp,mkdir,writeFile,readFile,copyFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {allocateGeneration,snapshotGeneration,publishBuiltGeneration} from '../../../scripts/consumer-delivery/generation-state.mjs';

/** Создаёт только bootstrap/env witness; fake app artifacts никогда не импортируются. */
export async function createPortProbe(){
 const repository=fileURLToPath(new URL('../../../',import.meta.url)),directory=await mkdtemp(path.join(tmpdir(),'ouro-port-bootstrap-')),root=path.join(directory,'installed root'),foreign=path.join(directory,'foreign');await mkdir(root);await mkdir(foreign);await mkdir(path.join(root,'source'));
 const files={'package.json':'{"name":"owned-port-witness","type":"module"}','scripts/runtime-environment.mjs':await readFile(path.join(repository,'scripts/runtime-environment.mjs'),'utf8'),'scripts/runtime-node.mjs':await readFile(path.join(repository,'scripts/runtime-node.mjs'),'utf8')},sourceFiles=[];
 for(const[file,content]of Object.entries(files)){await mkdir(path.dirname(path.join(root,'source',file)),{recursive:true});await writeFile(path.join(root,'source',file),content);sourceFiles.push({path:file,sha256:createHash('sha256').update(content).digest('hex'),editable:false});}
 await writeFile(path.join(root,'consumer-envelope.json'),JSON.stringify({schemaVersion:1,scope:'CONSUMER_GENERATION_ENVELOPE',sourceCommit:'a'.repeat(40),productVersion:'0.1.0-beta.4',protocolVersion:'0.3.0',sourceFiles}));
 for(const file of ['scripts/runtime-node.mjs','scripts/consumer-worker.mjs','scripts/consumer-delivery/generation-state.mjs','scripts/consumer-delivery/consumer-port.mjs','scripts/consumer-delivery/owned-http-listener.mjs']){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await copyFile(path.join(repository,file),path.join(root,file));}
 const generation=await allocateGeneration(root),snapshot=await snapshotGeneration(root,generation),artifacts={'apps/web/dist/index.html':'<div id="root"></div>','apps/service/dist/index.mjs':'throw Error("Application must not be imported by bootstrap witness");','apps/service/dist/main.mjs':'export {};','apps/service/dist/resources/migrations/001_init.sql':'SELECT 1;','apps/service/dist/resources/verification/playwright-preload.mjs':'export {};','apps/service/dist/resources/mcp/bin/ouro-mcp.mjs':'export {};'};
 for(const[file,content]of Object.entries(artifacts)){await mkdir(path.dirname(path.join(generation.directory,file)),{recursive:true});await writeFile(path.join(generation.directory,file),content);}await publishBuiltGeneration(root,generation,snapshot);
 for(const[name,version]of [['dotenv','16.3.1'],['dotenv-expand','10.0.0']]){const source=path.join(repository,'node_modules',name);if(JSON.parse(await readFile(path.join(source,'package.json'),'utf8')).version!==version)throw Error('Wrong locked parser fixture');await cp(source,path.join(generation.directory,'node_modules',name),{recursive:true,errorOnExist:true,force:false});}
 return {directory,root,foreign,generation,close:async()=>{if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir())||!path.basename(directory).startsWith('ouro-port-bootstrap-'))throw Error('Refused foreign port fixture cleanup');await rm(directory,{recursive:true,force:true});}};
}
