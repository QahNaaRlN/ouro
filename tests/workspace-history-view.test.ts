import test from 'node:test';
import assert from 'node:assert/strict';
import type {DomainEvent} from '../packages/core/src/types';
import {selectWorkspaceHistory,workspaceHistoryEntry,workspaceHistoryRelations} from '../lib/workspace-history-view';

const projectId='history-project',actor={id:'agent-1',kind:'agent' as const,name:'Агент',projectIds:[projectId]};
const event=(id:string,version:number,overrides:Partial<DomainEvent>={}):DomainEvent=>({id,version,type:'ActionReported',schemaVersion:1,projectId,occurredAt:'2026-11-03T10:00:00.000Z',actor,correlationId:'shared-correlation',specId:'spec-a',specRevisionId:'revision-a',executionId:'execution-a',payload:{title:'Проверка',phase:'completed'},...overrides});

test('history scopes conjunctively by project/spec/revision/execution without falling back or mutating committed order',()=>{
  const events=[event('a1',1),event('a2',2,{specRevisionId:'revision-old',executionId:'execution-old'}),event('b',3,{specId:'spec-b'}),event('foreign',4,{projectId:'another-project'}),event('a5',5)];
  const state={projectId,events},before=structuredClone(state);
  assert.deepEqual(selectWorkspaceHistory(state,{specId:'spec-a',revisionId:'revision-a',executionId:'execution-a'}).map(item=>item.id),['a5','a1']);
  assert.deepEqual(selectWorkspaceHistory(state,{specId:'spec-b',revisionId:'revision-old'}),[]);
  assert.deepEqual(selectWorkspaceHistory(state,{projectId:'another-project'}),[]);
  assert.deepEqual(selectWorkspaceHistory(state,{specId:''}),[]);
  assert.deepEqual(selectWorkspaceHistory(state).map(item=>item.id),['a5','b','a2','a1']);
  assert.deepEqual(state,before);
});

test('typed history preserves explicit fields and never manufactures cause/outcome from evidence or unsupported payload objects',()=>{
  const original=event('typed',1,{payload:{title:'Контракт\nпроверен',evidence:'Исходный текст\nстрока 2',reason:{text:'Не строка'},result:{state:'done'}}});
  const entry=workspaceHistoryEntry(original);
  assert.equal(entry.title,original.payload.title);assert.equal(entry.evidence,original.payload.evidence);assert.equal(entry.reason,undefined);assert.equal(entry.outcome,undefined);
  const unknown=workspaceHistoryEntry(event('unknown',2,{type:'FutureEvent',payload:{}}));
  assert.equal(unknown.label,'FutureEvent');assert.equal(unknown.title,'FutureEvent');assert.equal(unknown.reason,undefined);
  const decision=workspaceHistoryEntry(event('decision',3,{type:'DecisionResolved',payload:{decision:{outcome:{kind:'answer',answer:'Да, продолжать'}}}}));
  assert.equal(decision.outcome,'Да, продолжать');assert.equal(decision.label,'Решение человека');
});

test('history causal links use stored causationId only; chronology and shared correlation do not imply consequences',()=>{
  const first=event('first',1),unrelated=event('unrelated',2),caused=event('caused',3,{causationId:first.id}),foreign=event('foreign',4,{projectId:'another-project',causationId:first.id});
  const state={projectId,events:[first,unrelated,caused,foreign]};
  assert.deepEqual(workspaceHistoryRelations(state,first).effects.map(item=>item.id),['caused']);
  assert.equal(workspaceHistoryRelations(state,unrelated).cause,undefined);
  assert.equal(workspaceHistoryRelations(state,caused).cause?.id,'first');
  assert.deepEqual(workspaceHistoryRelations(state,foreign),{cause:undefined,effects:[]});
});

test('history provenance separates agent claims, verified service sources, human acceptance and simulation',()=>{
  const verifiedSource={kind:'github_commit',verificationMethod:'github-api-sha'};
  const forged=workspaceHistoryEntry(event('forged',1,{type:'SpecAccepted',actor:{...actor,name:'GitHub · проверено человеком'},payload:{source:verifiedSource,evidence:'VERIFIED · DoD принят'}}));
  assert.deepEqual(forged.provenance,{kind:'agent_report',label:'Сообщение агента',tone:'neutral'});
  const service={id:'github-service',kind:'service' as const,projectIds:[projectId],name:'GitHub'};
  assert.deepEqual(workspaceHistoryEntry(event('verified',2,{actor:service,payload:{source:verifiedSource}})).provenance,{kind:'verified_github',label:'Проверенный источник GitHub',tone:'positive'});
  assert.equal(workspaceHistoryEntry(event('unsupported',3,{actor:service,payload:{source:{kind:'github_commit',verificationMethod:'unverified'},evidence:'GitHub API SHA verified'}})).provenance.kind,'system_record');
  const human={id:'human-1',kind:'human' as const,projectIds:[projectId],name:'Человек'};
  assert.deepEqual(workspaceHistoryEntry(event('accepted',4,{type:'SpecAccepted',actor:human,payload:{}})).provenance,{kind:'human_acceptance',label:'Приёмка человеком',tone:'positive'});
  assert.equal(workspaceHistoryEntry(event('human-action',5,{actor:human,payload:{source:verifiedSource}})).provenance.kind,'human_action');
  assert.deepEqual(workspaceHistoryEntry(event('training',6,{actor:service,payload:{simulation:true,source:verifiedSource}})).provenance,{kind:'simulation',label:'Учебная симуляция',tone:'attention'});
});
