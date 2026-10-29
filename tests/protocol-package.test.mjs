import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

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
  const output=npm(source,'pack','--json','--pack-destination',directory);
  const packed=JSON.parse(output.slice(output.indexOf('[\n')))[0];
  assert(packed.files.some(file=>file.path==='README.md'),'Standalone documentation must be in the tarball');
  for(const file of packed.files){
   assert(/^(?:package\.json|README\.md|LICENSE)$|^(?:dist|schemas|examples|bin)\//.test(file.path),file.path);
   assert.equal(file.mode&0o777,file.path.startsWith('bin/')?0o755:0o644,`Portable distribution permissions: ${file.path}`);
  }
  await mkdir(consumer);await writeFile(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
  npm(consumer,'install','--ignore-scripts','--no-audit','--no-fund',path.join(directory,packed.filename));
  const installed=path.join(consumer,'node_modules/@ouro/protocol');
  const valid=path.join(installed,'examples/flow-valid.json'),invalid=path.join(installed,'examples/flow-invalid.json');
  const esm=`import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PROTOCOL_VERSION,validateFlowDefinition,createSchemaBundle} from '@ouro/protocol';const value=JSON.parse(readFileSync(${JSON.stringify(valid)},'utf8'));validateFlowDefinition(value);assert.equal(PROTOCOL_VERSION,${JSON.stringify(pkg.version)});assert.equal(createSchemaBundle().manifest.version,PROTOCOL_VERSION);`;
  await writeFile(path.join(consumer,'check.mjs'),esm);run(consumer,[path.join(consumer,'check.mjs')]);
  await writeFile(path.join(consumer,'check.cjs'),`const assert=require('node:assert/strict');const p=require('@ouro/protocol');assert.equal(p.PROTOCOL_VERSION,${JSON.stringify(pkg.version)});`);
  run(consumer,[path.join(consumer,'check.cjs')]);
  await writeFile(path.join(consumer,'check.ts'),`import {type FlowDefinition,flowDefinitionSchema} from '@ouro/protocol';const plan:FlowDefinition={entryNodeId:'result',nodes:[{id:'result',kind:'result',title:'Result',description:'',owner:'agent'}],edges:[]};flowDefinitionSchema.parse(plan);`);
  await writeFile(path.join(consumer,'check.cts'),`import protocol = require('@ouro/protocol');const v:string=protocol.PROTOCOL_VERSION;void v;`);
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
