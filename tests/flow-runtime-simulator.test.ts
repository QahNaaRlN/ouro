import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../lib/store';
import {POST} from '../app/api/simulator/route';
import {issueLocalSession} from '../lib/auth';
import {AGENT_ID,PROJECT_ID,type Actor} from '../packages/core/src';

const human:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
const simulator:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const content={title:'Учебный строгий процесс',goal:'Проверить только синтетические подтверждения шагов.',dod:[{id:'checked',text:'Человек проверил результат.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',flow:{entryNodeId:'work',nodes:[{id:'work',kind:'action',title:'Учебное действие',description:'',owner:'agent'},{id:'result',kind:'result',title:'Предъявить результат',description:'',owner:'agent'}],edges:[{id:'work-result',source:'work',target:'result',label:'Готово'}]}};

test('FR10 teaching simulator records synthetic step evidence and exact retries without controlling another agent',async()=>{
 const store=await createStore({dataDir:'memory://',seedEvents:[]});
 const globals=globalThis as typeof globalThis&{__ouroStore?:Promise<Awaited<ReturnType<typeof createStore>>>};
 const previous=globals.__ouroStore,previousDemo=process.env.OURO_LOCAL_DEMO;
 globals.__ouroStore=Promise.resolve(store);process.env.OURO_LOCAL_DEMO='1';
 try{
  const execute=async(data:Record<string,unknown>,actor=human)=>store.executeCommand({...data,requestId:crypto.randomUUID(),expectedVersion:(await store.getProject()).version},actor);
  let saved=await execute({type:'createSpec',content});const spec=saved.state.specs[0],revision=saved.state.revisions[0];
  await execute({type:'activateRevision',specId:spec.id,revisionId:revision.id});
  saved=await execute({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:AGENT_ID,flowTracking:'enforced'});
  const execution=saved.state.executions[0];await execute({type:'confirmResumed',executionId:execution.id},simulator);
  const runtime=(await store.getProject()).executions[0].flowRuntime;
  const base={specId:spec.id,executionId:execution.id,runId:runtime?.currentRunId??'missing-current-run'};
  const invoke=async(body:Record<string,unknown>)=>{
   const url='http://127.0.0.1/api/simulator';
   return POST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json',cookie:`ouro_session=${issueLocalSession(new Request(url))}`,'X-Ouro-Expected-Participant':human.id},body:JSON.stringify(body)}));
  };
  const start={...base,scenario:'flow_start',requestId:crypto.randomUUID(),expectedVersion:(await store.getProject()).version};
  let response=await invoke(start);let body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
  response=await invoke({scenario:'question',specId:spec.id,requestId:crypto.randomUUID(),expectedVersion:body.cursor});
  body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
  const question=body.state.requests.at(-1);assert.equal(question.flowInterrupt,true);assert.equal(question.flowStepRunId,base.runId);assert.equal(question.flowNodeId,undefined);
  await execute({type:'resolveDecision',decisionRequestId:question.id,specRevisionId:revision.id,outcome:{kind:'answer',answer:'Продолжить учебную проверку.'}});
  await execute({type:'confirmDecisionApplied',decisionRequestId:question.id,evidence:'simulation://ouro/interrupt-applied'},simulator);
  await execute({type:'resumeExecution',executionId:execution.id});await execute({type:'confirmResumed',executionId:execution.id},simulator);
  const finish={...base,scenario:'flow_complete',requestId:crypto.randomUUID(),expectedVersion:(await store.getProject()).version};
  response=await invoke(finish);body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
  const finishedVersion=body.cursor,finishedRun=body.state.executions[0].flowRuntime.runs.find((run:{id:string})=>run.id===base.runId);
  assert.equal(finishedRun.state,'succeeded');assert.match(finishedRun.evidence,/^simulation:\/\//);
  response=await invoke(finish);body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
  assert.equal(body.replayed,true);assert.equal(body.cursor,finishedVersion);
  assert.equal((await store.getProject()).executions[0].flowRuntime!.traversals.length,1);
  const registration=await store.createAgent('Настоящий агент',human);
  const other=await execute({type:'createSpec',content:{...content,title:'Чужая попытка'}});const otherSpec=other.state.specs.at(-1)!,otherRevision=other.state.revisions.at(-1)!;
  await execute({type:'activateRevision',specId:otherSpec.id,revisionId:otherRevision.id});
  const assigned=await execute({type:'startExecution',specId:otherSpec.id,specRevisionId:otherRevision.id,agentId:registration.agent.id,flowTracking:'enforced'}),external=assigned.state.executions.at(-1)!;
  response=await invoke({scenario:'flow_start',specId:otherSpec.id,executionId:external.id,runId:external.flowRuntime!.currentRunId,requestId:crypto.randomUUID(),expectedVersion:assigned.cursor});
  body=await response.json();assert.equal(response.status,403,JSON.stringify(body));assert.equal((await store.getProject()).version,assigned.cursor);
 }finally{
  await store.close();if(previous===undefined)delete globals.__ouroStore;else globals.__ouroStore=previous;
  if(previousDemo===undefined)delete process.env.OURO_LOCAL_DEMO;else process.env.OURO_LOCAL_DEMO=previousDemo;
 }
});
