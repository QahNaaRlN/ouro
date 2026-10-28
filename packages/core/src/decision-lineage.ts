import type { DecisionRequest,ProjectState } from './types';

/** A correction retires a permission, while preserving its immutable historical decision. */
export const decisionRoot=(request:DecisionRequest):string=>request.rootRequestId??request.id;
export function currentDecisionRequests(state:Pick<ProjectState,'requests'>):DecisionRequest[]{
  const latest=new Map<string,DecisionRequest>();
  for(const request of state.requests)latest.set(decisionRoot(request),request);
  return [...latest.values()];
}
export const isCurrentDecisionRequest=(state:Pick<ProjectState,'requests'>,request:DecisionRequest):boolean=>currentDecisionRequests(state).some(current=>current.id===request.id);
/** Physical obstacles outlive request withdrawal and contract supersession until explicitly addressed. */
export const openPhysicalBlockers=(state:Pick<ProjectState,'requests'|'specs'>,specId:string):DecisionRequest[]=>{
  const spec=state.specs.find(s=>s.id===specId);
  return currentDecisionRequests(state).filter(r=>r.specId===specId&&r.kind==='Blocker'&&!r.clearedEvidence&&!(r.applicabilityEndedEvidence&&r.applicabilityEndedForRevisionId===spec?.activeRevisionId));
};
