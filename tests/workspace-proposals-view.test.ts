import test from 'node:test';
import assert from 'node:assert/strict';
import type {AgentProposal} from '../packages/core/src/types';
import {selectWorkspaceProposals} from '../packages/frontend/src/entities/agent-proposal';

const proposal=(id:string,overrides:Partial<AgentProposal>={}):AgentProposal=>({id,projectId:'project',specId:'spec',specRevisionId:'revision',executionId:'attempt',agentId:'agent',latestRevisionId:id+'-v1',state:'pending',...overrides});

test('related proposals use conjunctive project/spec/revision/attempt scope and preserve all review states',()=>{
  const state={projectId:'project',agentProposals:[proposal('first'),proposal('reviewed',{state:'reviewed'}),proposal('another-attempt',{executionId:'attempt-2'}),proposal('historical',{specRevisionId:'old'}),proposal('other-spec',{specId:'other'}),proposal('foreign',{projectId:'foreign'})]},before=structuredClone(state);
  assert.deepEqual(selectWorkspaceProposals(state,{specId:'spec',revisionId:'revision',executionId:'attempt'}).map(p=>p.id),['reviewed','first']);
  assert.deepEqual(selectWorkspaceProposals(state,{specId:'spec',revisionId:'revision'}).map(p=>p.id),['another-attempt','reviewed','first']);
  assert.deepEqual(selectWorkspaceProposals(state,{specId:'spec',revisionId:'old'}).map(p=>p.id),['historical']);
  assert.deepEqual(state,before);
});

test('unknown and foreign scope does not substitute another available proposal',()=>{
  const state={projectId:'project',agentProposals:[proposal('exists')]};
  for(const scope of [{projectId:'foreign'},{specId:'missing'},{revisionId:'missing'},{executionId:'missing'},{executionId:''},{specId:'spec',revisionId:'wrong'}])assert.deepEqual(selectWorkspaceProposals(state,scope),[]);
  assert.deepEqual(selectWorkspaceProposals(state).map(p=>p.id),['exists']);
});
