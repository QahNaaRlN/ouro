import {createHash} from 'node:crypto';
import * as nodeModule from 'node:module';
import path from 'node:path';
import {readWorkspaceFile,type WorkspaceBinding} from '../workspace-files';

export type ObservationConfig={files:{path:string;role:'product'|'test'|'fixture'|'config'}[];playwrightConfigPath:string;requiredCapabilities?:Record<string,string>};
export type ArtifactManifest={files:{path:string;role:'product'|'test'|'fixture'|'config';sha256:string;size:number}[];capabilities:Record<string,string>;digest:string};
export type WorkspaceObservation=ArtifactManifest&{slice:{productRevision:string;testRevision:string;fixtureRevision:string;environmentDigest:string};status:'observed'|'unavailable';reason?:string};
export const observationHash=(value:unknown):string=>createHash('sha256').update(JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b,'en'))):item)).digest('hex');
// Keep native resolution: Webpack rewrites a direct createRequire(dynamicPath) to undefined.
const appRequire=(packageRoot?:string):NodeRequire=>Reflect.apply(Reflect.get(nodeModule,'createRequire'),undefined,[path.resolve(packageRoot??process.cwd(),'package.json')]) as NodeRequire;
export const resolvePlaywrightCli=(packageRoot?:string):string=>appRequire(packageRoot).resolve('@playwright/test/cli');
export function runnerCapabilities(packageRoot?:string):Record<string,string>{
 const playwright=appRequire(packageRoot)('@playwright/test/package.json') as {version:string};
 return {node:process.version,platform:process.platform,architecture:process.arch,playwright:playwright.version,adapter:'ouro-playwright-local/v1',playwrightResolution:'ouro-owned-preload/v1',runnerNodeEnv:'test',pathDigest:observationHash(process.env.PATH??''),browserPathDigest:observationHash(process.env.PLAYWRIGHT_BROWSERS_PATH??'default')};
}
/** Exact, bounded reads through the same anchored workspace guards as MCP file context. */
export async function observeVerificationWorkspace(binding:WorkspaceBinding,config:ObservationConfig,capabilitySource:Record<string,string>|(()=>Record<string,string>)=runnerCapabilities):Promise<WorkspaceObservation>{
 const files:ArtifactManifest['files']=[];
 let total=0,capabilities:Record<string,string>={};
 try{
  capabilities=typeof capabilitySource==='function'?capabilitySource():capabilitySource;
  if(!config.files.length||config.files.length>32||new Set(config.files.map(item=>item.path)).size!==config.files.length)throw new Error('Нужно 1–32 уникальных пути наблюдения.');
  if(!config.files.some(item=>item.role==='product')||!config.files.some(item=>item.role==='test'))throw new Error('Нужно явно указать хотя бы один файл продукта и один файл теста.');
  if(!config.files.some(item=>item.path===config.playwrightConfigPath&&item.role==='config'))throw new Error('Конфигурация Playwright должна быть явно включена в наблюдаемые файлы с ролью config.');
  for(const requested of config.files.toSorted((a,b)=>a.path.localeCompare(b.path,'en'))){
   const file=await readWorkspaceFile(binding,requested.path);total+=file.size;
   if(total>2*1024*1024)throw new Error('Наблюдаемые файлы превышают 2 MiB.');
   files.push({path:file.path,role:requested.role,sha256:file.sha256,size:file.size});
  }
  for(const [key,expected]of Object.entries(config.requiredCapabilities??{}))if(capabilities[key]!==expected)throw new Error(`Не выполнено требование окружения: ${key}.`);
  const roleDigest=(roles:string[])=>observationHash(files.filter(item=>roles.includes(item.role)));
  const digest=observationHash({files,capabilities});
  return {files,capabilities,digest,slice:{productRevision:roleDigest(['product']),testRevision:roleDigest(['test']),fixtureRevision:roleDigest(['fixture','config']),environmentDigest:observationHash(capabilities)},status:'observed'};
 }catch(error){
  const reason=(error as Error).message.slice(0,2000),digest=observationHash({status:'unavailable',files,capabilities,reason});
  return {files,capabilities,digest,status:'unavailable',reason,slice:{productRevision:'unavailable:'+digest,testRevision:'unavailable:'+digest,fixtureRevision:'unavailable:'+digest,environmentDigest:observationHash(capabilities)}};
 }
}
