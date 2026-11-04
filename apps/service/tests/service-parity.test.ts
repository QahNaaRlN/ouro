import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {randomUUID,createHmac} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {createConnection,type Socket} from 'node:net';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createBackendRoutes} from '../src/backend/create-backend.js';
import {startHttpServer} from '../src/bootstrap/start-http-server.js';
import {tcpRequest,openResponse,waitFor,type HttpResult} from './http-fixtures.js';
const rootRequire=createRequire(import.meta.url);
const {createStore}:typeof import('../../../lib/store')=rootRequire('../../../lib/store');
const {PROJECT_ID}:typeof import('../../../packages/core/src')=rootRequire('../../../packages/core/src');
const root=fileURLToPath(new URL('../../../',import.meta.url));
const environment={OURO_LOCAL_DEMO:'1',OURO_HUMAN_TOKEN:'isolated-human',OURO_GITHUB_WEBHOOK_SECRET:'isolated-webhook-secret'};
const headers={Authorization:'Bearer isolated-human','Content-Type':'application/json'};
const human={id:'human-token',kind:'human' as const,projectIds:[PROJECT_ID]};
const json=<T>(result:HttpResult):T=>JSON.parse(result.body.toString()) as T;

/** Независимо читает публичные exports прежних wrappers, не исполняя Next или глобальный store. */
async function baseline(){
 const found:{path:string;methods:string[]}[]=[];
 const visit=async(directory:string)=>{
  for(const entry of await readdir(directory,{withFileTypes:true})){
   const file=path.join(directory,entry.name);if(entry.isDirectory()){await visit(file);continue;}if(entry.name!=='route.ts')continue;
   const source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true),methods:string[]=[];
   for(const statement of source.statements){
    if(!ts.canHaveModifiers(statement)||!ts.getModifiers(statement)?.some(item=>item.kind===ts.SyntaxKind.ExportKeyword))continue;
    if(ts.isFunctionDeclaration(statement)&&statement.name)methods.push(statement.name.text);
    if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(ts.isIdentifier(declaration.name))methods.push(declaration.name.text);
   }
   found.push({path:'/'+path.relative(path.join(root,'app'),directory).split(path.sep).join('/').replace(/\[([^\]]+)\]/g,':$1'),methods:methods.filter(method=>['GET','POST','PATCH','DELETE','PUT','HEAD','OPTIONS'].includes(method)).sort()});
  }
 };
 await visit(path.join(root,'app/api'));return found.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}

test('every baseline route negotiates real HTTP methods and retains negative auth/body priority',async()=>{
 const store=await createStore({dataDir:'memory://',migrationsDir:path.join(root,'db/migrations')}),routes=createBackendRoutes({store,environment,resourceRoot:root});
 const server=await startHttpServer({routes});
 try{
  const original=await baseline();assert.equal(original.length,47);
  assert.deepEqual(routes.map(route=>({path:route.path,methods:Object.keys(route.methods).sort()})).sort((a,b)=>a.path.localeCompare(b.path,'en')),original);
  let checked=0;
  for(const route of original){
   const url=server.url+route.path.replace(/:[^/]+/g,PROJECT_ID),implemented=new Set(route.methods);if(implemented.has('GET'))implemented.add('HEAD');implemented.add('OPTIONS');
   const options=await tcpRequest(url,'OPTIONS');assert.equal(options.status,204,route.path);assert.equal(options.headers.allow,[...implemented].sort().join(', '),route.path);
   assert.equal((await tcpRequest(url,'PUT')).status,405,route.path);
   for(const method of route.methods){
    const response=await tcpRequest(url,method,method==='GET'||method==='DELETE'?[]:[Buffer.from('{')],{Authorization:'Bearer invalid','Content-Type':'text/plain'});
    let expected=401;
    if(route.path==='/api/health')expected=200;
    else if(route.path.endsWith('/mcp'))expected=method==='POST'?415:405;
    else if((route.path.startsWith('/api/auth/')&&method==='POST')||['/api/participants/session','/api/participants/logout','/api/github/webhook'].includes(route.path))expected=415;
    assert.equal(response.status,expected,`${method} ${route.path}: ${response.body.toString()}`);checked++;
   }
  }
  assert.equal(checked,59);assert.equal((await tcpRequest(server.url+'/api/unknown')).status,404);
 }finally{await server.stop();await store.close();}
});

test('real SQL command receipts, participant cookies, revocation and MCP keep one injected owner',async()=>{
 const store=await createStore({dataDir:'memory://',migrationsDir:path.join(root,'db/migrations')}),server=await startHttpServer({routes:createBackendRoutes({store,environment,resourceRoot:root})});
 const send=(url:string,body:unknown,extra:Record<string,string>={})=>tcpRequest(server.url+url,'POST',[Buffer.from(JSON.stringify(body))],{...headers,...extra});
 try{
  const initial=await store.getProject(),command={type:'createSpec',requestId:randomUUID(),expectedVersion:initial.version,content:{title:'Service receipt fixture',goal:'Preserve one exact receipt',dod:[{id:'one',text:'Durable',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}};
  const first=await send('/api/commands',command);assert.equal(first.status,200);
  const repeated=await send('/api/commands',command);assert.equal(json<{replayed:boolean}>(repeated).replayed,true);assert.deepEqual(json<{events:unknown[]}>(repeated).events,json<{events:unknown[]}>(first).events);
  assert.equal((await send('/api/commands',{...command,content:{...command.content,title:'Changed'}})).status,409);
  assert.equal((await send('/api/projects/'+PROJECT_ID+'/commands',{}, {'X-Ouro-Expected-Project':'foreign'})).status,409);
  const created=await send('/api/participants',{name:'Service participant'});assert.equal(created.status,201);
  const participant=json<{participant:{id:string};credential:string}>(created);
  const login=await send('/api/participants/session',{credential:participant.credential});assert.equal(login.status,200);
  const cookie=login.headers['set-cookie']?.[0]?.split(';')[0];assert(cookie);
  assert.equal((await tcpRequest(server.url+'/api/project','GET',[],{Cookie:cookie})).status,200);
  assert.equal((await send('/api/participants/'+participant.participant.id+'/revoke',{})).status,200);
  assert.equal((await tcpRequest(server.url+'/api/project','GET',[],{Cookie:cookie})).status,401);
  await store.createAccount({email:'service@example.test',name:'Service account',password:'Synthetic-password-2026'},human);
  const accountLogin=await send('/api/auth/login',{email:'service@example.test',password:'Synthetic-password-2026'});assert.equal(accountLogin.status,200);assert.equal(accountLogin.headers['set-cookie']?.length,3);
  const userCookie=accountLogin.headers['set-cookie']?.find(value=>value.startsWith('ouro_user_session='))?.split(';')[0];assert(userCookie);
  assert.equal((await tcpRequest(server.url+'/api/auth/session','GET',[],{Cookie:userCookie})).status,200);
  const accountProject=await tcpRequest(server.url+'/api/projects','POST',[Buffer.from(JSON.stringify({name:'Account fixture project'}))],{'Content-Type':'application/json',Cookie:userCookie});assert.equal(accountProject.status,201,accountProject.body.toString());
  const accountLogout=await tcpRequest(server.url+'/api/auth/logout','POST',[Buffer.from('{}')],{'Content-Type':'application/json',Cookie:userCookie});assert.equal(accountLogout.headers['set-cookie']?.length,3);
  assert.equal((await tcpRequest(server.url+'/api/auth/session','GET',[],{Cookie:userCookie})).status,401);
  for(const operation of ['observe','run'])assert.equal((await send('/api/projects/'+PROJECT_ID+'/verification/'+operation,{})).status,403);
   const registration=await store.createAgent('Service MCP fixture',human);
  const client=new Client({name:'service-runtime-fixture',version:'1'});
  try{await client.connect(new StreamableHTTPClientTransport(new URL(server.url+'/api/mcp'),{requestInit:{headers:{Authorization:'Bearer '+registration.token}}}));assert((await client.listTools()).tools.length>0);}
  finally{await client.close();}
  assert.equal((await tcpRequest(server.url+'/api/commands','POST',[Buffer.alloc(256001,97)],{Authorization:'Bearer invalid','Content-Type':'application/json',Connection:'keep-alive'})).status,401);
  assert.equal((await tcpRequest(server.url+'/api/commands','POST',[Buffer.alloc(256001,97)],{...headers,Connection:'keep-alive'})).status,413);
 }finally{await server.stop();await store.close();}
});

test('owned SSE delivers real SQL changes and actual webhook preserves chunked raw HMAC',async()=>{
 const store=await createStore({dataDir:'memory://',migrationsDir:path.join(root,'db/migrations')});let kicked=0;
 const server=await startHttpServer({routes:createBackendRoutes({store,environment,resourceRoot:root,kickWorker:async()=>{kicked++;}})});
 const subscription=await openResponse(server.url+'/api/stream',headers);
 try{
  await waitFor(()=>subscription.text().includes('event: snapshot'),'initial SQL snapshot');
  const before=await store.getProject();
  await store.executeCommand({type:'createSpec',requestId:randomUUID(),expectedVersion:before.version,content:{title:'SSE transport fixture',goal:'Observe one committed update',dod:[{id:'one',text:'Visible',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}},human);
  await waitFor(()=>subscription.text().includes('SSE transport fixture'),'committed SQL snapshot');
  const raw=Buffer.from('{ "ref":"refs/heads/fixture", "before":"'+'a'.repeat(40)+'", "after":"'+'b'.repeat(40)+'", "repository":{"id":42,"full_name":"ouro/fixture"},"commits":[],"head_commit":{"id":"'+'b'.repeat(40)+'","message":"Unicode · fixture"}}');
  const webhookHeaders={'Content-Type':'application/json','X-GitHub-Delivery':'service-fixture-delivery','X-GitHub-Event':'push','X-Hub-Signature-256':'sha256='+createHmac('sha256',environment.OURO_GITHUB_WEBHOOK_SECRET).update(raw).digest('hex')};
  const accepted=await tcpRequest(server.url+'/api/github/webhook','POST',[raw.subarray(0,17),raw.subarray(17)],webhookHeaders);assert.equal(accepted.status,202,accepted.body.toString());
  await waitFor(()=>kicked===1,'owned after-response worker kick');
  assert.equal((await tcpRequest(server.url+'/api/github/webhook','POST',[raw],{...webhookHeaders,'X-Hub-Signature-256':'sha256='+'0'.repeat(64)})).status,401);
  assert.equal(kicked,1);
  const oversized=Buffer.alloc(2*1024*1024+1,32);
  assert.equal((await tcpRequest(server.url+'/api/github/webhook','POST',[oversized],webhookHeaders)).status,413);
  assert.equal((await tcpRequest(server.url+'/api/meridian/import','POST',[oversized],headers)).status,413);
 }finally{subscription.abort();await server.stop();await store.close();}
});

test('MCP cloud capabilities use explicit runtime environment in both public endpoints',async()=>{
 const store=await createStore({dataDir:'memory://',migrationsDir:path.join(root,'db/migrations'),deploymentMode:'cloud'}),registration=await store.createAgent('Cloud fixture',human);
 const server=await startHttpServer({routes:createBackendRoutes({store,environment:{OURO_DEPLOYMENT_MODE:'cloud'},resourceRoot:root})});
 try{
  for(const endpoint of ['/api/mcp','/api/projects/'+PROJECT_ID+'/mcp']){
   const client=new Client({name:'explicit-cloud-fixture',version:'1'});
   try{
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url+endpoint),{requestInit:{headers:{Authorization:'Bearer '+registration.token}}}));
    const result=await client.callTool({name:'ouro.get_context',arguments:{}}),body=result.structuredContent as {contract?:{capabilities:string[]}};
    assert.equal(result.isError,undefined);assert(body.contract);assert.equal(body.contract.capabilities.includes('verification.local-runner.v1'),false);
    assert.equal((await client.callTool({name:'ouro.get_context',arguments:{requiredCapabilities:['verification.local-runner.v1']}})).isError,true);
   }finally{await client.close();}
  }
 }finally{await server.stop();await store.close();}
});

test('early auth and media refusals reach a raw TCP client before its upload is completed',async()=>{
 const store=await createStore({dataDir:'memory://',migrationsDir:path.join(root,'db/migrations')}),server=await startHttpServer({routes:createBackendRoutes({store,environment:{...environment,OURO_AGENT_TOKEN:'isolated-agent'},resourceRoot:root})});
 const sockets:Socket[]=[],errors:Error[]=[];
 try{
  for(const connection of ['close','keep-alive'])for(const [route,contentType,expectedStatus,expectedCode]of [['/api/commands','application/json',403,'FORBIDDEN'],['/api/auth/login','text/plain',415,'UNSUPPORTED_MEDIA_TYPE']] as const){
   const url=new URL(server.url),socket=createConnection({host:url.hostname,port:Number(url.port)});sockets.push(socket);socket.on('error',error=>{errors.push(error);});
   const response=new Promise<string>((resolve,reject)=>{
    let text='';socket.on('data',chunk=>{text+=chunk.toString();if(text.includes('\r\n\r\n')&&text.includes(expectedCode))resolve(text);});socket.once('error',reject);socket.once('close',()=>reject(new Error('Connection closed before the refusal response')));socket.setTimeout(1500,()=>reject(new Error('Incomplete upload blocked the refusal response')));
   });
   const sentAt=Date.now();socket.write(`POST ${route} HTTP/1.1\r\nHost: ${url.host}\r\nAuthorization: Bearer isolated-agent\r\nContent-Type: ${contentType}\r\nContent-Length: 100000\r\nConnection: ${connection}\r\n\r\n{`);
   assert.match(await response,new RegExp('^HTTP/1\\.1 '+expectedStatus+' '));assert(Date.now()-sentAt<400,'Early refusal waited for the 500ms unused-body deadline');assert.equal(socket.writableEnded,false);
  }
  await server.stop();assert.equal(errors.length,0);
 }finally{for(const socket of sockets)socket.destroy();await server.stop().catch(()=>undefined);await store.close();}
});
