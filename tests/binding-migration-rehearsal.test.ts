import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStore} from '../lib/store';
import {prepareUpgrade,tableFingerprints,assertUpgradePreserved} from './migration-upgrade-fixture';

for(const version of [9,11] as const)test(`file-backed ${version}→12 preserves every existing table, metadata, replay and exact receipts`,async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ouro-binding-upgrade-')),legacy=new PGlite(directory);let store:Awaited<ReturnType<typeof createStore>>|undefined;
 try{
  await legacy.waitReady;const historical=await prepareUpgrade((sql,values)=>legacy.query(sql,values),version,sql=>legacy.exec(sql)),before=await tableFingerprints((sql,values)=>legacy.query(sql,values));await legacy.close();
  store=await createStore({dataDir:directory,seedEvents:[]});
  const after=await assertUpgradePreserved((sql,values)=>store!.inspect(sql,values),before);
  assert.deepEqual(await store.getProject(),historical.state);
  assert.deepEqual(await store.executeCommand(historical.command,historical.actor),{...historical.response,replayed:true});
  assert.deepEqual(await tableFingerprints((sql,values)=>store!.inspect(sql,values)),after);
  await store.close();store=await createStore({dataDir:directory,seedEvents:[]});
  assert.deepEqual(await tableFingerprints((sql,values)=>store!.inspect(sql,values)),after);
  assert.deepEqual(await store.getProject(),historical.state);
 }finally{if(store)await store.close();else await legacy.close();await rm(directory,{recursive:true,force:true});}
});
