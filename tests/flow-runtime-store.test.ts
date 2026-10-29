import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStore} from '../lib/store';
import {PROJECT_ID,replay,type Actor,type ProjectState} from '../packages/core/src';

const human:Actor={id:'runtime-store-human',kind:'human',projectIds:[PROJECT_ID]};
const flow={entryNodeId:'a',nodes:[{id:'a',kind:'action',title:'Сохранить факт',description:'',owner:'agent'},{id:'end',kind:'result',title:'Предъявить',description:'',owner:'agent'}],edges:[{id:'to-end',source:'a',target:'end',label:'Есть проверяемый результат'}]};
const content=(title:string,withFlow=true)=>({title,goal:'Проверить долговечность и атомарность runtime.',dod:[{id:'verified',text:'Результат проверен человеком.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',...(withFlow?{flow}:{})});
type Runtime={state:string;currentRunId:string|null;runs:{id:string;nodeId:string;state:string;visit:number}[];traversals:{id:string;edgeId:string;fromRunId:string;toRunId:string}[]};
function runtime(state:ProjectState,executionId:string){
 const result=(state.executions.find(execution=>execution.id===executionId) as unknown as {flowRuntime?:Runtime})?.flowRuntime;
 assert(result,'SQL assignment must preserve an actual enforced runtime');return result;
}
const failureCode=(error:unknown)=>(error as {code?:string}).code;

test('FR-STORE01 competing transitions, lost replies and reopen preserve one traversal and immutable historical receipts',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'ouro-runtime-sql-'));let store:Awaited<ReturnType<typeof createStore>>|undefined;
 try{
  store=await createStore({dataDir});
  const oldRevisions=(await store.inspect<{id:string;content_hash:string;content:unknown}>('SELECT id,content_hash,content FROM ouro_spec_revisions ORDER BY id')).rows;
  const issued=await store.createAgent('Независимая SQL-проверка runtime',human),agent=(await store.authenticateAgentToken(issued.token))!;
  const send=async(body:Record<string,unknown>,actor=human)=>store!.executeCommand({...body,requestId:randomUUID(),expectedVersion:(await store!.getProject()).version},actor);
  let result=await send({type:'createSpec',content:content('Состязание переходов')});const spec=result.state.specs.at(-1)!,revision=result.state.revisions.at(-1)!;
  await send({type:'activateRevision',specId:spec.id,revisionId:revision.id});
  result=await send({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.id,flowTracking:'enforced'});
  const execution=result.state.executions.at(-1)!,first=runtime(result.state,execution.id).currentRunId!;
  await send({type:'confirmResumed',executionId:execution.id,ackPhase:'start'},agent);
  await send({type:'reportFlowStep',executionId:execution.id,runId:first,phase:'start'},agent);
  const before=await store.getProject(),base={type:'reportFlowStep',executionId:execution.id,runId:first,phase:'complete',evidence:'test://sql-race/verified',expectedVersion:before.version};
  const bodies=[{...base,requestId:randomUUID()},{...base,requestId:randomUUID()}];
  const outcomes=await Promise.allSettled(bodies.map(body=>store!.executeCommand(body,agent)));
  const winnerIndex=outcomes.findIndex(result=>result.status==='fulfilled');assert.notEqual(winnerIndex,-1);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const rejected=outcomes.find(result=>result.status==='rejected') as PromiseRejectedResult;assert.equal(failureCode(rejected.reason),'VERSION_CONFLICT');
  const winner=outcomes[winnerIndex];assert(winner.status==='fulfilled');const committed=winner.value;
  const winningBody=bodies[winnerIndex],after=await store.getProject(),tracked=runtime(after,execution.id);
  assert.equal(tracked.runs.length,2);assert.equal(tracked.traversals.length,1);assert.equal(tracked.traversals[0].edgeId,'to-end');
  assert.equal(tracked.traversals[0].fromRunId,first);assert.equal(tracked.traversals[0].toRunId,tracked.currentRunId);
  const receipts=await store.inspect<{count:string}>('SELECT count(*) FROM ouro_command_receipts WHERE actor_id=$1 AND request_id IN ($2,$3)',[agent.id,bodies[0].requestId,bodies[1].requestId]);assert.equal(Number(receipts.rows[0].count),1);
  // The caller lost the successful response. Its same request now names a run
  // that has already completed, so receipt lookup must precede current-run checks.
  const repeated=await store.executeCommand(winningBody,agent);assert.equal(repeated.replayed,true);assert.deepEqual(repeated.events,committed.events);
  assert.equal((await store.getProject()).version,after.version);assert.equal(runtime(await store.getProject(),execution.id).traversals.length,1);
  await assert.rejects(store.executeCommand({...winningBody,evidence:'different-body'},agent),error=>failureCode(error)==='IDEMPOTENCY_CONFLICT');
  const suffix=await store.getEvents(before.version);assert.deepEqual(suffix.events,committed.events);assert.equal(suffix.cursor,after.version);
  assert.deepEqual(replay(after.events),after);
  const finalRun=tracked.currentRunId!;await send({type:'reportFlowStep',executionId:execution.id,runId:finalRun,phase:'start'},agent);
  await send({type:'reportFlowStep',executionId:execution.id,runId:finalRun,phase:'complete',evidence:'test://sql-result'},agent);
  await send({type:'completeExecution',executionId:execution.id,result:'succeeded',evidence:'test://sql-execution-result'},agent);
  const final=await store.getProject();assert.equal(runtime(final,execution.id).state,'completed');assert.notEqual(final.specs.find(item=>item.id===spec.id)!.state,'done');
  await store.close();store=undefined;store=await createStore({dataDir});
  assert.deepEqual(await store.getProject(),final);
  const historicalReceipt=await store.executeCommand(winningBody,agent);assert.equal(historicalReceipt.replayed,true);assert.equal(historicalReceipt.cursor,committed.cursor);assert.deepEqual(historicalReceipt.events,committed.events);
  assert.equal((await store.getProject()).version,final.version);assert.equal(runtime(await store.getProject(),execution.id).state,'completed');
  const oldAfter=(await store.inspect<{id:string;content_hash:string;content:unknown}>('SELECT id,content_hash,content FROM ouro_spec_revisions ORDER BY id')).rows.filter(row=>oldRevisions.some(before=>before.id===row.id));assert.deepEqual(oldAfter,oldRevisions);
  const persisted=await store.inspect<{events:string;outbox:string}>('SELECT (SELECT count(*) FROM ouro_domain_events)::text AS events,(SELECT count(*) FROM ouro_outbox)::text AS outbox');
  assert.equal(Number(persisted.rows[0].events),final.version);assert.equal(Number(persisted.rows[0].outbox),final.version);
 }finally{await store?.close();await rm(dataDir,{recursive:true,force:true});}
});

test('FR-STORE02 legacy executions and cached responses acquire no invented Flow runs after tracked work',async()=>{
 const store=await createStore({dataDir:'memory://'});
 try{
  const issued=await store.createAgent('Legacy и новый режим',human),agent=(await store.authenticateAgentToken(issued.token))!;
  const send=async(body:Record<string,unknown>,actor=human)=>store.executeCommand({...body,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},actor);
  let result=await send({type:'createSpec',content:content('Старое исполнение без Flow',false)});const oldSpec=result.state.specs.at(-1)!,oldRevision=result.state.revisions.at(-1)!;
  await send({type:'activateRevision',specId:oldSpec.id,revisionId:oldRevision.id});result=await send({type:'startExecution',specId:oldSpec.id,specRevisionId:oldRevision.id,agentId:agent.id});
  const legacy=result.state.executions.at(-1)!;await send({type:'confirmResumed',executionId:legacy.id,ackPhase:'start'},agent);
  const body={type:'completeExecution',executionId:legacy.id,result:'succeeded',evidence:'test://legacy',requestId:randomUUID(),expectedVersion:(await store.getProject()).version};
  const oldResult=await store.executeCommand(body,agent),receiptBefore=(await store.inspect<{response:unknown}>('SELECT response FROM ouro_command_receipts WHERE actor_id=$1 AND request_id=$2',[agent.id,body.requestId])).rows[0].response;
  assert.equal(Object.hasOwn(oldResult.state.executions.find(item=>item.id===legacy.id)!,'flowRuntime'),false);
  const hashBefore=(await store.inspect<{content_hash:string;content:unknown}>('SELECT content_hash,content FROM ouro_spec_revisions WHERE id=$1',[oldRevision.id])).rows[0];
  result=await send({type:'createSpec',content:content('Новый режим рядом со старым')});const spec=result.state.specs.at(-1)!,revision=result.state.revisions.at(-1)!;
  await send({type:'activateRevision',specId:spec.id,revisionId:revision.id});result=await send({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.id,flowTracking:'enforced'});
  assert.equal(runtime(result.state,result.state.executions.at(-1)!.id).runs.length,1);
  const repeated=await store.executeCommand(body,agent);assert.equal(repeated.replayed,true);assert.deepEqual(repeated.events,oldResult.events);
  assert.equal(Object.hasOwn((await store.getProject()).executions.find(item=>item.id===legacy.id)!,'flowRuntime'),false);
  const receiptAfter=(await store.inspect<{response:unknown}>('SELECT response FROM ouro_command_receipts WHERE actor_id=$1 AND request_id=$2',[agent.id,body.requestId])).rows[0].response;assert.deepEqual(receiptAfter,receiptBefore);
  assert.deepEqual((await store.inspect<{content_hash:string;content:unknown}>('SELECT content_hash,content FROM ouro_spec_revisions WHERE id=$1',[oldRevision.id])).rows[0],hashBefore);
 }finally{await store.close();}
});

test('FR-STORE03 revoked agent recovery cancels authorization without inventing stop confirmation or a skipped run',async()=>{
 const store=await createStore({dataDir:'memory://'});
 try{
  const issued=await store.createAgent('Отзыв в середине прохода',human),agent=(await store.authenticateAgentToken(issued.token))!;
  const send=async(body:Record<string,unknown>,actor=human)=>store.executeCommand({...body,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},actor);
  let result=await send({type:'createSpec',content:content('Неизвестная остановка шага')});const spec=result.state.specs.at(-1)!,revision=result.state.revisions.at(-1)!;
  await send({type:'activateRevision',specId:spec.id,revisionId:revision.id});result=await send({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.id,flowTracking:'enforced'});
  const execution=result.state.executions.at(-1)!,runId=runtime(result.state,execution.id).currentRunId!;
  await send({type:'confirmResumed',executionId:execution.id,ackPhase:'start'},agent);await send({type:'reportFlowStep',executionId:execution.id,runId,phase:'start'},agent);
  await store.revokeAgent(agent.id,human);assert.equal(await store.authenticateAgentToken(issued.token),null);
  const cursor=(await store.getProject()).version;
  await assert.rejects(send({type:'reportFlowStep',executionId:execution.id,runId,phase:'complete',evidence:'test://revoked'},agent));assert.equal((await store.getProject()).version,cursor);
  result=await send({type:'forceCancelRevokedExecution',executionId:execution.id,reason:'Ключ отозван, результат остановки неизвестен.',evidence:'test://registry-revocation'});
  const cancelled=result.state.executions.find(item=>item.id===execution.id)!;assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.stopConfirmation,'unknown');
  assert.equal(runtime(result.state,execution.id).state,'cancelled');assert.equal(runtime(result.state,execution.id).runs.find(run=>run.id===runId)!.state,'cancelled');
  await assert.rejects(send({type:'retryFlowStep',executionId:execution.id,runId,reason:'Нельзя оживить отменённое разрешение.'}));
  await assert.rejects(send({type:'skipFlowStep',executionId:execution.id,runId,reason:'Пропуск не доказывает остановку.',evidence:'test://cannot-skip-stop'}));
  const replacement=await store.createAgent('Новый агент после проверки остановки',human);
  await assert.rejects(send({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:replacement.agent.id,flowTracking:'enforced'}));
  await assert.rejects(send({type:'changeRoadmapState',state:'archived'}));
  await send({type:'attestExternalStop',executionId:execution.id,evidence:'Оператор независимо подтвердил фактическую остановку процесса.'});
  result=await send({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:replacement.agent.id,flowTracking:'enforced'});
  const next=result.state.executions.at(-1)!;assert.notEqual(next.id,execution.id);assert.equal(runtime(result.state,next.id).runs[0].visit,1);
  assert.equal(runtime(result.state,execution.id).runs.find(run=>run.id===runId)!.state,'cancelled');
 }finally{await store.close();}
});
