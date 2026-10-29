import {applyCommand} from './engine';
import {flowNode,FlowRuntimeError} from './flow-runtime';
import type {Actor,Command,FlowRuntimeView,ProjectState} from './types';

/** Read-only availability uses the same pure command guards as actual writes. */
export function buildFlowRuntimeView(state:ProjectState,executionId:string,runId?:string):FlowRuntimeView{
 const execution=state.executions.find(item=>item.id===executionId);
 if(!execution)throw new FlowRuntimeError('NOT_FOUND','Исполнение не найдено.');
 const flow=state.revisions.find(revision=>revision.id===execution.specRevisionId)?.flow;
 const runtime=execution.flowRuntime;
 const denied=(reason:string)=>({allowed:false,reason});
 if(!runtime){
  const absent=denied('В этой попытке строгий учёт проходов не включён.');
  return {mode:'legacy',run:null,agentActions:{start:absent,complete:absent,fail:absent},humanActions:{start:absent,complete:absent,fail:absent,retry:absent,skip:absent},edges:(flow?.edges??[]).map(edge=>({id:edge.id,state:'possible',reason:'План без зарегистрированного строгого прохождения.'}))};
 }
 const selectedId=runId??runtime.currentRunId??runtime.runs.at(-1)?.id;
 const run=runtime.runs.find(item=>item.id===selectedId);
 if(!run||!flow)throw new FlowRuntimeError('NOT_FOUND','Выбранный проход не относится к схеме этой попытки.');
 const node=flowNode(flow,run.nodeId);
 const agent:Actor={id:execution.agentId,kind:'agent',projectIds:[state.projectId]};
 const human:Actor={id:'flow-view-human',kind:'human',projectIds:[state.projectId]};
 const probe=(body:Record<string,unknown>,actor:Actor)=>{
  try{
   applyCommand(state,{...body,executionId,requestId:'flow-view-guard-probe',expectedVersion:state.version} as Command,actor);
   return {allowed:true,reason:'Разрешено при текущем подтверждённом состоянии.'};
  }catch(error){return denied(error instanceof Error?error.message:'Действие недоступно.');}
 };
 const complete=(actor:Actor,edgeId?:string)=>probe({type:'reportFlowStep',runId:run.id,phase:'complete',evidence:'Read-only flow transition guard probe.',...(edgeId?{edgeId}:{})},actor);
 const outgoing=flow.edges.filter(edge=>edge.source===node.id);
 const completeAny=(actor:Actor)=>{
  if(!outgoing.length)return complete(actor);
  const possibilities=outgoing.map(edge=>complete(actor,edge.id));
  return possibilities.find(value=>value.allowed)??possibilities[0];
 };
 const actions=(actor:Actor)=>({
  start:probe({type:'reportFlowStep',runId:run.id,phase:'start',evidence:'Read-only step start guard probe.'},actor),
  complete:completeAny(actor),
  fail:probe({type:'reportFlowStep',runId:run.id,phase:'fail',evidence:'Read-only step failure guard probe.'},actor),
 });
 const actorForCompletion=['question','fork','blocker'].includes(node.kind)||node.owner==='agent'?agent:human;
 const taken=runtime.traversals.find(traversal=>traversal.fromRunId===run.id);
 const edges:FlowRuntimeView['edges']=flow.edges.map(edge=>{
  if(edge.source!==run.nodeId)return {id:edge.id,state:'possible',reason:'Ребро относится к другому шагу выбранной схемы.'};
  if(taken)return {id:edge.id,state:edge.id===taken.edgeId?'taken':'not_selected',reason:edge.id===taken.edgeId?'Этот переход записан для выбранного прохода.':'В выбранном проходе записан другой исключающий переход.'};
  const result=complete(actorForCompletion,edge.id);
  return {id:edge.id,state:result.allowed?'available':'blocked',reason:result.reason};
 });
 return {mode:'enforced',run:structuredClone(run),agentActions:actions(agent),humanActions:{...actions(human),retry:probe({type:'retryFlowStep',runId:run.id,reason:'Read-only retry guard probe.'},human),skip:probe({type:'skipFlowStep',runId:run.id,reason:'Read-only skip guard probe.',evidence:'Read-only skip evidence probe.'},human)},edges};
}
