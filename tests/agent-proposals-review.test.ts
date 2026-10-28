import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalJSON,createStore} from '../lib/store';
import {applyCommand,PROJECT_ID,type Actor,type Command} from '../packages/core/src';
import {createAgentService} from '../packages/mcp/src/agent-service';

const human:Actor={id:'proposal-review-human',kind:'human',projectIds:[PROJECT_ID]};
const content=(title:string)=>({title,goal:'Проверить совместимость зафиксированных receipts.',dod:[{id:'result',text:'Повтор возвращает прежний факт.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});

test('review: legacy report receipt without proposal arrays survives later human commits and replays exact public result',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const issued=await store.createAgent('Legacy receipt agent',human),actor=(await store.authenticateAgentToken(issued.token))!;
  const humanCommand=async(payload:Record<string,unknown>)=>store.executeCommand({...payload,requestId:crypto.randomUUID(),expectedVersion:(await store.getProject()).version},human);
  let saved=await humanCommand({type:'createSpec',content:content('Исходное назначение')});const spec=saved.state.specs[0],revision=saved.state.revisions[0];
  await humanCommand({type:'activateRevision',specId:spec.id,revisionId:revision.id});
  saved=await humanCommand({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:actor.id});const execution=saved.state.executions[0];
  await store.executeCommand({type:'confirmResumed',executionId:execution.id,ackPhase:'start',requestId:crypto.randomUUID(),expectedVersion:saved.cursor},actor);
  const before=await store.getProject();
  const args={executionId:execution.id,requestId:'legacy-report-review-stable-request',expectedVersion:before.version,actionId:'legacy-report-action',phase:'completed',title:'Старый зафиксированный отчёт',context:'Тело было принято до добавления предложений.',evidence:'fixture://legacy/committed'};
  const body={...args,type:'reportAction',specId:spec.id,specRevisionId:revision.id} as Command;
  const applied=applyCommand(before,body,actor),event=applied.events[0];
  // Install the old wire/storage shape as an INSERT-only migration fixture. The
  // event, outbox, project cursor and receipt form one SQL statement/transaction;
  // no authoritative row or original user database is edited.
  const legacyState:Record<string,unknown>=structuredClone(applied.state);
  delete legacyState.agentProposals;delete legacyState.agentProposalRevisions;delete legacyState.githubBindings;
  const response={state:legacyState,events:applied.events,cursor:applied.state.version};
  const payloadHash=createHash('sha256').update(canonicalJSON(body)).digest('hex');
  await store.inspect(`WITH inserted_event AS (
    INSERT INTO ouro_domain_events(id,project_id,version,event_type,schema_version,actor_id,occurred_at,event)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id
   ), inserted_outbox AS (
    INSERT INTO ouro_outbox(event_id,project_id,cursor) SELECT id,$2,$3 FROM inserted_event RETURNING event_id
   ), advanced_project AS (
    UPDATE ouro_projects SET version=$3 WHERE id=$2 RETURNING id
   ) INSERT INTO ouro_command_receipts(actor_id,project_id,request_id,payload_hash,response,cursor)
    SELECT $6,$2,$9,$10,$11::jsonb,$3 FROM advanced_project CROSS JOIN inserted_outbox`,
    [event.id,PROJECT_ID,event.version,event.type,event.schemaVersion,actor.id,event.occurredAt,JSON.stringify(event),args.requestId,payloadHash,JSON.stringify(response)]);
  const rowBefore=(await store.inspect<{response:unknown;payload_hash:string;cursor:string|number}>('SELECT response,payload_hash,cursor FROM ouro_command_receipts WHERE actor_id=$1 AND request_id=$2',[actor.id,args.requestId])).rows[0];
  await humanCommand({type:'createSpec',content:content('PRIVATE LATER HUMAN DESTINATION')});
  const service=createAgentService({store,actor}),result=await service.callTool('ouro.report_action',args);
  assert.equal(result.isError,undefined,JSON.stringify(result.structuredContent));
  const actual=result.structuredContent as {replayed:boolean;cursor:number;events:Array<{id:string}>};
  assert.equal(actual.replayed,true);assert.equal(actual.cursor,event.version);assert.deepEqual(actual.events.map(item=>item.id),[event.id]);
  assert(!('state' in actual));assert(!JSON.stringify(actual).includes('PRIVATE LATER HUMAN DESTINATION'));
  const rowAfter=(await store.inspect('SELECT response,payload_hash,cursor FROM ouro_command_receipts WHERE actor_id=$1 AND request_id=$2',[actor.id,args.requestId])).rows[0];
  assert.deepEqual(rowAfter,rowBefore,'legacy receipt remains immutable');
 }finally{await store.close();}
});

test('review: proposal strings that cannot round-trip through JSONB fail schema validation before append',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 try{
  const issued=await store.createAgent('Unicode proposal agent',human),actor=(await store.authenticateAgentToken(issued.token))!;
  const humanCommand=async(payload:Record<string,unknown>)=>store.executeCommand({...payload,requestId:crypto.randomUUID(),expectedVersion:(await store.getProject()).version},human);
  let saved=await humanCommand({type:'createSpec',content:content('Назначение с источниками')});const spec=saved.state.specs[0],revision=saved.state.revisions[0];
  await humanCommand({type:'activateRevision',specId:spec.id,revisionId:revision.id});
  saved=await humanCommand({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:actor.id});const execution=saved.state.executions[0];
  saved=await store.executeCommand({type:'confirmResumed',executionId:execution.id,ackPhase:'start',requestId:crypto.randomUUID(),expectedVersion:saved.cursor},actor);
  const source=saved.events[0],before=saved.cursor,service=createAgentService({store,actor});
  const summary={kind:'reality_summary',title:'Предложение по источникам',findings:[{text:'Источник существует в выбранном исполнении.',sourceEventIds:[source.id]}],interpretation:'Агент предлагает рассмотреть факт.',limitations:'Смысл вывода проверяет человек.'};
  const proposedCases:Array<Record<string,unknown>>=[String.fromCharCode(0xd800),String.fromCharCode(0xdc00),String.fromCharCode(0)].map(invalid=>({...summary,title:`Недопустимый текст x${invalid}y`}));
  proposedCases.push({...summary,kind:'spec_proposal',draft:{...content('Процесс из предложения'),flow:{entryNodeId:'result',nodes:[{id:'result',kind:'result',title:`x${String.fromCharCode(0xd800)}y`,description:'Ожидаемый результат.',owner:'agent'}],edges:[]}}});
  for(const proposed of proposedCases){
   const result=await service.callTool('ouro.submit_proposal',{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:before,sourceCursor:before,content:proposed});
   assert.equal((await store.getProject()).version,before);
   assert.equal((result.structuredContent.error as {code:string}|undefined)?.code,'VALIDATION_ERROR','invalid persisted text must not become a SQL/internal failure');
  }
 }finally{await store.close();}
});
