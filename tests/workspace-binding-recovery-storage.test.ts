import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {createStore,canonicalJSON,type Store} from '../lib/store';
import {resolveWorkspaceFolder} from '../lib/workspace-files';
import {createWorkspaceBindingRecovery,probeWorkspaceBinding,type WorkspaceBindingRecoveryOptions} from '../lib/workspace-binding-recovery';
import {PROJECT_ID,type Actor,type RevisionContent} from '../packages/core/src';
import {createAgentService} from '../packages/mcp/src/agent-service';
import {createAgentWorkspace} from '../packages/mcp/src/workspace';

const operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
const content:RevisionContent={title:'Изолированная работа',goal:'Проверить привязку папки.',dod:[{id:'done',text:'Результат наблюдаем.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
const runtime={platform:'win32' as const,node:'v24.19.0',uv:'1.52.1',architecture:'x64'};
const hasCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;
async function legacyFixture(options:{durable?:boolean;helper?:WorkspaceBindingRecoveryOptions}={}){
 const base=await mkdtemp(path.join(tmpdir(),'ouro-binding-recovery-')),root=path.join(base,'project');await mkdir(root);
 const resolved=await resolveWorkspaceFolder(root),projectId=randomUUID(),bindingId=randomUUID();
 const dataDir=options.durable?path.join(base,'database'):'memory://';
 const helper=createWorkspaceBindingRecovery({runtime,...options.helper});
 const owner=await createStore({dataDir,seedEvents:[],workspaceBindingRecovery:helper});
 await owner.inspect('INSERT INTO ouro_projects(id,version) VALUES($1,0)',[projectId]);
 await owner.inspect("INSERT INTO ouro_workspace_projects(id,name,kind,root_path,binding_id,root_dev,root_ino,created_by) VALUES($1,'Legacy dev0','folder',$2,$3,'0',$4,$5)",[projectId,resolved.canonicalPath,bindingId,resolved.identity.ino,operator.id]);
 const store=await owner.forProject(projectId),human:Actor={...operator,projectIds:[projectId]};
 const registered=await store.createAgent('Recovery fixture agent',human);
 return {base,root,dataDir,owner,store,human,projectId,bindingId,resolved,agent:registered.agent,agentToken:registered.token,close:async()=>{await owner.close();await rm(base,{recursive:true,force:true});}};
}

test('WBR01 rejected legacy dev0 start proves rollback and exact absent command receipt before a fresh retry is offered',async()=>{
 const f=await legacyFixture();
 try{
  const before=await f.store.getProject(),command={type:'startProjectWork',requestId:randomUUID(),expectedVersion:before.version,agentId:f.agent.id,content};
  let rejection:any;
  try{await f.store.executeCommand(command,f.human);}catch(error){rejection=error;}
  assert.equal(rejection?.code,'WORKSPACE_BINDING_CONFLICT');
  assert.deepEqual(await f.store.getProject(),before,'Rejected pre-write guard must preserve events/version/specs/executions.');
  const receipts=await f.store.inspect<{count:string}>('SELECT count(*) FROM ouro_command_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[f.projectId,f.human.id,command.requestId]);
  assert.equal(Number(receipts.rows[0].count),0,'No command receipt may exist after the confirmed rejection.');
  assert.deepEqual(rejection.details?.commandRejection,{phase:'workspace-binding-guard',outcome:'rejected',receipt:'absent',projectId:f.projectId,actorId:f.human.id,requestId:command.requestId,commandType:command.type,bodySha256:createHash('sha256').update(canonicalJSON(command)).digest('hex')});
 }finally{await f.close();}
});

test('WBR02 inspection is read-only and human local Owner authority precedes tickets and receipts',async()=>{
 const f=await legacyFixture();
 try{
  const before=await f.store.getProject(),rowsBefore=await f.store.inspect('SELECT count(*) FROM ouro_principals');
  const inspected=await f.store.inspectWorkspaceBindingRecovery(f.human);
  assert.equal(inspected.eligible,true);assert.equal(inspected.origin,'unknown');assert(inspected.ticket);
  assert.equal(inspected.saved?.identity.dev,'0');assert.deepEqual(inspected.observed?.identity,f.resolved.identity);assert.deepEqual(inspected.audit,[]);
  assert.deepEqual(await f.store.getProject(),before);assert.deepEqual(await f.store.inspect('SELECT count(*) FROM ouro_principals'),rowsBefore);
  assert.equal((await f.store.inspect('SELECT * FROM ouro_workspace_binding_recoveries')).rows.length,0);
  const body={requestId:randomUUID(),ticket:inspected.ticket,reason:'Explicit synthetic trust decision',acknowledgeUnknownContinuity:true};
  for(const actor of [{...f.human,kind:'agent' as const},{...f.human,id:'remote-owner'},{...f.human,projectIds:[PROJECT_ID]}]){
   await assert.rejects(f.store.inspectWorkspaceBindingRecovery(actor),hasCode('FORBIDDEN'));
   await assert.rejects(f.store.recoverWorkspaceBinding(body,actor),hasCode('FORBIDDEN'));
  }
  const uncatalogued=randomUUID();await f.owner.inspect('INSERT INTO ouro_projects(id,version) VALUES($1,0)',[uncatalogued]);
  await assert.rejects((await f.owner.forProject(uncatalogued)).inspectWorkspaceBindingRecovery({...operator,projectIds:[uncatalogued]}),hasCode('FORBIDDEN'));
  await assert.rejects(f.store.recoverWorkspaceBinding({...body,arbitraryPath:f.base},f.human),hasCode('VALIDATION_ERROR'));
  await assert.rejects(f.store.recoverWorkspaceBinding({...body,acknowledgeUnknownContinuity:false},f.human),hasCode('VALIDATION_ERROR'));
  assert.deepEqual(await f.store.getProject(),before);
 }finally{await f.close();}
});

test('WBR03 recovery appends a new binding without touching history and the original frozen start commits exactly once',async()=>{
 let now=Date.parse('2026-11-03T12:00:00.000Z');const f=await legacyFixture({helper:{now:()=>now,ttlMs:1000}});
 try{
  const before=await f.store.getProject(),catalog=await f.store.inspect('SELECT * FROM ouro_workspace_projects WHERE id=$1',[f.projectId]);
  const command={type:'startProjectWork',requestId:randomUUID(),expectedVersion:before.version,agentId:f.agent.id,content};
  await assert.rejects(f.store.executeCommand(command,f.human),hasCode('WORKSPACE_BINDING_CONFLICT'));
  const inspected=await f.store.inspectWorkspaceBindingRecovery(f.human),body={requestId:randomUUID(),ticket:inspected.ticket!,reason:'Human adopts the observed isolated directory; history continuity stays unknown.',acknowledgeUnknownContinuity:true};
  const recovered=await f.store.recoverWorkspaceBinding(body,f.human);
  assert.equal(recovered.replayed,false);assert.notEqual(recovered.project.bindingId,f.bindingId);assert.equal(recovered.recovery.oldBinding.id,f.bindingId);
  assert.equal(recovered.recovery.origin,'unknown');assert.deepEqual(recovered.project.rootIdentity,f.resolved.identity);
  assert.deepEqual(await f.store.getProject(),before);assert.deepEqual(await f.store.inspect('SELECT * FROM ouro_workspace_projects WHERE id=$1',[f.projectId]),catalog);
  assert.deepEqual(await f.store.getWorkspaceBinding(),recovered.recovery.newBinding);
  assert.deepEqual(await f.owner.getWorkspaceProject(f.projectId),recovered.project);
  assert.deepEqual((await f.owner.listWorkspaceProjects(operator)).find(project=>project.id===f.projectId),recovered.project);
  assert.deepEqual((await f.owner.createWorkspaceProject({requestId:randomUUID(),rootPath:f.root},operator)).project,recovered.project,'Registering an existing path must resolve its current overlay.');
  const first=await f.store.executeCommand(command,f.human),again=await f.store.executeCommand(command,f.human);
  assert.equal(first.replayed,false);assert.equal(again.replayed,true);assert.equal(first.state.executions.length,1);assert.deepEqual(again.events,first.events);
  now+=5000;
  const replayed=await f.store.recoverWorkspaceBinding(body,f.human);
  assert.equal(replayed.replayed,true);assert.deepEqual(replayed.recovery,recovered.recovery,'Receipt wins over expiry, new binding and now-queued execution.');
  await rename(f.root,path.join(f.base,'old-project'));
  assert.equal((await f.store.executeCommand(command,f.human)).replayed,true,'Positive original receipt precedes even a lost folder.');
  await assert.rejects(f.store.executeCommand({...command,requestId:randomUUID(),expectedVersion:first.cursor},f.human),hasCode('WORKSPACE_BINDING_CONFLICT'));
  assert.equal((await f.store.getProject()).executions.length,1);
  for(const sql of ['UPDATE ouro_workspace_binding_recoveries SET old_binding_id=old_binding_id','DELETE FROM ouro_workspace_binding_recovery_receipts','TRUNCATE ouro_workspace_binding_recoveries'])await assert.rejects(f.store.inspect(sql),/append-only/);
 }finally{await f.close();}
});

test('WBR04 recovery and receipt roll back together and unchanged request remains reusable',async()=>{
 const f=await legacyFixture();
 try{
  const before=await f.store.getProject(),binding=await f.store.getWorkspaceBinding(),inspected=await f.store.inspectWorkspaceBindingRecovery(f.human);
  const body={requestId:randomUUID(),ticket:inspected.ticket!,reason:'Atomic test trust decision',acknowledgeUnknownContinuity:true};
  await f.store.inspect("CREATE FUNCTION recovery_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected recovery receipt failure'; END $$");
  await f.store.inspect('CREATE TRIGGER recovery_receipt_failure BEFORE INSERT ON ouro_workspace_binding_recovery_receipts FOR EACH ROW EXECUTE FUNCTION recovery_receipt_failure()');
  await assert.rejects(f.store.recoverWorkspaceBinding(body,f.human),/injected recovery receipt failure/);
  assert.deepEqual(await f.store.getWorkspaceBinding(),binding);assert.deepEqual(await f.store.getProject(),before);
  assert.equal((await f.store.inspect('SELECT * FROM ouro_workspace_binding_recoveries')).rows.length,0);
  assert.equal((await f.store.inspect('SELECT * FROM ouro_workspace_binding_recovery_receipts')).rows.length,0);
  await f.store.inspect('DROP TRIGGER recovery_receipt_failure ON ouro_workspace_binding_recovery_receipts');
  assert.equal((await f.store.recoverWorkspaceBinding(body,f.human)).replayed,false);
 }finally{await f.close();}
});

test('WBR05 concurrent confirmation has one audit; stale tickets, changed bodies and revoked humans cannot replay',async()=>{
 const f=await legacyFixture();
 try{
  const inspected=await f.store.inspectWorkspaceBindingRecovery(f.human),body={requestId:randomUUID(),ticket:inspected.ticket!,reason:'One explicit recovery',acknowledgeUnknownContinuity:true};
  const results=await Promise.all([f.store.recoverWorkspaceBinding(body,f.human),f.store.recoverWorkspaceBinding(body,f.human)]);
  assert.equal(results.filter(result=>result.replayed).length,1);assert.equal((await f.store.inspect('SELECT * FROM ouro_workspace_binding_recoveries')).rows.length,1);
  await assert.rejects(f.store.recoverWorkspaceBinding({...body,reason:'Changed reason'},f.human),hasCode('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(f.store.recoverWorkspaceBinding({...body,requestId:randomUUID()},f.human),hasCode('BINDING_RECOVERY_TICKET_INVALID'));
  await f.store.inspect("INSERT INTO ouro_participant_registrations(id,project_id,name,created_by) VALUES($1,$2,'Revoked test operator',$1)",[f.human.id,f.projectId]);
  await f.store.inspect('INSERT INTO ouro_participant_revocations(participant_id,revoked_by) VALUES($1,$1)',[f.human.id]);
  await assert.rejects(f.store.recoverWorkspaceBinding(body,f.human),hasCode('FORBIDDEN'));
  await assert.rejects(f.store.inspectWorkspaceBindingRecovery(f.human),hasCode('FORBIDDEN'));
 }finally{await f.close();}
});

test('WBR06 queued, running, waiting and paused executions block recovery without changing domain cursor',async()=>{
 const f=await legacyFixture();
 try{
  const inspected=await f.store.inspectWorkspaceBindingRecovery(f.human),body={requestId:randomUUID(),ticket:inspected.ticket!,reason:'Recover before beginning isolated work',acknowledgeUnknownContinuity:true};
  await f.store.recoverWorkspaceBinding(body,f.human);
  const agent:Actor={id:f.agent.id,kind:'agent',projectIds:[f.projectId]};
  const send=async(input:Record<string,unknown>,actor=f.human)=>f.store.executeCommand({...input,requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version},actor);
  const started=await send({type:'startProjectWork',agentId:f.agent.id,content}),execution=started.state.executions[0];
  const blocked=async(state:string)=>{
   const before=await f.store.getProject();assert.equal(before.executions[0].state,state);
   const view=await f.store.inspectWorkspaceBindingRecovery(f.human);assert.equal(view.eligible,false);assert.equal(view.ticket,undefined);assert.match(view.reason,/незаверш/);
   await assert.rejects(f.store.recoverWorkspaceBinding({...body,requestId:randomUUID()},f.human),hasCode('WORKSPACE_BINDING_CONFLICT'));assert.deepEqual(await f.store.getProject(),before);
  };
  await blocked('queued');
  await send({type:'confirmResumed',executionId:execution.id,ackPhase:'start'},agent);await blocked('running');
  await send({type:'reportQuestion',executionId:execution.id,specId:execution.specId,specRevisionId:execution.specRevisionId,title:'Wait for a human',context:'Synthetic blocking question',question:'Continue?',blockingScope:'execution'},agent);await blocked('waiting_for_human');
  await send({type:'requestStop',executionId:execution.id,reason:'Explicit stop for boundary test'});
  await send({type:'confirmStopped',executionId:execution.id},agent);await blocked('paused');
 }finally{await f.close();}
});

test('WBR07 durable reopen preserves recovery receipts independently of new ticket keys and domain history',async()=>{
 const f=await legacyFixture({durable:true});let reopened:Store|undefined;
 try{
  const before=await f.store.getProject(),inspected=await f.store.inspectWorkspaceBindingRecovery(f.human),body={requestId:randomUUID(),ticket:inspected.ticket!,reason:'Durable explicit trust',acknowledgeUnknownContinuity:true};
  const committed=await f.store.recoverWorkspaceBinding(body,f.human);await f.owner.close();
  reopened=await createStore({dataDir:f.dataDir,seedEvents:[],workspaceBindingRecovery:createWorkspaceBindingRecovery({runtime})});
  const scoped=await reopened.forProject(f.projectId),receipt=await scoped.recoverWorkspaceBinding(body,f.human);
  assert.equal(receipt.replayed,true);assert.deepEqual(receipt.recovery,committed.recovery);assert.deepEqual(await scoped.getProject(),before);assert.deepEqual(await scoped.getWorkspaceBinding(),committed.recovery.newBinding);
  assert.deepEqual((await scoped.inspectWorkspaceBindingRecovery(f.human)).audit,[committed.recovery]);
 }finally{if(reopened)await reopened.close();await f.close();}
});

test('WBR08 identity drift on the final precommit probe rolls back both new binding and recovery receipt',async()=>{
 let probes=0;
 const f=await legacyFixture({helper:{probe:async binding=>{
  const observed=await probeWorkspaceBinding(binding);
  // Inspection, pre-write verification, then the final probe after both INSERTs.
  return ++probes===3?{...observed,identity:{...observed.identity,dev:(BigInt(observed.identity.dev)+1n).toString()}}:observed;
 }}});
 try{
  const before=await f.store.getProject(),binding=await f.store.getWorkspaceBinding(),inspected=await f.store.inspectWorkspaceBindingRecovery(f.human);
  const body={requestId:randomUUID(),ticket:inspected.ticket!,reason:'Recheck the exact observed tuple at commit',acknowledgeUnknownContinuity:true};
  await assert.rejects(f.store.recoverWorkspaceBinding(body,f.human),hasCode('WORKSPACE_BINDING_CONFLICT'));
  assert.equal(probes,3);assert.deepEqual(await f.store.getWorkspaceBinding(),binding);assert.deepEqual(await f.store.getProject(),before);
  assert.equal((await f.store.inspect('SELECT * FROM ouro_workspace_binding_recoveries')).rows.length,0);
  assert.equal((await f.store.inspect('SELECT * FROM ouro_workspace_binding_recovery_receipts')).rows.length,0);
  assert.equal((await f.store.recoverWorkspaceBinding(body,f.human)).replayed,false,'The exact unchanged request remains reusable after a confirmed rollback.');
 }finally{await f.close();}
});

test('WBR09 repaired latest binding supports the same original assignment, actual agent ACK and real MCP file tools without DoD acceptance',async()=>{
 const f=await legacyFixture();
 try{
  const text='Synthetic project input after explicit binding recovery.\n';
  await writeFile(path.join(f.root,'README.md'),text);
  const before=await f.store.getProject(),original={type:'startProjectWork',requestId:randomUUID(),expectedVersion:before.version,agentId:f.agent.id,content},frozen=canonicalJSON(original);
  await assert.rejects(f.store.executeCommand(original,f.human),hasCode('WORKSPACE_BINDING_CONFLICT'));
  assert.deepEqual(await f.store.getProject(),before);
  const inspection=await f.store.inspectWorkspaceBindingRecovery(f.human);assert(inspection.ticket);
  const recovered=await f.store.recoverWorkspaceBinding({requestId:randomUUID(),ticket:inspection.ticket,reason:'Synthetic owner explicitly trusts the inspected directory.',acknowledgeUnknownContinuity:true},f.human);
  const assigned=await f.store.executeCommand(original,f.human),execution=assigned.state.executions[0];
  assert.equal(assigned.replayed,false);assert.equal(execution.state,'queued');
  const actor=await f.store.authenticateAgentToken(f.agentToken);assert(actor);assert.equal(actor.id,f.agent.id);
  const service=createAgentService({store:f.store,actor,projectId:f.projectId,workspace:createAgentWorkspace(f.store)});
  const context=await service.callTool('ouro.get_context',{executionId:execution.id});
  assert.notEqual(context.isError,true,JSON.stringify(context));
  const contextBody=context.structuredContent as any;
  assert.equal(contextBody.workspace.bindingId,recovered.recovery.newBinding.id);assert.notEqual(contextBody.workspace.bindingId,f.bindingId);
  assert.equal(contextBody.work[0].revision.id,execution.specRevisionId);assert.equal(contextBody.work[0].execution.id,execution.id);
  const ackArgs={executionId:execution.id,requestId:randomUUID(),expectedVersion:assigned.cursor};
  const ack=await service.callTool('ouro.confirm_started',ackArgs);
  assert.notEqual(ack.isError,true,JSON.stringify(ack));assert.equal((ack.structuredContent as any).execution.state,'running');
  const afterAck=await f.store.getProject(),listing=await service.callTool('ouro.list_workspace_files',{executionId:execution.id});
  assert.notEqual(listing.isError,true,JSON.stringify(listing));
  const listed=listing.structuredContent as any;assert(listed.entries.some((entry:any)=>entry.path==='README.md'));
  assert.equal(listed.projectId,f.projectId);assert.equal(listed.executionId,execution.id);assert.equal(listed.bindingId,recovered.recovery.newBinding.id);
  const file=await service.callTool('ouro.read_workspace_file',{executionId:execution.id,path:'README.md'});
  assert.notEqual(file.isError,true,JSON.stringify(file));
  const observed=file.structuredContent as any;
  assert.equal(observed.text,text);assert.equal(observed.sha256,createHash('sha256').update(text).digest('hex'));
  assert.equal(observed.projectId,f.projectId);assert.equal(observed.executionId,execution.id);assert.equal(observed.bindingId,recovered.recovery.newBinding.id);
  const foreign=await service.callTool('ouro.read_workspace_file',{executionId:randomUUID(),path:'README.md'});
  assert.equal(foreign.isError,true);assert.equal((foreign.structuredContent as any).error.code,'FORBIDDEN');
  assert.deepEqual(await f.store.getProject(),afterAck,'MCP context/list/read must not mutate domain history.');
  const replay=await f.store.executeCommand(original,f.human),ackReplay=await service.callTool('ouro.confirm_started',ackArgs);
  assert.equal(replay.replayed,true);assert.equal(replay.state.executions[0].id,execution.id);assert.equal((ackReplay.structuredContent as any).replayed,true);
  const final=await f.store.getProject();assert.equal(final.executions.length,1);assert.equal(final.executions[0].id,execution.id);assert.equal(final.executions[0].specRevisionId,execution.specRevisionId);assert.equal(final.executions[0].state,'running');assert.notEqual(final.specs[0].state,'done');
  assert.deepEqual(final,afterAck);assert.equal(canonicalJSON(original),frozen,'The original request, expectedVersion and content remain frozen.');
 }finally{await f.close();}
});
