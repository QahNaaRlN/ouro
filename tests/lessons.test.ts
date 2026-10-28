import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createStore } from '../lib/store';
import { applyCommand,createSeedEvents,replay,PROJECT_ID,AGENT_ID,type Actor,type Command,type ProjectState } from '../packages/core/src';
import { getLessonCandidates,getLessonSourceSpecIds } from '../packages/core/src/lessons';
const human:Actor={id:'lesson-human',kind:'human',projectIds:[PROJECT_ID]};
const agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
function run(state:ProjectState,payload:Record<string,unknown>,actor=human):ProjectState{return applyCommand(state,{...payload,requestId:crypto.randomUUID(),expectedVersion:state.version} as Command,actor).state;}
const errorCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;
function lessonContent(sourceEventIds:string[],title='Ограничить область вывода'){return {title,context:'Рассмотрены варианты исполнения одного контракта.',conclusion:'Выбор человека относится к проверенному контексту.',applicability:'Применять к похожим требованиям после проверки предпосылок.',evidence:'Сохранено исходное решение; непригодность альтернатив не доказана.',tags:['решения','проверка'],sourceEventIds};}
function specContent(title='Проверить применимость урока'){return {title,goal:'Проверить вывод на новом ограниченном входе.',dod:[{id:'lesson-proof',text:'Человек проверил evidence',required:true}],constraints:'Сначала черновик, активация отдельно.',assumptions:'',risks:'',inputs:'',comment:''};}
function choiceFixture(){
 let state=replay(createSeedEvents());const fork=state.requests.find(r=>r.kind==='Fork')!;
 state=run(state,{type:'resolveDecision',decisionRequestId:fork.id,specRevisionId:fork.specRevisionId,outcome:{kind:'approve',chosenOptionId:fork.options[0].id}});
 const source=state.events.at(-1)!;
 return {state,fork,source};
}

test('L01 rejected requests and unchosen Fork alternatives are factual candidates, never automatically published lessons',()=>{
 let {state,fork,source}=choiceFixture();
 let candidates=getLessonCandidates(state);
 assert.equal(candidates.length,fork.options.length-1);
 assert(candidates.every(candidate=>candidate.sourceEventId===source.id&&candidate.kind==='unchosen_fork_option'));
 assert(!candidates.some(candidate=>candidate.optionId===fork.options[0].id));
 assert.equal(candidates[0].specId,fork.specId);
 const question=state.requests.find(r=>r.kind==='Question')!;
 state=run(state,{type:'resolveDecision',decisionRequestId:question.id,specRevisionId:question.specRevisionId,outcome:{kind:'reject',reason:'Нужен другой контекст проверки.'}});
 candidates=getLessonCandidates(state);
 const rejected=candidates.find(candidate=>candidate.kind==='rejected_decision')!;
 assert.equal(rejected.sourceEventId,state.events.at(-1)!.id);assert.equal(rejected.reason,'Нужен другой контекст проверки.');
 assert.equal(state.lessons.length,0);assert.equal(state.lessonRevisions.length,0);
});

test('L02 lesson commands are human-only and strictly validate bounded content and committed project sources',()=>{
 const {state,source}=choiceFixture();const content=lessonContent([source.id]),immutable=structuredClone(state);
 for(const actor of [agent,{...agent,id:'lesson-service',kind:'service' as const},{...human,projectIds:['foreign-project']}]) {
  for(const payload of [{type:'createLesson',content},{type:'reviseLesson',lessonId:'unknown',content},{type:'publishLesson',lessonId:'unknown',revisionId:'unknown'},{type:'createSpecFromLesson',lessonId:'unknown',lessonRevisionId:'unknown',content:specContent()}])assert.throws(()=>run(state,payload,actor),errorCode('FORBIDDEN'));
 }
 const invalid=[{...content,title:' '},{...content,title:'x'.repeat(201)},{...content,conclusion:'x'.repeat(20_001)},{...content,evidence:''},{...content,tags:Array.from({length:21},(_,i)=>`tag-${i}`)},{...content,tags:[' Проверка ','проверка']},{...content,tags:['x'.repeat(61)]},{...content,sourceEventIds:[]},{...content,sourceEventIds:Array.from({length:51},(_,i)=>`source-${i}`)},{...content,sourceEventIds:[source.id,source.id]},{...content,sourceEventIds:['missing']},{...content,sourceEventIds:[`${source.id} `]},{...content,createdBy:'spoofed-human'}];
 for(const bad of invalid)assert.throws(()=>run(state,{type:'createLesson',content:bad}),errorCode('VALIDATION_ERROR'));
 const foreign=structuredClone(state);foreign.events.find(event=>event.id===source.id)!.projectId='foreign-project';
 assert.throws(()=>run(foreign,{type:'createLesson',content}),errorCode('FORBIDDEN'));
 assert.deepEqual(state,immutable);
});

test('L03/L04 lesson revisions are immutable, publication is explicit, and an unpublished edit preserves the published snapshot',()=>{
 const fixture=choiceFixture();let state=run(fixture.state,{type:'createLesson',content:lessonContent([fixture.source.id])});
 let lesson=state.lessons.at(-1)!,first=state.lessonRevisions.at(-1)!;
 assert.equal(lesson.publishedRevisionId,undefined);assert.equal(first.revision,1);assert.equal(first.createdBy,human.id);assert.equal(first.parentRevisionId,undefined);
 const immutable=structuredClone(first);
 state=run(state,{type:'publishLesson',lessonId:lesson.id,revisionId:first.id});
 state=run(state,{type:'reviseLesson',lessonId:lesson.id,content:lessonContent([fixture.source.id],'Уточнить границы применимости')});
 lesson=state.lessons.at(-1)!;const second=state.lessonRevisions.at(-1)!;
 assert.equal(lesson.latestRevisionId,second.id);assert.equal(lesson.publishedRevisionId,first.id);assert.equal(second.revision,2);assert.equal(second.parentRevisionId,first.id);
 assert.deepEqual(state.lessonRevisions.find(revision=>revision.id===first.id),immutable);
 const otherState=run(state,{type:'createLesson',content:lessonContent([fixture.source.id],'Отдельный урок')});const foreignRevision=otherState.lessonRevisions.at(-1)!;
 assert.throws(()=>run(otherState,{type:'publishLesson',lessonId:lesson.id,revisionId:foreignRevision.id}),errorCode('VALIDATION_ERROR'));
 state=run(state,{type:'publishLesson',lessonId:lesson.id,revisionId:second.id});
 assert.equal(state.lessons.at(-1)!.publishedRevisionId,second.id);
 assert.throws(()=>run(state,{type:'publishLesson',lessonId:lesson.id,revisionId:second.id}),errorCode('INVALID_TRANSITION'));
 assert.deepEqual(replay(state.events),state);
});

test('L05 a spec is a human-created draft from the exact current publication, with stable provenance and optional explicit source-spec relation',()=>{
 const fixture=choiceFixture();let state=run(fixture.state,{type:'createLesson',content:lessonContent([fixture.source.id])});
 const lesson=state.lessons.at(-1)!,first=state.lessonRevisions.at(-1)!;
 assert.throws(()=>run(state,{type:'createSpecFromLesson',lessonId:lesson.id,lessonRevisionId:first.id,content:specContent()}),errorCode('INVALID_TRANSITION'));
 state=run(state,{type:'publishLesson',lessonId:lesson.id,revisionId:first.id});
 assert.deepEqual(getLessonSourceSpecIds(state,first),[fixture.fork.specId]);
 const wrongSource=state.specs.find(spec=>spec.id!==fixture.fork.specId)!;
 assert.throws(()=>run(state,{type:'createSpecFromLesson',lessonId:lesson.id,lessonRevisionId:first.id,content:specContent(),sourceSpecId:wrongSource.id}),errorCode('VALIDATION_ERROR'));
 const executions=state.executions.length,dependencies=state.dependencies.length;
 state=run(state,{type:'createSpecFromLesson',lessonId:lesson.id,lessonRevisionId:first.id,content:specContent()});
 const derived=state.specs.at(-1)!;
 assert.equal(derived.state,'idea');assert.equal(derived.activeRevisionId,null);assert.equal(state.executions.length,executions);assert.equal(state.dependencies.length,dependencies);
 assert.deepEqual(derived.origin,{kind:'lesson',lessonId:lesson.id,lessonRevisionId:first.id});
 const publishEvent=state.events.findLast(event=>event.type==='LessonPublished')!;
 assert.equal(state.events.at(-1)!.causationId,publishEvent.id);
 state=run(state,{type:'createSpecFromLesson',lessonId:lesson.id,lessonRevisionId:first.id,content:specContent('Проверить другой вход'),sourceSpecId:fixture.fork.specId});
 assert.deepEqual(state.dependencies.at(-1),{id:state.dependencies.at(-1)!.id,from:fixture.fork.specId,to:state.specs.at(-1)!.id,type:'derived_from'});
 const createdEvent=state.events.at(-2)!;assert.equal(state.events.at(-1)!.causationId,createdEvent.id);
 state=run(state,{type:'reviseLesson',lessonId:lesson.id,content:lessonContent([fixture.source.id],'Новая редакция')});
 const second=state.lessonRevisions.at(-1)!;
 state=run(state,{type:'createSpecFromLesson',lessonId:lesson.id,lessonRevisionId:first.id,content:specContent('Проверить опубликованную r1 при черновике r2')});
 assert.equal(state.specs.at(-1)!.origin?.lessonRevisionId,first.id);
 state=run(state,{type:'publishLesson',lessonId:lesson.id,revisionId:second.id});
 assert.throws(()=>run(state,{type:'createSpecFromLesson',lessonId:lesson.id,lessonRevisionId:first.id,content:specContent()}),errorCode('REVISION_CONFLICT'));
 assert.deepEqual(state.specs.find(spec=>spec.id===derived.id)!.origin,derived.origin);
 state=run(state,{type:'createSpecFromLesson',lessonId:lesson.id,lessonRevisionId:second.id,content:specContent('Проверить опубликованную r2')});
 assert.equal(state.specs.at(-1)!.origin?.lessonRevisionId,second.id);
});

test('L03/L05 SQL receipts, two-event spec derivation rollback, append-only sources and reopen remain durable',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ouro-lessons-'));let store:Awaited<ReturnType<typeof createStore>>|undefined;
 try {
  store=await createStore({dataDir:directory});let state=await store.getProject();const source=state.events[0];
  const create={type:'createLesson',requestId:crypto.randomUUID(),expectedVersion:state.version,content:lessonContent([source.id])};
  const first=await store.executeCommand(create,human);state=first.state;
  const lesson=state.lessons.at(-1)!,revision=state.lessonRevisions.at(-1)!;
  const publish=await store.executeCommand({type:'publishLesson',requestId:crypto.randomUUID(),expectedVersion:state.version,lessonId:lesson.id,revisionId:revision.id},human);state=publish.state;
  const repeated=await store.executeCommand(create,human);assert.equal(repeated.replayed,true);assert.deepEqual(repeated.events,first.events);assert.deepEqual(repeated.state,first.state);
  await assert.rejects(store.executeCommand({...create,content:lessonContent([source.id],'Подмена')},human),errorCode('IDEMPOTENCY_CONFLICT'));
  const before=await store.getProject(),receipts=await store.inspect('SELECT count(*) FROM ouro_command_receipts');
  const derived={type:'createSpecFromLesson',requestId:crypto.randomUUID(),expectedVersion:before.version,lessonId:lesson.id,lessonRevisionId:revision.id,content:specContent(),sourceSpecId:source.specId};
  assert(source.specId);
  await store.inspect(`CREATE FUNCTION ouro_lessons_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.cursor>${before.version+1} THEN RAISE EXCEPTION 'lesson outbox failure'; END IF; RETURN NEW; END $$`);
  await store.inspect('CREATE TRIGGER ouro_lessons_fail_outbox BEFORE INSERT ON ouro_outbox FOR EACH ROW EXECUTE FUNCTION ouro_lessons_fail_outbox()');
  await assert.rejects(store.executeCommand(derived,human),/lesson outbox failure/);
  assert.deepEqual(await store.getProject(),before);assert.deepEqual(await store.inspect('SELECT count(*) FROM ouro_command_receipts'),receipts);
  await store.inspect('DROP TRIGGER ouro_lessons_fail_outbox ON ouro_outbox');await store.inspect('DROP FUNCTION ouro_lessons_fail_outbox()');
  const retried=await store.executeCommand(derived,human);assert.equal(retried.events.length,2);assert.equal(retried.replayed,false);
  assert.equal((await store.executeCommand(derived,human)).replayed,true);
  await assert.rejects(store.inspect("UPDATE ouro_domain_events SET event=event WHERE event_type='LessonCreated'"),/append-only/);
  state=await store.getProject();
  await store.executeCommand({type:'reviseLesson',requestId:crypto.randomUUID(),expectedVersion:state.version,lessonId:lesson.id,content:lessonContent([source.id],'Неопубликованная редакция после SQL-проверок')},human);
  const durable=await store.getProject();assert.equal(durable.lessons.at(-1)!.publishedRevisionId,revision.id);assert.notEqual(durable.lessons.at(-1)!.latestRevisionId,revision.id);
  await store.close();store=await createStore({dataDir:directory});
  assert.deepEqual(await store.getProject(),durable);
  assert.equal((await store.executeCommand(create,human)).replayed,true);
 } finally {if(store)await store.close();await rm(directory,{recursive:true,force:true});}
});
