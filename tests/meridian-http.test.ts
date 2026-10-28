import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {assertJsonWrite} from '../lib/auth';
import {createStore} from '../lib/store';
import {PROJECT_ID,AGENT_ID,type Actor} from '../packages/core/src';
import {mapMeridianExpectation,parseMeridianScope} from '../packages/meridian/src/context';
const raw=readFileSync(new URL('./fixtures/meridian/scope.json',import.meta.url),'utf8');
const human:Actor={id:'meridian-http-human',kind:'human',projectIds:[PROJECT_ID]};
const request=(body:unknown,headers:Record<string,string>={})=>new Request('http://127.0.0.1/api/meridian/import',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const input=(rawDocument=raw)=>({requestId:randomUUID(),expectedVersion:0,rawDocument,content:mapMeridianExpectation(parseMeridianScope(rawDocument))});

test('M03 dedicated body budget preserves origin checks and generic command limit',()=>{
 const req=request({}, {'Content-Length':'300000'});
 assert.throws(()=>assertJsonWrite(req),e=>(e as {code?:string}).code==='PAYLOAD_TOO_LARGE');
 assert.doesNotThrow(()=> (assertJsonWrite as any)(req,2*1024*1024));
 assert.throws(()=>(assertJsonWrite as any)(request({}, {Origin:'http://foreign.example'}),2*1024*1024),e=>(e as {code?:string}).code==='FORBIDDEN');
});

test('M03 human import accepts bounded source over generic limit and stores exact raw UTF8 bytes',async()=>{
 const {createMeridianImportHandler}=await import('../lib/meridian/http');
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const handler=createMeridianImportHandler({authenticateHuman:async()=>human,importScope:(body,actor)=>store.importMeridianScope(body,actor)});
  const source=raw+' '.repeat(300000),req=input(source),response=await handler(request(req));
  assert.equal(response.status,201);const result=await response.json();
  assert.equal(result.events[0].payload.meridianSource.rawDocument,source);assert.equal(result.state.specs[0].activeRevisionId,null);
  const replay=await handler(request(req));assert.equal(replay.status,201);assert.equal((await replay.json()).replayed,true);
 }finally{await store.close();}
});

test('M03 unknown input, foreign origin, malformed UTF8, missing human and streamed overflow never create a draft',async()=>{
 const {createMeridianImportHandler}=await import('../lib/meridian/http');
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const handler=createMeridianImportHandler({authenticateHuman:()=>human,importScope:(body,actor)=>store.importMeridianScope(body,actor)});
  for(const req of [request({...input(),documentSha256:'a'.repeat(64)}),request(input(),{Origin:'https://foreign.example'}),request(input(),{'Content-Type':'text/plain'}),request('{'),new Request('http://127.0.0.1/api/meridian/import',{method:'POST',headers:{'Content-Type':'application/json'},body:new Uint8Array([0xc3,0x28])})])assert([400,403,415,422].includes((await handler(req)).status));
  let cancelled=false;
  const stream=new ReadableStream<Uint8Array>({pull(c){c.enqueue(new Uint8Array(256*1024));},cancel(){cancelled=true;}});
  const oversized=new Request('http://127.0.0.1/api/meridian/import',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'} as RequestInit);
  assert.equal((await handler(oversized)).status,413);assert.equal(cancelled,true);
  const agent=createMeridianImportHandler({authenticateHuman:()=>({id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]}),importScope:(body,actor)=>store.importMeridianScope(body,actor)});
  assert.equal((await agent(request(input()))).status,403);
  const anonymous=createMeridianImportHandler();assert.equal((await anonymous(request(input()))).status,401);
  assert.equal((await store.getProject()).version,0);
 }finally{await store.close();}
});

test('M03 an unexpected SQL exception is not echoed or logged with imported source content',async()=>{
 const {createMeridianImportHandler}=await import('../lib/meridian/http');
 const original=console.error,logged:unknown[]=[];console.error=(...args:unknown[])=>{logged.push(args);};
 try{
  const marker='private-meridian-source-marker';
  const handler=createMeridianImportHandler({authenticateHuman:()=>human,importScope:async()=>{throw new Error(marker);}});
  const response=await handler(request(input()));assert.equal(response.status,500);assert(!JSON.stringify(await response.json()).includes(marker));
  assert.equal(logged.length,0);
 }finally{console.error=original;}
});

test('M06 a pending import cannot check a different human receipt after the browser cookie changes',async()=>{
 const {createMeridianImportHandler}=await import('../lib/meridian/http');
 let calls=0;
 const handler=createMeridianImportHandler({authenticateHuman:()=>human,importScope:async()=>{calls++;throw Object.assign(new Error('absence belongs only to the authenticated actor'),{code:'VERSION_CONFLICT',details:{meridianReceipt:'absent'}});}});
 const mismatch=await handler(request(input(),{'X-Ouro-Expected-Participant':'previous-human'}));
 assert.equal(mismatch.status,401);assert.equal(calls,0);
 const denied=await mismatch.json();assert.equal(denied.error.code,'PARTICIPANT_CHANGED');assert.equal(denied.error.details?.meridianReceipt,undefined);
 const matching=await handler(request(input(),{'X-Ouro-Expected-Participant':human.id}));
 assert.equal(matching.status,409);assert.equal(calls,1);assert.equal((await matching.json()).error.details.meridianReceipt,'absent');
});
