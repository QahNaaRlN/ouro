import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,emptyState,replay,PROJECT_ID,AGENT_ID,GITHUB_SERVICE_ID,type Actor,type Command,type ProjectState} from '../packages/core/src';

const human:Actor={id:'proposal-human',kind:'human',projectIds:[PROJECT_ID]};
const agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const code=(expected:string)=>(error:unknown)=>(error as {code?:string}).code===expected;
const revision=(title='Следующее ожидание')=>({title,goal:'Проверить предложенное ожидание.',dod:[{id:'proof',text:'Есть проверяемый результат',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});
const run=(state:ProjectState,payload:Record<string,unknown>,actor=human)=>applyCommand(state,{...payload,requestId:crypto.randomUUID(),expectedVersion:state.version} as Command,actor);
function work(initial=emptyState(),title='Исходная работа',assigned=agent){
 let state=run(initial,{type:'createSpec',content:revision(title)}).state;
 const spec=state.specs.at(-1)!,rev=state.revisions.at(-1)!;
 state=run(state,{type:'activateRevision',specId:spec.id,revisionId:rev.id}).state;
 state=run(state,{type:'startExecution',specId:spec.id,specRevisionId:rev.id,agentId:assigned.id}).state;
 const execution=state.executions.at(-1)!;
 state=run(state,{type:'confirmResumed',executionId:execution.id,ackPhase:'start'},assigned).state;
 state=run(state,{type:'reportAction',executionId:execution.id,specId:spec.id,specRevisionId:rev.id,title:'Проверен исходный факт',context:'Наблюдение в назначенном контексте.',actionId:crypto.randomUUID(),phase:'completed',evidence:'fixture://observed-result'},assigned).state;
 return {state,spec,rev,execution,source:state.events.at(-1)!};
}
const summary=(sourceId:string)=>({kind:'reality_summary',title:'Сводка наблюдений',findings:[{text:'Агент предъявил проверяемый факт.',sourceEventIds:[sourceId]}],interpretation:'Это интерпретация агента, требующая рассмотрения.',limitations:'Проверка существования ссылки не подтверждает смысл вывода.'});
function submit(f:ReturnType<typeof work>,content:unknown=summary(f.source.id),extra:Record<string,unknown>={},actor=agent){return run(f.state,{type:'submitAgentProposal',executionId:f.execution.id,specId:f.spec.id,specRevisionId:f.rev.id,sourceCursor:f.state.version,content,...extra},actor);}

test('P01/P02 source-backed proposal is agent-authored, immutable and independent from result/DoD',()=>{
 const f=work(),before=structuredClone(f.state),saved=submit(f),p=(saved.state as any).agentProposals[0],r=(saved.state as any).agentProposalRevisions[0];
 assert.equal(p.state,'pending');assert.equal(p.agentId,agent.id);assert.equal(p.specRevisionId,f.rev.id);assert.equal(r.sourceCursor,f.state.version);
 assert.deepEqual(r.sourceEventIds,[f.source.id]);assert.equal(r.submittedBy,agent.id);assert.equal(saved.events[0].type,'AgentProposalSubmitted');
 assert.deepEqual(f.state,before);assert.equal(saved.state.executions[0].state,'running');assert.equal(saved.state.specs[0].acceptance,undefined);
 assert.deepEqual(replay(saved.state.events),saved.state);
 for(const actor of [human,{id:GITHUB_SERVICE_ID,kind:'service',projectIds:[PROJECT_ID]} as Actor,{...agent,id:'other-agent'}])assert.throws(()=>submit(f,summary(f.source.id),{},actor),code('FORBIDDEN'));
});

test('P02 citations reject inaccessible, foreign-execution, future and circular sources without disclosing bodies',()=>{
 const f=work(),other=work(f.state,'Чужая для этой сводки работа');f.state=other.state;
 for(const [sources,cursor] of [[[other.source.id],f.state.version],[['unknown-secret-event'],f.state.version],[[f.source.id],f.source.version-1],[[f.source.id],f.state.version+1],[[f.state.events.find(e=>e.type==='ExecutionCreated')!.id],f.state.version]] as Array<[string[],number]>){
  assert.throws(()=>submit(f,{...summary(f.source.id),findings:[{text:'Заявленный вывод',sourceEventIds:sources}]},{sourceCursor:cursor}),error=>{
   assert(['VALIDATION_ERROR','FORBIDDEN'].includes((error as any).code));assert(!String((error as Error).message).includes('Чужая'));return true;
  });
 }
 const own=submit(f);f.state=own.state;
 assert.throws(()=>submit(f,summary(own.events[0].id)),code('VALIDATION_ERROR'));
});

test('P01 schemas reject hidden authority, duplicate IDs, unsupported draft keys and aggregate byte overflow',()=>{
 const f=work();
 for(const content of [{...summary(f.source.id),curated:true},{...summary(f.source.id),title:'   '},{...summary(f.source.id),findings:[{text:'Факт',sourceEventIds:[f.source.id,f.source.id]}]},{...summary(f.source.id),kind:'spec_proposal',draft:{...revision(),origin:{kind:'verified'}}},{...summary(f.source.id),findings:[{text:'Факт',sourceEventIds:[f.source.id],actorId:'forged'}]}])assert.throws(()=>submit(f,content),code('VALIDATION_ERROR'));
 const huge={...summary(f.source.id),kind:'spec_proposal',draft:{...revision(),constraints:'x'.repeat(20000),assumptions:'x'.repeat(20000),risks:'x'.repeat(20000),inputs:'x'.repeat(20000),comment:'x'.repeat(20000),goal:'x'.repeat(20000),dod:Array.from({length:10},(_,i)=>({id:`c${i}`,text:'x'.repeat(10000),required:true}))}};
 assert.throws(()=>submit(f,huge),code('VALIDATION_ERROR'));
});

test('P03 pending revisions pin parent and terminal human review preserves all earlier text',()=>{
 const f=work();f.state=submit(f).state;
 const first=structuredClone((f.state as any).agentProposalRevisions[0]),p=(f.state as any).agentProposals[0];
 f.state=submit(f,{...summary(f.source.id),title:'Уточнённая сводка'},{proposalId:p.id,baseProposalRevisionId:first.id}).state;
 const latest=(f.state as any).agentProposalRevisions.at(-1);
 assert.equal(latest.parentRevisionId,first.id);assert.deepEqual((f.state as any).agentProposalRevisions[0],first);
 assert.throws(()=>submit(f,summary(f.source.id),{proposalId:p.id,baseProposalRevisionId:first.id}),code('REVISION_CONFLICT'));
 assert.throws(()=>run(f.state,{type:'reviewAgentProposal',proposalId:p.id,proposalRevisionId:first.id,outcome:'reviewed',comment:'Не тот snapshot'}),code('REVISION_CONFLICT'));
 f.state=run(f.state,{type:'reviewAgentProposal',proposalId:p.id,proposalRevisionId:latest.id,outcome:'reviewed',comment:'Источники прочитаны человеком.'}).state;
 assert.equal((f.state as any).agentProposals[0].state,'reviewed');assert.deepEqual((f.state as any).agentProposalRevisions[0],first);
 assert.throws(()=>submit(f,summary(f.source.id),{proposalId:p.id,baseProposalRevisionId:latest.id}),code('INVALID_TRANSITION'));
 assert.throws(()=>run(f.state,{type:'reviewAgentProposal',proposalId:p.id,proposalRevisionId:latest.id,outcome:'dismissed',comment:'Попытка агента'},agent),code('FORBIDDEN'));
});

test('P03 late r1 analysis retains its immutable context after r2 activation without authorizing execution',()=>{
 const f=work();f.state=run(f.state,{type:'proposeRevision',specId:f.spec.id,content:revision('Новая r2')}).state;
 const r2=f.state.revisions.at(-1)!;f.state=run(f.state,{type:'activateRevision',specId:f.spec.id,revisionId:r2.id}).state;
 const execution=structuredClone(f.state.executions[0]);f.state=submit(f).state;
 assert.equal((f.state as any).agentProposals[0].specRevisionId,f.rev.id);assert.equal(f.state.specs[0].activeRevisionId,r2.id);assert.deepEqual(f.state.executions[0],execution);
 assert.throws(()=>submit(f,summary(f.state.events.find(e=>e.type==='RevisionActivated'&&e.specRevisionId===r2.id)!.id)),code('VALIDATION_ERROR'));
});

test('P04/P05 human adoption creates only one independent idea with exact origin and explicit provenance edge',()=>{
 const f=work();f.state=submit(f,{...summary(f.source.id),kind:'spec_proposal',draft:revision('Предложение агента')}).state;
 const p=(f.state as any).agentProposals[0],r=(f.state as any).agentProposalRevisions[0],content=revision('Отредактировано человеком');
 assert.throws(()=>run(f.state,{type:'reviewAgentProposal',proposalId:p.id,proposalRevisionId:r.id,outcome:'reviewed',comment:'Вместо принятия'}),code('INVALID_TRANSITION'));
 assert.throws(()=>run(f.state,{type:'adoptAgentSpecProposal',proposalId:p.id,proposalRevisionId:r.id,content,comment:'Самопринятие'},agent),code('FORBIDDEN'));
 const saved=run(f.state,{type:'adoptAgentSpecProposal',proposalId:p.id,proposalRevisionId:r.id,content,comment:'Проверены источники.',sourceSpecId:f.spec.id}),draft=saved.state.specs.at(-1)!;
 assert.equal(draft.state,'idea');assert.equal(draft.activeRevisionId,null);assert.equal(draft.acceptance,undefined);assert.deepEqual((draft as any).origin,{kind:'agent_proposal',proposalId:p.id,proposalRevisionId:r.id});
 assert.equal(saved.state.revisions.at(-1)!.authorId,human.id);assert.equal(saved.state.revisions.at(-1)!.title,'Отредактировано человеком');
 assert.deepEqual(saved.events.map(e=>e.type),['SpecCreated','AgentProposalAdopted','DependencyAdded']);
 assert.equal(saved.state.dependencies.at(-1)!.from,f.spec.id);assert.equal(saved.state.dependencies.at(-1)!.to,draft.id);
 assert(!JSON.stringify(saved.events.find(e=>e.type==='AgentProposalAdopted')!.payload).includes('Отредактировано человеком'));
 assert.throws(()=>run(saved.state,{type:'adoptAgentSpecProposal',proposalId:p.id,proposalRevisionId:r.id,content,comment:'Повтор с другим запросом'}),code('INVALID_TRANSITION'));
});

test('P02 source union follows committed order, accepts global context gaps and preserves GitHub service attribution',()=>{
 const f=work(),started=f.state.events.find(event=>event.type==='ExecutionStarted')!,activated=f.state.events.find(event=>event.type==='RevisionActivated')!;
 f.state=run(f.state,{type:'createSpec',content:revision('Событие вне видимого выбранного исполнения')}).state;
 const saved=submit(f,{...summary(f.source.id),findings:[{text:'Наблюдение после ACK.',sourceEventIds:[f.source.id,started.id]},{text:'Контекст ожидания сохранён.',sourceEventIds:[f.source.id,activated.id]}]});
 assert.deepEqual(saved.state.agentProposalRevisions[0].sourceEventIds,[activated.id,started.id,f.source.id]);
 f.state=run(f.state,{type:'createGitHubBinding',executionId:f.execution.id,repositoryId:42,repositoryFullName:'fixture/ouro',ref:'refs/heads/work'}).state;
 const binding=f.state.githubBindings[0],service:Actor={id:GITHUB_SERVICE_ID,kind:'service',projectIds:[PROJECT_ID]},sha='c'.repeat(40);
 f.state=run(f.state,{type:'recordGitHubCommit',bindingId:binding.id,deliveryId:'proposal-source-fixture',payloadDigest:'d'.repeat(64),commit:{repositoryId:42,repositoryFullName:'fixture/ouro',fullSha:sha,url:`https://github.com/fixture/ouro/commit/${sha}`,title:'Проверенный объект',verifiedAt:'2026-10-28T12:00:00.000Z',verificationMethod:'github-api-sha'}},service).state;
 const source=f.state.events.at(-1)!;const observed=submit(f,summary(source.id));assert.equal(observed.state.agentProposalRevisions[0].sourceEventIds[0],source.id);assert.equal(source.actor.id,GITHUB_SERVICE_ID);assert.equal(observed.state.executions[0].state,'running');
});
