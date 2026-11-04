import type {AgentProposal,ProjectState} from '@/packages/core/src';

export type WorkspaceProposalScope={projectId?:string;specId?:string;revisionId?:string;executionId?:string};

/** Выбирает предложения подтверждённого snapshot; отсутствующие или чужие явные ID не подменяются. */
export function selectWorkspaceProposals(state:Pick<ProjectState,'projectId'|'agentProposals'>,scope:WorkspaceProposalScope={}):AgentProposal[]{
  if(scope.projectId!==undefined&&scope.projectId!==state.projectId)return [];
  return state.agentProposals.filter(proposal=>proposal.projectId===state.projectId
    &&(scope.specId===undefined||proposal.specId===scope.specId)
    &&(scope.revisionId===undefined||proposal.specRevisionId===scope.revisionId)
    &&(scope.executionId===undefined||proposal.executionId===scope.executionId)).toReversed();
}
