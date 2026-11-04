import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startHttpServer} from '../src/bootstrap/start-http-server.js';
import {createBackendRoutes} from '../src/backend/create-backend.js';
import type {ProjectState,Actor} from '../../../packages/core/src';

const requireRoot=createRequire(import.meta.url);
const {createStore,canonicalJSON}:typeof import('../../../lib/store')=requireRoot('../../../lib/store');
const {createProjectSession}:typeof import('../../../packages/client/src/lifecycle/project-session')=requireRoot('../../../packages/client/src/lifecycle/project-session');
const {createProjectHttpPorts}:typeof import('../../../packages/client/src/http/project-http')=requireRoot('../../../packages/client/src/http/project-http');
const {freezeProjectCommandIntent}:typeof import('../../../packages/client/src/ports')=requireRoot('../../../packages/client/src/ports');
const {getWorkspaceIntents}:typeof import('../../../packages/client/src/http/workspace-intents')=requireRoot('../../../packages/client/src/http/workspace-intents');
const resourceRoot=fileURLToPath(new URL('../../../',import.meta.url));
const content={title:'TCP committed receipt',goal:'Recover the actual successful operation.',dod:[{id:'durable',text:'Same command, one committed receipt',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};

/** Входит настоящим credential fixture и возвращает cookie только после проверки HTTP success. */
async function participantCookie(url:string,credential:string){
 const response=await fetch(url+'/api/participants/session',{method:'POST',headers:{Connection:'close','Content-Type':'application/json'},body:JSON.stringify({credential})});
 assert.equal(response.status,200,await response.clone().text());const identity=await response.json() as {actor:Actor},cookie=response.headers.get('Set-Cookie')?.split(';')[0];assert(cookie);return {cookie,actor:identity.actor};
}

test('HRP01 actual immutable historical empty SQL receipt confirms an exact retry after lost HTTP response without rewriting old JSON',async()=>{
 const store=await createStore({dataDir:'memory://'}),state=JSON.parse(JSON.stringify(await store.getProject())) as ProjectState,actor=state.events[0].actor,requestId=randomUUID();
 const credential='ouro_human_'+randomBytes(32).toString('base64url');
 await store.inspect('INSERT INTO ouro_participant_registrations(id,project_id,name,created_by) VALUES($1,$2,$3,$1)',[actor.id,state.projectId,'Historical proof fixture']);
 await store.inspect('INSERT INTO ouro_participant_credentials(participant_id,credential_hash) VALUES($1,$2)',[actor.id,createHash('sha256').update(credential).digest('hex')]);
 const command={type:'createSpec',requestId,expectedVersion:state.version,content:state.revisions[0]},legacyState:Record<string,unknown>={...state};
 for(const field of ['verificationRuns','verificationReviews','verificationSlices','verificationPhases','verificationCycles','verificationRefactorAdmissions','verificationObservationConfigs','verificationObservations'] as const)if(Array.isArray(legacyState[field])&&legacyState[field].length===0)delete legacyState[field];
 const response={state:legacyState,events:[],cursor:state.version},payloadHash=createHash('sha256').update(canonicalJSON(command)).digest('hex');
 await store.inspect('INSERT INTO ouro_command_receipts(actor_id,project_id,request_id,payload_hash,response,cursor) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[actor.id,state.projectId,requestId,payloadHash,JSON.stringify(response),state.version]);
 const before=(await store.inspect('SELECT project_id,actor_id,request_id,payload_hash,response,cursor FROM ouro_command_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[state.projectId,actor.id,requestId])).rows[0];
 const server=await startHttpServer({routes:createBackendRoutes({store,environment:{OURO_LOCAL_DEMO:'1'},resourceRoot})});
 const scope={projectId:state.projectId,actorId:actor.id,accessEpoch:1},body=' '+JSON.stringify(command)+' ',intent=freezeProjectCommandIntent({operation:'execute-command',scope,requestId,expectedVersion:state.version,body}),sent:unknown[]=[];
 let calls=0,session:ReturnType<typeof createProjectSession>|undefined;const statuses:number[]=[],bodies:unknown[]=[];let observed:Record<string,unknown>={};
 try{
  const bootstrap=await fetch(server.url+'/api/participants/session',{method:'POST',headers:{Connection:'close','Content-Type':'application/json'},body:JSON.stringify({credential})});assert.equal(bootstrap.status,200);assert.equal((await bootstrap.json() as {actor:{id:string}}).actor.id,actor.id);const cookie=bootstrap.headers.get('Set-Cookie')?.split(';')[0];assert(cookie);
  session=createProjectSession({sourceId:server.url,scope,ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,fetch:async(url,init)=>{
   calls++;sent.push(init?.body);const headers=new Headers(init?.headers);headers.set('Cookie',cookie);headers.set('Connection','close');const received=await fetch(server.url+String(url),{...init,headers});statuses.push(received.status);observed={header:received.headers.has('X-Ouro-Command-Receipt'),url:received.url,type:received.headers.get('Content-Type')};bodies.push(await received.clone().json());if(calls===1){await received.arrayBuffer();throw new Error('Fixture lost the response after the committed duplicate transaction.');}return received;
  }})});
  assert.equal((await session.execute(intent)).status,'unknown');assert.deepEqual(statuses,[200]);assert.deepEqual(bodies[0],{...response,replayed:true});assert.equal(calls,1);assert.equal(getWorkspaceIntents(scope.projectId,scope.actorId).find(value=>value.requestId===requestId)?.body,body);
  const recovered=await session.execute(intent);assert.deepEqual(statuses,[200,200]);assert.equal(recovered.status,'confirmed',JSON.stringify(observed));assert.equal(calls,2);assert.deepEqual(sent,[body,body]);assert.equal(session.getSnapshot()?.cursor,state.version);assert.equal(getWorkspaceIntents(scope.projectId,scope.actorId).some(value=>value.requestId===requestId),false);
  const after=(await store.inspect('SELECT project_id,actor_id,request_id,payload_hash,response,cursor FROM ouro_command_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[state.projectId,actor.id,requestId])).rows[0];assert.equal(canonicalJSON(after),canonicalJSON(before));
 }finally{session?.dispose();await server.stop();await store.close();}
});

test('HRP10 real HTTP new COMMIT survives a lost response and current revoke denies exact replay without disclosing proof',async()=>{
 const store=await createStore({dataDir:'memory://'}),state=await store.getProject(),operator:Actor={id:'local-human',kind:'human',projectIds:[state.projectId]};
 const participant=await store.createParticipant('TCP proof author',operator),server=await startHttpServer({routes:createBackendRoutes({store,environment:{OURO_LOCAL_DEMO:'1'},resourceRoot})});
 let session:ReturnType<typeof createProjectSession>|undefined;
 try{
  const {cookie,actor}=await participantCookie(server.url,participant.credential),scope={projectId:state.projectId,actorId:actor.id,accessEpoch:1},command={type:'createSpec',content,requestId:randomUUID(),expectedVersion:state.version},body='\n'+JSON.stringify(command)+'  ',statuses:number[]=[],rawBodies:unknown[]=[],headers:(string|null)[]=[],sent:unknown[]=[];
  const intent=freezeProjectCommandIntent({operation:'execute-command',scope,requestId:command.requestId,expectedVersion:state.version,body});let attempts=0;
  session=createProjectSession({sourceId:server.url,scope,ports:adopter=>createProjectHttpPorts({scope,mode:'legacy',adopter,fetch:async(url,init)=>{
   sent.push(init?.body);const requestHeaders=new Headers(init?.headers);requestHeaders.set('Cookie',cookie);requestHeaders.set('Connection','close');const response=await fetch(server.url+String(url),{...init,headers:requestHeaders});statuses.push(response.status);headers.push(response.headers.get('X-Ouro-Command-Receipt'));rawBodies.push(await response.clone().json());
   if(++attempts===1){await response.arrayBuffer();throw new Error('Fixture discarded a successful response after actual fresh COMMIT.');}return response;
  }})});
  assert.equal((await session.execute(intent)).status,'unknown');assert.deepEqual(statuses,[200]);assert.equal((rawBodies[0] as {replayed:boolean}).replayed,false);assert(headers[0]);
  const row=(await store.inspect('SELECT project_id,actor_id,request_id,payload_hash,response,cursor FROM ouro_command_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[state.projectId,actor.id,command.requestId])).rows[0];assert(row);
  assert.equal(row.payload_hash,createHash('sha256').update(canonicalJSON(command)).digest('hex'));assert.deepEqual(rawBodies[0],{...(row.response as object),replayed:false});
  const recovered=await session.execute(intent);assert.deepEqual(statuses,[200,200]);assert.equal(recovered.status,'confirmed');assert.deepEqual(sent,[body,body]);assert.equal(headers[1],headers[0]);assert.equal((rawBodies[1] as {replayed:boolean}).replayed,true);
  const committed=await store.getProject();assert.equal(committed.version,state.version+1);assert.equal(committed.events.filter(event=>event.requestId===command.requestId).length,1);
  await store.revokeParticipant(actor.id,operator);
  const revoked=await fetch(server.url+'/api/commands',{method:'POST',headers:{Cookie:cookie,Connection:'close','Content-Type':'application/json','X-Ouro-Expected-Participant':actor.id,'X-Ouro-Expected-Project':state.projectId},body});
  assert.equal(revoked.status,401);assert.equal(revoked.headers.has('X-Ouro-Command-Receipt'),false);assert.equal((await revoked.json() as {error:{code:string}}).error.code,'UNAUTHENTICATED');assert.deepEqual(await store.getProject(),committed);
 }finally{session?.dispose();await server.stop();await store.close();}
});

test('HRP11 real HTTP deferred COMMIT failure returns old error body without a proof and succeeds once after rollback',async()=>{
 const store=await createStore({dataDir:'memory://'}),state=await store.getProject(),operator:Actor={id:'local-human',kind:'human',projectIds:[state.projectId]},participant=await store.createParticipant('Rollback proof author',operator);
 const server=await startHttpServer({routes:createBackendRoutes({store,environment:{OURO_LOCAL_DEMO:'1'},resourceRoot})});
 try{
  const {cookie,actor}=await participantCookie(server.url,participant.credential),command={type:'createSpec',content,requestId:randomUUID(),expectedVersion:state.version},send=()=>fetch(server.url+'/api/commands',{method:'POST',headers:{Cookie:cookie,Connection:'close','Content-Type':'application/json','X-Ouro-Expected-Participant':actor.id,'X-Ouro-Expected-Project':state.projectId},body:JSON.stringify(command)});
  await store.inspect("CREATE FUNCTION hrp_http_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture HTTP commit failure'; END $$");
  await store.inspect('CREATE CONSTRAINT TRIGGER hrp_http_failure AFTER INSERT ON ouro_command_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hrp_http_fail_commit()');
  const failed=await send();assert.equal(failed.status,500);assert.equal(failed.headers.has('X-Ouro-Command-Receipt'),false);assert.equal((await failed.json() as {error:{code:string}}).error.code,'P0001');
  assert.equal((await store.inspect('SELECT * FROM ouro_command_receipts WHERE request_id=$1',[command.requestId])).rows.length,0);assert.deepEqual(await store.getProject(),state);
  await store.inspect('DROP TRIGGER hrp_http_failure ON ouro_command_receipts');
  const accepted=await send();assert.equal(accepted.status,200);assert(accepted.headers.get('X-Ouro-Command-Receipt'));assert.equal((await accepted.json() as {replayed:boolean}).replayed,false);
 }finally{await server.stop();await store.close();}
});

test('HRP12 real tasks endpoint hashes the effective strict command and preserves exact bytes across a three-event replay',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ouro-receipt-tasks-')),folder=path.join(directory,'project');await mkdir(folder);
 const store=await createStore({dataDir:'memory://'}),legacy=await store.getProject(),operator:Actor={id:'local-human',kind:'human',projectIds:[legacy.projectId]};let server:Awaited<ReturnType<typeof startHttpServer>>|undefined,session:ReturnType<typeof createProjectSession>|undefined;
 try{
  const registration=await store.createWorkspaceProject({requestId:randomUUID(),rootPath:folder,name:'Task proof fixture'},operator),scoped=await store.forProject(registration.project.id),owner={...operator,projectIds:[registration.project.id]},agent=await scoped.createAgent('Task proof agent',owner),state=await scoped.getProject();
  server=await startHttpServer({routes:createBackendRoutes({store,environment:{OURO_LOCAL_DEMO:'1'},resourceRoot})});
  const login=await fetch(server.url+'/api/session',{headers:{Connection:'close'}});assert.equal(login.status,200);const cookie=login.headers.get('Set-Cookie')?.split(';')[0];assert(cookie);const {actor}=await login.json() as {actor:Actor},scope={projectId:state.projectId,actorId:actor.id,accessEpoch:1};
  const task={content,agentId:agent.agent.id,expectedVersion:state.version,requestId:randomUUID()},body=' '+JSON.stringify(task,null,1)+'\n',intent=freezeProjectCommandIntent({operation:'start-project-work',scope,requestId:task.requestId,expectedVersion:state.version,body}),statuses:number[]=[],sent:unknown[]=[],proofs:(string|null)[]=[];let attempts=0;
  const origin=server.url;session=createProjectSession({sourceId:origin,scope,ports:adopter=>createProjectHttpPorts({scope,mode:'workspace',adopter,fetch:async(url,init)=>{
   const headers=new Headers(init?.headers);headers.set('Cookie',cookie);headers.set('Connection','close');sent.push(init?.body);const response=await fetch(origin+String(url),{...init,headers});statuses.push(response.status);proofs.push(response.headers.get('X-Ouro-Command-Receipt'));if(++attempts===1){await response.arrayBuffer();throw new Error('Fixture lost the freshly committed task response.');}return response;
  }})});
  assert.equal((await session.execute(intent)).status,'unknown');assert.deepEqual(statuses,[200]);assert(proofs[0]);
  const recovered=await session.execute(intent);assert.deepEqual(statuses,[200,200]);assert.equal(recovered.status,'confirmed');assert.deepEqual(sent,[body,body]);assert.equal(proofs[1],proofs[0]);
  const metadata=JSON.parse(Buffer.from(proofs[0]!.slice(3),'base64url').toString()) as {payloadSha256:string};assert.equal(metadata.payloadSha256,createHash('sha256').update(canonicalJSON({type:'startProjectWork',...task})).digest('hex'));assert.notEqual(metadata.payloadSha256,createHash('sha256').update(canonicalJSON(task)).digest('hex'));
  assert.equal((await scoped.getProject()).events.filter(event=>event.requestId===task.requestId).length,3);
  const invalid=await fetch(origin+'/api/projects/'+scope.projectId+'/tasks',{method:'POST',headers:{Cookie:cookie,Connection:'close','Content-Type':'application/json','X-Ouro-Expected-Participant':actor.id,'X-Ouro-Expected-Project':scope.projectId},body:JSON.stringify({...task,type:'startProjectWork'})});assert.equal(invalid.status,422);assert.equal(invalid.headers.has('X-Ouro-Command-Receipt'),false);await invalid.arrayBuffer();
 }finally{session?.dispose();await server?.stop();await store.close();await rm(directory,{recursive:true,force:true});}
});
