import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStore } from '../lib/store';
import { PROJECT_ID,type Actor } from '../packages/core/src';
import { Y,createDraftDocument,loadDraftDocument,readDraftContent,replaceDraftText,bytesToBase64 } from '../packages/collaboration/src/document';

const operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
const content={title:'Ожидание 🧭',goal:'Проверить точный Unicode',dod:[{id:'unicode',text:'Эмодзи 🧭 сохранён без изменения',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
const bad=['x\u0000y','x\ud800y','x\udfffy'];
async function fixture(){const store=await createStore({dataDir:'memory://',seedEvents:[]});const created=await store.executeCommand({type:'createSpec',content,requestId:randomUUID(),expectedVersion:0},operator);return {store,state:created.state};}

test('C04 Unicode: NUL in a Yjs text is rejected before it can poison the SQL publication snapshot',async()=>{
  const f=await fixture();try{
    const draft=await f.store.createCollaborativeDraft({specId:f.state.specs[0].id,baseRevisionId:f.state.revisions[0].id,requestId:randomUUID(),expectedVersion:f.state.version},operator),doc=loadDraftDocument(draft.stateUpdate),before=Y.encodeStateVector(doc);
    doc.transact(()=>{const text=doc.getMap('draft').get('goal') as Y.Text;text.delete(0,text.length);text.insert(0,bad[0]);});
    await assert.rejects(f.store.updateCollaborativeDraft({draftId:draft.id,updateId:randomUUID(),clientId:'unicode-check',updateBase64:bytesToBase64(Y.encodeStateAsUpdate(doc,before))},operator),{code:'VALIDATION_ERROR'});
    assert.equal((await f.store.getCollaborativeDraft(draft.id,operator)).version,0);assert.equal((await f.store.inspect('SELECT * FROM ouro_draft_updates')).rows.length,0);doc.destroy();
  }finally{await f.store.close();}
});
test('C04 Unicode: plain draft gates reject unpaired surrogates and NUL but preserve valid emoji exactly',()=>{
  for(const goal of bad){const doc=createDraftDocument({...content,goal});try{assert.throws(()=>readDraftContent(doc),{code:'VALIDATION_ERROR'});}finally{doc.destroy();}}
  const doc=createDraftDocument(content);try{assert.equal(readDraftContent(doc).title,content.title);const title=doc.getMap('draft').get('title') as Y.Text;for(const value of bad)assert.throws(()=>replaceDraftText(title,value),{code:'VALIDATION_ERROR'});assert.equal(title.toString(),content.title);replaceDraftText(title,'Новая цель 🧭');assert.equal(title.toString(),'Новая цель 🧭');}finally{doc.destroy();}
});
test('C04 Unicode: lesson text and tags reject invalid scalars before JSONB, with no fact or receipt',async()=>{
  const f=await fixture();try{
    const lesson={title:'Урок 🧭',context:'Контекст',conclusion:'Вывод',applicability:'Область',evidence:'Проверено',tags:['навигация 🧭'],sourceEventIds:[f.state.events[0].id]};
    for(const value of bad)for(const field of ['title','context','conclusion','applicability','evidence','tags']){
      const patched={...lesson,[field]:field==='tags'?[value]:value};
      await assert.rejects(f.store.executeCommand({type:'createLesson',content:patched,requestId:randomUUID(),expectedVersion:f.state.version},operator),{code:'VALIDATION_ERROR'});
    }
    assert.equal((await f.store.getProject()).version,f.state.version);
    const result=await f.store.executeCommand({type:'createLesson',content:lesson,requestId:randomUUID(),expectedVersion:f.state.version},operator);assert.equal(result.state.lessonRevisions[0].title,lesson.title);assert.deepEqual(result.state.lessonRevisions[0].tags,lesson.tags);
  }finally{await f.store.close();}
});
for(const kind of ['agent','participant'] as const)test(`C01 Unicode: ${kind} names reject NUL and lone surrogates before issuing a persisted credential`,async()=>{
  const f=await fixture();try{
    const create=(name:string)=>kind==='agent'?f.store.createAgent(name,operator):f.store.createParticipant(name,operator);
    for(const name of bad)await assert.rejects(create(name),{code:'VALIDATION_ERROR'});
    const table=kind==='agent'?'ouro_agent_registrations':'ouro_participant_registrations';assert.equal((await f.store.inspect(`SELECT * FROM ${table}`)).rows.length,0);
    const result=await create('Редактор 🧭');assert.equal('agent'in result?result.agent.name:result.participant.name,'Редактор 🧭');
  }finally{await f.store.close();}
});
