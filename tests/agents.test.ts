import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../lib/store';
import { AGENT_ID, PROJECT_ID } from '../packages/core/src';
import type { Actor } from '../packages/core/src';
import { PGlite } from '@electric-sql/pglite';
import { createSeedEvents } from '../packages/core/src';

const human:Actor={id:'registry-human',kind:'human',name:'Человек',projectIds:[PROJECT_ID]};
const agent:Actor={id:'registry-impostor',kind:'agent',projectIds:[PROJECT_ID]};
const hasCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;

test('AC01: independent per-agent credentials persist hashes only and public metadata contains no secrets',async()=>{
  const store=await createStore({dataDir:'memory://'});
  try {
    const a=await store.createAgent('Claude Code',human);
    const b=await store.createAgent('Cursor',human);
    assert.notEqual(a.agent.id,b.agent.id);assert.notEqual(a.token,b.token);
    assert.match(a.token,/^ouro_agent_[A-Za-z0-9_-]{43}$/);
    const metadata=await store.listAgents(human);
    assert.equal(metadata.length,2);assert.equal(metadata[0].name,'Claude Code');
    assert.equal(metadata[0].projectId,PROJECT_ID);
    const hash=createHash('sha256').update(a.token).digest('hex');
    const persisted=await store.inspect<{token_hash:string}>('SELECT token_hash FROM ouro_agent_credentials WHERE agent_id=$1',[a.agent.id]);
    assert.equal(persisted.rows[0].token_hash,hash);
    assert(!JSON.stringify(metadata).includes(a.token));assert(!JSON.stringify(metadata).includes(hash));
    const raw=await store.inspect<{row:unknown}>(`SELECT row_to_json(t) AS row FROM ouro_agent_credentials t`);
    assert(!JSON.stringify(raw.rows).includes(a.token));
    assert.deepEqual(Object.keys(persisted.rows[0]),['token_hash']);
    const auth=await store.authenticateAgentToken(a.token);
    assert.deepEqual(auth,{id:a.agent.id,kind:'agent',name:'Claude Code',projectIds:[PROJECT_ID]});
    const presence=(await store.listAgents(human)).find(x=>x.id===a.agent.id)!;
    assert(presence.lastSeenAt);assert.equal(presence.revokedAt,null);
    assert.equal(await store.authenticateAgentToken(`${a.token}wrong`),null);
    assert.equal(await store.authenticateAgentToken(''),null);
  } finally {await store.close();}
});

test('AC02: revocation is append-only, immediate and durable across database reopen',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ouro-agent-registry-'));
  let store:Awaited<ReturnType<typeof createStore>>|undefined;
  try {
    store=await createStore({dataDir:directory});
    const created=await store.createAgent('Агент после перезапуска',human);
    await store.close();store=await createStore({dataDir:directory});
    assert.equal((await store.authenticateAgentToken(created.token))?.id,created.agent.id);
    const revoked=await store.revokeAgent(created.agent.id,human);assert(revoked.revokedAt);
    assert.equal(await store.authenticateAgentToken(created.token),null);
    const repeated=await store.revokeAgent(created.agent.id,human);
    assert.equal(repeated.revokedAt,revoked.revokedAt);
    await assert.rejects(store.inspect('UPDATE ouro_agent_credentials SET token_hash=token_hash'),/append-only/);
    await assert.rejects(store.inspect('DELETE FROM ouro_agent_revocations'),/append-only/);
    await assert.rejects(store.inspect('TRUNCATE ouro_agent_registrations CASCADE'),/append-only/);
    await store.close();store=await createStore({dataDir:directory});
    assert.equal(await store.authenticateAgentToken(created.token),null);
    assert.equal((await store.listAgents(human))[0].revokedAt,revoked.revokedAt);
  } finally {if(store)await store.close();await rm(directory,{recursive:true,force:true});}
});

test('AC05: only a scoped human can create, list or revoke agents and actor kind cannot be upgraded',async()=>{
  const store=await createStore({dataDir:'memory://'});
  try {
    await assert.rejects(store.createAgent('Self registration',agent),hasCode('FORBIDDEN'));
    await assert.rejects(store.listAgents(agent),hasCode('FORBIDDEN'));
    await assert.rejects(store.createAgent('Foreign scope',{...human,projectIds:['foreign']}),hasCode('FORBIDDEN'));
    const created=await store.createAgent('human-looking agent name',human);
    const authenticated=(await store.authenticateAgentToken(created.token))!;
    assert.equal(authenticated.kind,'agent');
    await assert.rejects(store.revokeAgent(created.agent.id,authenticated),hasCode('FORBIDDEN'));
    await assert.rejects(store.createAgent('Escalate',{...authenticated,kind:'human'}),hasCode('FORBIDDEN'));
    await assert.rejects(store.listAgents({...authenticated,kind:'human'}),hasCode('FORBIDDEN'));
    assert.equal((await store.listAgents(human)).length,1);
  } finally {await store.close();}
});

test('registration validates bounded names without leaking SQL errors; concurrent creation keeps unique identities',async()=>{
  const store=await createStore({dataDir:'memory://'});
  try {
    for(const name of ['', '   ', 'x'.repeat(121),null,{}]){
      await assert.rejects(store.createAgent(name as string,human),hasCode('VALIDATION_ERROR'));
    }
    const results=await Promise.all(Array.from({length:4},(_,i)=>store.createAgent(`Agent ${i}`,human)));
    assert.equal(new Set(results.map(x=>x.agent.id)).size,4);
    assert.equal(new Set(results.map(x=>x.token)).size,4);
    assert.equal((await store.listAgents(human)).length,4);
    await assert.rejects(store.revokeAgent('missing-id',human),hasCode('NOT_FOUND'));
  } finally {await store.close();}
});

test('migration upgrades an existing 001 database without replacing its committed history',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ouro-agent-upgrade-'));
  let store:Awaited<ReturnType<typeof createStore>>|undefined;
  const first=createSeedEvents()[0];
  try {
    const old=new PGlite(directory);await old.waitReady;
    await old.exec(await readFile(path.join(process.cwd(),'db/migrations/001_initial.sql'),'utf8'));
    await old.query('INSERT INTO ouro_projects (id,version) VALUES ($1,1)',[PROJECT_ID]);
    await old.query('INSERT INTO ouro_principals (id,kind) VALUES ($1,$2)',[first.actor.id,first.actor.kind]);
    await old.query(`INSERT INTO ouro_domain_events (id,project_id,version,event_type,schema_version,actor_id,occurred_at,event)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[first.id,first.projectId,first.version,first.type,first.schemaVersion,first.actor.id,first.occurredAt,JSON.stringify(first)]);
    await old.close();
    store=await createStore({dataDir:directory});
    const state=await store.getProject();assert.equal(state.version,1);assert.deepEqual(state.events,[first]);
    const created=await store.createAgent('После обновления',human);
    assert.equal((await store.authenticateAgentToken(created.token))?.id,created.agent.id);
    assert.deepEqual((await store.getProject()).events,[first]);
    const versions=await store.inspect<{version:number}>('SELECT version FROM ouro_schema_migrations ORDER BY version');
    assert.deepEqual(versions.rows.map(row=>row.version),[1,2,3,4,5,6]);
  }finally {if(store)await store.close();await rm(directory,{recursive:true,force:true});}
});

test('revoked registered identity cannot write through a previously captured authenticated actor',async()=>{
  const store=await createStore({dataDir:'memory://'});
  try {
    const created=await store.createAgent('Работающий агент',human);
    const authenticated=(await store.authenticateAgentToken(created.token))!;
    let state=await store.getProject();
    const available=state.specs.find(s=>s.humanId==='OURO-S-000005')!;
    const started=await store.executeCommand({type:'startExecution',specId:available.id,specRevisionId:available.activeRevisionId,agentId:created.agent.id,requestId:'registry-race-start',expectedVersion:state.version},human);
    const execution=started.state.executions.at(-1)!;
    await store.revokeAgent(created.agent.id,human);
    state=await store.getProject();
    await assert.rejects(store.executeCommand({type:'confirmResumed',executionId:execution.id,requestId:'registry-race-ack',expectedVersion:state.version},authenticated),hasCode('FORBIDDEN'));
    assert.equal((await store.getProject()).version,state.version);
  } finally {await store.close();}
});

test('assignment accepts the explicit simulator or an active registration, and rejects unknown/revoked identities',async()=>{
  const store=await createStore({dataDir:'memory://'});
  try {
    let state=await store.getProject();
    const available=state.specs.find(s=>s.humanId==='OURO-S-000005')!;
    const assign=(agentId:string)=>({type:'startExecution',specId:available.id,specRevisionId:available.activeRevisionId,agentId,requestId:`assign-${agentId}`,expectedVersion:state.version});
    await assert.rejects(store.executeCommand(assign('unregistered-agent'),human),hasCode('FORBIDDEN'));
    const revoked=await store.createAgent('Отозван до назначения',human);await store.revokeAgent(revoked.agent.id,human);
    await assert.rejects(store.executeCommand(assign(revoked.agent.id),human),hasCode('FORBIDDEN'));
    assert.equal((await store.getProject()).version,state.version);
    const active=await store.createAgent('Разрешённый агент',human);
    state=(await store.executeCommand(assign(active.agent.id),human)).state;
    assert.equal(state.executions.at(-1)?.agentId,active.agent.id);
  } finally {await store.close();}
  const legacy=await createStore({dataDir:'memory://'});
  try {
    const state=await legacy.getProject(),available=state.specs.find(s=>s.humanId==='OURO-S-000005')!;
    const result=await legacy.executeCommand({type:'startExecution',specId:available.id,specRevisionId:available.activeRevisionId,agentId:AGENT_ID,requestId:'assign-simulator-explicit',expectedVersion:state.version},human);
    assert.equal(result.state.executions.at(-1)?.agentId,AGENT_ID);
  }finally {await legacy.close();}
});

test('remediation assignment also rejects unknown or revoked registrations before creating work',async()=>{
  const store=await createStore({dataDir:'memory://'});
  try {
    let state=await store.getProject();const blocker=state.requests.find(r=>r.kind==='Blocker')!;
    state=(await store.executeCommand({type:'resolveDecision',decisionRequestId:blocker.id,specRevisionId:blocker.specRevisionId,outcome:{kind:'approve',chosenOptionId:blocker.options[0].id},requestId:'remediation-plan-choice',expectedVersion:state.version},human)).state;
    const assign=(agentId:string)=>({type:'authorizeRemediation',decisionRequestId:blocker.id,agentId,requestId:`remediation-${agentId}`,expectedVersion:state.version});
    await assert.rejects(store.executeCommand(assign('unknown-remediator'),human),hasCode('FORBIDDEN'));
    const revoked=await store.createAgent('Отозванный помощник',human);await store.revokeAgent(revoked.agent.id,human);
    await assert.rejects(store.executeCommand(assign(revoked.agent.id),human),hasCode('FORBIDDEN'));
    assert.equal((await store.getProject()).version,state.version);
    const active=await store.createAgent('Действующий помощник',human);
    state=(await store.executeCommand(assign(active.agent.id),human)).state;
    assert.equal(state.executions.at(-1)?.agentId,active.agent.id);assert.equal(state.executions.at(-1)?.kind,'remediation');
  }finally {await store.close();}
});
