import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import type {VerificationContract} from '@ouro/protocol';
import type {ObservationConfig} from '../../../lib/verification/observation';

const ownedRequire=createRequire(import.meta.url);
const {resolveWorkspaceFolder}:typeof import('../../../lib/workspace-files')=ownedRequire('../../../lib/workspace-files');
export const servicePackageRoot=fileURLToPath(new URL('../',import.meta.url));
export const sourceRoot=fileURLToPath(new URL('../../../',import.meta.url));
export const installedPlaywright=ownedRequire('@playwright/test/package.json') as {version:string};

/** Создаёт обычные bare-import тесты вне install root, не требующие browser binaries. */
export async function runnerFixture(format:'cjs'|'esm'|'ts'){
 const parent=await mkdtemp(path.join(tmpdir(),'ouro-runner-packaging-')),workspace=path.join(parent,'workspace'),runtime=path.join(parent,'runtime');
 const {mkdir}=await import('node:fs/promises');await mkdir(workspace);await mkdir(runtime);
 const suffix=format==='esm'?'mjs':format,configPath='playwright.config.'+suffix,testPath='behavior.spec.'+suffix,productPath='product.'+suffix;
 const expectedEntry=ownedRequire.resolve('@playwright/test'),witness=path.join(parent,'worker-witness.jsonl');
 const imports=format==='cjs'?"const {test,expect}=require('@playwright/test');const {add}=require('./product.cjs');const {createRequire}=require('node:module');const ownRequire=createRequire(__filename);":"import {test,expect} from '@playwright/test';import {add} from './product."+suffix+"';import {createRequire} from 'node:module';const ownRequire=createRequire("+(format==='ts'?'__filename':'import.meta.url')+");";
 const testCode=imports+`\ntest('${format} owned runner',async()=>{expect(add(2,3)).toBe(5);expect(process.env.TEST_WORKER_INDEX).toBeDefined();expect(process.execArgv).toContain('--import');expect(ownRequire.resolve('@playwright/test')).toBe(${JSON.stringify(expectedEntry)});expect(ownRequire('@playwright/test/package.json').version).toBe(${JSON.stringify(installedPlaywright.version)});expect(()=>ownRequire('zod')).toThrow();expect(()=>ownRequire('@playwright/test/reporter')).toThrow();expect(process.env.NODE_PATH).toBeUndefined();expect(process.env.NODE_OPTIONS).toBeUndefined();ownRequire('node:fs').appendFileSync(${JSON.stringify(witness)},JSON.stringify({pid:process.pid,execArgv:process.execArgv,cwd:process.cwd(),worker:process.env.TEST_WORKER_INDEX})+'\\n');});\n`;
 const product=format==='cjs'?'exports.add=(left,right)=>left+right;\n':format==='ts'?'export const add=(left:number,right:number):number=>left+right;\n':'export const add=(left,right)=>left+right;\n';
 const config=format==='cjs'?"const {defineConfig}=require('@playwright/test');module.exports=defineConfig({testDir:__dirname,testMatch:'behavior.spec.cjs',workers:1,retries:0});\n":`import {defineConfig} from '@playwright/test';export default defineConfig({testDir:'.',testMatch:'${testPath}',workers:1,retries:0});\n`;
 const contents=new Map([[productPath,product],[testPath,testCode],[configPath,config]]);
 for(const [name,bytes]of contents)await writeFile(path.join(workspace,name),bytes,{flag:'wx'});
 const resolved=await resolveWorkspaceFolder(workspace),binding={id:'synthetic-runner-fixture',canonicalPath:resolved.canonicalPath,identity:resolved.identity};
 const observation:ObservationConfig={files:[{path:productPath,role:'product'},{path:testPath,role:'test'},{path:configPath,role:'config'}],playwrightConfigPath:configPath};
 return {parent,workspace,runtime,binding,observation,contents,witness,
  async assertUnchanged(){for(const [name,bytes]of contents){const actual=await readFile(path.join(workspace,name));if(createHash('sha256').update(actual).digest('hex')!==createHash('sha256').update(bytes).digest('hex'))throw new Error('Observed fixture bytes changed: '+name);}},
  async close(){if(path.dirname(path.resolve(parent))!==path.resolve(tmpdir())||!path.basename(parent).startsWith('ouro-runner-packaging-'))throw new Error('Refused fixture cleanup outside its temp parent.');await rm(parent,{recursive:true,force:true});}
 };
}

/** Строит синтетический контракт для проверки транспорта раннера, отдельно от domain acceptance. */
export function runnerContract(testIds:string[]=[]):VerificationContract{
 return {version:1,targetSpecId:'synthetic-product',targetRevisionId:'synthetic-revision',criterionIds:['sum'],workflow:'verification',cases:(testIds.length?testIds:['not-linked']).map((testId,index)=>({id:'case-'+index,criterionIds:['sum'],given:'Synthetic local inputs',action:'Run an owned Playwright worker',expected:'Exact provider and result',data:'Synthetic arithmetic',prerequisites:'Pinned Node and Playwright',level:'integration',purpose:'regression',required:true,procedure:testIds.length?{kind:'playwright',testId}:{kind:'unlinked'}}))};
}
