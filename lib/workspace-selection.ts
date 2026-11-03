import type {ProjectState} from '../packages/core/src';

export type WorkspaceSelection={specId?:string;revisionId?:string;executionId?:string};
/** Explicit foreign/stale IDs never silently select a different entity. */
export function selectWorkspaceContext(state:ProjectState,selection:WorkspaceSelection){
  const spec=selection.specId?state.specs.find(item=>item.id===selection.specId):state.specs.at(-1);
  const revisions=state.revisions.filter(item=>item.specId===spec?.id);
  const revision=selection.revisionId?revisions.find(item=>item.id===selection.revisionId):revisions.find(item=>item.id===spec?.activeRevisionId)??revisions.find(item=>item.id===spec?.revisionIds.at(-1));
  const executions=state.executions.filter(item=>item.specId===spec?.id&&item.specRevisionId===revision?.id);
  const execution=selection.executionId==='all'?undefined:selection.executionId?executions.find(item=>item.id===selection.executionId):executions.filter(item=>item.kind==='primary').at(-1)??executions.at(-1);
  return {spec,revision,revisions,execution,executions};
}
