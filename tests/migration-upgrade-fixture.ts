import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {canonicalJSON} from '../lib/store';
import {PROJECT_ID,createSeedEvents,replay,type Command} from '../packages/core/src';
import {fixture,report} from './verification-fixture';

export type UpgradeQuery=(sql:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;
const hash=(value:unknown)=>createHash('sha256').update(canonicalJSON(value)).digest('hex');

/** Historical SQL and persisted facts, never a downgraded current database. */
export async function prepareUpgrade(query:UpgradeQuery,version:9|11,exec:(sql:string)=>Promise<unknown>=sql=>query(sql)){
 const migrations=(await readdir('db/migrations')).filter(name=>/^\d{3}_.*\.sql$/.test(name)&&Number(name.slice(0,3))<=version).sort();
 assert.equal(migrations.length,version);
 for(const file of migrations)await exec(await readFile(path.join('db/migrations',file),'utf8'));
 const verification=fixture();verification.current();verification.importRun(report());verification.review('usable');
 // Historical storage contains JSON, not JavaScript-only undefined properties.
 const events=JSON.parse(JSON.stringify(version===9?createSeedEvents():verification.state.events)) as typeof verification.state.events;
 const state=JSON.parse(JSON.stringify(replay(events,PROJECT_ID))) as typeof verification.state,actor=events[0].actor;
 await query("INSERT INTO ouro_projects(id,version,name,slug,created_at) VALUES($1,$2,'Preserved historical project','preserved-slug','2001-02-03T00:00:00Z')",[PROJECT_ID,state.version]);
 await query("INSERT INTO ouro_workspace_projects(id,name,kind,created_by) VALUES($1,'Preserved catalog title','demo','ouro-bootstrap')",[PROJECT_ID]);
 for(const principal of new Map(events.map(event=>[event.actor.id,event.actor])).values())await query('INSERT INTO ouro_principals(id,kind) VALUES($1,$2)',[principal.id,principal.kind]);
 for(const spec of state.specs)await query('INSERT INTO ouro_specs(id,project_id,human_id) VALUES($1,$2,$3)',[spec.id,PROJECT_ID,spec.humanId]);
 for(const revision of state.revisions)await query('INSERT INTO ouro_spec_revisions(id,spec_id,revision,content,content_hash) VALUES($1,$2,$3,$4::jsonb,$5)',[revision.id,revision.specId,revision.revision,JSON.stringify(revision),hash(revision)]);
 for(const event of events){
  await query('INSERT INTO ouro_domain_events(id,project_id,version,event_type,schema_version,actor_id,occurred_at,event) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[event.id,PROJECT_ID,event.version,event.type,event.schemaVersion,event.actor.id,event.occurredAt,JSON.stringify(event)]);
  await query('INSERT INTO ouro_outbox(event_id,project_id,cursor) VALUES($1,$2,$3)',[event.id,PROJECT_ID,event.version]);
 }
 for(const run of state.verificationRuns){
  const event=events.find(event=>event.type==='VerificationRunRecorded'&&(event.payload.run as {id:string}).id===run.id)!;
  await query('INSERT INTO ouro_verification_runs(id,project_id,event_id,verification_revision_id,target_revision_id,content,content_hash) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)',[run.id,PROJECT_ID,event.id,run.verificationRevisionId,run.targetRevisionId,JSON.stringify(run),hash(run)]);
 }
 const command:Command={type:'createSpec',requestId:`historical-${version}-exact-receipt`,expectedVersion:state.version,content:state.revisions[0]},response={state,events:[],cursor:state.version};
 await query('INSERT INTO ouro_command_receipts(actor_id,project_id,request_id,payload_hash,response,cursor) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[actor.id,PROJECT_ID,command.requestId,hash(command),JSON.stringify(response),state.version]);
 if(version===11)await query("INSERT INTO ouro_verification_runner_requests(project_id,actor_id,request_id,payload_hash,request,status,response,finished_at) VALUES($1,$2,'historical-runtime-receipt',$3,$4::jsonb,'completed',$5::jsonb,'2001-02-03T00:00:00Z')",[PROJECT_ID,actor.id,hash(command),JSON.stringify(command),JSON.stringify({...response,replayed:false})]);
 return {state,actor,command,response};
}

export async function tableFingerprints(query:UpgradeQuery){
 const tables=await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"),result=[];
 for(const table of tables.rows){
  const name=String(table.table_name);assert(/^ouro_[a-z_]+$/.test(name));
  const rows=(await query(`SELECT to_jsonb(t) AS row FROM "${name}" t`)).rows.map(row=>canonicalJSON(row.row)).sort();
  result.push({table:name,count:rows.length,sha256:hash(rows)});
 }
 return result;
}

export async function assertUpgradePreserved(query:UpgradeQuery,before:Awaited<ReturnType<typeof tableFingerprints>>){
 const after=await tableFingerprints(query);assert.equal(after.length,45);
 for(const previous of before)if(previous.table!=='ouro_schema_migrations')assert.deepEqual(after.find(row=>row.table===previous.table),previous,previous.table);
 assert.deepEqual((await query('SELECT version FROM ouro_schema_migrations ORDER BY version')).rows.map(row=>row.version),Array.from({length:12},(_,i)=>i+1));
 for(const table of ['ouro_workspace_binding_recoveries','ouro_workspace_binding_recovery_receipts'])assert.equal(after.find(row=>row.table===table)?.count,0);
 return after;
}
