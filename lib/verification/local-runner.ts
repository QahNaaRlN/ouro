import {spawn} from 'node:child_process';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,rm,lstat,realpath} from 'node:fs/promises';
import type {VerificationContract,VerificationImport,VerificationRun} from '@ouro/protocol';
import {importPlaywrightReport,type PlaywrightImportProof} from './playwright';
import {observeVerificationWorkspace,runnerCapabilities,resolvePlaywrightCli,type ObservationConfig,type WorkspaceObservation,type ArtifactManifest} from './observation';
import {readWorkspaceFile,type WorkspaceBinding} from '../workspace-files';

export type LocalRunnerSource={kind:'local_runner';adapter:'playwright-json/v1';verificationMethod:'server-owned-playwright-process';artifactRef:string;sha256:string;rawReport:string;submittedBy:string;runnerVersion:string;exitCode:number|null;inputStability:'unchanged'|'changed'};
export type LocalRunnerProof=PlaywrightImportProof&{source:LocalRunnerSource;artifactManifest:ArtifactManifest};
type ChildResult={stdout:string;stderr:string;exitCode:number|null;failure?:string};
const minimalEnvironment=()=>Object.fromEntries(['SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','XDG_CACHE_HOME','PLAYWRIGHT_BROWSERS_PATH'].flatMap(name=>process.env[name]===undefined?[]:[[name,process.env[name]!]]));
async function stopOwnedProcess(pid:number,child:ReturnType<typeof spawn>):Promise<void>{
 if(process.platform==='win32')await new Promise<void>(resolve=>{const killer=spawn('taskkill.exe',['/PID',String(pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'});killer.on('error',()=>{child.kill();resolve();});killer.on('close',()=>resolve());});
 else{try{process.kill(-pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
}
/** Only fixed Node + installed Playwright CLI argv. No shell, binary, environment or argv input. */
async function runFixedPlaywright(binding:WorkspaceBinding,config:ObservationConfig,shouldStop:()=>Promise<boolean>,timeoutMs:number,signal?:AbortSignal,packageRoot?:string):Promise<ChildResult>{
 if(signal?.aborted)throw Object.assign(new Error('Локальный runtime останавливается.'),{code:'RUNNER_STOPPED'});
 const cli=resolvePlaywrightCli(packageRoot);
 // Playwright positional selectors are regular expressions, never raw argv or loose filename patterns.
 const testPaths=config.files.filter(item=>item.role==='test').map(item=>'^'+path.resolve(binding.canonicalPath,...item.path.split('/')).split(path.sep).join('/').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
 if(!testPaths.length)throw Object.assign(new Error('Нужен хотя бы один явно разрешённый файл теста.'),{code:'VALIDATION_ERROR'});
 // Installed Playwright reserves arguments after -- for the tests, so terminate after the encoded filters.
 const args=[cli,'test','--config',path.join(binding.canonicalPath,config.playwrightConfigPath),'--reporter=json','--workers=1','--retries=0','--output',path.join(binding.canonicalPath,'test-results'),...testPaths,'--'];
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:binding.canonicalPath,env:{...minimalEnvironment(),NODE_ENV:'test',CI:'1',FORCE_COLOR:'0'},shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  let stdout='',stderr='',failure:string|undefined,finished=false,checking=false;
  const stop=async(reason:string)=>{if(finished||failure)return;failure=reason;if(child.pid)await stopOwnedProcess(child.pid,child);};
  const onAbort=()=>{void stop('Локальный runtime останавливается.');};
  signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();
  const timer=setTimeout(()=>{void stop('Превышено время ограниченного запуска Playwright.');},timeoutMs);
  const cancellation=setInterval(()=>{if(checking||finished)return;checking=true;void shouldStop().then(cancel=>cancel?stop('Разрешение запуска изменилось или была запрошена остановка.'):undefined).catch(()=>stop('Не удалось повторно проверить разрешение запуска.')).finally(()=>{checking=false;});},250);
  child.stdout.on('data',chunk=>{stdout+=String(chunk);if(Buffer.byteLength(stdout)>160000){stdout=stdout.slice(0,160000);void stop('JSON-отчёт превышает ограничение размера.');}});
  child.stderr.on('data',chunk=>{if(stderr.length<16000)stderr+=String(chunk).slice(0,16000-stderr.length);});
  child.on('error',error=>{finished=true;clearTimeout(timer);clearInterval(cancellation);signal?.removeEventListener('abort',onAbort);reject(Object.assign(new Error('Не удалось запустить разрешённый Playwright CLI: '+error.message),{code:'RUNNER_ERROR'}));});
  child.on('close',exitCode=>{finished=true;clearTimeout(timer);clearInterval(cancellation);signal?.removeEventListener('abort',onAbort);resolve({stdout,stderr,exitCode,...(failure?{failure}:{})});});
 });
}
export async function runLocalVerification(input:{binding:WorkspaceBinding;config:ObservationConfig;contract:VerificationContract;scopeCaseIds:string[];submittedBy:string;shouldStop:()=>Promise<boolean>;timeoutMs?:number;flowStepRunId?:string;signal?:AbortSignal;runtimeDirectory?:string;packageRoot?:string}):Promise<{proof:LocalRunnerProof;before:WorkspaceObservation;after:WorkspaceObservation}>{
 if(input.signal?.aborted)throw Object.assign(new Error('Локальный runtime останавливается.'),{code:'RUNNER_STOPPED'});
 const capabilities=()=>runnerCapabilities(input.packageRoot);
 const before=await observeVerificationWorkspace(input.binding,input.config,capabilities);
 if(before.status!=='observed')throw Object.assign(new Error(before.reason??'Входы проверки недоступны.'),{code:'VERIFICATION_INPUT_UNAVAILABLE'});
 // Execute copies of the exact observed bytes. The runner never races a mutable checkout.
 const scratchParent=path.resolve(input.runtimeDirectory??path.join(process.cwd(),'.ouro','verification-runtime'));await mkdir(scratchParent,{recursive:true});
 const scratch=await mkdtemp(path.join(scratchParent,'run-'));
 const scratchIdentity=await lstat(scratch,{bigint:true}),scratchCanonical=await realpath(scratch);
 let captured:ChildResult,startedAt:string,finishedAt:string,copiedInputsUnchanged=false;
 try{
  for(const entry of before.files){
   const file=await readWorkspaceFile(input.binding,entry.path);if(file.sha256!==entry.sha256)throw Object.assign(new Error('Вход изменился до создания неизменяемого снимка.'),{code:'WORKSPACE_BINDING_CONFLICT'});
   const target=path.resolve(scratch,...entry.path.split('/'));if(!target.startsWith(scratch+path.sep))throw new Error('Snapshot path escaped its owned directory.');
   let bytes=Buffer.from(file.text,'utf8');
   if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),bytes]);
   if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('Не удалось сохранить точные байты наблюдаемого UTF-8 файла.');
   await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});
  }
  startedAt=new Date().toISOString();captured=await runFixedPlaywright({...input.binding,canonicalPath:scratch},input.config,input.shouldStop,Math.min(120000,Math.max(1000,input.timeoutMs??60000)),input.signal,input.packageRoot);finishedAt=new Date().toISOString();
  const copied=await observeVerificationWorkspace({...input.binding,canonicalPath:scratch,identity:{dev:String(scratchIdentity.dev),ino:String(scratchIdentity.ino)}},input.config,before.capabilities);
  copiedInputsUnchanged=copied.status==='observed'&&copied.digest===before.digest;
 }finally{
  const resolved=path.resolve(scratch);if(path.dirname(resolved)!==scratchParent||!path.basename(resolved).startsWith('run-'))throw new Error('Refused cleanup outside the owned runner directory.');
  const named=await lstat(resolved,{bigint:true});if(!named.isDirectory()||named.isSymbolicLink()||named.dev!==scratchIdentity.dev||named.ino!==scratchIdentity.ino||(await realpath(resolved))!==scratchCanonical)throw new Error('Owned runner directory identity changed; cleanup refused.');
  await rm(resolved,{recursive:true,force:true});
 }
 const after=await observeVerificationWorkspace(input.binding,input.config,capabilities),stable=copiedInputsUnchanged&&after.status==='observed'&&before.digest===after.digest;
 let rawReport=captured.stdout;
 try{JSON.parse(rawReport);}catch{rawReport=JSON.stringify({suites:[],errors:[{message:captured.failure??'Playwright не вернул корректный JSON-отчёт.',detail:captured.stderr}],stats:{expected:0,unexpected:0,flaky:0,skipped:0}});}
 const report:VerificationImport={slice:before.slice,scopeCaseIds:input.scopeCaseIds,artifactRef:'local-run://'+randomUUID(),rawReport,startedAt,finishedAt,...(input.flowStepRunId?{flowStepRunId:input.flowStepRunId}:{})};
 const proof=importPlaywrightReport(report,input.contract);
 if(captured.failure||proof.outcome==='passed'&&captured.exitCode!==0){proof.outcome='error';proof.results=proof.results.map(result=>({...result,outcome:'error',actual:captured.failure??'Процесс Playwright завершился неуспешно.'}));}
 const source:LocalRunnerSource={kind:'local_runner',adapter:'playwright-json/v1',verificationMethod:'server-owned-playwright-process',artifactRef:report.artifactRef,sha256:proof.sha256,rawReport,submittedBy:input.submittedBy,runnerVersion:before.capabilities.playwright,exitCode:captured.exitCode,inputStability:stable?'unchanged':'changed'};
 return {proof:{...proof,source,artifactManifest:{files:before.files,capabilities:before.capabilities,digest:before.digest}},before,after};
}
