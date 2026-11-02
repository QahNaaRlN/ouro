import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT_ID } from '../packages/core/src';
import { projectFetch, projectRequestUrl, selectedProjectId } from '../lib/client-project';

test('R01 page scope survives preference changes without losing request identity, body or cancellation',async()=>{
 const savedDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 const savedLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
 const savedFetch=globalThis.fetch;
 try{
  assert.equal(selectedProjectId(),PROJECT_ID,'server fallback must not pin the browser');
  const document={cookie:'ouro_project=project-a'};
  Object.defineProperty(globalThis,'document',{configurable:true,value:document});
  Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:'http://ouro.test'}});
  assert.equal(selectedProjectId(),'project-a');
  document.cookie='ouro_project=project-b';
  assert.equal(selectedProjectId(),'project-a');
  const calls:{input:RequestInfo|URL;init?:RequestInit}[]=[];
  globalThis.fetch=async(input,init)=>{calls.push({input,init});return new Response('{}');};
  const controller=new AbortController();
  const request=new Request('http://ouro.test/api/commands',{method:'POST',body:'{"requestId":"same-receipt"}',headers:{'X-Ouro-Expected-Participant':'original-author','Content-Type':'application/json'},signal:controller.signal});
  await projectFetch(request,{headers:{'X-Additional':'kept'}});
  assert.equal(calls[0].input,request);
  assert.equal(new Headers(calls[0].init?.headers).get('X-Ouro-Project-Id'),'project-a');
  assert.equal(new Headers(calls[0].init?.headers).get('X-Ouro-Expected-Participant'),'original-author');
  assert.equal(new Headers(calls[0].init?.headers).get('X-Additional'),'kept');
  assert.equal(await request.clone().text(),'{"requestId":"same-receipt"}');
  controller.abort();
  assert.equal(request.signal.aborted,true);
  await projectFetch('/api/commands',{headers:{'X-Ouro-Project-Id':'explicit-project'}});
  assert.equal(new Headers(calls[1].init?.headers).get('X-Ouro-Project-Id'),'explicit-project');
  await projectFetch('/api/commands?projectId=explicit-project');
  assert.equal(calls[2].init,undefined);
  for(const path of ['/api/auth/login','/api/projects','https://outside.example/api/commands']){
   await projectFetch(path);
   assert.equal(calls.at(-1)?.init,undefined);
  }
  const stream=new URL(projectRequestUrl('/api/stream?after=12'),'http://ouro.test');
  assert.equal(stream.searchParams.get('projectId'),'project-a');
  assert.equal(stream.searchParams.get('after'),'12');
  assert.equal(projectRequestUrl('/api/stream?after=12&projectId=explicit-project'),'/api/stream?after=12&projectId=explicit-project');
 }finally{
  globalThis.fetch=savedFetch;
  if(savedDocument)Object.defineProperty(globalThis,'document',savedDocument);else Reflect.deleteProperty(globalThis,'document');
  if(savedLocation)Object.defineProperty(globalThis,'location',savedLocation);else Reflect.deleteProperty(globalThis,'location');
 }
});
