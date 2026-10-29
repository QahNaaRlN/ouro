import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,rm,symlink,rename} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createStore} from '../lib/store';
import {PROJECT_ID,AGENT_ID,replay,type Actor,type RevisionContent} from '../packages/core/src';

const operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
const scoped=(projectId:string):Actor=>({...operator,projectIds:[projectId]});
const content=(title='Явная задача'):RevisionContent=>({title,goal:'Проверить результат на выбранном проекте.',dod:[{id:'observed',text:'Человек проверил предъявленный результат.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});
async function fixture(){
 const directory=await mkdtemp(path.join(os.tmpdir(),'ouro-workspace-store-')),rootA=path.join(directory,'folder-a'),rootB=path.join(directory,'folder-b'),dataDir=path.join(directory,'db');
 await mkdir(rootA);await mkdir(rootB);
 const store=await createStore({dataDir});
 return {store,directory,rootA,rootB,dataDir,close:async()=>{await store.close();await rm(directory,{recursive:true,force:true});}};
}
const add=(store:Awaited<ReturnType<typeof createStore>>,rootPath:string,name?:string)=>store.createWorkspaceProject({requestId:randomUUID(),rootPath,...(name?{name}:{})},operator);

test('PW02 explicit project scope reads and authorizes its own stream instead of the legacy singleton',async()=>{
 const projectId=randomUUID();
 const store=await createStore({dataDir:'memory://',seedEvents:[],projectId} as Parameters<typeof createStore>[0]&{projectId:string});
 try{
  const state=await store.getProject();
  assert.equal(state.projectId,projectId,'Selected store must replay the selected project, not the hardcoded legacy project');
  assert.equal(state.version,0);assert.equal(state.specs.length,0);
  const actor:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
  await assert.rejects(store.executeCommand({type:'changeRoadmapState',state:'frozen',requestId:randomUUID(),expectedVersion:0},actor),{code:'FORBIDDEN'});
 }finally{await store.close();}
});

test('PW01 catalog canonical aliases persist with one initialization and do not alter legacy history',async()=>{
 const f=await fixture();let reopened:Awaited<ReturnType<typeof createStore>>|undefined;
 try{
  const legacy=await f.store.getProject(),beforeHashes=await f.store.inspect('SELECT id,content_hash FROM ouro_spec_revisions ORDER BY id');
  const request={requestId:randomUUID(),name:'Мой локальный проект',rootPath:f.rootA},created=await f.store.createWorkspaceProject(request,operator);
  assert.equal(created.created,true);assert.equal(created.replayed,false);assert.equal(created.project.kind,'folder');assert.equal(created.project.rootPath,f.rootA);assert(created.project.rootIdentity);assert(created.project.bindingId);
  const alias=path.join(f.directory,'alias-a');await symlink(f.rootA,alias,'dir');
  const duplicate=await add(f.store,alias);assert.equal(duplicate.created,false);assert.equal(duplicate.project.id,created.project.id);
  const project=await f.store.forProject(created.project.id);assert.equal(project.projectId,created.project.id);assert.strictEqual(await f.store.forProject(created.project.id),project);
  const fresh=await project.getProject();assert.equal(fresh.version,1);assert.equal(fresh.specs.length,0);assert.equal(fresh.executions.length,0);assert.equal(fresh.events[0].type,'ProjectInitialized');assert.equal(fresh.roadmap.title,created.project.name);assert.deepEqual(replay(fresh.events,created.project.id),fresh);
  assert.deepEqual(await f.store.getProject(),legacy);assert.deepEqual(await f.store.inspect('SELECT id,content_hash FROM ouro_spec_revisions ORDER BY id'),beforeHashes);
  await assert.rejects(f.store.forProject(randomUUID()),{code:'NOT_FOUND'});
  await assert.rejects(f.store.listWorkspaceProjects({...operator,id:'ordinary-human'}),{code:'FORBIDDEN'});
  await assert.rejects(f.store.createWorkspaceProject({...request,requestId:randomUUID()},{...operator,kind:'agent'}),{code:'FORBIDDEN'});
  await f.store.close();reopened=await createStore({dataDir:f.dataDir});
  assert.deepEqual(await reopened.getWorkspaceProject(created.project.id),created.project);assert.deepEqual(await(await reopened.forProject(created.project.id)).getProject(),fresh);
  await rm(f.rootA,{recursive:true});
  const receipt=await reopened.createWorkspaceProject(request,operator);assert.equal(receipt.replayed,true);assert.deepEqual(receipt.project,created.project);
 }finally{await reopened?.close();await f.close();}
});

test('PW02 shared owner isolates domain cursors, receipts, agent keys, participants and drafts',async()=>{
 const f=await fixture();try{
  const a=await add(f.store,f.rootA,'Проект А'),b=await add(f.store,f.rootB,'Проект Б'),storeA=await f.store.forProject(a.project.id),storeB=await f.store.forProject(b.project.id),actorA=scoped(a.project.id),actorB=scoped(b.project.id),requestId=randomUUID();
  const createdA=await storeA.executeCommand({type:'createSpec',requestId,expectedVersion:1,content:content('Задача А')},actorA);
  assert.equal((await storeB.getProject()).version,1);assert.equal((await storeB.getProject()).specs.length,0);
  const createdB=await storeB.executeCommand({type:'createSpec',requestId,expectedVersion:1,content:content('Задача Б')},actorB);
  assert.notEqual(createdA.state.specs[0].id,createdB.state.specs[0].id);assert.equal(createdA.cursor,2);assert.equal(createdB.cursor,2);
  const repeated=await storeA.executeCommand({type:'createSpec',requestId,expectedVersion:1,content:content('Задача А')},actorA);assert.equal(repeated.replayed,true);assert.equal(repeated.state.specs[0].title,'Задача А');
  await assert.rejects(storeB.executeCommand({type:'changeRoadmapState',state:'frozen',requestId:randomUUID(),expectedVersion:2},actorA),{code:'FORBIDDEN'});
  const agentA=await storeA.createAgent('ChatGPT A',actorA);assert.equal(agentA.agent.projectId,a.project.id);assert.equal(await storeB.authenticateAgentToken(agentA.token),null);assert.equal((await storeA.authenticateAgentToken(agentA.token))!.projectIds[0],a.project.id);assert.equal((await storeB.listAgents(actorB)).length,0);
  const participant=await storeA.createParticipant('Алиса A',actorA),alice=await storeA.authenticateParticipantCredential(participant.credential);assert(alice);assert.equal(await storeB.authenticateParticipantCredential(participant.credential),null);assert.equal(await storeB.resolveParticipantIdentity(alice.id),null);
  await assert.rejects(storeB.executeCommand({type:'changeRoadmapState',state:'frozen',requestId:randomUUID(),expectedVersion:2},{...alice,projectIds:[b.project.id]}),{code:'FORBIDDEN'});
  const draft=await storeA.createCollaborativeDraft({requestId:randomUUID(),specId:createdA.state.specs[0].id,baseRevisionId:createdA.state.revisions[0].id,expectedVersion:2},alice);
  assert.equal(draft.projectId,a.project.id);await assert.rejects(storeB.getCollaborativeDraft(draft.id,actorB),{code:'NOT_FOUND'});assert.deepEqual(await storeB.listCollaborativeDrafts(actorB),[]);
  await assert.rejects(storeB.createCollaborativeDraft({requestId:randomUUID(),specId:createdA.state.specs[0].id,baseRevisionId:createdA.state.revisions[0].id,expectedVersion:2},actorB),{code:'NOT_FOUND'});
  // The old single-project lease sweeper must not mutate B while running in A.
  const push={repositoryId:42,repositoryFullName:'example/project',ref:'refs/heads/main',before:'a'.repeat(40),after:'b'.repeat(40),commitShas:['b'.repeat(40)],payloadDigest:'c'.repeat(64),disposition:'pending' as const};
  const jobA=await storeA.enqueueGitHubDelivery(randomUUID(),push),jobB=await storeB.enqueueGitHubDelivery(randomUUID(),push);
  await f.store.inspect("UPDATE ouro_github_jobs SET status='processing',attempts=5,lease_until='2000-01-01T00:00:00Z' WHERE delivery_id IN($1,$2)",[jobA.delivery.id,jobB.delivery.id]);
  assert.equal(await storeA.claimGitHubDelivery(),null);
  const statuses=await f.store.inspect<{delivery_id:string;status:string}>('SELECT delivery_id,status FROM ouro_github_jobs WHERE delivery_id IN($1,$2)',[jobA.delivery.id,jobB.delivery.id]);
  assert.equal(statuses.rows.find(row=>row.delivery_id===jobA.delivery.id)!.status,'retryable');assert.equal(statuses.rows.find(row=>row.delivery_id===jobB.delivery.id)!.status,'processing');
  assert.deepEqual((await storeA.getEvents(0)).events.map(event=>event.projectId),[a.project.id,a.project.id]);assert.deepEqual((await storeB.getEvents(0)).events.map(event=>event.projectId),[b.project.id,b.project.id]);
 }finally{await f.close();}
});

test('PW03 start requires a real project agent, queues atomically and restores exact receipt before folder checks',async()=>{
 const f=await fixture();try{
  const added=await add(f.store,f.rootA),store=await f.store.forProject(added.project.id),actor=scoped(added.project.id),initial=await store.getProject();
  const invalid={type:'startProjectWork',requestId:randomUUID(),expectedVersion:initial.version,agentId:randomUUID(),content:content()};
  await assert.rejects(store.executeCommand(invalid,actor),{code:'FORBIDDEN'});assert.deepEqual(await store.getProject(),initial);
  const registered=await store.createAgent('ChatGPT',actor),body={...invalid,agentId:registered.agent.id};
  const first=await store.executeCommand(body,actor);assert.equal(first.replayed,false);assert.deepEqual(first.events.map(event=>event.type),['SpecCreated','RevisionActivated','ExecutionCreated']);assert.equal(first.state.executions[0].state,'queued');assert.equal(first.state.specs[0].activeRevisionId,first.state.revisions[0].id);
  const agent=await store.authenticateAgentToken(registered.token);assert(agent);await store.executeCommand({type:'confirmResumed',executionId:first.state.executions[0].id,requestId:randomUUID(),expectedVersion:first.cursor},agent);assert.equal((await store.getProject()).executions[0].state,'running');
  await store.revokeAgent(registered.agent.id,actor);
  await rm(f.rootA,{recursive:true});
  const receipt=await store.executeCommand(body,actor);assert.equal(receipt.replayed,true);assert.deepEqual(receipt.events,first.events);assert.deepEqual(receipt.state,first.state);assert.equal((await store.getProject()).specs.length,1);
  await assert.rejects(store.executeCommand({...body,content:content('Подмена')},actor),{code:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(store.executeCommand({...body,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},actor));
 }finally{await f.close();}
});

test('PW04 catalog and task outbox failures roll back every new row and leave request IDs reusable',async()=>{
 const f=await fixture();try{
  const before=await f.store.inspect('SELECT count(*) AS count FROM ouro_projects'),body={requestId:randomUUID(),rootPath:f.rootA};
  await f.store.inspect("CREATE FUNCTION workspace_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'workspace injected outbox failure'; END $$");
  await f.store.inspect('CREATE TRIGGER workspace_outbox_fail BEFORE INSERT ON ouro_outbox FOR EACH ROW EXECUTE FUNCTION workspace_test_fail()');
  await assert.rejects(f.store.createWorkspaceProject(body,operator),/workspace injected outbox failure/);
  assert.deepEqual(await f.store.inspect('SELECT count(*) AS count FROM ouro_projects'),before);assert.equal((await f.store.inspect('SELECT * FROM ouro_workspace_receipts')).rows.length,0);assert.equal((await f.store.listWorkspaceProjects(operator)).length,1);
  await f.store.inspect('DROP TRIGGER workspace_outbox_fail ON ouro_outbox');
  const added=await f.store.createWorkspaceProject(body,operator),store=await f.store.forProject(added.project.id),actor=scoped(added.project.id),agent=await store.createAgent('ChatGPT',actor),start={type:'startProjectWork',requestId:randomUUID(),expectedVersion:1,agentId:agent.agent.id,content:content()};
  await store.inspect('CREATE TRIGGER workspace_outbox_fail BEFORE INSERT ON ouro_outbox FOR EACH ROW EXECUTE FUNCTION workspace_test_fail()');
  await assert.rejects(store.executeCommand(start,actor),/workspace injected outbox failure/);
  const unchanged=await store.getProject();assert.equal(unchanged.version,1);assert.equal(unchanged.specs.length,0);assert.equal(unchanged.revisions.length,0);assert.equal(unchanged.executions.length,0);
  assert.equal((await store.inspect('SELECT * FROM ouro_command_receipts WHERE project_id=$1',[added.project.id])).rows.length,0);
  await store.inspect('DROP TRIGGER workspace_outbox_fail ON ouro_outbox');
  assert.equal((await store.executeCommand(start,actor)).replayed,false);assert.equal((await store.getProject()).specs.length,1);
 }finally{await f.close();}
});

test('PW04 canonical alias and task races commit one creation and preserve independent project versions',async()=>{
 const f=await fixture();try{
  const alias=path.join(f.directory,'alias-a');await symlink(f.rootA,alias,'dir');
  const registration=await Promise.all([add(f.store,f.rootA),add(f.store,alias)]);assert.equal(registration.filter(result=>result.created).length,1);assert.equal(registration[0].project.id,registration[1].project.id);
  const store=await f.store.forProject(registration[0].project.id),actor=scoped(store.projectId),agent=await store.createAgent('ChatGPT',actor),first={type:'startProjectWork',requestId:randomUUID(),expectedVersion:1,agentId:agent.agent.id,content:content('Задача 1')};
  const raced=await Promise.allSettled([store.executeCommand(first,actor),store.executeCommand({...first,requestId:randomUUID(),content:content('Задача 2')},actor)]);
  assert.equal(raced.filter(result=>result.status==='fulfilled').length,1);assert.equal(raced.filter(result=>result.status==='rejected'&&result.reason.code==='VERSION_CONFLICT').length,1);assert.equal((await store.getProject()).specs.length,1);assert.equal((await store.getProject()).executions.length,1);
  await assert.rejects(store.inspect('UPDATE ouro_workspace_projects SET name=name'),/append-only/);await assert.rejects(store.inspect('DELETE FROM ouro_workspace_receipts'),/append-only/);
 }finally{await f.close();}
});

test('PW08 replacement of a canonical folder never silently rebinds its project',async()=>{
 const f=await fixture();try{
  const body={requestId:randomUUID(),rootPath:f.rootA},added=await f.store.createWorkspaceProject(body,operator),store=await f.store.forProject(added.project.id),actor=scoped(added.project.id),agent=await store.createAgent('ChatGPT',actor),initial=await store.getProject();
  await rename(f.rootA,`${f.rootA}-original`);await mkdir(f.rootA);
  await assert.rejects(store.executeCommand({type:'startProjectWork',requestId:randomUUID(),expectedVersion:initial.version,agentId:agent.agent.id,content:content()},actor),{code:'WORKSPACE_BINDING_CONFLICT'});
  await assert.rejects(add(f.store,f.rootA),{code:'WORKSPACE_BINDING_CONFLICT'});
  assert.deepEqual(await store.getProject(),initial);assert.deepEqual((await f.store.createWorkspaceProject(body,operator)).project,added.project);assert.deepEqual(await store.getWorkspaceBinding(),{id:added.project.bindingId,canonicalPath:added.project.rootPath,identity:added.project.rootIdentity});
 }finally{await f.close();}
});

test('PW08 assigning an existing active spec checks its folder while exact assignment receipt survives a lost root',async()=>{
 const f=await fixture();try{
  const project=await add(f.store,f.rootA),store=await f.store.forProject(project.project.id),actor=scoped(project.project.id),agent=await store.createAgent('MCP агент',actor);
  const send=async(body:Record<string,unknown>)=>store.executeCommand({...body,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},actor);
  const active=async(title:string)=>{const created=await send({type:'createSpec',content:content(title)}),spec=created.state.specs.at(-1)!,revision=created.state.revisions.at(-1)!;await send({type:'activateRevision',specId:spec.id,revisionId:revision.id});return {spec,revision};};
  const first=await active('Ранее назначенная спека'),original={type:'startExecution',specId:first.spec.id,specRevisionId:first.revision.id,agentId:agent.agent.id,requestId:randomUUID(),expectedVersion:(await store.getProject()).version};
  const accepted=await store.executeCommand(original,actor),next=await active('Новая активированная спека'),version=(await store.getProject()).version;
  const launch={type:'startExecution',specId:next.spec.id,specRevisionId:next.revision.id,agentId:agent.agent.id,requestId:randomUUID(),expectedVersion:version};
  await rename(f.rootA,`${f.rootA}-original`);
  await assert.rejects(store.executeCommand(launch,actor),{code:'WORKSPACE_BINDING_CONFLICT'});
  // Existing startExecution emits optional undefined fields in memory; HTTP
  // and SQL receipts both retain the original JSON representation.
  const receipt=await store.executeCommand(original,actor);assert.equal(receipt.replayed,true);assert.deepEqual(receipt.events,JSON.parse(JSON.stringify(accepted.events)));assert.deepEqual(receipt.state,JSON.parse(JSON.stringify(accepted.state)));
  await mkdir(f.rootA);
  await assert.rejects(store.executeCommand({...launch,requestId:randomUUID()},actor),{code:'WORKSPACE_BINDING_CONFLICT'});assert.equal((await store.getProject()).version,version);
 }finally{await f.close();}
});

test('PW08 authorizing remediation rechecks its folder and restores an old receipt before that guard',async()=>{
 const f=await fixture();try{
  const project=await add(f.store,f.rootA),store=await f.store.forProject(project.project.id),human=scoped(project.project.id),registration=await store.createAgent('MCP агент',human),agent=(await store.authenticateAgentToken(registration.token))!;
  const send=async(body:Record<string,unknown>,actor=human)=>store.executeCommand({...body,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},actor);
  const started=await send({type:'startProjectWork',agentId:agent.id,content:content()}),execution=started.state.executions[0];
  await send({type:'confirmResumed',executionId:execution.id},agent);
  const reported=await send({type:'reportBlocker',executionId:execution.id,specId:execution.specId,specRevisionId:execution.specRevisionId,title:'Нужен отдельный путь устранения',context:'Фактическое препятствие в назначенном проекте.',reason:'Для продолжения требуется отдельная проверка доступности входа и подтверждение проверяемого результата человеком.',expected:'Вход доступен.',actual:'Вход недоступен.',impact:'Работа не может продолжаться.',options:[{id:'repair',title:'Проверить вход',description:'Выполнить ограниченную проверку.'}]},agent),request=reported.state.requests.at(-1)!;
  await send({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:request.specRevisionId,outcome:{kind:'approve',chosenOptionId:'repair'}});
  const original={type:'authorizeRemediation',decisionRequestId:request.id,agentId:agent.id,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},accepted=await store.executeCommand(original,human),remediation=accepted.state.executions.at(-1)!;
  await send({type:'completeExecution',executionId:remediation.id,result:'failed',evidence:'Устранить препятствие в этой попытке не удалось.'},agent);
  const version=(await store.getProject()).version,next={...original,requestId:randomUUID(),expectedVersion:version};
  await rename(f.rootA,`${f.rootA}-original`);
  await assert.rejects(store.executeCommand(next,human),{code:'WORKSPACE_BINDING_CONFLICT'});
  const receipt=await store.executeCommand(original,human);assert.equal(receipt.replayed,true);assert.deepEqual(receipt.events,accepted.events);assert.deepEqual(receipt.state,accepted.state);
  await mkdir(f.rootA);await assert.rejects(store.executeCommand({...next,requestId:randomUUID()},human),{code:'WORKSPACE_BINDING_CONFLICT'});assert.equal((await store.getProject()).version,version);
 }finally{await f.close();}
});

test('PW05 simulator registration bypass belongs only to the legacy project',async()=>{
 const projectId=randomUUID(),store=await createStore({dataDir:'memory://',projectId,seedEvents:[]}),actor=scoped(projectId);try{
  const created=await store.executeCommand({type:'createSpec',content:content(),requestId:randomUUID(),expectedVersion:0},actor),spec=created.state.specs[0],revision=created.state.revisions[0];
  const active=await store.executeCommand({type:'activateRevision',specId:spec.id,revisionId:revision.id,requestId:randomUUID(),expectedVersion:created.cursor},actor);
  await assert.rejects(store.executeCommand({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:AGENT_ID,requestId:randomUUID(),expectedVersion:active.cursor},actor),{code:'FORBIDDEN'});
  const registered=await store.createAgent('Настоящий MCP агент',actor);
  const accepted=await store.executeCommand({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:registered.agent.id,requestId:randomUUID(),expectedVersion:active.cursor},actor);assert.equal(accepted.state.executions[0].agentId,registered.agent.id);
 }finally{await store.close();}
});
