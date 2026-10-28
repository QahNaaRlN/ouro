import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createParticipantRegistry,assertRegisteredHumanActive,type ParticipantConnection } from '../lib/participant-registry';
import { PROJECT_ID,type Actor } from '../packages/core/src';
const operator:Actor={id:'local-human',kind:'human',name:'Оператор',projectIds:[PROJECT_ID]};
const hasCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;
async function fixture(directory='memory://'){
  const pg=new PGlite(directory);await pg.waitReady;
  await pg.exec(await readFile(path.join(process.cwd(),'db/migrations/001_initial.sql'),'utf8'));
  await pg.exec(await readFile(path.join(process.cwd(),'db/migrations/004_participants.sql'),'utf8'));
  await pg.query('INSERT INTO ouro_projects (id,version) VALUES ($1,0) ON CONFLICT DO NOTHING',[PROJECT_ID]);
  await pg.query('INSERT INTO ouro_principals (id,kind) VALUES ($1,$2) ON CONFLICT DO NOTHING',[operator.id,operator.kind]);
  let tail:Promise<unknown>=Promise.resolve();
  const serialize=<T>(fn:()=>Promise<T>)=>{const p=tail.then(fn,fn);tail=p.catch(()=>{});return p;};
  const db={query:<T=Record<string,unknown>>(sql:string,values?:unknown[])=>pg.query<T>(sql,values),exec:(sql:string)=>pg.exec(sql),transaction:<T>(fn:(tx:ParticipantConnection)=>Promise<T>)=>pg.transaction(tx=>fn({query:<R=Record<string,unknown>>(sql:string,values?:unknown[])=>tx.query<R>(sql,values),exec:(sql:string)=>tx.exec(sql)}))};
  const registry=createParticipantRegistry({db,serialize,lockProject:tx=>tx.query('SELECT version FROM ouro_projects WHERE id=$1 FOR UPDATE',[PROJECT_ID])});
  return {registry,pg,db};
}
test('C01 distinct human credentials reveal once and persist only hashes; metadata and authority are server-derived',async()=>{
  const f=await fixture();try{
    const a=await f.registry.createParticipant('Алиса',operator),b=await f.registry.createParticipant('Борис',operator);
    assert.notEqual(a.participant.id,b.participant.id);assert.notEqual(a.credential,b.credential);
    assert.match(a.credential,/^ouro_human_[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(await f.registry.authenticateParticipantCredential(a.credential),{id:a.participant.id,name:'Алиса',kind:'human',projectIds:[PROJECT_ID]});
    assert.equal((await f.registry.authenticateParticipantCredential(b.credential))?.id,b.participant.id);
    assert.equal(await f.registry.authenticateParticipantCredential(`${a.credential}wrong`),null);
    const rows=await f.pg.query<{credential_hash:string}>('SELECT credential_hash FROM ouro_participant_credentials WHERE participant_id=$1',[a.participant.id]);
    assert.equal(rows.rows[0].credential_hash,createHash('sha256').update(a.credential).digest('hex'));
    const list=await f.registry.listParticipants(operator);assert.equal(list.length,2);
    assert(!JSON.stringify(list).includes(a.credential));assert(!JSON.stringify(list).includes(rows.rows[0].credential_hash));
    const raw=await f.pg.query('SELECT row_to_json(c) FROM ouro_participant_credentials c');assert(!JSON.stringify(raw.rows).includes(a.credential));
    for(const invalid of ['', ' '.repeat(5), 'x'.repeat(121),null])await assert.rejects(f.registry.createParticipant(invalid as string,operator),hasCode('VALIDATION_ERROR'));
  }finally{await f.pg.close();}
});
test('C02 revocation is append-only, rejects captured identities inside writes and survives SQL reopen',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ouro-participants-'));let f:Awaited<ReturnType<typeof fixture>>|undefined;
  try{
    f=await fixture(directory);const created=await f.registry.createParticipant('Участник после перезапуска',operator),captured=(await f.registry.authenticateParticipantCredential(created.credential))!;
    await f.pg.close();f=await fixture(directory);assert.equal((await f.registry.resolveParticipantIdentity(captured.id))?.id,captured.id);
    const revoked=await f.registry.revokeParticipant(captured.id,operator);assert(revoked.revokedAt);
    await assert.rejects(assertRegisteredHumanActive(f.db,captured),hasCode('FORBIDDEN'));
    assert.equal(await f.registry.authenticateParticipantCredential(created.credential),null);assert.equal(await f.registry.resolveParticipantIdentity(captured.id),null);
    assert.equal((await f.registry.revokeParticipant(captured.id,operator)).revokedAt,revoked.revokedAt);
    await assert.rejects(f.pg.query('UPDATE ouro_participant_credentials SET credential_hash=credential_hash'),/append-only/);
    await assert.rejects(f.pg.query('DELETE FROM ouro_participant_revocations'),/append-only/);
    await assert.rejects(f.pg.query('TRUNCATE ouro_participant_registrations CASCADE'),/append-only/);
    await f.pg.close();f=await fixture(directory);assert.equal(await f.registry.authenticateParticipantCredential(created.credential),null);
    assert.equal((await f.registry.listParticipants(operator))[0].revokedAt,revoked.revokedAt);
  }finally{if(f)await f.pg.close();await rm(directory,{recursive:true,force:true});}
});
test('C01 participant registry is scoped and operator-managed; participant and agent roles cannot self-upgrade',async()=>{
  const f=await fixture();try{
    await assert.rejects(f.registry.createParticipant('Чужой проект',{...operator,projectIds:['other']}),hasCode('FORBIDDEN'));
    await assert.rejects(f.registry.createParticipant('Агент',{id:'agent',kind:'agent',projectIds:[PROJECT_ID]}),hasCode('FORBIDDEN'));
    const a=await f.registry.createParticipant('Участник',operator),actor=(await f.registry.authenticateParticipantCredential(a.credential))!;
    await assert.rejects(f.registry.createParticipant('Самостоятельная регистрация',actor),hasCode('FORBIDDEN'));
    await assert.rejects(f.registry.revokeParticipant(actor.id,actor),hasCode('FORBIDDEN'));
    assert.equal((await f.registry.listParticipants(actor)).length,1);
    await f.pg.query('INSERT INTO ouro_principals (id,kind) VALUES ($1,$2)',['known-agent','agent']);
    await assert.rejects(assertRegisteredHumanActive(f.db,{id:'known-agent',kind:'human',projectIds:[PROJECT_ID]}),hasCode('FORBIDDEN'));
    await assert.rejects(f.registry.revokeParticipant('missing',operator),hasCode('NOT_FOUND'));
  }finally{await f.pg.close();}
});
