import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const help=`Ouro local launch

  npm run launch
  npm run launch -- --port 3001

Use Node.js 24 LTS (minimum 20.9). This launcher uses only Node's standard
library and works before dependencies are installed. On every launch it runs
npm ci, a fresh production build, then the local server. Existing .ouro data
is preserved. Keep the terminal open; Ctrl+C stops the owned server processes.
Localhost is this computer, not a published website.
`;
const signalCode=signal=>signal==='SIGINT'?130:signal==='SIGTERM'?143:signal==='SIGKILL'?137:1;
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

export function validateNodeVersion(version){
 const match=/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
 if(!match||Number(match[1])<20||(Number(match[1])===20&&Number(match[2])<9))throw new Error('Use Node.js 24 LTS; Ouro requires Node.js 20.9 or newer.');
}

function parseArguments(argv){
 if(argv.length===1&&argv[0]==='--help')return {help:true,port:3000};
 let port=3000,seen=false;
 for(let index=0;index<argv.length;index++){
  if(argv[index]!=='--port'||seen||!/^\d+$/.test(argv[index+1]??''))throw new Error('Invalid launch arguments. Use npm run launch -- --help.');
  port=Number(argv[++index]);seen=true;
  if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Port must be an integer from 1 to 65535. Use --help.');
 }
 return {help:false,port};
}

function signalOwnedGroup(child,signal){
 if(!child?.pid)return;
 try{process.kill(-child.pid,signal);}catch(error){
  if(error.code!=='ESRCH')child.kill(signal);
 }
}

/** Never target the caller's process group or an unrelated server. */
async function stopOwnedTree(child,signal){
 if(!child?.pid)return;
 if(process.platform==='win32'){
  // Windows has no POSIX process groups. taskkill is passed a numeric owned
  // child PID as literal argv and closes that child's complete process tree.
  const systemRoot=process.env.SystemRoot??process.env.WINDIR??'C:\\Windows';
  const executable=path.join(systemRoot,'System32','taskkill.exe');
  await new Promise(resolve=>{
   const killer=spawn(executable,['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,shell:false});
   killer.once('error',()=>{child.kill(signal);resolve();});killer.once('close',()=>resolve());
  });
 }else{
  signalOwnedGroup(child,signal);
  // Give all members time to stop gracefully even if npm's leader exits first.
  // Then stop descendants that deliberately ignored cancellation.
  await delay(5000);signalOwnedGroup(child,'SIGKILL');
 }
}

export async function launch(argv=process.argv.slice(2),environment=process.env){
 const options=parseArguments(argv);
 if(options.help){process.stdout.write(help);return 0;}
 validateNodeVersion(process.versions.node);
 const npm=environment.npm_execpath;
 if(typeof npm!=='string'||!path.isAbsolute(npm)||/[\u0000-\u001f\u007f]/.test(npm))throw new Error('Run npm run launch from the extracted Ouro folder; a working Node/npm installation is required.');
 const repository=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
 try{await Promise.all(['package.json','package-lock.json'].map(name=>access(path.join(repository,name))));}
 catch{throw new Error('The Ouro release is incomplete. Extract the complete archive before running npm run launch.');}

 let current,interrupted,stopping=Promise.resolve();
 const cancel=signal=>{
  if(interrupted){if(process.platform!=='win32')signalOwnedGroup(current,'SIGKILL');return;}
  interrupted=signal;stopping=stopOwnedTree(current,signal);
 };
 const onInterrupt=()=>cancel('SIGINT'),onTerminate=()=>cancel('SIGTERM');
 process.on('SIGINT',onInterrupt);process.on('SIGTERM',onTerminate);
 process.stdout.write('Ouro: preparing dependencies and a fresh production build.\nPreparation repeats on every launch; existing .ouro data is preserved.\n');
 try{
  const phases=[{label:'1/3 · Install dependencies',args:['ci']},{label:'2/3 · Build the application',args:['run','build']},{label:'3/3 · Start the local server',args:['start','--','--port',String(options.port)]}];
  for(const phase of phases){
   if(interrupted)break;
   process.stdout.write(`\n${phase.label}\n`);
   const starting=phase.args[0]==='start';
   const child=spawn(process.execPath,[npm,...phase.args],{cwd:repository,env:environment,stdio:starting?['inherit','pipe','pipe']:'inherit',shell:false,detached:process.platform!=='win32',windowsHide:true});
   current=child;
   if(starting){
    let ready=false;
    for(const [stream,target]of [[child.stdout,process.stdout],[child.stderr,process.stderr]]){
     if(!stream)continue;stream.setEncoding('utf8');stream.pipe(target,{end:false});let recent='';
     stream.on('data',chunk=>{
      recent=(recent+chunk).slice(-4096).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
      if(!ready&&!interrupted&&/\bReady in\s+\d/.test(recent)){
       ready=true;process.stdout.write(`\nOpen http://127.0.0.1:${options.port}/projects on this computer.\nKeep this terminal open. Ctrl+C stops Ouro.\n`);
      }
     });
    }
   }
   const code=await new Promise(resolve=>{
    child.once('error',()=>{process.stderr.write('Ouro: npm could not be started. Check your Node/npm installation.\n');resolve(1);});
    child.once('close',(exit,signal)=>resolve(exit??signalCode(signal)));
   });
   current=undefined;
   if(interrupted){await stopping;return signalCode(interrupted);}
   if(code!==0)return code;
  }
  if(interrupted){await stopping;return signalCode(interrupted);}
  return 0;
 }finally{
  process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onTerminate);
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.exitCode=await launch();}
 catch(error){process.stderr.write(`Ouro: ${error instanceof Error?error.message:'Local launch failed.'}\n`);process.exitCode=1;}
}
