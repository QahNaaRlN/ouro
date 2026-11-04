import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

export type OwnerEvent={stage:string;pid?:number;createdPath?:string;initializerOpen?:boolean;from?:string;to?:string;result?:string;message?:string;cause?:string;causeCode?:string};

/** Запускает отдельный native Node процесс и управляет только его fixture-барьерами. */
export function ownerChild(profile:string,mode='ordinary'){
 const barrierFile=path.join(path.dirname(profile),'barrier-'+randomUUID()+'.json'),entry=fileURLToPath(new URL('./fixtures/profile-owner-child.ts',import.meta.url));
 const environment=Object.fromEntries(['PATH','SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','HOME','LOCALAPPDATA','APPDATA'].flatMap(name=>process.env[name]===undefined?[]:[[name,process.env[name]!] ]));
 const child=spawn(process.execPath,[entry,profile,mode,barrierFile],{cwd:path.dirname(profile),env:environment,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
 const events:OwnerEvent[]=[];let stderr='',done=false;
 child.stderr!.on('data',chunk=>{stderr+=String(chunk);});child.on('message',value=>{if(value&&typeof value==='object'&&'stage'in value&&typeof value.stage==='string')events.push(value as OwnerEvent);});
 const exited=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{done=true;resolve(code);});});
 const wait=async<T>(read:()=>Promise<T|undefined>,label:string):Promise<T>=>{const until=Date.now()+10000;while(Date.now()<until){const value=await read();if(value!==undefined)return value;if(done)throw new Error('Owner child exited before '+label+': '+JSON.stringify(events)+' '+stderr);await delay(10);}throw new Error('Owner child deadline: '+label+' '+stderr);};
 return {child,events,exited,barrierFile,
  waitStage:(stage:string)=>wait(async()=>events.find(event=>event.stage===stage),stage),
  waitOutcome:()=>wait(async()=>events.find(event=>event.stage==='acquired'||event.stage==='rejected'),'ownership outcome'),
  waitBarrier:()=>wait(async()=>{try{return JSON.parse(await readFile(barrierFile,'utf8')) as OwnerEvent;}catch(error){if(error instanceof SyntaxError||(error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}},'disk barrier'),
  publish(){child.send('publish');},
  async close(){if(!done){child.send('release');let timer:ReturnType<typeof setTimeout>|undefined;try{assert.equal(await Promise.race([exited,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Owner release deadline')),3000);})]),0);}finally{if(timer)clearTimeout(timer);if(!done){child.kill();await exited;}}}},
  async kill(){if(!done){child.kill();await exited;}}
 };
}
