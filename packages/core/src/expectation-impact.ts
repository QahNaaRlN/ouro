import { replay } from './engine';
import { validateFlowDefinition } from './flow';
import { topologicalLayers } from './graph';
import type { DomainEvent, ProjectState, SpecRevision } from './types';

export type ImpactParameters = {projectId:string;c0:number;c1:number;specIds?:readonly string[]};
export type ImpactEventReference = {eventId:string;version:number;type:string;occurredAt:string;specId?:string;specRevisionId?:string;decisionRequestId?:string};
export type BaselineExpectation = {specId:string;humanId:string;title:string;revisionId:string;revision:number;mandatoryPrerequisiteIds:string[]};
export type ImpactChange = ImpactEventReference & {reason:'revision-content-changed'|'spec-invalidated'|'mandatory-prerequisites-changed';fields:string[];baselineRevisionId:string;revisionId:string|null};
export type ChangedExpectation = {specId:string;humanId:string;title:string;baselineRevisionId:string;changes:ImpactChange[]};
export type ObservedExpectation = {specId:string;humanId:string;title:string;eventId:string;version:number;revisionId:string|null};
export type ExpectationImpactReport = {
  algorithmId:'expectation-impact/v1';projectId:string;scope:{mode:'all'|'selected';specIds:string[]|null};
  c0:number|null;c1:number|null;status:'available'|'no-baseline'|'unknown';K:number|null;N:number|null;percent:number|null;reason:string|null;
  baseline:BaselineExpectation[];changedSpecs:ChangedExpectation[];newApprovedSpecs:ObservedExpectation[];newDraftSpecs:ObservedExpectation[];
  counts:Record<string,number>;sources:Record<string,ImpactEventReference[]>;
};

const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const ordered=(a:string,b:string)=>a<b?-1:a>b?1:0;
const cursor=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
class UnknownHistory extends Error {constructor(public reason:string){super(reason);}}
function unknown(reason:string):never {throw new UnknownHistory(reason);}
const identity=(value:unknown):string=>typeof value==='string'&&value.trim().length?value:unknown('invalid-history');
const normalizeText=(value:unknown):string=>typeof value==='string'?value.replace(/\r\n?/g,'\n').trim():unknown('unavailable-revision');
const fields=['goal','dod','constraints','assumptions','risks','inputs','flow'] as const;

/** Only the agreed contract fields participate; view coordinates and labels outside them do not. */
function normalizedContract(revision:SpecRevision):Record<typeof fields[number],unknown> {
  if(!Array.isArray(revision.dod)||!revision.dod.length)unknown('unavailable-revision');
  const criterionIds=new Set<string>();
  const dod=revision.dod.map(criterion=>{
    if(!record(criterion)||typeof criterion.required!=='boolean')unknown('unavailable-revision');
    const id=identity(criterion.id);if(criterionIds.has(id))unknown('invalid-history');criterionIds.add(id);
    return {id,text:normalizeText(criterion.text),required:criterion.required};
  }).sort((a,b)=>ordered(a.id,b.id));
  let flow:unknown=null;
  if(revision.flow!==undefined){
    const source=revision.flow as unknown;
    if(!record(source)||!Array.isArray(source.nodes)||!Array.isArray(source.edges))unknown('unavailable-revision');
    const normalized={entryNodeId:identity(source.entryNodeId),nodes:source.nodes.map(value=>{
      if(!record(value))unknown('unavailable-revision');
      return {id:identity(value.id),kind:identity(value.kind),title:normalizeText(value.title),description:normalizeText(value.description),owner:identity(value.owner)};
    }).sort((a,b)=>ordered(a.id,b.id)),edges:source.edges.map(value=>{
      if(!record(value))unknown('unavailable-revision');
      return {id:identity(value.id),source:identity(value.source),target:identity(value.target),label:normalizeText(value.label),...(value.optionId!==undefined?{optionId:identity(value.optionId)}:{})};
    }).sort((a,b)=>ordered(a.id,b.id))};
    validateFlowDefinition(normalized);flow=normalized;
  }
  return {goal:normalizeText(revision.goal),dod,constraints:normalizeText(revision.constraints),assumptions:normalizeText(revision.assumptions),risks:normalizeText(revision.risks),inputs:normalizeText(revision.inputs),flow};
}

function uniqueIds(items:readonly {id:string}[]):Set<string> {
  const result=new Set<string>();for(const item of items){if(!record(item))unknown('invalid-history');const id=identity(item.id);if(result.has(id))unknown('invalid-history');result.add(id);}return result;
}

/** Structural references are checked alongside the existing authoritative replay. */
function checkedRevisions(state:ProjectState):Map<string,Record<typeof fields[number],unknown>> {
  const specs=uniqueIds(state.specs),revisions=uniqueIds(state.revisions),executions=uniqueIds(state.executions);uniqueIds(state.requests);uniqueIds(state.dependencies);
  const contracts=new Map<string,Record<typeof fields[number],unknown>>();
  for(const revision of state.revisions){
    if(!specs.has(revision.specId)||!Number.isSafeInteger(revision.revision)||revision.revision<1)unknown('unavailable-revision');
    contracts.set(revision.id,normalizedContract(revision));
  }
  for(const spec of state.specs){
    if(spec.projectId!==state.projectId||!Array.isArray(spec.revisionIds)||new Set(spec.revisionIds).size!==spec.revisionIds.length)unknown('invalid-history');
    identity(spec.humanId);identity(spec.title);
    for(const id of spec.revisionIds)if(!revisions.has(id)||state.revisions.find(revision=>revision.id===id)?.specId!==spec.id)unknown('unavailable-revision');
    if(spec.activeRevisionId!==null&&(!spec.revisionIds.includes(spec.activeRevisionId)||!revisions.has(spec.activeRevisionId)))unknown('unavailable-revision');
  }
  for(const execution of state.executions){
    if(!specs.has(execution.specId)||state.revisions.find(revision=>revision.id===execution.specRevisionId)?.specId!==execution.specId)unknown('unavailable-revision');
  }
  for(const request of state.requests){
    const execution=state.executions.find(item=>item.id===request.executionId);
    if(!executions.has(request.executionId)||execution?.specId!==request.specId||execution.specRevisionId!==request.specRevisionId||execution.agentId!==request.agentId)unknown('invalid-history');
  }
  const links=new Set<string>();
  for(const dependency of state.dependencies){
    const key=JSON.stringify([dependency.from,dependency.to,dependency.type]);
    if(!specs.has(dependency.from)||!specs.has(dependency.to)||links.has(key)||!['depends_on','derived_from','replaces','relates_to'].includes(dependency.type))unknown('invalid-history');links.add(key);
  }
  topologicalLayers([...specs],state.dependencies);
  return contracts;
}

function checkedStream(events:readonly DomainEvent[],projectId:string,c1:number):DomainEvent[] {
  if(!Array.isArray(events)||events.length<c1)unknown('incomplete-history');
  const prefix=events.slice(0,c1),ids=new Set<string>();
  for(let index=0;index<prefix.length;index++){
    const event=prefix[index];
    if(!record(event)||event.projectId!==projectId||event.schemaVersion!==1||event.version!==index+1||!record(event.payload)||!record(event.actor))unknown('invalid-history');
    const eventId=identity(event.id),causationId=event.causationId===undefined?undefined:identity(event.causationId);identity(event.type);identity(event.occurredAt);
    const actor=event.actor;
    identity(actor.id);
    if(typeof actor.kind!=='string'||!['human','agent','service'].includes(actor.kind)||!Array.isArray(actor.projectIds)||!actor.projectIds.every(id=>typeof id==='string'&&!!id.trim())||!actor.projectIds.includes(projectId))unknown('invalid-history');
    if(ids.has(eventId)||causationId!==undefined&&!ids.has(causationId))unknown('invalid-history');ids.add(eventId);
  }
  return prefix;
}

const trace=(event:DomainEvent,extra:Partial<ImpactEventReference>={}):ImpactEventReference=>({eventId:event.id,version:event.version,type:event.type,occurredAt:event.occurredAt,...(event.specId?{specId:event.specId}:{}),...(event.specRevisionId?{specRevisionId:event.specRevisionId}:{}),...extra});
const prerequisites=(state:ProjectState,specId:string)=>[...new Set(state.dependencies.filter(link=>link.type==='depends_on'&&link.to===specId).map(link=>link.from))].sort(ordered);

/** A read-only measure of changed expectations, never an agent-quality or completion score. */
export function calculateExpectationImpact(events:readonly DomainEvent[],parameters:ImpactParameters):ExpectationImpactReport {
  const selected=parameters?.specIds;
  const validScope=selected===undefined||Array.isArray(selected)&&selected.every(id=>typeof id==='string'&&!!id.trim());
  const scope={mode:selected===undefined?'all' as const:'selected' as const,specIds:selected===undefined?null:validScope?[...new Set(selected)].sort(ordered):[]};
  const base:ExpectationImpactReport={algorithmId:'expectation-impact/v1',projectId:typeof parameters?.projectId==='string'?parameters.projectId:'',scope,c0:cursor(parameters?.c0)?parameters.c0:null,c1:cursor(parameters?.c1)?parameters.c1:null,status:'unknown',K:null,N:null,percent:null,reason:null,baseline:[],changedSpecs:[],newApprovedSpecs:[],newDraftSpecs:[],counts:{},sources:{}};
  const fail=(reason:string):ExpectationImpactReport=>({...base,status:'unknown',reason});
  if(!base.projectId.trim())return fail('invalid-project');
  if(!cursor(parameters?.c0)||!cursor(parameters?.c1)||parameters.c0>parameters.c1)return fail('invalid-window');
  if(!validScope)return fail('invalid-scope');
  try{
    const {projectId,c0,c1}=parameters;
    const prefix=checkedStream(events,projectId,c1),atEnd=replay(prefix,projectId),contracts=checkedRevisions(atEnd),atStart=replay(prefix.slice(0,c0),projectId);
    checkedRevisions(atStart);
    if(scope.specIds?.some(id=>!atEnd.specs.some(spec=>spec.id===id)))return fail('unknown-scope');
    const allowed=new Set(scope.specIds??atEnd.specs.map(spec=>spec.id));
    const scoped=(specId:unknown):specId is string=>typeof specId==='string'&&allowed.has(specId);
    const baseline=atStart.specs.filter(spec=>allowed.has(spec.id)&&spec.activeRevisionId&&spec.state!=='invalidated').map(spec=>{
      const revision=atStart.revisions.find(item=>item.id===spec.activeRevisionId)??unknown('unavailable-revision');
      return {specId:spec.id,humanId:spec.humanId,title:spec.title,revisionId:revision.id,revision:revision.revision,mandatoryPrerequisiteIds:prerequisites(atStart,spec.id)};
    }).sort((a,b)=>ordered(a.humanId,b.humanId));
    const baselineMap=new Map(baseline.map(item=>[item.specId,item])),changes=new Map<string,ImpactChange[]>();
    const sources:Record<string,ImpactEventReference[]>={revisionChanges:[],firstActivations:[],newApprovedSpecs:[],newDraftSpecs:[],invalidatedBaselineSpecs:[],supersededRequests:[],pendingQuestions:[],pendingForks:[],pendingBlockers:[],historicalActions:[],unlinkedFactsWithFlow:[],unlinkedFactsWithoutFlow:[]};
    const newApprovedSpecs:ObservedExpectation[]=[],newDraftSpecs:ObservedExpectation[]=[];
    const everActivated=new Set(prefix.slice(0,c0).filter(event=>event.type==='RevisionActivated').map(event=>event.specId));
    const currentRevision=new Map(atStart.specs.map(spec=>[spec.id,spec.activeRevisionId]));
    const window=prefix.slice(c0);
    const addChange=(specId:string,event:DomainEvent,reason:ImpactChange['reason'],changedFields:string[],revisionId:string|null)=>{
      const original=baselineMap.get(specId);if(!original)return;
      const change:ImpactChange={...trace(event,{specId}),reason,fields:changedFields,baselineRevisionId:original.revisionId,revisionId};
      changes.set(specId,[...(changes.get(specId)??[]),change]);
    };
    for(const event of window){
      if(event.type==='RevisionActivated'){
        const specId=identity(event.specId),revisionId=identity(event.payload.revisionId),revision=atEnd.revisions.find(item=>item.id===revisionId&&item.specId===specId)??unknown('unavailable-revision');
        if(scoped(specId)){
          if(currentRevision.get(specId))sources.revisionChanges.push(trace(event));
          if(!everActivated.has(specId)){
            const spec=atEnd.specs.find(item=>item.id===specId)??unknown('invalid-history');
            sources.firstActivations.push(trace(event));
            sources.newApprovedSpecs.push(trace(event));
            newApprovedSpecs.push({specId,humanId:spec.humanId,title:revision.title,eventId:event.id,version:event.version,revisionId});
          }
          const original=baselineMap.get(specId);
          if(original){
            const before=contracts.get(original.revisionId)??unknown('unavailable-revision'),after=contracts.get(revisionId)??unknown('unavailable-revision');
            const changedFields=fields.filter(field=>JSON.stringify(before[field])!==JSON.stringify(after[field]));
            if(changedFields.length)addChange(specId,event,'revision-content-changed',changedFields,revisionId);
          }
        }
        currentRevision.set(specId,revisionId);everActivated.add(specId);
      }else if(event.type==='SpecInvalidated'&&scoped(event.specId)&&baselineMap.has(event.specId)){
        sources.invalidatedBaselineSpecs.push(trace(event));addChange(event.specId,event,'spec-invalidated',['validity'],event.specRevisionId??null);
      }else if(event.type==='DependencyAdded'){
        const dependency=event.payload.dependency as ProjectState['dependencies'][number];
        if(dependency.type==='depends_on'&&scoped(dependency.to)&&baselineMap.has(dependency.to))addChange(dependency.to,event,'mandatory-prerequisites-changed',['prerequisites'],currentRevision.get(dependency.to)??null);
      }else if(event.type==='DecisionSuperseded'&&scoped(event.specId)){
        sources.supersededRequests.push(trace(event,{decisionRequestId:identity(event.payload.decisionRequestId)}));
      }
      if(event.type==='ActionReported'||event.type==='DecisionRequested'){
        const request=event.type==='DecisionRequested'?event.payload.request as ProjectState['requests'][number]:null;
        const specId=request?.specId??event.specId,revisionId=request?.specRevisionId??event.specRevisionId;
        if(!scoped(specId))continue;
        const revision=atEnd.revisions.find(item=>item.id===revisionId&&item.specId===specId)??unknown('unavailable-revision');
        const source=trace(event,{specId,specRevisionId:revision.id,...(request?{decisionRequestId:request.id}:{})});
        if(event.type==='ActionReported'&&event.payload.historicalContext===true)sources.historicalActions.push(source);
        if((request?.flowNodeId??event.payload.flowNodeId)===undefined)sources[revision.flow?'unlinkedFactsWithFlow':'unlinkedFactsWithoutFlow'].push(source);
      }
    }
    for(const spec of atEnd.specs.filter(item=>allowed.has(item.id))){
      const creation=window.find(event=>event.type==='SpecCreated'&&event.specId===spec.id);
      if(creation&&!everActivated.has(spec.id)&&spec.state==='idea'){
        newDraftSpecs.push({specId:spec.id,humanId:spec.humanId,title:spec.title,eventId:creation.id,version:creation.version,revisionId:spec.revisionIds.at(-1)??null});
        sources.newDraftSpecs.push(trace(creation));
      }
    }
    for(const request of atEnd.requests.filter(item=>allowed.has(item.specId)&&item.state==='pending')){
      const event=prefix.find(item=>item.type==='DecisionRequested'&&(item.payload.request as {id?:string})?.id===request.id)??unknown('invalid-history');
      const key=request.kind==='Question'?'pendingQuestions':request.kind==='Fork'?'pendingForks':request.kind==='Blocker'?'pendingBlockers':unknown('invalid-history');
      sources[key].push(trace(event,{specId:request.specId,specRevisionId:request.specRevisionId,decisionRequestId:request.id}));
    }
    const changedSpecs=baseline.filter(item=>changes.has(item.specId)).map(item=>({specId:item.specId,humanId:item.humanId,title:item.title,baselineRevisionId:item.revisionId,changes:changes.get(item.specId)!}));
    const N=baseline.length,K=changedSpecs.length,counts=Object.fromEntries(Object.entries(sources).map(([key,value])=>[key,value.length]));
    counts.newApprovedSpecs=newApprovedSpecs.length;counts.newDraftSpecs=newDraftSpecs.length;
    counts.invalidatedBaselineSpecs=new Set(sources.invalidatedBaselineSpecs.map(source=>source.specId)).size;
    return {...base,status:N?'available':'no-baseline',K,N,percent:N?100*K/N:null,reason:N?null:scope.mode==='selected'&&!scope.specIds?.length?'empty-scope':'no-baseline',baseline,changedSpecs,newApprovedSpecs,newDraftSpecs,counts,sources};
  }catch(error){return fail(error instanceof UnknownHistory?error.reason:'invalid-history');}
}
