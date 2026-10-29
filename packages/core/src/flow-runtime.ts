import {validateEnforcedFlowDefinition} from '@ouro/protocol';
import type {Actor,DecisionRequest,DomainEvent,Execution,FlowDefinition,FlowNode,FlowStepRun,FlowRuntime,ProjectState} from './types';
import {currentDecisionRequests} from './decision-lineage';

export const FLOW_RUN_LIMIT=1000;
export class FlowRuntimeError extends Error{
 constructor(public code:string,message:string){super(message);this.name='FlowRuntimeError';}
}
function fail(code:string,message:string):never{throw new FlowRuntimeError(code,message);}
const terminalRun=new Set(['succeeded','failed','skipped','cancelled']);
const terminalExecution=new Set(['succeeded','failed','cancelled','skipped']);
const interactive=new Set(['question','fork','blocker']);

/** A stricter opt-in execution profile; the stored legacy Flow is unchanged. */
export function validateFlowTrackingProfile(value:unknown):asserts value is FlowDefinition{
 try{validateEnforcedFlowDefinition(value);}catch(error){fail('VALIDATION_ERROR',`Строгий учёт требует корректную схему: ${(error as Error).message}`);}
}

export function flowForExecution(state:Pick<ProjectState,'revisions'>,execution:Execution):FlowDefinition{
 return state.revisions.find(revision=>revision.id===execution.specRevisionId)?.flow??fail('INVALID_TRANSITION','Назначенная ревизия не содержит схемы процесса.');
}
export function createFlowRun(runtime:Pick<FlowRuntime,'runs'>,nodeId:string,now:string,id:()=>string,retryOfRunId?:string):FlowStepRun{
 if(runtime.runs.length>=FLOW_RUN_LIMIT)fail('FLOW_RUN_LIMIT','Достигнут лимит 1000 проходов; нужна новая попытка.');
 return {id:id(),nodeId,visit:runtime.runs.filter(run=>run.nodeId===nodeId).length+1,state:'ready',createdAt:now,...(retryOfRunId?{retryOfRunId}:{})};
}
export function createFlowRuntime(flow:FlowDefinition,now:string,id:()=>string):FlowRuntime{
 validateFlowTrackingProfile(flow);
 const entry=createFlowRun({runs:[]},flow.entryNodeId,now,id);
 return {version:1,state:'active',currentRunId:entry.id,runs:[entry],traversals:[]};
}
export function requireFlowRuntime(execution:Execution):FlowRuntime{
 return execution.flowRuntime??fail('INVALID_TRANSITION','Для этой попытки строгий учёт проходов не включён.');
}
export function currentFlowRun(execution:Execution,runId:string):FlowStepRun{
 const runtime=requireFlowRuntime(execution),run=runtime.runs.find(item=>item.id===runId);
 if(!run)fail('NOT_FOUND','Проход не относится к назначенной попытке.');
 if(runtime.currentRunId!==runId)fail('INVALID_TRANSITION','Это не текущий проход процесса.');
 return run;
}
export function flowNode(flow:FlowDefinition,nodeId:string):FlowNode{
 return flow.nodes.find(node=>node.id===nodeId)??fail('INVALID_TRANSITION','Узел отсутствует в неизменяемой схеме попытки.');
}
export function assertFlowStepActor(actor:Actor,execution:Execution,node:FlowNode):void{
 if(interactive.has(node.kind)||node.owner==='agent'){
  if(actor.kind!=='agent'||actor.id!==execution.agentId)fail('FORBIDDEN','Этот шаг подтверждает назначенный агент.');
 }else if(actor.kind!=='human')fail('FORBIDDEN','Человеческий или наблюдаемый системный шаг подтверждает человек.');
}
export function selectFlowEdge(flow:FlowDefinition,node:FlowNode,edgeId?:string){
 const outgoing=flow.edges.filter(edge=>edge.source===node.id);
 if(node.kind==='result'){
  if(edgeId!==undefined)fail('VALIDATION_ERROR','Результат не имеет исходящего перехода.');
  return undefined;
 }
 if(node.kind==='condition'&&edgeId===undefined)fail('VALIDATION_ERROR','Условие требует явный edgeId и evidence; текст условия не исполняется.');
 const edge=edgeId===undefined&&outgoing.length===1?outgoing[0]:outgoing.find(item=>item.id===edgeId);
 if(!edge)fail('VALIDATION_ERROR','Нужен допустимый исходящий edgeId текущего узла.');
 return edge;
}
export function currentFlowRequest(state:Pick<ProjectState,'requests'>,execution:Execution,run:FlowStepRun):DecisionRequest|undefined{
 const current=new Set(currentDecisionRequests(state).map(request=>request.id));
 return state.requests.findLast(request=>request.executionId===execution.id&&request.flowStepRunId===run.id&&!request.flowInterrupt&&request.flowNodeId===run.nodeId&&current.has(request.id));
}
export function assertFlowInterruptFacts(state:Pick<ProjectState,'requests'>,execution:Execution,run:FlowStepRun):void{
 for(const request of currentDecisionRequests(state).filter(item=>item.executionId===execution.id&&item.flowStepRunId===run.id&&item.flowInterrupt)){
  // Withdrawing an off-plan, non-physical question still leaves execution
  // waiting. A separate human resume and agent ACK are needed by the caller.
  if(request.state==='withdrawn'&&request.kind!=='Blocker')continue;
  if(request.state!=='resolved'||!request.decision||request.decision.outcome.kind==='reject')fail('INVALID_TRANSITION','Внеплановый запрос этого прохода ещё не разрешён человеком.');
  if(request.kind==='Blocker'){
   if(request.decision.outcome.kind!=='approve'||!request.clearedEvidence)fail('INVALID_TRANSITION','Физический внеплановый блокер этого прохода ещё не устранён.');
  }else if(!request.decision.appliedAt||request.kind==='Question'&&request.decision.outcome.kind!=='answer'||request.kind==='Fork'&&request.decision.outcome.kind!=='approve')fail('INVALID_TRANSITION','Решение по внеплановому запросу этого прохода ещё не применено.');
 }
}
/** Guards use only the current run's current request lineage. */
export function assertFlowHumanFacts(state:Pick<ProjectState,'requests'>,execution:Execution,run:FlowStepRun,node:FlowNode,edgeId?:string,flow?:FlowDefinition):void{
 if(!interactive.has(node.kind))return;
 const request=currentFlowRequest(state,execution,run);
 const kind=node.kind==='question'?'Question':node.kind==='fork'?'Fork':'Blocker';
 if(!request||request.kind!==kind||request.flowNodeId!==node.id||request.state!=='resolved')fail('INVALID_TRANSITION','Нужно актуальное человеческое решение именно этого прохода.');
 if(node.kind==='blocker'){
  if(request.decision?.outcome.kind!=='approve'||!request.clearedEvidence)fail('INVALID_TRANSITION','План блокера не заменяет подтверждённого устранения с evidence.');
  return;
 }
 if(!request.decision?.appliedAt||request.decision.outcome.kind==='reject')fail('INVALID_TRANSITION','Положительное решение этого прохода ещё не подтверждено применением.');
 if(node.kind==='question'&&request.decision.outcome.kind!=='answer')fail('INVALID_TRANSITION','Нужен ответ человека на вопрос этого прохода.');
 if(node.kind==='fork'){
  if(request.decision.outcome.kind!=='approve')fail('INVALID_TRANSITION','Нужен выбранный человеком вариант этого прохода.');
  const edge=flow?.edges.find(item=>item.id===edgeId&&item.source===node.id);
  if(!edge||edge.optionId!==request.decision.outcome.chosenOptionId)fail('INVALID_TRANSITION','Переход не соответствует выбранному и применённому варианту этого прохода.');
 }
}

/** Only replay mutates the projection. Reported Action facts do not move it. */
export function projectFlowRuntimeEvent(state:ProjectState,event:DomainEvent):void{
 const payload=event.payload;
 if(event.type.startsWith('FlowStep')||event.type==='FlowEdgeTraversed'){
  const execution=state.executions.find(item=>item.id===event.executionId);
  if(!execution?.flowRuntime)fail('INVALID_EVENT_STREAM','Событие прохода не имеет строгой попытки.');
  const runtime=execution.flowRuntime;
  if(event.type==='FlowStepRetried'){
   const run=structuredClone(payload.run) as FlowStepRun;runtime.runs.push(run);runtime.currentRunId=run.id;runtime.state='active';
  }else if(event.type==='FlowEdgeTraversed'){
   const run=structuredClone(payload.run) as FlowStepRun;
   runtime.traversals.push(structuredClone(payload.traversal) as FlowRuntime['traversals'][number]);
   runtime.runs.push(run);runtime.currentRunId=run.id;runtime.state='active';
  }else{
   const run=runtime.runs.find(item=>item.id===payload.runId)??fail('INVALID_EVENT_STREAM','Событие относится к неизвестному проходу.');
   if(event.type==='FlowStepStarted'){
    run.state=payload.waiting===true?'waiting':'running';run.startedAt=event.occurredAt;
    if(typeof payload.evidence==='string')run.evidence=payload.evidence;
   }else if(event.type==='FlowStepCompleted'){
    run.state='succeeded';run.finishedAt=event.occurredAt;run.evidence=String(payload.evidence);
    if(payload.processCompleted===true){runtime.state='completed';runtime.currentRunId=null;}
   }else if(event.type==='FlowStepFailed'){
    run.state='failed';run.finishedAt=event.occurredAt;run.evidence=String(payload.evidence);runtime.state='failed';
   }else if(event.type==='FlowStepSkipped'){
    run.state='skipped';run.finishedAt=event.occurredAt;run.evidence=String(payload.evidence);run.reason=String(payload.reason);
   }
  }
 }
 for(const execution of state.executions){
  const runtime=execution.flowRuntime;if(!runtime||runtime.state==='completed')continue;
  const run=runtime.runs.find(item=>item.id===runtime.currentRunId);
  if(terminalExecution.has(execution.state)){
   if(run&&!terminalRun.has(run.state)){run.state='cancelled';run.finishedAt=event.occurredAt;run.reason='Авторизация попытки завершена; локальный успех не объявлен.';}
   runtime.state=execution.state==='failed'?'failed':'cancelled';runtime.currentRunId=null;continue;
  }
  if(runtime.state!=='active'||!run?.startedAt||!['running','waiting'].includes(run.state))continue;
  if(['paused','waiting_for_human'].includes(execution.state)){run.state='waiting';continue;}
  if(execution.state==='running'){
   const flow=flowForExecution(state,execution),node=flowNode(flow,run.nodeId);
   try{
    assertFlowInterruptFacts(state,execution,run);
    const outcome=currentFlowRequest(state,execution,run)?.decision?.outcome;
    const edge=node.kind==='fork'&&outcome?.kind==='approve'?flow.edges.find(item=>item.source===node.id&&item.optionId===outcome.chosenOptionId)?.id:undefined;
    if(currentFlowRequest(state,execution,run))assertFlowHumanFacts(state,execution,run,node,edge,flow);
    if(node.kind!=='wait'&&!execution.stopRequested)run.state='running';
   }catch{run.state='waiting';/* A decision, application and resume ACK are distinct. */}
  }
 }
}
