import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../lib/store';
import {createAgentService,type AgentToolResult} from '../packages/mcp/src/agent-service';
import {PROJECT_ID,type Actor,type ProjectState} from '../packages/core/src';
import {createProjectSnapshotAdopter} from '../lib/project-snapshot';
const human:Actor={id:'proposal-sql-human',kind:'human',projectIds:[PROJECT_ID]};
const revision=(title='Предлагаемая работа')=>({title,goal:'Проверяемая цель.',dod:[{id:'proof',text:'Результат проверен',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});
const success=(result:AgentToolResult)=>{assert.equal(result.isError,undefined,JSON.stringify(result.structuredContent));return result.structuredContent as any;};
const code=(expected:string)=>(error:unknown)=>(error as {code?:string}).code===expected;
async function fixture(directory='memory://'){
 const store=await createStore({dataDir:directory,seedEvents:[]}),registration=await store.createAgent('Proposal SDK Agent',human),actor=(await store.authenticateAgentToken(registration.token))!;
 const humanCommand=async(payload:Record<string,unknown>)=>(await store.executeCommand({...payload,requestId:crypto.randomUUID(),expectedVersion:(await store.getProject()).version},human)).state;
 let state=await humanCommand({type:'createSpec',content:revision('Исходная SQL работа')});const spec=state.specs[0],rev=state.revisions[0];
 await humanCommand({type:'activateRevision',specId:spec.id,revisionId:rev.id});state=await humanCommand({type:'startExecution',specId:spec.id,specRevisionId:rev.id,agentId:actor.id});const execution=state.executions[0],service=createAgentService({store,actor});
 const tool=async(name:string,extra:Record<string,unknown>={})=>service.callTool(name,{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:(await store.getProject()).version,...extra});
 success(await tool('ouro.confirm_started'));success(await tool('ouro.report_action',{actionId:crypto.randomUUID(),title:'Реальный protocol fixture',context:'Наблюдение из настоящего store.',phase:'completed',evidence:'fixture://proposal/observed'}));
 const source=(await store.getProject()).events.at(-1)!;
 const content={kind:'spec_proposal',title:'Предложение по фактам',findings:[{text:'Источник записан независимо от сводки.',sourceEventIds:[source.id]}],interpretation:'Агент предлагает дальнейшую проверку.',limitations:'Смысл вывода проверяет человек.',draft:revision()};
 return {store,humanCommand,service,tool,source,content,spec,rev,execution,actor,registration};
}

test('P05 real SQL preserves proposals/adoption/receipts across reopen and never exposes adopted spec body to agent',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ouro-proposal-'));let store:Awaited<ReturnType<typeof createStore>>|undefined;
 try{
  const f=await fixture(directory);store=f.store;
  const initial=await store.getProject(),args={executionId:f.execution.id,requestId:crypto.randomUUID(),expectedVersion:initial.version,sourceCursor:initial.version,content:f.content};
  const submitted=success(await f.service.callTool('ouro.submit_proposal',args));assert(!('state' in submitted));assert.equal(submitted.proposals.length,1);
  const proposal=submitted.proposals[0],proposalRevision=submitted.proposalRevisions[0];
  const adoption={type:'adoptAgentSpecProposal',proposalId:proposal.id,proposalRevisionId:proposalRevision.id,requestId:crypto.randomUUID(),expectedVersion:submitted.cursor,content:revision('PRIVATE HUMAN EDITED DESTINATION'),comment:'Человек проверил первичные факты.',sourceSpecId:f.spec.id};
  const saved=await store.executeCommand(adoption,human),draft=saved.state.specs.at(-1)!;
  await f.humanCommand({type:'createSpec',content:revision('Более позднее независимое ожидание')});
  const repeated=await store.executeCommand(adoption,human);assert.equal(repeated.replayed,true);assert.equal(repeated.events.find(e=>e.type==='SpecCreated')!.specId,draft.id);
  const updates=success(await f.service.callTool('ouro.get_updates',{afterCursor:submitted.cursor}));
  assert(updates.events.some((event:any)=>event.type==='AgentProposalAdopted'));assert(!JSON.stringify(updates).includes('PRIVATE HUMAN EDITED DESTINATION'));
  const context=success(await f.service.callTool('ouro.get_context',{executionId:f.execution.id}));assert.equal(context.work[0].proposals[0].state,'adopted');assert(!JSON.stringify(context).includes('PRIVATE HUMAN EDITED DESTINATION'));
  const repeatedSubmission=success(await f.service.callTool('ouro.submit_proposal',args));assert.equal(repeatedSubmission.replayed,true);assert.equal(repeatedSubmission.proposals[0].id,proposal.id);
  await store.close();store=await createStore({dataDir:directory,seedEvents:[]});const state=await store.getProject();assert.equal(state.agentProposals[0].state,'adopted');assert.equal(state.agentProposalRevisions[0].id,proposalRevision.id);assert.equal(state.specs.filter(s=>s.origin?.kind==='agent_proposal').length,1);
  const adopter=createProjectSnapshotAdopter(PROJECT_ID);assert.equal(adopter.adopt({state,cursor:state.version,storage:'embedded-postgres'}).status,'applied');
  await assert.rejects(store.inspect('UPDATE ouro_domain_events SET event=event'),/append-only/);
 }finally{if(store)await store.close();await rm(directory,{recursive:true,force:true});}
});

test('P05 adoption failure rolls back proposal status, spec, dependency and receipt atomically',async()=>{
 const f=await fixture();try{
  const state=await f.store.getProject(),submitted=success(await f.tool('ouro.submit_proposal',{sourceCursor:state.version,content:f.content})),p=submitted.proposals[0],r=submitted.proposalRevisions[0];
  const body={type:'adoptAgentSpecProposal',proposalId:p.id,proposalRevisionId:r.id,content:revision(),comment:'Проверка atomicity.',sourceSpecId:f.spec.id,requestId:crypto.randomUUID(),expectedVersion:submitted.cursor};
  const before=await f.store.getProject();await f.store.inspect("CREATE FUNCTION proposal_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'proposal outbox failure'; END $$");
  await f.store.inspect('CREATE TRIGGER proposal_fail BEFORE INSERT ON ouro_outbox FOR EACH ROW EXECUTE FUNCTION proposal_fail_outbox()');
  await assert.rejects(f.store.executeCommand(body,human),/proposal outbox failure/);assert.deepEqual(await f.store.getProject(),before);
  assert.equal((await f.store.inspect('SELECT * FROM ouro_command_receipts WHERE request_id=$1',[body.requestId])).rows.length,0);
  await f.store.inspect('DROP TRIGGER proposal_fail ON ouro_outbox');const saved=await f.store.executeCommand(body,human);assert.equal(saved.replayed,false);assert.equal(saved.state.agentProposals[0].state,'adopted');
 }finally{await f.store.close();}
});

test('P01/P02 facade rejects forged context and a captured revoked agent cannot submit with an old identity',async()=>{
 const f=await fixture();try{
  const before=await f.store.getProject();
  const forged=await f.tool('ouro.submit_proposal',{sourceCursor:before.version,content:f.content,specId:'forged'});assert.equal((forged.structuredContent.error as any).code,'VALIDATION_ERROR');
  assert.equal((await f.store.getProject()).version,before.version);
  await f.store.revokeAgent(f.actor.id,human);
  const denied=await f.tool('ouro.submit_proposal',{sourceCursor:before.version,content:f.content});assert.equal(denied.isError,true);assert.equal((denied.structuredContent.error as any).code,'FORBIDDEN');
  assert.equal((await f.store.getProject()).version,before.version);
 }finally{await f.store.close();}
});

test('P01 human adoption request IDs reject invalid Unicode before they can alias PostgreSQL text parameters',async()=>{
 const f=await fixture();try{
  const before=await f.store.getProject(),submitted=success(await f.tool('ouro.submit_proposal',{sourceCursor:before.version,content:f.content})),p=submitted.proposals[0],r=submitted.proposalRevisions[0];
  for(const requestId of ['invalid\u0000-request','invalid-\ud800-request','invalid-\udfff-request']){
   await assert.rejects(f.store.executeCommand({type:'adoptAgentSpecProposal',proposalId:p.id,proposalRevisionId:r.id,content:revision(),comment:'Проверка идентификатора.',requestId,expectedVersion:submitted.cursor},human),code('VALIDATION_ERROR'));
   assert.equal((await f.store.getProject()).version,submitted.cursor);
  }
 }finally{await f.store.close();}
});
