import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as Y from 'yjs';
import { createStore } from '../lib/store';
import { PROJECT_ID, type Actor, type RevisionContent } from '../packages/core/src';

const alice:Actor={id:'collab-test-alice',kind:'human',projectIds:[PROJECT_ID]},bob:Actor={id:'collab-test-bob',kind:'human',projectIds:[PROJECT_ID]};
const content:RevisionContent={title:'Исходное ожидание',goal:'Согласовать точное ожидание вместе.',dod:[{id:'c1',text:'Ожидание проверяемо',required:true}],constraints:'Ограничение',assumptions:'',risks:'',inputs:'',comment:'',flow:{entryNodeId:'work',nodes:[{id:'work',kind:'action',title:'Работа',description:'',owner:'agent'},{id:'end',kind:'result',title:'Проверка',description:'',owner:'human'}],edges:[{id:'e1',source:'work',target:'end',label:''}]}};
const encode=(bytes:Uint8Array)=>Buffer.from(bytes).toString('base64');
function docFrom(base64:string){const doc=new Y.Doc({gc:false});Y.applyUpdate(doc,Buffer.from(base64,'base64'));return doc;}
function edit(doc:Y.Doc,action:()=>void){const before=Y.encodeStateVector(doc);doc.transact(action);return encode(Y.encodeStateAsUpdate(doc,before));}

async function fixture(dataDir='memory://'){
  const store=await createStore({dataDir,seedEvents:[]});
  const created=await store.executeCommand({type:'createSpec',content,requestId:randomUUID(),expectedVersion:0},alice);
  const spec=created.state.specs[0],revision=created.state.revisions[0];
  const createInput={specId:spec.id,baseRevisionId:revision.id,requestId:randomUUID(),expectedVersion:created.cursor};
  // Initially RED: this authorized operation does not exist before the package.
  let draft:Awaited<ReturnType<typeof store.createCollaborativeDraft>>;
  try{draft=await store.createCollaborativeDraft(createInput,alice);}catch(error){await store.close();throw error;}
  return {store,spec,revision,draft,createInput};
}
const update=(draftId:string,updateBase64:string,clientId='test-client')=>({draftId,updateId:randomUUID(),clientId,updateBase64});
const publish=(draft:Awaited<ReturnType<typeof fixture>>['draft'],expectedVersion:number)=>({draftId:draft.id,requestId:randomUUID(),expectedVersion,draftVersion:draft.version,contentHash:draft.contentHash,baseLatestRevisionId:draft.baseRevisionId});

test('C03: two actual Y.Docs merge text and DoD while project cursor and immutable revision stay unchanged',async()=>{
  const f=await fixture();try{
    const first=docFrom(f.draft.stateUpdate),second=docFrom(f.draft.stateUpdate);
    const a=edit(first,()=>{(first.getMap('draft').get('title') as Y.Text).insert(0,'Alice: ');});
    const b=edit(second,()=>{(second.getMap('draft').get('title') as Y.Text).insert(0,'Bob: ');const dod=second.getMap('draft').get('dod') as Y.Array<Y.Map<unknown>>;(dod.get(0).get('text') as Y.Text).insert(0,'Совместно: ');});
    await Promise.all([f.store.updateCollaborativeDraft(update(f.draft.id,a,'alice-browser'),alice),f.store.updateCollaborativeDraft(update(f.draft.id,b,'bob-browser'),bob)]);
    const merged=await f.store.getCollaborativeDraft(f.draft.id,alice);
    Y.applyUpdate(first,Buffer.from(merged.stateUpdate,'base64'));Y.applyUpdate(second,Buffer.from(merged.stateUpdate,'base64'));
    assert.equal(first.getMap('draft').toJSON().title,second.getMap('draft').toJSON().title);
    assert(merged.content.title.includes('Alice: '));assert(merged.content.title.includes('Bob: '));
    assert.equal(merged.content.dod[0].text,'Совместно: Ожидание проверяемо');assert.equal(merged.version,2);
    const state=await f.store.getProject();assert.equal(state.version,1);assert.deepEqual(state.revisions[0],f.revision);assert.equal(state.specs[0].activeRevisionId,null);
    first.destroy();second.destroy();
  }finally{await f.store.close();}
});

test('C03: transport and semantic retries are idempotent; delete-set changes count even with an unchanged state vector',async()=>{
  const f=await fixture();try{
    const doc=docFrom(f.draft.stateUpdate),beforeVector=Y.encodeStateVector(doc);
    const bytes=edit(doc,()=>{(doc.getMap('draft').get('title') as Y.Text).delete(0,1);});
    assert.deepEqual(Y.encodeStateVector(doc),beforeVector,'deletions must not be detected using only the state vector');
    const input=update(f.draft.id,bytes),first=await f.store.updateCollaborativeDraft(input,alice);
    assert.equal(first.draft.version,1);assert.equal(first.replayed,false);
    const again=await f.store.updateCollaborativeDraft(input,alice);assert.equal(again.replayed,true);assert.equal(again.draft.version,first.draft.version);
    const semantic=await f.store.updateCollaborativeDraft({...input,updateId:randomUUID()},alice);assert.equal(semantic.draft.version,1);
    await assert.rejects(f.store.updateCollaborativeDraft({...input,updateBase64:encode(new Uint8Array([0,0]))},alice),{code:'IDEMPOTENCY_CONFLICT'});
    assert.equal((await f.store.getCollaborativeDraft(f.draft.id,bob)).content.title,content.title.slice(1));doc.destroy();
  }finally{await f.store.close();}
});

test('C04: malformed, oversized and schema-changing updates leave the head and receipts untouched',async()=>{
  const f=await fixture();try{
    const unknown=docFrom(f.draft.stateUpdate),changed=edit(unknown,()=>unknown.getMap('admin').set('acceptSpec',true));
    const wrong=docFrom(f.draft.stateUpdate),replacement=edit(wrong,()=>wrong.getMap('draft').set('title','plain string replaces Y.Text'));
    for(const bad of ['%%%','AAAA',encode(new Uint8Array(128*1024+1)),changed,replacement])await assert.rejects(f.store.updateCollaborativeDraft(update(f.draft.id,bad),alice));
    const after=await f.store.getCollaborativeDraft(f.draft.id,alice);assert.equal(after.version,0);assert.equal(after.stateHash,f.draft.stateHash);
    assert.equal((await f.store.inspect('SELECT * FROM ouro_draft_updates')).rows.length,0);unknown.destroy();wrong.destroy();
  }finally{await f.store.close();}
});

test('C05: publication checks project/draft/hash/base independently and preserves Flow without activating',async()=>{
  const f=await fixture();try{
    const input=publish(f.draft,1);
    for(const invalid of [{...input,expectedVersion:0},{...input,draftVersion:9},{...input,contentHash:'f'.repeat(64)},{...input,baseLatestRevisionId:randomUUID()}])await assert.rejects(f.store.publishCollaborativeDraft(invalid,alice));
    const published=await f.store.publishCollaborativeDraft(input,alice);
    assert.equal(published.state.revisions.length,2);assert.equal(published.revisionId,published.state.revisions[1].id);
    assert.deepEqual(published.state.revisions[1].flow,content.flow);assert.equal(published.state.specs[0].activeRevisionId,null);assert.equal(published.state.executions.length,0);
    assert.equal(published.state.revisions[1].authorId,alice.id);
    const again=await f.store.publishCollaborativeDraft(input,alice);assert.equal(again.replayed,true);assert.equal(again.revisionId,published.revisionId);
    assert.equal((await f.store.getProject()).revisions.length,2);
    const doc=docFrom(f.draft.stateUpdate),late=edit(doc,()=>{(doc.getMap('draft').get('title') as Y.Text).insert(0,'Поздно: ');});
    await assert.rejects(f.store.updateCollaborativeDraft(update(f.draft.id,late),bob),{code:'DRAFT_PUBLISHED'});doc.destroy();
  }finally{await f.store.close();}
});

test('C05: an outbox failure rolls back the revision, publication marker and exact receipt together',async()=>{
  const f=await fixture();try{
    await f.store.inspect("CREATE FUNCTION reject_collab_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced outbox failure'; END; $$");
    await f.store.inspect('CREATE TRIGGER collab_fail_outbox BEFORE INSERT ON ouro_outbox FOR EACH ROW EXECUTE FUNCTION reject_collab_outbox()');
    const input=publish(f.draft,1);await assert.rejects(f.store.publishCollaborativeDraft(input,bob));
    assert.equal((await f.store.getProject()).version,1);assert.equal((await f.store.getCollaborativeDraft(f.draft.id,alice)).publishedRevisionId,undefined);
    assert.equal((await f.store.inspect("SELECT * FROM ouro_draft_receipts WHERE operation='publish'")).rows.length,0);
    await f.store.inspect('DROP TRIGGER collab_fail_outbox ON ouro_outbox');const recovered=await f.store.publishCollaborativeDraft(input,bob);
    assert.equal(recovered.state.revisions[1].authorId,bob.id);assert.equal(recovered.replayed,false);
  }finally{await f.store.close();}
});

test('C07: an external immutable revision keeps the shared draft but blocks stale-base publication',async()=>{
  const f=await fixture();try{
    const changed=await f.store.executeCommand({type:'proposeRevision',specId:f.spec.id,content:{...content,title:'Внешняя immutable r2'},requestId:randomUUID(),expectedVersion:1},bob);
    await assert.rejects(f.store.publishCollaborativeDraft(publish(f.draft,changed.cursor),alice),{code:'REVISION_CONFLICT'});
    const retained=await f.store.getCollaborativeDraft(f.draft.id,bob);assert.equal(retained.baseRevisionId,f.revision.id);assert.equal(retained.content.title,content.title);
    assert.equal(retained.publishedRevisionId,undefined);assert.equal((await f.store.getProject()).revisions.length,2);
  }finally{await f.store.close();}
});

test('C01/C07: agents and cross-project humans cannot read, create, update or publish shared drafts',async()=>{
  const f=await fixture();try{
    const agent:Actor={id:'foreign-agent',kind:'agent',projectIds:[PROJECT_ID]},foreign:Actor={id:'foreign-human',kind:'human',projectIds:['other-project']};
    for(const actor of [agent,foreign]){
      await assert.rejects(f.store.getCollaborativeDraft(f.draft.id,actor),{code:'FORBIDDEN'});
      await assert.rejects(f.store.createCollaborativeDraft({...f.createInput,requestId:randomUUID()},actor),{code:'FORBIDDEN'});
      await assert.rejects(f.store.updateCollaborativeDraft(update(f.draft.id,'AAA='),actor),{code:'FORBIDDEN'});
      await assert.rejects(f.store.publishCollaborativeDraft(publish(f.draft,1),actor),{code:'FORBIDDEN'});
    }
  }finally{await f.store.close();}
});

test('C03/C05: accepted updates and exact publication receipts survive SQL reopen',async()=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'ouro-shared-draft-'));let store:Awaited<ReturnType<typeof createStore>>|undefined;
  try{
    const f=await fixture(dataDir);store=f.store;const doc=docFrom(f.draft.stateUpdate),bytes=edit(doc,()=>{(doc.getMap('draft').get('goal') as Y.Text).insert(0,'Сохранить: ');});
    const updated=await store.updateCollaborativeDraft(update(f.draft.id,bytes),bob);await store.close();store=await createStore({dataDir});
    const reopened=await store.getCollaborativeDraft(f.draft.id,alice);assert.equal(reopened.content.goal,updated.draft.content.goal);assert.equal(reopened.stateHash,updated.draft.stateHash);
    const input=publish(reopened,(await store.getProject()).version),first=await store.publishCollaborativeDraft(input,bob);await store.close();store=await createStore({dataDir});
    const repeated=await store.publishCollaborativeDraft(input,bob);assert.equal(repeated.replayed,true);assert.equal(repeated.revisionId,first.revisionId);
    assert.equal((await store.getProject()).revisions.length,2);doc.destroy();
  }finally{await store?.close();await rm(dataDir,{recursive:true,force:true});}
});

test('C03/C05: out-of-order accepted Yjs dependencies survive reopen and block publication until integrated',async()=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'ouro-shared-pending-'));let store:Awaited<ReturnType<typeof createStore>>|undefined;
  try{
    const f=await fixture(dataDir);store=f.store;const doc=docFrom(f.draft.stateUpdate);
    const first=edit(doc,()=>{(doc.getMap('draft').get('title') as Y.Text).insert(0,'Первое: ');});
    const second=edit(doc,()=>{(doc.getMap('draft').get('title') as Y.Text).insert(0,'Второе: ');});
    const queued=await store.updateCollaborativeDraft(update(f.draft.id,second),alice);
    await assert.rejects(store.publishCollaborativeDraft(publish(queued.draft,1),bob),{code:'DRAFT_CONFLICT'});
    await store.close();store=await createStore({dataDir});
    const pending=await store.getCollaborativeDraft(f.draft.id,bob);assert.equal(pending.hasPendingUpdates,true);assert.equal(pending.publishedRevisionId,undefined);
    const integrated=await store.updateCollaborativeDraft(update(f.draft.id,first),alice);
    assert.equal(integrated.draft.hasPendingUpdates,false);assert.equal(integrated.draft.content.title,'Второе: Первое: Исходное ожидание');
    const result=await store.publishCollaborativeDraft(publish(integrated.draft,1),bob);assert.equal(result.state.revisions[1].title,integrated.draft.content.title);doc.destroy();
  }finally{await store?.close();await rm(dataDir,{recursive:true,force:true});}
});

test('C03/C05: a pending delete set blocks publication even when the visible content hash is unchanged',async()=>{
  const f=await fixture();try{
    const doc=docFrom(f.draft.stateUpdate),text=doc.getMap('draft').get('goal') as Y.Text;
    const insertion=edit(doc,()=>text.insert(0,'Удалить: ')),deletion=edit(doc,()=>text.delete(0,9));
    const waiting=await f.store.updateCollaborativeDraft(update(f.draft.id,deletion),alice);
    assert.equal(waiting.draft.contentHash,f.draft.contentHash);assert.equal(waiting.draft.hasPendingUpdates,true);
    await assert.rejects(f.store.publishCollaborativeDraft(publish(waiting.draft,1),bob),{code:'DRAFT_CONFLICT'});
    const integrated=await f.store.updateCollaborativeDraft(update(f.draft.id,insertion),alice);
    assert.equal(integrated.draft.hasPendingUpdates,false);assert.equal(integrated.draft.content.goal,content.goal);doc.destroy();
  }finally{await f.store.close();}
});

test('C04 review: fixed Yjs types reject hidden list/map content that is absent from the visible JSON',async()=>{
  const f=await fixture();try{
    const rootAttack=new Y.Doc();rootAttack.getText('draft').insert(0,'hidden root list');
    const mixedMap=docFrom(f.draft.stateUpdate),criterion=(mixedMap.getMap('draft').get('dod') as Y.Array<Y.Map<unknown>>).get(0);
    const mapAttack=edit(mixedMap,()=>Y.Array.prototype.insert.call(criterion,0,['hidden criterion list']));
    const mixedArray=docFrom(f.draft.stateUpdate),arrayAttack=edit(mixedArray,()=>Y.Map.prototype.set.call(mixedArray.getMap('draft').get('dod'),'hidden',true));
    const mixedText=docFrom(f.draft.stateUpdate),textAttack=edit(mixedText,()=>Y.Map.prototype.set.call(mixedText.getMap('draft').get('goal'),'hidden',true));
    for(const bytes of [encode(Y.encodeStateAsUpdate(rootAttack)),mapAttack,arrayAttack,textAttack])await assert.rejects(f.store.updateCollaborativeDraft(update(f.draft.id,bytes),alice),{code:'VALIDATION_ERROR'});
    assert.equal((await f.store.getCollaborativeDraft(f.draft.id,alice)).version,0);assert.equal((await f.store.inspect('SELECT * FROM ouro_draft_updates')).rows.length,0);
    rootAttack.destroy();mixedMap.destroy();mixedArray.destroy();mixedText.destroy();
  }finally{await f.store.close();}
});
