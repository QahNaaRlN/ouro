import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStore} from '../lib/store';
import {authenticatedActor} from '../lib/auth';
import {PROJECT_ID,AGENT_ID,type Actor} from '../packages/core/src';
import type {OuroMailer} from '../lib/projects';

const password='correct horse battery staple';
const operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
const hasCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;
async function fixture(){
 const resets:{email:string;code:string}[]=[];
 const mailer:OuroMailer={sendInvitation:async()=>{},sendPasswordReset:async input=>{resets.push(input);}};
 const store=await createStore({dataDir:'memory://',seedEvents:[],mailer});
 const account=(await store.createAccount({email:'recovery-owner@example.com',name:'Owner',password},operator)).account;
 const owner:Actor={id:account.id,kind:'human',name:account.name,projectIds:[]};
 return {store,account,owner,resets};
}

test('R02 legacy operator bearer cannot read or write hosted projects without membership and keeps legacy/folder access',async()=>{
 const f=await fixture(),directory=await mkdtemp(path.join(tmpdir(),'ouro-operator-scope-')),oldToken=process.env.OURO_HUMAN_TOKEN;
 process.env.OURO_HUMAN_TOKEN='synthetic-operator-test-token';
 try{
  const project=await f.store.createProject({name:'Account-owned hosted project'},f.owner);f.owner.projectIds=[project.id];
  const actor=(id:string)=>authenticatedActor(new Request('http://127.0.0.1/api/project',{headers:{Authorization:'Bearer synthetic-operator-test-token'}}),id,AGENT_ID);
  await assert.rejects(f.store.getProject(project.id,actor(project.id)),hasCode('FORBIDDEN'));
  await assert.rejects(f.store.executeCommand({type:'createSpec',requestId:'operator-hosted-denied',expectedVersion:0,content:{title:'Unauthorized spec',goal:'Must not be saved',dod:[],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}},actor(project.id),project.id),hasCode('FORBIDDEN'));
  assert.equal((await f.store.getProject(project.id,f.owner)).version,0);
  assert.equal((await f.store.getProject(PROJECT_ID,actor(PROJECT_ID))).projectId,PROJECT_ID);
  const folder=(await f.store.createWorkspaceProject({requestId:'operator-folder-compat',rootPath:directory,name:'Local folder'},operator)).project;
  assert.equal((await f.store.getProject(folder.id,actor(folder.id))).projectId,folder.id);
  assert.equal((await f.store.createAgent('Folder operator agent',actor(folder.id),folder.id)).agent.projectId,folder.id);
 }finally{
  if(oldToken===undefined)delete process.env.OURO_HUMAN_TOKEN;else process.env.OURO_HUMAN_TOKEN=oldToken;
  await f.store.close();await rm(directory,{recursive:true,force:true});
 }
});

test('R06 reset and invitation limits start a fresh bounded window after every expiration',async(t)=>{
 const f=await fixture();let now=Date.now();t.mock.method(Date,'now',()=>now);
 try{
  const project=await f.store.createProject({name:'Limiter windows'},f.owner);f.owner.projectIds=[project.id];
  for(let window=0;window<3;window++){
   for(let index=0;index<5;index++)assert.deepEqual(await f.store.requestPasswordReset('unknown@example.com','same-client'),{ok:true});
   await assert.rejects(f.store.requestPasswordReset('unknown@example.com','same-client'),hasCode('RATE_LIMITED'));
   for(let index=0;index<10;index++)await f.store.createInvitation(project.id,{email:`invite-${window}-${index}@example.com`,role:'Viewer'},f.owner);
   await assert.rejects(f.store.createInvitation(project.id,{email:`limited-${window}@example.com`,role:'Viewer'},f.owner),hasCode('RATE_LIMITED'));
   now+=600_001;
  }
 }finally{await f.store.close();}
});

test('R07 a successful reset consumes every earlier code and session while a subsequently issued code still works',async()=>{
 const f=await fixture();
 try{
  const before=await f.store.authenticate(f.account.email,password,'recovery');assert(before);
  await f.store.requestPasswordReset(f.account.email,'recovery');
  await f.store.requestPasswordReset(f.account.email,'recovery');
  const [older,newer]=f.resets;
  await f.store.inspect(`CREATE FUNCTION ouro_test_fail_reset_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test reset session failure'; END; $$`);
  await f.store.inspect('CREATE TRIGGER ouro_test_reset_session_failure BEFORE INSERT ON ouro_user_sessions FOR EACH ROW EXECUTE FUNCTION ouro_test_fail_reset_session()');
  await assert.rejects(f.store.resetPassword(newer.code,'replacement secure password','recovery'),/test reset session failure/);
  await f.store.inspect('DROP TRIGGER ouro_test_reset_session_failure ON ouro_user_sessions');
  assert.equal((await f.store.resolveSession(before.token))?.account.id,f.account.id);
  assert.equal((await f.store.authenticate(f.account.email,password,'recovery'))?.account.id,f.account.id);
  assert.equal((await f.store.inspect<{count:number}>('SELECT count(*)::int AS count FROM ouro_password_reset_confirmations')).rows[0].count,0);
  const reset=await f.store.resetPassword(newer.code,'replacement secure password','recovery');
  await assert.rejects(f.store.resetPassword(older.code,'unwanted older-code password','recovery'),hasCode('RESET_INVALID'));
  assert.equal(await f.store.resolveSession(before.token),null);
  assert.equal((await f.store.resolveSession(reset.token))?.account.id,f.account.id);
  assert.equal(await f.store.authenticate(f.account.email,password,'recovery'),null);
  const consumed=await f.store.inspect<{count:number}>('SELECT count(*)::int AS count FROM ouro_password_reset_confirmations');assert.equal(consumed.rows[0].count,2);
  await f.store.requestPasswordReset(f.account.email,'recovery');
  const final=await f.store.resetPassword(f.resets[2].code,'subsequent secure password','recovery');
  assert.equal(await f.store.resolveSession(reset.token),null);
  assert.equal((await f.store.resolveSession(final.token))?.account.id,f.account.id);
  assert.equal((await f.store.authenticate(f.account.email,'subsequent secure password','recovery'))?.account.id,f.account.id);
 }finally{await f.store.close();}
});

test('R08 a well-formed nonexistent reset code is rejected before Argon2 password hashing',async(t)=>{
 const f=await fixture();
 const argon2=createRequire(import.meta.url)('@node-rs/argon2') as {hash:(...args:unknown[])=>Promise<string>};
 const hash=argon2.hash,spy=t.mock.method(argon2,'hash',(...args:unknown[])=>hash(...args));
 try{
  await assert.rejects(f.store.resetPassword('A'.repeat(43),'replacement secure password','recovery'),hasCode('RESET_INVALID'));
  assert.equal(spy.mock.callCount(),0,'invalid codes must not consume password hashing work');
 }finally{await f.store.close();}
});
