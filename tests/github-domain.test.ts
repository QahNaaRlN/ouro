import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { applyCommand, emptyState, PROJECT_ID, AGENT_ID, type Actor, type Command, type ProjectState } from '../packages/core/src';
const human:Actor={id:'github-human',kind:'human',projectIds:[PROJECT_ID]};
const agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const service:Actor={id:'ouro-github-webhook',kind:'service',projectIds:[PROJECT_ID]};
const code=(expected:string)=>(e:unknown)=>(e as {code?:string}).code===expected;
const run=(state:ProjectState,payload:Record<string,unknown>,actor=human)=>applyCommand(state,{...payload,requestId:randomUUID(),expectedVersion:state.version} as Command,actor).state;
function fixture(){let state=run(emptyState(),{type:'createSpec',content:{title:'Зафиксировать коммит',goal:'Получать проверенные факты GitHub.',dod:[{id:'checked',text:'Человек проверил результат',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});const spec=state.specs[0],revision=state.revisions[0];state=run(state,{type:'activateRevision',specId:spec.id,revisionId:revision.id});state=run(state,{type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.id});return {state,spec,revision,execution:state.executions[0]};}
const binding=(executionId:string)=>({type:'createGitHubBinding',executionId,repositoryId:123,repositoryFullName:'example/ouro',ref:'refs/heads/work'});
const commit=(bindingId:string)=>({type:'recordGitHubCommit',bindingId,deliveryId:'github-delivery-001',payloadDigest:'f'.repeat(64),commit:{repositoryId:123,repositoryFullName:'example/ouro',fullSha:'a'.repeat(40),url:`https://github.com/example/ouro/commit/${'a'.repeat(40)}`,title:'Изменить реализацию',verifiedAt:'2026-10-29T10:00:00.000Z',verificationMethod:'github-api-sha'}});

test('G02: a human binding stores immutable execution context and refuses duplicate or forged scope',()=>{
  const f=fixture();let state=run(f.state,binding(f.execution.id));const saved=(state as any).githubBindings[0];
  assert.equal(saved.specId,f.spec.id);assert.equal(saved.specRevisionId,f.revision.id);assert.equal(saved.executionId,f.execution.id);assert.equal(saved.repositoryId,123);
  assert.throws(()=>run(state,binding(f.execution.id)),code('BINDING_CONFLICT'));
  assert.throws(()=>run(f.state,binding(f.execution.id),agent),code('FORBIDDEN'));
  assert.throws(()=>run(f.state,{...binding(f.execution.id),executionId:'foreign'}),code('NOT_FOUND'));
  assert.throws(()=>run(f.state,{...binding(f.execution.id),ref:'refs/tags/v1'}),code('VALIDATION_ERROR'));
  state=run(state,{type:'revokeGitHubBinding',bindingId:saved.id});assert((state as any).githubBindings[0].revokedAt);
  state=run(state,binding(f.execution.id));assert.equal((state as any).githubBindings.length,2);
});

test('G03/G07: only GitHub service records verified source; Action does not ACK, complete or accept work',()=>{
  const f=fixture();const state=run(f.state,binding(f.execution.id)),saved=(state as any).githubBindings[0];
  for(const actor of [human,agent,{...service,id:'other-service'}])assert.throws(()=>run(state,commit(saved.id),actor),code('FORBIDDEN'));
  for(const change of [{repositoryId:456},{fullSha:'short'},{url:'https://evil.example/commit'},{verificationMethod:'agent-claimed'}])assert.throws(()=>run(state,{...commit(saved.id),commit:{...commit(saved.id).commit,...change}},service),code('VERIFICATION_FAILED'));
  const next=run(state,commit(saved.id),service),fact=next.events.at(-1)!;
  assert.equal(fact.type,'ActionReported');assert.equal(fact.actor.kind,'service');assert.equal(fact.specRevisionId,f.revision.id);assert.equal((fact.payload.source as any).verificationMethod,'github-api-sha');assert.equal(fact.payload.phase,'completed');
  assert.equal(next.executions[0].state,'queued');assert.notEqual(next.specs[0].state,'done');assert(!('signature' in (fact.payload.source as object)));
});

test('G02/G07: revocation rejects future observations and late verified commit keeps the original revision',()=>{
  const f=fixture();let state=run(f.state,binding(f.execution.id));const saved=(state as any).githubBindings[0];
  const content={...f.revision,title:'Новая редакция ожидания'};state=run(state,{type:'proposeRevision',specId:f.spec.id,content});state=run(state,{type:'activateRevision',specId:f.spec.id,revisionId:state.revisions.at(-1)!.id});
  state=run(state,commit(saved.id),service);assert.equal(state.events.at(-1)!.specRevisionId,f.revision.id);assert.equal(state.events.at(-1)!.payload.historicalContext,true);
  state=run(state,{type:'revokeGitHubBinding',bindingId:saved.id});assert.throws(()=>run(state,{...commit(saved.id),commit:{...commit(saved.id).commit,fullSha:'b'.repeat(40),url:`https://github.com/example/ouro/commit/${'b'.repeat(40)}`}},service),code('BINDING_REVOKED'));
});

test('G03: agent reports cannot attach a server-verified GitHub source',()=>{
  const f=fixture();assert.throws(()=>run(f.state,{type:'reportAction',specId:f.spec.id,specRevisionId:f.revision.id,executionId:f.execution.id,actionId:randomUUID(),phase:'completed',title:'Коммит',context:'Недоверенный источник.',evidence:'https://github.com/example/ouro',source:commit('fake')},agent),code('FORBIDDEN'));
});
