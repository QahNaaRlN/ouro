import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {createStore} from '../lib/store';
import {PROJECT_ID,type Actor,type Command} from '../packages/core/src';
import {fixture,report} from './verification-fixture';
import {prepareUpgrade,tableFingerprints,assertUpgradePreserved} from './migration-upgrade-fixture';
const databaseUrl=process.env.OURO_TEST_DATABASE_URL,emptyDatabaseUrl=process.env.OURO_TEST_EMPTY_DATABASE_URL,adminDatabaseUrl=process.env.OURO_TEST_ADMIN_DATABASE_URL;
const enabled=!!databaseUrl&&!!emptyDatabaseUrl&&!!adminDatabaseUrl&&process.env.OURO_TEST_DB_CONFIRM==='DEDICATED_DISPOSABLE_DATABASES';
const skip=enabled?false:'Real PostgreSQL qualification requires dedicated disposable database URLs and explicit confirmation.';
const human:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
const content={title:'PostgreSQL qualification',goal:'Prove real durable store behaviour.',dod:[{id:'durable',text:'Preserved after reopen',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
const body=(expectedVersion:number,requestId:string):Command=>({type:'createSpec',requestId,expectedVersion,content});
const code=(expected:string)=>(e:unknown)=>(e as {code?:string}).code===expected;

for(const version of [9,11] as const)test(`real PostgreSQL ${version}→12 preserves all old rows, metadata, replay and exact receipts`,{skip},async()=>{
 const suffix=randomBytes(6).toString('hex'),name=`ouro_upgrade_${version}_${suffix}`,url=new URL(databaseUrl!);url.pathname='/'+name;
 const admin=new Pool({connectionString:adminDatabaseUrl}),pool=new Pool({connectionString:url.href});let created=false,store:Awaited<ReturnType<typeof createStore>>|undefined;
 try{
  await admin.query(`CREATE DATABASE "${name}" OWNER ouro`);created=true;
  const query=(sql:string,values?:unknown[])=>pool.query(sql,values);
  const historical=await prepareUpgrade(query,version),before=await tableFingerprints(query);
  store=await createStore({databaseUrl:url.href,seedEvents:[]});
  const after=await assertUpgradePreserved(query,before);
  assert.deepEqual(await store.getProject(),historical.state);
  assert.deepEqual(await store.executeCommand(historical.command,historical.actor),{...historical.response,replayed:true});
  assert.deepEqual(await tableFingerprints(query),after,'Exact replay must not change any historical row.');
  await store.close();store=await createStore({databaseUrl:url.href,seedEvents:[]});
  assert.deepEqual(await store.getProject(),historical.state);assert.deepEqual(await tableFingerprints(query),after);
 }finally{if(store)await store.close();await pool.end();if(created){assert(/^ouro_upgrade_(?:9|11)_[a-f0-9]{12}$/.test(name));await admin.query(`DROP DATABASE "${name}"`);}await admin.end();}
});

test('real PostgreSQL application role cannot administer the cluster and owns only its dedicated database',{skip},async()=>{
 const pool=new Pool({connectionString:databaseUrl});
 try{
  const role=(await pool.query('SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  assert.deepEqual(role,{name:'ouro',rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false});
  const ownership=(await pool.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()')).rows[0];assert.equal(ownership.owner,'ouro');
  await assert.rejects(pool.query('CREATE DATABASE ouro_app_must_not_create'),(e:unknown)=>(e as {code?:string}).code==='42501');
  await assert.rejects(pool.query('CREATE ROLE ouro_app_must_not_grant SUPERUSER'),(e:unknown)=>(e as {code?:string}).code==='42501');
 }finally{await pool.end()}
});

test('real PostgreSQL applies 001–012, enforces immutable history and command receipts across reopen',{skip},async()=>{
 let store=await createStore({databaseUrl,seedEvents:[]});
 try{
  assert.deepEqual((await store.inspect<{version:number}>('SELECT version FROM ouro_schema_migrations ORDER BY version')).rows.map(r=>r.version),Array.from({length:12},(_,i)=>i+1));
  const start=await store.getProject(),command=body(start.version,'hosted-pg-receipt'),first=await store.executeCommand(command,human);
  await assert.rejects(store.executeCommand({...command,content:{...content,title:'Different'}},human),code('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(store.executeCommand(body(start.version,'hosted-pg-stale'),human),code('VERSION_CONFLICT'));
  for(const sql of ['UPDATE ouro_domain_events SET event_type=event_type','DELETE FROM ouro_domain_events','TRUNCATE ouro_spec_revisions CASCADE','TRUNCATE ouro_verification_runs','TRUNCATE ouro_workspace_binding_recoveries','TRUNCATE ouro_workspace_binding_recovery_receipts'])await assert.rejects(store.inspect(sql),/append-only/);
  await store.close();store=await createStore({databaseUrl,seedEvents:[]});
  assert.deepEqual(await store.getProject(),first.state);const retry=await store.executeCommand(command,human);assert.equal(retry.replayed,true);assert.deepEqual(retry.events,first.events);
 }finally{await store.close();}
});
test('real PostgreSQL concurrent stores arbitrate one CAS winner and initialize one complete journal',{skip},async()=>{
 const stores=await Promise.all([createStore({databaseUrl:emptyDatabaseUrl}),createStore({databaseUrl:emptyDatabaseUrl})]);
 try{
  const [a,b]=await Promise.all(stores.map(s=>s.getProject()));assert.deepEqual(a,b);assert(a.version>0);
  const results=await Promise.allSettled(stores.map((s,i)=>s.executeCommand(body(a.version,'hosted-concurrent-'+i),human)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert(results.some(r=>r.status==='rejected'&&code('VERSION_CONFLICT')(r.reason)));
  assert.deepEqual(await stores[0].getProject(),await stores[1].getProject());
 }finally{await Promise.all(stores.map(s=>s.close()));}
});
test('real PostgreSQL account project scope, revocation and failed transaction preserve history',{skip},async()=>{
 const store=await createStore({databaseUrl,seedEvents:[]});
 try{
  const password='test-only qualification password';
  const a=(await store.createAccount({email:'pg-a@example.invalid',name:'A',password},human)).account,b=(await store.createAccount({email:'pg-b@example.invalid',name:'B',password},human)).account;
  const actorA:Actor={id:a.id,kind:'human',projectIds:[]},actorB:Actor={id:b.id,kind:'human',projectIds:[]};
  const project=await store.createProject({name:'Closed qualification'},actorA);actorA.projectIds=[project.id];actorB.projectIds=[project.id];
  assert.deepEqual((await store.listProjects(actorB)),[]);
  const scoped=await store.forProject(project.id);await assert.rejects(scoped.getProject(project.id,actorB),code('FORBIDDEN'));
  const before=await scoped.getProject();await assert.rejects(scoped.executeCommand(body(before.version,'cross-account-denied'),actorB),code('FORBIDDEN'));assert.deepEqual(await scoped.getProject(),before);
  const login=await store.authenticate(a.email,password);assert(login);await store.disableAccount(a.id,human);assert.equal(await store.resolveSession(login.token),null);
  await assert.rejects(scoped.executeCommand(body(before.version,'revoked-account-denied'),actorA),code('FORBIDDEN'));
 }finally{await store.close();}
 const pool=new Pool({connectionString:databaseUrl});try{assert.equal((await pool.query("SELECT count(*) FROM ouro_command_receipts WHERE request_id IN ('cross-account-denied','revoked-account-denied')")).rows[0].count,'0');}finally{await pool.end();}
});
test('real PostgreSQL custom-format backup restores all table rows, replay and exact receipts',{skip:skip||(!process.env.OURO_TEST_PG_CONTAINER&&'Set owned disposable PostgreSQL container for real pg_dump/pg_restore.')},async()=>{
 const container=process.env.OURO_TEST_PG_CONTAINER!;
 assert(/^(?:ouro-cloud-qualification-[a-z0-9-]+|[a-f0-9]{12,64})$/.test(container),'Only explicit qualification container or CI service ID is admitted.');
 const suffix=randomBytes(6).toString('hex'),sourceName='ouro_backup_source_'+suffix,restoreName='ouro_backup_restore_'+suffix;
 const url=(name:string)=>{const u=new URL(databaseUrl!);u.pathname='/'+name;return u.href;};
 const admin=new Pool({connectionString:adminDatabaseUrl});const created:string[]=[];
 const execute=promisify(execFile);
 let command:Command,expected:Awaited<ReturnType<Awaited<ReturnType<typeof createStore>>['getProject']>>;
 try{
  for(const name of [sourceName,restoreName]){await admin.query(`CREATE DATABASE "${name}" OWNER ouro`);created.push(name);}
  const verification=fixture();verification.current();verification.importRun(report());verification.review('usable');
  const source=await createStore({databaseUrl:url(sourceName),seedEvents:verification.state.events});
  try{command=body((await source.getProject()).version,'backup-durable-'+suffix);expected=(await source.executeCommand(command,human)).state;assert.equal((await source.inspect<{count:string}>('SELECT count(*) FROM ouro_verification_runs')).rows[0].count,'1');}finally{await source.close();}
  const dump=await execute('docker',['exec',container,'pg_dump','-U','ouro_admin','-d',sourceName,'--format=custom','--no-owner','--no-privileges'],{encoding:'buffer',maxBuffer:64*1024*1024});
  assert.equal(dump.stdout.subarray(0,5).toString(),'PGDMP');
  await new Promise<void>((resolve,reject)=>{
   const child=spawn('docker',['exec','-i',container,'pg_restore','-U','ouro_admin','--role=ouro','-d',restoreName,'--no-owner','--no-privileges','--exit-on-error'],{stdio:['pipe','ignore','pipe']});
   let error='';child.stderr.on('data',data=>{error+=String(data);});child.once('error',reject);child.stdin.on('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('Isolated pg_restore failed: '+error)));child.stdin.end(dump.stdout);
  });
  const restored=await createStore({databaseUrl:url(restoreName),seedEvents:[]});
  try{assert.deepEqual(await restored.getProject(),expected!);assert.equal((await restored.executeCommand(command!,human)).replayed,true);}finally{await restored.close();}
  const readers=[new Pool({connectionString:url(sourceName)}),new Pool({connectionString:url(restoreName)})];
  try{
   const tables=(await readers[0].query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows;
   assert.equal(tables.length,45);
   for(const {table_name}of tables){assert(/^ouro_[a-z_]+$/.test(table_name));const rows=await Promise.all(readers.map(async p=>(await p.query(`SELECT to_jsonb(t) AS row FROM "${table_name}" t`)).rows.map(r=>JSON.stringify(r.row)).sort()));assert.deepEqual(rows[0],rows[1],table_name);}
  }finally{await Promise.all(readers.map(p=>p.end()));}
 }finally{
  for(const name of created.reverse()){assert(/^ouro_backup_(?:source|restore)_[a-f0-9]{12}$/.test(name));await admin.query(`DROP DATABASE "${name}"`);}
  await admin.end();
 }
});
