import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseMeridianScope,mapMeridianExpectation} from '../packages/meridian/src/context';
import {createStore} from '../lib/store';
import {PROJECT_ID,type Actor} from '../packages/core/src';

const raw=readFileSync(new URL('./fixtures/meridian/scope.json',import.meta.url),'utf8');
const human:Actor={id:'meridian-unicode-review-human',kind:'human',projectIds:[PROJECT_ID]};
const code=(error:unknown)=>(error as {code?:string})?.code;

for(const [label,unit] of [['high',0xd800],['low',0xdc00]] as const){
 test(`review: escaped lone ${label} surrogate is rejected as invalid host DTO before mapping`,()=>{
  const fixture=JSON.parse(raw);fixture.facts.goal.goal=`x${String.fromCharCode(unit)}y`;
  let failure:string|undefined;try{parseMeridianScope(JSON.stringify(fixture));}catch(error){failure=code(error);}
  assert.equal(failure,'VALIDATION_ERROR');
 });
}

test('review: human-edited import text with an unpaired surrogate fails validation before JSONB persistence',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  for(const unit of [0xd800,0xdc00]){
   const content={...mapMeridianExpectation(parseMeridianScope(raw)),goal:`x${String.fromCharCode(unit)}y`};
   let failure:string|undefined;
   try{await store.importMeridianScope({requestId:crypto.randomUUID(),expectedVersion:0,rawDocument:raw,content},human);}catch(error){failure=code(error);}
   assert.equal((await store.getProject()).version,0);
   assert.equal(failure,'VALIDATION_ERROR','invalid UTF-16 must not fall through to SQL 22P02');
  }
 }finally{await store.close();}
});

test('review: valid surrogate pairs retain exact source UTF8 digest and round-trip through JSONB',async()=>{
 const fixture=JSON.parse(raw);fixture.facts.goal.goal=`Проверить результат ${String.fromCodePoint(0x1f600)}`;
 const source=JSON.stringify(fixture),scope=parseMeridianScope(source),content=mapMeridianExpectation(scope);
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const result=await store.importMeridianScope({requestId:crypto.randomUUID(),expectedVersion:0,rawDocument:source,content},human);
  assert.equal(result.state.revisions[0].goal,fixture.facts.goal.goal);
  const spec=result.state.specs[0];assert.equal(spec.origin?.kind,'meridian_import');
  assert.equal((spec.origin as {documentSha256:string}).documentSha256,createHash('sha256').update(source,'utf8').digest('hex'));
  const persisted=await store.inspect<{event:{payload:{meridianSource:{rawDocument:string}}}}>('SELECT event FROM ouro_domain_events WHERE id=$1',[result.events[0].id]);
  assert.equal(persisted.rows[0].event.payload.meridianSource.rawDocument,source);
 }finally{await store.close();}
});

test('review: human-edited NUL text is rejected before JSONB persistence',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const content={...mapMeridianExpectation(parseMeridianScope(raw)),goal:`x${String.fromCharCode(0)}y`};
  let failure:string|undefined;
  try{await store.importMeridianScope({requestId:crypto.randomUUID(),expectedVersion:0,rawDocument:raw,content},human);}catch(error){failure=code(error);}
  assert.equal((await store.getProject()).version,0);assert.equal(failure,'VALIDATION_ERROR');
 }finally{await store.close();}
});

test('review: an edited process node with an unpaired surrogate fails before JSONB persistence',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const content={...mapMeridianExpectation(parseMeridianScope(raw)),flow:{entryNodeId:'result',nodes:[{id:'result',kind:'result' as const,title:`x${String.fromCharCode(0xd800)}y`,description:'Проверяемый результат.',owner:'agent' as const}],edges:[]}};
  let failure:string|undefined;
  try{await store.importMeridianScope({requestId:crypto.randomUUID(),expectedVersion:0,rawDocument:raw,content},human);}catch(error){failure=code(error);}
  assert.equal((await store.getProject()).version,0);assert.equal(failure,'VALIDATION_ERROR');
 }finally{await store.close();}
});
