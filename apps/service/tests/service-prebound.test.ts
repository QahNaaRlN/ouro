import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {connect} from 'node:net';
import {createHmac} from 'node:crypto';
import {bindOwnedHttpListener} from '../../../scripts/consumer-delivery/owned-http-listener.mjs';
import {startHttpServer} from '../src/bootstrap/start-http-server.js';
import {tcpRequest,waitFor} from './http-fixtures.js';

/** Проверяет занятие только собственного ephemeral порта, никогда не ищет и не останавливает foreign owner. */
async function occupied(port:number){const probe=createServer();return new Promise<boolean>((resolve,reject)=>{probe.once('error',error=>{if('code'in error&&error.code==='EADDRINUSE')resolve(true);else reject(error);});probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(false)));});}

test('CPH01 prebound same Server queues exact raw bytes/HEAD and adopts the existing Hono pipeline',async context=>{
 const prebound=await bindOwnedHttpListener({port:0}),original=prebound.server,listen=context.mock.method(original,'listen'),close=context.mock.method(original,'close'),body=Buffer.from(' {"рус":"exact"}\n'),signature=createHmac('sha256','own-fixture-secret').update(body).digest('hex');let calls=0;
 let queued=0;prebound.server.on('request',()=>queued++);const pending=tcpRequest(prebound.url+'/echo','POST',[body.subarray(0,5),body.subarray(5)],{'Content-Type':'application/json','X-Fixture-Signature':signature}),head=tcpRequest(prebound.url+'/ready','HEAD');void pending.catch(()=>{});void head.catch(()=>{});
 let runtime:Awaited<ReturnType<typeof startHttpServer>>|undefined;
 try{
  await waitFor(()=>queued===2,'two parsed early requests');assert.equal(prebound.currentSockets().length,2);assert.equal(await occupied(prebound.address.port),true);
  runtime=await startHttpServer({listener:{...prebound,get state(){return prebound.state;}},port:prebound.address.port,host:'127.0.0.1',deferAdmission:true,routes:[
   {path:'/echo',methods:{POST:async input=>{calls++;const bytes=Buffer.from(await input.arrayBuffer());assert(bytes.equals(body));assert.equal(input.headers.get('x-fixture-signature'),createHmac('sha256','own-fixture-secret').update(bytes).digest('hex'));const headers=new Headers();for(const cookie of ['one=a','two=b','three=c'])headers.append('Set-Cookie',cookie);return new Response(bytes,{headers});}}},
   {path:'/ready',methods:{GET:()=>{calls++;return new Response('ready');}}},
  ]});assert.equal(calls,0);assert.equal(prebound.server,original);assert.equal(prebound.server.listening,true);assert.equal(listen.mock.callCount(),0);assert.equal(close.mock.callCount(),0);assert.equal(await occupied(prebound.address.port),true);
  runtime.activate();const result=await pending,empty=await head;assert.equal(result.status,200);assert(result.body.equals(body));assert.equal(result.headers['set-cookie']?.length,3);assert.equal(empty.status,200);assert.equal(empty.body.length,0);assert.equal(calls,2);assert.equal(await prebound.closeIfUnadopted(),false);assert.equal((await tcpRequest(runtime.url+'/ready')).status,200);assert.throws(()=>prebound.adopt(()=>{}));
 }finally{if(runtime)await runtime.stop();else await prebound.closeIfUnadopted();}
});

test('CPH02 closed and over-cap queued requests never invoke application handlers',async()=>{
 const prebound=await bindOwnedHttpListener({port:0,maxPendingRequests:1});let calls=0,runtime:Awaited<ReturnType<typeof startHttpServer>>|undefined;
 const firstQueued=new Promise<void>(resolve=>prebound.server.once('request',()=>resolve())),first=request(prebound.url+'/ready',{agent:false});first.on('error',()=>{});first.end();
 try{await firstQueued;await assert.rejects(()=>tcpRequest(prebound.url+'/excess'));first.destroy();await waitFor(()=>prebound.currentSockets().length===0,'closed startup sockets');runtime=await startHttpServer({listener:prebound,routes:[{path:'/ready',methods:{GET:()=>{calls++;return new Response('ready');}}}]});assert.equal(calls,0);assert.equal((await tcpRequest(runtime.url+'/ready')).status,200);assert.equal(calls,1);}finally{first.destroy();if(runtime)await runtime.stop();else await prebound.closeIfUnadopted();}
});

test('CPH03 startup connection cap is removed at adoption and inherited sockets stay owned',async()=>{
 const prebound=await bindOwnedHttpListener({port:0,maxConnections:1}),first=connect(prebound.address.port,'127.0.0.1');first.on('error',()=>{});let runtime:Awaited<ReturnType<typeof startHttpServer>>|undefined,second:ReturnType<typeof connect>|undefined;
 try{await waitFor(()=>prebound.currentSockets().length===1,'first prebound connection');second=connect(prebound.address.port,'127.0.0.1');second.on('error',()=>{});await new Promise<void>(resolve=>second!.once('close',()=>resolve()));assert.equal(prebound.currentSockets().length,1);runtime=await startHttpServer({listener:prebound,routes:[{path:'/ready',methods:{GET:()=>new Response('ready')}}]});const third=connect(prebound.address.port,'127.0.0.1');third.on('error',()=>{});await new Promise<void>(resolve=>third.once('connect',()=>resolve()));assert.equal(first.destroyed,false);assert.equal(third.destroyed,false);first.write('GET /ready HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');third.write('GET /ready HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');first.resume();third.resume();await new Promise<void>(resolve=>third.once('close',()=>resolve()));}finally{first.destroy();second?.destroy();if(runtime)await runtime.stop();else await prebound.closeIfUnadopted();}
});

test('CPH04 unadopted startup deadline closes only its listener and prevents later admission',async()=>{
 const prebound=await bindOwnedHttpListener({port:0,startupTimeoutMs:30});const pending=tcpRequest(prebound.url+'/waiting');void pending.catch(()=>{});await assert.rejects(()=>pending);await prebound.closeIfUnadopted();assert.equal(prebound.state,'CLOSED');assert.throws(()=>prebound.adopt(()=>{}));assert.equal(await occupied(prebound.address.port),false);
});

test('CPH05 inherited queued handler lifetime drains before HTTP shutdown resolves',async()=>{
 const prebound=await bindOwnedHttpListener({port:0});let release:()=>void=()=>{},started=false,finished=false;const gate=new Promise<void>(resolve=>release=resolve),pending=tcpRequest(prebound.url+'/query');void pending.catch(()=>{});await waitFor(()=>prebound.currentSockets().length===1,'queued query socket');const runtime=await startHttpServer({listener:prebound,shutdownTimeoutMs:1000,routes:[{path:'/query',methods:{GET:async()=>{started=true;await gate;finished=true;return new Response('done');}}}]});
 try{await waitFor(()=>started,'admitted query');let stopped=false;const closing=runtime.stop().then(()=>stopped=true);await new Promise(resolve=>setTimeout(resolve,20));assert.equal(stopped,false);assert.equal(finished,false);release();await closing;assert.equal(finished,true);await pending.catch(()=>{});}finally{release();await runtime.stop();}
});
