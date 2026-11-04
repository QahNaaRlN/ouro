import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStaticHandler} from '../src/runtime/static-handler.js';
import {startHttpServer} from '../src/bootstrap/start-http-server.js';
import {tcpRequest} from './http-fixtures.js';

test('SPA only serves known UI navigation and never catches API, unknown assets or traversal',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ouro-spa-fixture-'));
 await mkdir(path.join(directory,'assets'));await writeFile(path.join(directory,'index.html'),'<main>Fixture SPA</main>');await writeFile(path.join(directory,'assets/entry.mjs'),'export const fixture=true;');
 const server=await startHttpServer({routes:[],fallback:await createStaticHandler(directory)});
 try{
  for(const route of ['/','/projects','/projects/help','/projects/project-fixture','/projects/project-fixture/members'])assert.equal((await tcpRequest(server.url+route,'GET',[],{Accept:'text/html'})).status,200,route);
  for(const route of ['/api/unknown','/api','/assets/missing.json','/assets/missing.wasm','/assets/missing.mjs','/assets/extensionless','/missing.custom','/unpublished-route','/%2e%2e/.env','/%5c..%5c.env']){
   for(const method of ['GET','HEAD'])assert.equal((await tcpRequest(server.url+route,method,[],{Accept:'text/html'})).status,404,method+' '+route);
  }
  assert.equal((await tcpRequest(server.url+'/projects','GET',[],{Accept:'application/json'})).status,404);
  assert.equal((await tcpRequest(server.url+'/projects','POST',[],{Accept:'text/html'})).status,404);
  const script=await tcpRequest(server.url+'/assets/entry.mjs');assert.equal(script.status,200);assert.equal(script.body.toString(),'export const fixture=true;');assert.match(String(script.headers['content-type']),/^text\/javascript/);
  assert.equal((await tcpRequest(server.url+'/projects','HEAD',[],{Accept:'text/html'})).body.length,0);
 }finally{await server.stop();await rm(directory,{recursive:true,force:true});}
});
