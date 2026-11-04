import type { ProjectState } from '../../../../core/src/types';
import { replay } from '../../../../core/src/engine';

export type ProjectSnapshot = {state:ProjectState;cursor:number;storage?:string};
export type SnapshotAdoption =
  | {status:'applied'|'unchanged'|'stale';snapshot:ProjectSnapshot}
  | {status:'invalid';reason:string;snapshot:ProjectSnapshot|null};

type SnapshotInspection = {valid:true;snapshot:ProjectSnapshot}|{valid:false;reason:string};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;

/** JSONB may reorder object keys; optional undefined properties vanish over HTTP. */
const canonicalJSON=(value:unknown):string=>{
  if(Array.isArray(value))return `[${Array.from(value,item=>item===undefined?'null':canonicalJSON(item)).join(',')}]`;
  if(record(value))return `{${Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>`${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  throw new TypeError('Snapshot must contain JSON values');
};

/** Каноническое сетевое JSON-представление, одинаковое для SQL receipt view и browser body. */
export {canonicalJSON as canonicalProjectJSON};

/** Validate the envelope before it can advance either React state or the applied cursor. */
export function inspectProjectSnapshot(value:unknown,projectId:string):SnapshotInspection {
  if(!record(value)||!record(value.state)||!integer(value.cursor))return {valid:false,reason:'invalid-snapshot'};
  const state=value.state;
  if(state.projectId!==projectId)return {valid:false,reason:'project-mismatch'};
  if(!integer(state.version)||state.version!==value.cursor)return {valid:false,reason:'cursor-version-mismatch'};
  if(value.storage!==undefined&&(typeof value.storage!=='string'||!value.storage.length))return {valid:false,reason:'invalid-storage'};
  if(!record(state.roadmap)||typeof state.roadmap.id!=='string'||typeof state.roadmap.title!=='string'||typeof state.roadmap.state!=='string')return {valid:false,reason:'invalid-project-state'};
  for(const field of ['specs','revisions','executions','requests','dependencies'] as const){
    if(!Array.isArray(state[field])||!state[field].every(item=>record(item)&&typeof item.id==='string'))return {valid:false,reason:'invalid-project-state'};
  }
  if(!Array.isArray(state.events)||state.events.length!==value.cursor)return {valid:false,reason:'incomplete-history'};
  const ids=new Set<string>();
  for(let index=0;index<state.events.length;index++){
    const event=state.events[index];
    if(!record(event)||typeof event.id!=='string'||ids.has(event.id)||event.projectId!==projectId||event.version!==index+1||event.schemaVersion!==1||typeof event.type!=='string'||!record(event.payload)||!record(event.actor))return {valid:false,reason:'invalid-event-history'};
    if(event.causationId!==undefined&&(typeof event.causationId!=='string'||!ids.has(event.causationId)))return {valid:false,reason:'invalid-event-history'};
    ids.add(event.id);
  }
  return {valid:true,snapshot:value as unknown as ProjectSnapshot};
}

/** Применяет прежнюю совместимость пустых derived collections без изменения receipt или revision JSON. */
function normalizeValidatedSnapshot(candidate:ProjectSnapshot):SnapshotInspection{
 try{
  const projected=replay(candidate.state.events,candidate.state.projectId),stateForComparison={...candidate.state};let legacyProjection=false;
  for(const field of ['verificationRuns','verificationReviews','verificationSlices','verificationPhases','verificationCycles','verificationRefactorAdmissions','verificationObservationConfigs','verificationObservations'] as const){
   if(!(field in stateForComparison)&&projected[field].length===0){(stateForComparison as unknown as Record<string,unknown>)[field]=[];legacyProjection=true;}
  }
  if(canonicalJSON(projected)!==canonicalJSON(stateForComparison))return {valid:false,reason:'projection-mismatch'};
  return {valid:true,snapshot:legacyProjection?{...candidate,state:projected}:candidate};
 }catch{return {valid:false,reason:'invalid-project-projection'};}
}

/** Проверяет и нормализует независимый snapshot тем же pure правилом, которое использует admission owner. */
export function normalizeProjectSnapshot(value:unknown,projectId:string):SnapshotInspection{
 const checked=inspectProjectSnapshot(value,projectId);return checked.valid?normalizeValidatedSnapshot(checked.snapshot):checked;
}

/** Формирует ровно business view command receipt v1; transport replayed не является частью stored результата. */
export function commandReceiptProjection(value:unknown,projectId:string):{state:ProjectState;events:unknown[];cursor:number}|null{
 if(!record(value)||!Array.isArray(value.events))return null;
 const normalized=normalizeProjectSnapshot(value,projectId);if(!normalized.valid)return null;
 return {state:normalized.snapshot.state,events:value.events,cursor:normalized.snapshot.cursor};
}

/** All network paths share this mutable reference; callers never close over a stale render. */
export function createProjectSnapshotAdopter(projectId:string) {
  let current:ProjectSnapshot|null=null;
  let acceptedHistory:string[]=[];
  const inspect=(value:unknown)=>inspectProjectSnapshot(value,projectId);
  const adopt=(value:unknown):SnapshotAdoption=>{
    const checked=inspect(value);
    if(!checked.valid)return {status:'invalid',reason:checked.reason,snapshot:current};
    let candidate=checked.snapshot;
    let candidateHistory:string[];
    try{candidateHistory=candidate.state.events.map(canonicalJSON);}
    catch{return {status:'invalid',reason:'invalid-event-history',snapshot:current};}
    if(current){
      const length=Math.min(current.cursor,candidate.cursor);
      for(let index=0;index<length;index++)if(acceptedHistory[index]!==candidateHistory[index])return {status:'invalid',reason:'history-mismatch',snapshot:current};
    }
    const normalized=normalizeValidatedSnapshot(candidate);
    if(!normalized.valid)return {status:'invalid',reason:normalized.reason,snapshot:current};
    candidate=normalized.snapshot;
    if(current){
      if(candidate.cursor<current.cursor)return {status:'stale',snapshot:current};
      if(candidate.cursor===current.cursor){
        // Transport metadata may become available on an equal bootstrap/GET;
        // preserve the actual state reference and never append the history twice.
        if(candidate.storage!==undefined&&candidate.storage!==current.storage)current={...current,storage:candidate.storage};
        return {status:'unchanged',snapshot:current};
      }
    }
    current={state:candidate.state,cursor:candidate.cursor,...(candidate.storage!==undefined?{storage:candidate.storage}:current?.storage!==undefined?{storage:current.storage}:{})};
    acceptedHistory=candidateHistory;
    return {status:'applied',snapshot:current};
  };
  return {projectId,getSnapshot:():ProjectSnapshot|null=>current,inspect,adopt};
}
export type ProjectSnapshotAdopter = ReturnType<typeof createProjectSnapshotAdopter>;
