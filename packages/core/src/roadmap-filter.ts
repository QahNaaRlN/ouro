import type { ProjectState, RequestKind, Spec } from './types';

export type RoadmapFilter = {query?:string;status?:string;agentId?:string;requestKind?:string};
const activeAssignments=(spec:Spec,state:ProjectState)=>spec.activeRevisionId?state.executions.filter(execution=>execution.specId===spec.id&&execution.specRevisionId===spec.activeRevisionId):[];
const pendingRequests=(spec:Spec,state:ProjectState)=>{
  const assignments=activeAssignments(spec,state);
  return state.requests.filter(request=>request.specId===spec.id&&request.specRevisionId===spec.activeRevisionId&&request.state==='pending'&&assignments.some(execution=>execution.id===request.executionId&&execution.agentId===request.agentId));
};

/** One predicate is used by graph and table, with a correlated agent/kind match. */
export function matchesRoadmapFilter(spec:Spec,state:ProjectState,filter:RoadmapFilter):boolean {
  const query=filter.query?.trim().toLocaleLowerCase('ru-RU');
  if(query&&!`${spec.humanId} ${spec.title}`.toLocaleLowerCase('ru-RU').includes(query))return false;
  if(filter.status&&filter.status!==spec.state)return false;
  if(filter.requestKind)return pendingRequests(spec,state).some(request=>request.kind===filter.requestKind&&(!filter.agentId||request.agentId===filter.agentId));
  if(filter.agentId)return activeAssignments(spec,state).some(execution=>execution.agentId===filter.agentId);
  return true;
}

export function getRoadmapFilterOptions(state:ProjectState):{agentIds:string[];requestKinds:RequestKind[]} {
  const agentIds=new Set<string>(),kinds=new Set<RequestKind>();
  for(const spec of state.specs){
    for(const execution of activeAssignments(spec,state))agentIds.add(execution.agentId);
    for(const request of pendingRequests(spec,state))kinds.add(request.kind);
  }
  return {agentIds:[...agentIds].sort(),requestKinds:(['Question','Fork','Blocker'] as const).filter(kind=>kinds.has(kind))};
}
