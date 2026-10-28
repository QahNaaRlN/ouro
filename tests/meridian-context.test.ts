import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMeridianScope,mapMeridianExpectation} from '../packages/meridian/src/context';
// Synthetic DTO reconstructed from pinned Meridian work-scope.test.ts, not a live host capture.
const raw=readFileSync(new URL('./fixtures/meridian/scope.json',import.meta.url),'utf8');
const fixture=()=>JSON.parse(raw);
const reject=(value:unknown)=>assert.throws(()=>parseMeridianScope(JSON.stringify(value)),error=>(error as {code?:string}).code==='VALIDATION_ERROR');

test('M01 source DTO accepts coherent pinned scope and maps only draft expectations with explicit verification',()=>{
 const scope=parseMeridianScope(raw),content=mapMeridianExpectation(scope);
 assert.equal(scope.contract,'meridian-work-scope-view');
 assert.equal(scope.facts.coverage.internal_pins,'verified');
 assert.equal(content.goal,'Historical goal A');assert.equal(content.dod.length,1);
 assert.match(content.dod[0].text,/comparison/);assert.match(content.dod[0].text,/Same pinned facts/);
 assert.match(content.inputs,/source:historical-a/);assert.match(content.inputs,/synthetic-attempt/);
 assert.equal(content.constraints,'Original constraint A');
 assert(!('activeRevisionId' in content));assert(!('acceptance' in content));
 assert.deepEqual(parseMeridianScope(new TextEncoder().encode(raw)),scope);
});

test('M01 closed DTO rejects nested unknown keys, authority flags and inconsistent immutable pins',()=>{
 for(const change of [
  (v:any)=>v.actions_authorized=true,(v:any)=>v.ordinary_writer=true,(v:any)=>v.contract_version=2,
  (v:any)=>v.facts.goal.hidden='authority',(v:any)=>v.facts.run_ref.provider_id='other-provider',
  (v:any)=>v.facts.context_manifest_pin.key.scope.id='other-run',
  (v:any)=>v.facts.task_specification_pin.sha256='a'.repeat(64),
  (v:any)=>v.facts.goal.source_pin.revision='18446744073709551616',
  (v:any)=>v.facts.goal.source_pin.revision='0',(v:any)=>v.facts.subject_ref.record_key.scope.workspace_id='other-workspace',
  (v:any)=>v.facts.run_ref.run.key.scope.id='other-run',
  (v:any)=>v.facts.authoritative_sources.push(structuredClone(v.facts.authoritative_sources[0])),
 ]){const v=fixture();change(v);reject(v);}
});

test('M01 source bytes reject malformed UTF8, duplicate escaped JSON keys, excessive depth and oversize without interpretation',()=>{
 for(const value of ['{"contract":1,"\\u0063ontract":2}',raw.replace('"actions_authorized": false','"actions_authorized": true,"actions_authorized": false'), '['.repeat(70)+'0'+']'.repeat(70), ' '.repeat(524289),new Uint8Array([0xc3,0x28]),new Uint8Array([0xef,0xbb,0xbf,...new TextEncoder().encode(raw)])])
  assert.throws(()=>parseMeridianScope(value),error=>(error as {code?:string}).code==='VALIDATION_ERROR');
 const v=fixture();v.facts.goal.goal='я'.repeat(2049);reject(v);
 const controls=fixture();controls.facts.goal.goal='bad\u0000text';reject(controls);
});

test('M02 declared paths remain documentary names and reject aliases and Windows reserved segments',()=>{
 for(const path of ['../src/a.ts','src//a.ts','Src/a.ts','src/CON.txt','src/nul/a.ts','src/a.ts.','c:/a.ts','src\\a.ts','src/./a.ts']){
  const v=fixture();v.facts.declared_scope.declared_paths=[path];reject(v);
 }
 const duplicate=fixture();duplicate.facts.declared_scope.declared_paths=['src/a.ts','src/a.ts'];reject(duplicate);
 const max=fixture();max.facts.run_ref.scope_revision='18446744073709551615';assert.equal(parseMeridianScope(JSON.stringify(max)).facts.run_ref.scope_revision,'18446744073709551615');
});
