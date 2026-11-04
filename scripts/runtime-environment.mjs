import {validateNodeVersion} from './runtime-node.mjs';
import {statSync,readFileSync} from 'node:fs';
import path from 'node:path';

/** Возвращает безопасный код bootstrap failure без исходных строк конфигурации. */
export class RuntimeEnvironmentError extends Error{
 constructor(code){super(code==='RUNTIME_ENVIRONMENT_INVALID'?'Invalid runtime environment bootstrap options.':'Runtime environment parser is unavailable.');this.name='RuntimeEnvironmentError';this.code=code;}
}

/** Загружает только environment files установленного root перед application imports. */
export async function loadRuntimeEnvironment(options){
 validateNodeVersion(process.versions.node);
 if(!options||typeof options.root!=='string'||!path.isAbsolute(options.root)||/[\u0000-\u001f\u007f]/.test(options.root)||!['production','development'].includes(options.phase))throw new RuntimeEnvironmentError('RUNTIME_ENVIRONMENT_INVALID');
 const {root,phase}=options;
 process.env.NODE_ENV=process.env.NODE_ENV||(phase==='development'?'development':'production');
 const mode=process.env.NODE_ENV==='test'?'test':phase==='development'?'development':'production';
 let parse,expand;
 try{({parse}=await import('dotenv'));({expand}=await import('dotenv-expand'));if(typeof parse!=='function'||typeof expand!=='function')throw new Error();}
 catch{throw new RuntimeEnvironmentError('RUNTIME_ENVIRONMENT_PARSER_UNAVAILABLE');}

 const loaded=[],diagnostics=[];
 const names=[`.env.${mode}.local`,...(mode==='test'?[]:['.env.local']),`.env.${mode}`,'.env'];
 for(const file of names){
  try{
   const filename=path.join(root,file),stat=statSync(filename);
   if(!stat.isFile()&&!stat.isFIFO())continue;
   loaded.push({file,contents:readFileSync(filename,'utf8')});
  }catch(error){if(error?.code!=='ENOENT')diagnostics.push({code:'ENVIRONMENT_FILE_READ_FAILED',file});}
 }

 const inherited={...process.env},firstValues={};
 for(const entry of loaded){
  try{
   const {parsed}=expand({parsed:parse(entry.contents)});
   for(const key of Object.keys(parsed))if(typeof firstValues[key]==='undefined'&&typeof inherited[key]==='undefined')firstValues[key]=parsed[key];
  }catch{diagnostics.push({code:'ENVIRONMENT_FILE_EXPANSION_FAILED',file:entry.file});}
 }
 /** Восстанавливает первую file-проекцию после возможного повторного раскрытия literal dollar. */
 Object.assign(process.env,firstValues);
 return {mode,loadedFiles:loaded.map(entry=>entry.file),diagnostics};
}
