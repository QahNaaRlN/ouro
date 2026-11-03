import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {createStore} from '../lib/store';
import {PROJECT_ID,type Actor} from '../packages/core/src';

test('fresh default, selected and folder project metadata survives reopen without changing history or existing values',async()=>{
 const parent=path.resolve(process.cwd(),'.ouro');await mkdir(parent,{recursive:true});
 const directory=await mkdtemp(path.join(parent,'metadata-reopen-')),dataDir=path.join(directory,'postgres'),rootPath=path.join(directory,'workspace');
 await mkdir(rootPath);let store:Awaited<ReturnType<typeof createStore>>|undefined;
 try{
  store=await createStore({dataDir,projectId:'metadata-selected-project',seedEvents:[]});
  const actor:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
  const folder=(await store.createWorkspaceProject({requestId:'metadata-create-folder',rootPath,name:'Named workspace'},actor)).project;
  // A previously populated value is not a request to invent a newer name/date.
  await store.inspect("UPDATE ouro_projects SET name='Existing title',slug='existing-slug',created_at='2000-01-01T00:00:00Z' WHERE id=$1",[PROJECT_ID]);
  const sql='SELECT id,name,slug,created_at,created_by FROM ouro_projects ORDER BY id';
  const before=(await store.inspect(sql)).rows;
  const events=(await store.inspect('SELECT event FROM ouro_domain_events ORDER BY project_id,version')).rows;
  await store.close();store=await createStore({dataDir,projectId:'metadata-selected-project',seedEvents:[]});
  assert.deepEqual((await store.inspect(sql)).rows,before);
  assert.deepEqual((await store.inspect('SELECT event FROM ouro_domain_events ORDER BY project_id,version')).rows,events);
  assert.equal((await store.getWorkspaceProject(folder.id))?.name,'Named workspace');
 }finally{if(store)await store.close();assert.equal(path.dirname(directory),parent);assert(path.basename(directory).startsWith('metadata-reopen-'));await rm(directory,{recursive:true,force:true});}
});
