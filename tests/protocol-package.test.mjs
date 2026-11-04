import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';

test('protocol builds independently and its tarball supports JS, types, schemas and CLI without Ouro', {timeout:180000},async()=>{
 const origin=path.resolve('packages/protocol');
 const pkg=JSON.parse(await readFile(path.join(origin,'package.json'),'utf8'));
 assert.equal(pkg.name,'@ouro/protocol');
 assert(process.env.npm_execpath,'Run through npm run protocol:test-package');
 const directory=await mkdtemp(path.join(tmpdir(),'ouro protocol independent '));
 const run=(cwd,args,expected=0)=>{
  const result=spawnSync(process.execPath,args,{cwd,env:process.env,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  assert.equal(result.status,expected,result.stderr+'\n'+result.stdout);return result.stdout;
 };
 const npm=(cwd,...args)=>run(cwd,[process.env.npm_execpath,...args]);
 try{
  const source=path.join(directory,'standalone source'),consumer=path.join(directory,'consumer');
  await cp(origin,source,{recursive:true,filter:file=>!path.relative(origin,file).split(path.sep).some(part=>['node_modules','dist'].includes(part))});
  npm(source,'ci','--no-audit','--no-fund');
  const output=npm(source,'run','pack:portable','--','--json','--pack-destination',directory);
  const packed=JSON.parse(output.slice(output.indexOf('[\n')))[0];
  assert(packed.files.some(file=>file.path==='README.md'),'Standalone documentation must be in the tarball');
  assert(packed.files.some(file=>file.path==='dist/esm/http/index.d.ts'),'HTTP type surface must survive independent packaging');
  for(const file of packed.files){
   assert(/^(?:package\.json|README\.md|LICENSE)$|^(?:dist|schemas|examples|bin)\//.test(file.path),file.path);
   assert.equal(file.mode&0o777,file.path.startsWith('bin/')?0o755:0o644,`Portable distribution permissions: ${file.path}`);
  }
  const tar=gunzipSync(await readFile(path.join(directory,packed.filename)));
  for(let offset=0;offset<tar.length;){const header=tar.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;const name=header.subarray(0,100).toString().replace(/\0.*$/s,''),size=parseInt(header.subarray(124,136).toString(),8),mode=parseInt(header.subarray(100,108).toString(),8);if(header[156]!==53)assert.equal(mode,name.startsWith('package/bin/')?0o755:0o644,`Actual tar header: ${name}`);offset+=512+Math.ceil(size/512)*512;}
  await mkdir(consumer);await writeFile(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
  npm(consumer,'install','--ignore-scripts','--no-audit','--no-fund',path.join(directory,packed.filename));
  const installed=path.join(consumer,'node_modules/@ouro/protocol');
  const valid=path.join(installed,'examples/flow-valid.json'),invalid=path.join(installed,'examples/flow-invalid.json');
  const esm=`import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PROTOCOL_VERSION,validateFlowDefinition,createSchemaBundle} from '@ouro/protocol';const value=JSON.parse(readFileSync(${JSON.stringify(valid)},'utf8'));validateFlowDefinition(value);assert.equal(PROTOCOL_VERSION,${JSON.stringify(pkg.version)});assert.equal(createSchemaBundle().manifest.version,PROTOCOL_VERSION);`;
  await writeFile(path.join(consumer,'check.mjs'),esm+`const http=await import('@ouro/protocol/http');assert.deepEqual(Object.keys(http),[]);`);run(consumer,[path.join(consumer,'check.mjs')]);
  await writeFile(path.join(consumer,'check.cjs'),`const assert=require('node:assert/strict');const p=require('@ouro/protocol');assert.equal(p.PROTOCOL_VERSION,${JSON.stringify(pkg.version)});assert.deepEqual(Object.keys(require('@ouro/protocol/http')),[]);`);
  run(consumer,[path.join(consumer,'check.cjs')]);
  await writeFile(path.join(consumer,'check.ts'),`import {type FlowDefinition,flowDefinitionSchema} from '@ouro/protocol';const plan:FlowDefinition={entryNodeId:'result',nodes:[{id:'result',kind:'result',title:'Result',description:'',owner:'agent'}],edges:[]};flowDefinitionSchema.parse(plan);`);
  await writeFile(path.join(consumer,'check.cts'),`import protocol = require('@ouro/protocol');const v:string=protocol.PROTOCOL_VERSION;void v;`);
  /** Отдельный потребитель проверяет обе module conditions и не устанавливает Node/React types ради DTO. */
  const httpTypes=`import type {ProjectRole,ProjectMetadata,ParticipantRegistration,WorkspaceBindingRecoveryInspection} from '@ouro/protocol/http';const role:ProjectRole='Owner';const project:ProjectMetadata={id:'p',name:'Project',slug:'project',createdAt:'2026-11-04',createdBy:null,role};const platform:WorkspaceBindingRecoveryInspection['runtime']['platform']='win32';const participant:ParticipantRegistration={id:'h',projectId:project.id,name:'Human',createdAt:project.createdAt,createdBy:'owner',revokedAt:null,revokedBy:null};void [platform,participant];`;
  await writeFile(path.join(consumer,'http.ts'),httpTypes);await writeFile(path.join(consumer,'http.cts'),httpTypes);
  await writeFile(path.join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{module:'NodeNext',moduleResolution:'NodeNext',target:'ES2022',strict:true,noEmit:true},include:['*.ts','*.cts']}));
  run(consumer,[path.join(source,'node_modules/typescript/bin/tsc'),'-p',consumer]);
  const cli=path.join(installed,'bin/ouro-protocol.mjs');
  assert.equal(JSON.parse(npm(consumer,'exec','--offline','--','ouro-protocol','manifest')).version,pkg.version);
  run(consumer,[cli,'validate-flow',valid]);run(consumer,[cli,'validate-flow',invalid],1);
  run(consumer,[cli,'validate-response','ouro.get_updates',path.join(installed,'examples/updates-success.json')]);
  const schema=JSON.parse(await readFile(path.join(installed,'schemas/flow.schema.json'),'utf8'));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');assert(schema.properties.nodes.items.properties.kind);
  const tree=JSON.parse(npm(consumer,'ls','--all','--json'));
  const visit=dependencies=>{for(const[name,value]of Object.entries(dependencies??{})){assert(['@ouro/protocol','zod'].includes(name),name);visit(value.dependencies);}};visit(tree.dependencies);
 }finally{await rm(directory,{recursive:true,force:true});}
});
