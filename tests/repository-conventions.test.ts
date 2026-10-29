import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const script=path.resolve('scripts/check-conventions.mjs');
const baseEnvironment=()=>{const environment={...process.env};for(const name of Object.keys(environment))if(name.startsWith('OURO_CONVENTIONS_'))delete environment[name];return environment;};
const check=(args:string[],cwd=process.cwd(),extra:Record<string,string>={})=>spawnSync(process.execPath,[script,...args],{cwd,env:{...baseEnvironment(),...extra},encoding:'utf8',timeout:10000});
async function fixture(){
 const directory=await mkdtemp(path.join(tmpdir(),"ouro conventions ' & данные "));
 let count=0;
 const git=(...args:string[])=>{const r=spawnSync('git',args,{cwd:directory,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','--initial-branch=dev');
 const commit=async(subject:string)=>{await writeFile(path.join(directory,'fixture.txt'),String(++count));git('add','fixture.txt');git('-c','user.name=Governance Fixture','-c','user.email=fixture@example.invalid','commit','-m',subject);return git('rev-parse','HEAD');};
 return {directory,git,commit,close:()=>rm(directory,{recursive:true,force:true})};
}

test('FRL02 English technical branches and Conventional subjects are accepted',()=>{
 for(const branch of ['main','dev','feat/client-onboarding','fix/stop-stale-work','docs/first-release','chore/update-tools','hotfix/recover-data','release/0.1.0-beta.1','release/1.2.3+build.5']){
  const r=check(['--branch',branch,'--subject','chore(release): prepare the first working beta']);assert.equal(r.status,0,r.stderr);
 }
 for(const subject of ['feat: add assigned work','fix(scope)!: replace the old transport','docs(client-guide): explain setup','test: verify 500 errors','revert: remove the unsupported option'])assert.equal(check(['--branch','dev','--subject',subject]).status,0,subject);
});

test('FRL02 malformed, mixed-language and noncanonical branch names are rejected',()=>{
 for(const branch of ['master','Feature/Task','feat/русская-ветка','feature/new-task','feat/new_task','feat/a/b','feat/-invalid','feat/a-','release/v1.2.3','release/01.2.3','release/1.2.3-beta.01','release/1.2.3..bad']){
  const r=check(['--branch',branch,'--subject','docs: explain the rule']);assert.notEqual(r.status,0,`Branch must reject: ${branch}`);
 }
});

test('FRL02 nonconventional, non-ASCII and multiline commit or PR subjects are rejected',()=>{
 for(const subject of ['add a feature','Feat: uppercase type','feat: добавить задачу','docs: café guide','feat(scope) missing colon','feat: ','feat:  extra prefix space','feat: trailing space ','feat: add work\nInjected header','feat: bad\tseparator','merge: merge a branch']){
  const r=check(['--branch','dev','--subject',subject]);assert.notEqual(r.status,0,`Subject must reject: ${JSON.stringify(subject)}`);
 }
});

test('FRL02 exact Git ranges check every introduced commit, not only the tip',async()=>{
 const f=await fixture();try{
  const initial=await f.commit('docs: initialize fixture'),second=await f.commit('feat: add checked change'),bad=await f.commit('fix: ошибка в описании'),last=await f.commit('docs: finish fixture');
  assert.equal(check(['--branch','feat/repository-rules','--base',initial,'--head',second],f.directory).status,0);
  const r=check(['--branch','feat/repository-rules','--base',initial,'--head',last],f.directory);assert.notEqual(r.status,0);assert(r.stderr.includes(bad.slice(0,12)),r.stderr);
 }finally{await f.close();}
});

test('FRL02 default local audit and all-history mode include the expected committed subjects',async()=>{
 const f=await fixture();try{
  const first=await f.commit('docs: исходная версия'),last=await f.commit('fix: retain readable data');
  assert.equal(check([],f.directory).status,0,'Default mode checks the current branch and HEAD subject');
  assert.equal(check(['--base',first,'--head',last],f.directory).status,0);
  const all=check(['--all'],f.directory);assert.notEqual(all.status,0);assert(all.stderr.includes(first.slice(0,12)),all.stderr);
 }finally{await f.close();}
});

test('FRL02 CI metadata remains data and malformed ranges never become Git options or shell code',async()=>{
 const f=await fixture();try{
  const sha=await f.commit('docs: initialize fixture'),marker=path.join(f.directory,'must-not-exist');
  const literal='feat: keep $(touch must-not-exist) literal';
  assert.equal(check(['--branch','dev','--subject',literal],f.directory).status,0);
  for(const args of [['--base','--all','--head',sha],['--base',sha],['--head',`${sha};touch ${marker}`],['--unknown-secret=PRIVATE-INPUT']]){
   const r=check(args,f.directory);assert.notEqual(r.status,0);assert(!r.stderr.includes('PRIVATE-INPUT'));
  }
  await assert.rejects(access(marker));
  const good=check([],f.directory,{OURO_CONVENTIONS_BRANCH:'feat/checked-change',OURO_CONVENTIONS_TITLE:'feat: check the pull request',OURO_CONVENTIONS_BASE:sha,OURO_CONVENTIONS_HEAD:sha});assert.equal(good.status,0,good.stderr);
  const bad=check([],f.directory,{OURO_CONVENTIONS_BRANCH:'feat/checked-change',OURO_CONVENTIONS_TITLE:'feat: русское описание',OURO_CONVENTIONS_BASE:sha,OURO_CONVENTIONS_HEAD:sha});assert.notEqual(bad.status,0);
 }finally{await f.close();}
});
