import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../lib/store';
import { createParticipantHandlers } from '../lib/participant-http';
import { authenticatedParticipant,issueLocalSession } from '../lib/auth';
import { PROJECT_ID,AGENT_ID,type Actor } from '../packages/core/src';
const operator:Actor={id:'local-human',kind:'human',name:'Оператор',projectIds:[PROJECT_ID]};
const req=(path:string,data?:unknown,cookie?:string,base='http://127.0.0.1')=>new Request(base+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
async function fixture(){
  const store=await createStore({dataDir:'memory://'}),old=process.env.OURO_LOCAL_DEMO;process.env.OURO_LOCAL_DEMO='1';
  const authenticate=(request:Request)=>authenticatedParticipant(request,PROJECT_ID,AGENT_ID,id=>store.resolveParticipantIdentity(id));
  const handlers=createParticipantHandlers({getRegistry:async()=>store,authenticateHuman:authenticate});
  const demo=`ouro_session=${issueLocalSession(req('/api/session'))}`;
  return {store,handlers,demo,close:async()=>{await store.close();if(old===undefined)delete process.env.OURO_LOCAL_DEMO;else process.env.OURO_LOCAL_DEMO=old;}};
}
test('C01 login exchanges distinct credentials for HttpOnly sessions and bootstrap preserves participant identity',async()=>{
  const f=await fixture();try{
    const alice=await f.store.createParticipant('Алиса',operator),bob=await f.store.createParticipant('Борис',operator);
    const a=await f.handlers.login(req('/api/participants/session',{credential:alice.credential})),b=await f.handlers.login(req('/api/participants/session',{credential:bob.credential}));
    assert.equal(a.status,200);assert.equal(b.status,200);
    assert.match(a.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200/);
    const ac=a.headers.get('set-cookie')!.split(';')[0],bc=b.headers.get('set-cookie')!.split(';')[0];assert.notEqual(ac,bc);
    const bootstrap=await f.handlers.session(req('/api/session',undefined,`${f.demo}; ${ac}`));
    assert.equal(bootstrap.status,200);assert.equal(bootstrap.headers.get('set-cookie'),null);
    assert.deepEqual((await bootstrap.json()).actor,{id:alice.participant.id,name:'Алиса',kind:'human',projectIds:[PROJECT_ID]});
    assert(!JSON.stringify(await b.json()).includes(bob.credential));
    const invalid=await f.handlers.login(req('/api/participants/session',{credential:alice.credential,actor:operator}));assert.equal(invalid.status,401);
    const broken=await f.handlers.session(req('/api/session',undefined,`${f.demo}; ouro_participant=broken`));assert.equal(broken.status,401);assert.equal(broken.headers.get('set-cookie'),null);
    const list=await f.handlers.list(req('/api/participants',undefined,ac));assert.equal(list.status,200);const metadata=await list.json();assert.equal(metadata.canManageParticipants,false);assert.equal(metadata.participants.length,2);assert(!JSON.stringify(metadata).includes(alice.credential));
    assert.equal((await f.handlers.create(req('/api/participants',{name:'Самоуправление'},ac))).status,403);
    assert.equal((await f.handlers.revoke(req('/api/participants/x/revoke',{},ac),alice.participant.id)).status,403);
  }finally{await f.close();}
});
test('C02 real HTTP registry revocation invalidates cookie and captured store principal without changing history',async()=>{
  const f=await fixture();try{
    const create=await f.handlers.create(req('/api/participants',{name:'Наблюдатель'},f.demo));assert.equal(create.status,201);const created=await create.json();
    const login=await f.handlers.login(req('/api/participants/session',{credential:created.credential})),cookie=login.headers.get('set-cookie')!.split(';')[0],actor=(await login.json()).actor;
    const before=(await f.store.getProject()).version;
    assert.equal((await f.handlers.revoke(req('/api/participants/revoke',{},f.demo),created.participant.id)).status,200);
    assert.equal((await f.handlers.session(req('/api/session',undefined,cookie))).status,401);
    assert.equal((await f.handlers.list(req('/api/participants',undefined,cookie))).status,401);
    assert.equal((await f.handlers.login(req('/api/participants/session',{credential:created.credential}))).status,401);
    await assert.rejects(f.store.executeCommand({type:'createSpec',requestId:crypto.randomUUID(),expectedVersion:before,content:{title:'Не должно сохраниться',goal:'Отозванный principal',dod:[{id:'x',text:'Проверка',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}},actor),(error:unknown)=>(error as {code:string}).code==='FORBIDDEN');
    assert.equal((await f.store.getProject()).version,before);
    const list=await(await f.handlers.list(req('/api/participants',undefined,f.demo))).json();assert(list.participants[0].revokedAt);assert(!JSON.stringify(list).includes(created.credential));
  }finally{await f.close();}
});
test('C01 sessions use Secure on the configured HTTPS origin; logout clears invalid participant and demo cookies',async()=>{
  const f=await fixture(),old=process.env.OURO_PUBLIC_URL;process.env.OURO_PUBLIC_URL='https://ouro.example.com';
  try{
    const created=await f.store.createParticipant('HTTPS участник',operator);
    const login=await f.handlers.login(req('/api/participants/session',{credential:created.credential},undefined,'https://ouro.example.com'));
    assert.equal(login.status,200);assert.match(login.headers.get('set-cookie')!,/; Secure$/);
    const logout=await f.handlers.logout(req('/api/participants/logout',{},'ouro_participant=broken; ouro_session=broken','https://ouro.example.com'));
    assert.equal(logout.status,200);assert.equal(logout.headers.getSetCookie().length,2);assert(logout.headers.getSetCookie().every(cookie=>cookie.includes('Max-Age=0')&&cookie.includes('HttpOnly')));
    const crossOrigin=new Request('http://127.0.0.1/api/participants/session',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.example'},body:JSON.stringify({credential:created.credential})});assert.equal((await f.handlers.login(crossOrigin)).status,403);
  }finally{await f.close();if(old===undefined)delete process.env.OURO_PUBLIC_URL;else process.env.OURO_PUBLIC_URL=old;}
});
test('C02 captured participant cannot replay a receipt or manage agents after in-transaction revocation',async()=>{
  const f=await fixture();try{
    const created=await f.store.createParticipant('Автор до отзыва',operator),actor=(await f.store.authenticateParticipantCredential(created.credential))!;
    const body={type:'createSpec',requestId:crypto.randomUUID(),expectedVersion:(await f.store.getProject()).version,content:{title:'Прежний факт',goal:'Сохранить автора, отозвать полномочия',dod:[{id:'proof',text:'Автор сохранён',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}};
    const receipt=await f.store.executeCommand(body,actor);assert.equal(receipt.events[0].actor.id,actor.id);
    await f.store.revokeParticipant(actor.id,operator);
    const denied=(error:unknown)=>(error as {code:string}).code==='FORBIDDEN';
    await assert.rejects(f.store.executeCommand(body,actor),denied);
    await assert.rejects(f.store.createAgent('Не выдавать доступ',actor),denied);await assert.rejects(f.store.listAgents(actor),denied);
    assert.equal((await f.store.getProject()).version,receipt.cursor);
  }finally{await f.close();}
});
