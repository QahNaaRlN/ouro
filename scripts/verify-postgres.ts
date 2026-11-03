import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createStore,canonicalJSON} from '../lib/store';
import {Pool} from 'pg';
async function main(){
const databaseUrl=process.env.OURO_VERIFY_DATABASE_URL;
if(!databaseUrl)throw new Error('OURO_VERIFY_DATABASE_URL is required; DATABASE_URL is never used implicitly.');
const preflight=new Pool({connectionString:databaseUrl,connectionTimeoutMillis:5000});
try{
 const role=(await preflight.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
 assert(role&&!role.rolsuper&&!role.rolcreatedb&&!role.rolcreaterole&&!role.rolreplication&&!role.rolbypassrls,'Verifier must use the bounded application role.');
 const rows=await preflight.query('SELECT version FROM ouro_schema_migrations ORDER BY version');
 assert.deepEqual(rows.rows.map(r=>r.version),Array.from({length:12},(_,i)=>i+1),'Verifier refuses to migrate an unknown/older schema.');
}finally{await preflight.end();}
const store=await createStore({databaseUrl,seedEvents:[]});
try{
 const migrations=await store.inspect<{version:number}>('SELECT version FROM ouro_schema_migrations ORDER BY version');
 assert.deepEqual(migrations.rows.map(r=>r.version),Array.from({length:12},(_,i)=>i+1));
 const projects=(await store.inspect<{id:string;version:string}>('SELECT id,version FROM ouro_projects ORDER BY id')).rows;
 const summaries=[];
 for(const project of projects){
  const scoped=await store.forProject(project.id),state=await scoped.getProject(),events=await scoped.getEvents(0);
  assert.equal(state.version,Number(project.version));assert.equal(events.events.length,state.version);assert.deepEqual(events.events,state.events);
  summaries.push({id:project.id,cursor:state.version,stateHash:createHash('sha256').update(canonicalJSON(state)).digest('hex')});
 }
 const tables=(await store.inspect<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows;
 assert.equal(tables.length,45,'Expected the complete 12-migration table catalog.');
 const rows=[];
 for(const {table_name}of tables){
  if(!/^ouro_[a-z_]+$/.test(table_name))throw new Error('Unexpected public table in dedicated Ouro database.');
  const data=(await store.inspect<{row:unknown}>(`SELECT to_jsonb(t) AS row FROM "${table_name}" t`)).rows.map(r=>canonicalJSON(r.row)).sort();
  rows.push({table:table_name,count:data.length,sha256:createHash('sha256').update(canonicalJSON(data)).digest('hex')});
 }
 // Only aggregate fingerprints, never raw state, credentials or account details.
 console.log(JSON.stringify({ok:true,migrations:12,projects:summaries.length,events:summaries.reduce((n,p)=>n+p.cursor,0),stateFingerprint:createHash('sha256').update(canonicalJSON(summaries)).digest('hex'),rows}));
}finally{await store.close();}
}
void main().catch(()=>{console.error('PostgreSQL verification failed; no raw database records or connection settings were printed.');process.exitCode=1;});
