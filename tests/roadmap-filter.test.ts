import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedEvents, replay } from '../packages/core/src';
import type { DecisionRequest, ProjectState } from '../packages/core/src/types';
import { getRoadmapFilterOptions, matchesRoadmapFilter } from '../packages/core/src/roadmap-filter';

function fixture(){
  const state=replay(createSeedEvents()),spec=state.specs[1],revision=spec.activeRevisionId!;
  state.executions.push({id:'work-a',specId:spec.id,specRevisionId:revision,agentId:'agent-a',state:'running',kind:'primary'},{id:'work-b',specId:spec.id,specRevisionId:revision,agentId:'agent-b',state:'running',kind:'remediation'},{id:'old-work',specId:spec.id,specRevisionId:'old-revision',agentId:'old-agent',state:'succeeded',kind:'primary'});
  state.requests=state.requests.filter(request=>request.specId!==spec.id);
  const request=(id:string,kind:DecisionRequest['kind'],agentId:string,executionId:string,specRevisionId=revision,stateValue:DecisionRequest['state']='pending'):DecisionRequest=>({id,kind,agentId,executionId,specId:spec.id,specRevisionId,title:id,context:'Контекст',reason:'Причина',options:[],state:stateValue,blockingScope:'execution'});
  state.requests.push(request('question-a','Question','agent-a','work-a'),request('blocker-b','Blocker','agent-b','work-b'),request('old-fork','Fork','old-agent','old-work','old-revision'),request('resolved-fork','Fork','agent-a','work-a',revision,'resolved'));
  return {state,spec};
}

test('R07 graph and table share one predicate for query/status/current assignment and pending kind',()=>{
  const {state,spec}=fixture();
  assert(matchesRoadmapFilter(spec,state,{}));assert(matchesRoadmapFilter(spec,state,{query:'ПОСТРОИТЬ',status:spec.state,agentId:'agent-a',requestKind:'Question'}));
  assert(!matchesRoadmapFilter(spec,state,{query:'Несуществующее'}));assert(!matchesRoadmapFilter(spec,state,{status:'done'}));
  assert(!matchesRoadmapFilter(spec,state,{agentId:'old-agent'}));assert(!matchesRoadmapFilter(spec,state,{requestKind:'Fork'}));
  assert(matchesRoadmapFilter(spec,state,{requestKind:'Blocker'}));
});

test('R07 agent and request type must belong to the same current pending request',()=>{
  const {state,spec}=fixture();
  assert(!matchesRoadmapFilter(spec,state,{agentId:'agent-a',requestKind:'Blocker'}),'A question cannot combine with B blocker');
  assert(matchesRoadmapFilter(spec,state,{agentId:'agent-b',requestKind:'Blocker'}));
  assert(!matchesRoadmapFilter(spec,state,{agentId:'agent-b',requestKind:'Question'}));
});

test('R07 old revisions and closed requests do not supply filter options; drafts remain visible without assignment filters',()=>{
  const {state,spec}=fixture();const options=getRoadmapFilterOptions(state);
  assert(options.agentIds.includes('agent-a'));assert(options.agentIds.includes('agent-b'));assert(!options.agentIds.includes('old-agent'));
  assert(options.requestKinds.includes('Question'));assert(options.requestKinds.includes('Blocker'));assert(!options.requestKinds.includes('Fork'));
  const draft={...spec,activeRevisionId:null,state:'idea' as const};
  assert(matchesRoadmapFilter(draft,state,{}));assert(!matchesRoadmapFilter(draft,state,{agentId:'agent-a'}));assert(!matchesRoadmapFilter(draft,state,{requestKind:'Question'}));
});
