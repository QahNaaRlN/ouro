import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,readdir,lstat,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createControlledNpmEnvelope} from './fixtures/consumer-delivery/process-project.mjs';
import {readBuiltGeneration} from '../scripts/consumer-delivery/generation-state.mjs';
import {forceOwnedChild} from '../scripts/consumer-delivery/consumer-owner.mjs';

const delay=(milliseconds:number)=>new Promise(resolve=>setTimeout(resolve,milliseconds));
/** Ожидает только bounded fixture evidence, не определяет stale production owner по PID/возрасту. */
async function waitFor<T>(read:()=>Promise<T|undefined>,milliseconds=15000):Promise<T>{const end=Date.now()+milliseconds;while(Date.now()<end){const value=await read();if(value!==undefined)return value;await delay(25);}throw Error('Owned process fixture deadline.');}

test('CGL23 actual npm orphan writes only unknown genA while another real ci/build publishes genB',{timeout:60000},async()=>{
 const npm=process.env.npm_execpath;assert(npm&&path.isAbsolute(npm));const fixture=await createControlledNpmEnvelope(npm),nonce=randomUUID(),keys=['SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA'],environment=Object.fromEntries(keys.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));environment.PATH=path.dirname(process.execPath)+path.delimiter+(environment.PATH??'');environment.NODE_ENV='production';environment.npm_execpath=fixture.npmWitness;environment.npm_config_audit='false';environment.npm_config_fund='false';environment.OWN_CGL_NONCE=nonce;
 const start=(mode:string)=>{const child=spawn(process.execPath,[path.join(fixture.root,'scripts/consumer-launch.mjs'),'build'],{cwd:fixture.foreign,env:{...environment,OWN_CGL_MODE:mode},stdio:['ignore','pipe','pipe'],windowsHide:true,shell:false});child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve())),closed=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));return {child,exited,closed};};
 const first=start('block');let second:ReturnType<typeof start>|undefined,oldDirectory:string|undefined,writer:{nonce:string;pid:number;installOwnerPid:number;installShellPid:number;port:number}|undefined,npmOwner:{pid:number;nonce:string}|undefined,complete=false;
 try{
  const firstId=await waitFor(async()=>{try{return(await readdir(path.join(fixture.root,'.ouro-runtime/generations')))[0];}catch{return undefined;}});oldDirectory=path.join(fixture.root,'.ouro-runtime/generations',firstId);writer=await waitFor(async()=>{try{return JSON.parse(await readFile(path.join(oldDirectory!,'.writer-ready.json'),'utf8'));}catch{return undefined;}});assert.equal(writer.nonce,nonce);assert(Number.isSafeInteger(writer.pid)&&Number.isSafeInteger(writer.installOwnerPid)&&Number.isSafeInteger(writer.port)&&writer.port>0&&writer.port<=65535);const probe=await fetch('http://127.0.0.1:'+writer.port+'/probe/'+nonce,{signal:AbortSignal.timeout(3000)});assert.deepEqual(await probe.json(),{nonce,pid:writer.pid});
  npmOwner=JSON.parse(await readFile(path.join(oldDirectory,'.npm-owner.json'),'utf8'));assert(npmOwner&&npmOwner.nonce===nonce&&Number.isSafeInteger(npmOwner.pid)&&Number.isSafeInteger(writer.installShellPid));const observed=JSON.parse(await readFile(path.join(oldDirectory,'.observed-ci.json'),'utf8'));assert.equal(observed.command,'ci');assert.equal(observed.include,'dev');assert.equal(observed.nodeEnv,'production');first.child.kill('SIGKILL');await first.exited;const before=(await readFile(path.join(oldDirectory,'.heartbeat'))).length;await assert.rejects(()=>readBuiltGeneration(fixture.root));
  second=start('pass');let finished:{code:number|null;signal:NodeJS.Signals|null}|undefined;void second.closed.then(value=>finished=value);await waitFor(async()=>finished,25000);assert.deepEqual(finished,{code:0,signal:null});const selected=await readBuiltGeneration(fixture.root);assert.notEqual(selected.id,firstId);assert.equal((await readdir(path.join(fixture.root,'.ouro-runtime/generations'))).length,2);await assert.rejects(()=>readBuiltGeneration(fixture.root,firstId));await lstat(oldDirectory);await waitFor(async()=>((await readFile(path.join(oldDirectory!,'.heartbeat'))).length>before?true:undefined));const next=JSON.parse(await readFile(path.join(selected.directory,'.observed-ci.json'),'utf8'));assert.equal(next.command,'ci');assert.equal(next.include,'dev');assert.notEqual(next.cwd,observed.cwd);assert.equal(next.cwd,selected.directory);complete=true;
 }finally{
  if(first.child.exitCode===null&&first.child.signalCode===null)forceOwnedChild(first.child);await first.exited;if(second&&second.child.exitCode===null&&second.child.signalCode===null)forceOwnedChild(second.child);if(second)await second.closed;
  if(writer&&oldDirectory){try{await fetch('http://127.0.0.1:'+writer.port+'/stop/'+nonce,{method:'POST',signal:AbortSignal.timeout(3000)});}catch{await writeFile(path.join(oldDirectory,'.writer-stopped'),'coordinator cleanup');const probe=await fetch('http://127.0.0.1:'+writer.port+'/probe/'+nonce,{signal:AbortSignal.timeout(1000)}).catch(()=>undefined);if(probe&&JSON.stringify(await probe.json())===JSON.stringify({nonce,pid:writer.pid}))process.kill(writer.pid,'SIGKILL');}
   assert(npmOwner&&npmOwner.nonce===nonce);await waitFor(async()=>{for(const pid of new Set([writer!.pid,writer!.installOwnerPid,writer!.installShellPid,npmOwner!.pid]))try{process.kill(pid,0);return undefined;}catch{}return true;},10000);
  }
  await first.closed;if(complete)await fixture.close();else process.stderr.write('Retained own failed actual-npm generation process fixture.\n');
 }
});
