import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStore } from '../lib/store';
import { PROJECT_ID, AGENT_ID, type Actor, type Command, type ProjectState } from '../packages/core/src';
import { createAgentService, type AgentToolResult } from '../packages/mcp/src/agent-service';
import { AGENT_TOOLS } from '../packages/mcp/src/tools';

const human:Actor={id:'agent-tools-human',kind:'human',name:'Human',projectIds:[PROJECT_ID]};
const agent:Actor={id:AGENT_ID,kind:'agent',name:'Agent A',projectIds:[PROJECT_ID]};
const code=(result:AgentToolResult)=> (result.structuredContent.error as {code:string})?.code;
const payload=(result:AgentToolResult)=>{assert.equal(result.isError,undefined,JSON.stringify(result.structuredContent));assert.equal(result.structuredContent.ok,true);return result.structuredContent as any;};

async function fixture() {
  const store=await createStore({dataDir:'memory://'});
  const otherRegistration=await store.createAgent('Agent B',human);
  const otherAgent:Actor={...agent,id:otherRegistration.agent.id,name:'Agent B'};
  const service=createAgentService({store,actor:agent});
  const command=async(data:Record<string,unknown>)=>{
    const state=await store.getProject();return (await store.executeCommand({...data,requestId:randomUUID(),expectedVersion:state.version},human)).state;
  };
  const work=async(who:Actor=agent,title='Работа подключённого агента')=>{
    let state=await command({type:'createSpec',content:{title,goal:'Сохранить результат с человеческой приёмкой.',dod:[{id:'connected-dod',text:'Результат предъявлен и проверен',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
    const spec=state.specs.at(-1)!;
    state=await command({type:'activateRevision',specId:spec.id,revisionId:spec.revisionIds[0]});
    state=await command({type:'startExecution',specId:spec.id,specRevisionId:spec.revisionIds[0],agentId:who.id});
    return {spec:state.specs.find(s=>s.id===spec.id)!,execution:state.executions.at(-1)!};
  };
  const invoke=async(name:string,executionId:string,extra:Record<string,unknown>={})=>service.callTool(name,{executionId,requestId:randomUUID(),expectedVersion:(await store.getProject()).version,...extra});
  return {store,service,command,work,invoke,otherAgent};
}

test('agent tools publish strict schemas and expose no human decision or acceptance commands',async()=>{
  const expected=['ouro.get_context','ouro.get_updates','ouro.report_action','ouro.report_question','ouro.report_fork','ouro.report_blocker','ouro.report_flow_step','ouro.confirm_started','ouro.confirm_resumed','ouro.confirm_stopped','ouro.confirm_decision_applied','ouro.complete_execution','ouro.clear_blocker','ouro.withdraw_decision','ouro.submit_decision_clarification','ouro.submit_proposal'];
  assert.deepEqual(AGENT_TOOLS.map(t=>t.name).sort(),expected.sort());
  for(const tool of AGENT_TOOLS)assert(tool.inputSchema);
  assert(!AGENT_TOOLS.some(t=>/resolve|accept_spec|activate/.test(t.name)));
});

test('context and updates are restricted to assigned executions and never reveal another agent work',async()=>{
  const f=await fixture();
  try {
    const own=await f.work(),foreign=await f.work(f.otherAgent,'PRIVATE OTHER AGENT WORK');
    const context=payload(await f.service.callTool('ouro.get_context',{}));
    assert(context.work.some((w:any)=>w.execution.id===own.execution.id));
    assert(!context.work.some((w:any)=>w.execution.id===foreign.execution.id));
    assert(!JSON.stringify(context).includes('PRIVATE OTHER AGENT WORK'));
    const specific=payload(await f.service.callTool('ouro.get_context',{executionId:own.execution.id}));
    assert.equal(specific.work.length,1);assert.equal(specific.work[0].revision.id,own.execution.specRevisionId);
    assert.equal(specific.work[0].permissions.canAcknowledgeStart,true);
    assert.equal(code(await f.service.callTool('ouro.get_context',{executionId:foreign.execution.id})),'FORBIDDEN');
    const beforeForeign=(await f.store.getProject()).version;
    await f.command({type:'requestStop',executionId:foreign.execution.id,reason:'Человек отозвал запуск чужой попытки.'});
    const updates=payload(await f.service.callTool('ouro.get_updates',{afterCursor:beforeForeign}));
    assert.equal(updates.events.length,0);assert(updates.cursor>beforeForeign);
  }finally{await f.store.close();}
});

test('server binds immutable execution context; spoofed authority and foreign decisions do not write',async()=>{
  const f=await fixture();
  try{
    const own=await f.work(),foreign=await f.work(f.otherAgent);
    const before=(await f.store.getProject()).version;
    const spoof=await f.invoke('ouro.report_action',own.execution.id,{phase:'completed',actionId:randomUUID(),title:'Факт',context:'Контекст',evidence:'Проверка',actor:{kind:'human'},specId:foreign.spec.id});
    assert.equal(code(spoof),'VALIDATION_ERROR');
    assert.equal(code(await f.invoke('ouro.confirm_started',foreign.execution.id)),'FORBIDDEN');
    assert.equal(code(await f.service.callTool('ouro.resolve_decision',{decisionRequestId:'fake'})),'UNKNOWN_TOOL');
    assert.equal((await f.store.getProject()).version,before);
    const started=payload(await f.invoke('ouro.confirm_started',own.execution.id));
    assert.equal(started.execution.state,'running');assert.equal(started.events[0].specRevisionId,own.execution.specRevisionId);
    const action=payload(await f.invoke('ouro.report_action',own.execution.id,{phase:'completed',actionId:randomUUID(),title:'Факт',context:'Проверяемый контекст.',evidence:'https://example.test/check'}));
    assert.equal(action.events[0].actor.id,agent.id);assert.equal(action.events[0].specId,own.spec.id);
    assert(!('state' in action));assert(!JSON.stringify(action).includes(foreign.execution.id));
  }finally{await f.store.close();}
});

test('external Question lifecycle keeps human response, agent ACK, result and DoD independent',async()=>{
  const f=await fixture();
  try{
    const {spec,execution}=await f.work();
    payload(await f.invoke('ouro.confirm_started',execution.id));
    const questionResult=payload(await f.invoke('ouro.report_question',execution.id,{title:'Уточнение',context:'Нужно решение владельца.',question:'Как поступить с пустым входом?',blockingScope:'execution'}));
    const question=questionResult.requests.find((r:any)=>r.state==='pending');
    assert(question);assert.equal(questionResult.execution.state,'waiting_for_human');
    assert.equal(code(await f.invoke('ouro.complete_execution',execution.id,{result:'succeeded',evidence:'Рано'})),'INVALID_TRANSITION');
    await f.command({type:'resolveDecision',decisionRequestId:question.id,specRevisionId:execution.specRevisionId,outcome:{kind:'answer',answer:'Показать пустой список с подписью.'}});
    let context=payload(await f.service.callTool('ouro.get_context',{executionId:execution.id}));
    assert.equal(context.work[0].requests[0].decision.outcome.answer,'Показать пустой список с подписью.');
    assert.equal(context.work[0].execution.state,'waiting_for_human');
    await f.command({type:'resumeExecution',executionId:execution.id});
    payload(await f.invoke('ouro.confirm_resumed',execution.id));
    payload(await f.invoke('ouro.confirm_decision_applied',execution.id,{decisionRequestId:question.id,evidence:'Решение прочитано и применено.'}));
    payload(await f.invoke('ouro.complete_execution',execution.id,{result:'succeeded',evidence:'Ожидаемое поведение проверено.'}));
    let state=await f.store.getProject();assert.notEqual(state.specs.find(s=>s.id===spec.id)!.state,'done');
    state=await f.command({type:'acceptSpec',specId:spec.id,specRevisionId:execution.specRevisionId,evidence:{'connected-dod':'Человек проверил результат.'}});
    assert.equal(state.specs.find(s=>s.id===spec.id)!.state,'done');
  }finally{await f.store.close();}
});

test('Fork and Blocker tools require real variants and separate successful remediation evidence',async()=>{
  const f=await fixture();
  try{
    const {execution}=await f.work();payload(await f.invoke('ouro.confirm_started',execution.id));
    const reason='Продолжение зависит от проверяемого выбора человека, потому что у вариантов разные последствия для ожидаемого результата.';
    const bad=await f.invoke('ouro.report_fork',execution.id,{title:'Развилка',context:'Два пути.',reason,options:[{id:'a',title:'A',description:'Первый путь'}]});
    assert.equal(code(bad),'VALIDATION_ERROR');
    const reported=payload(await f.invoke('ouro.report_blocker',execution.id,{title:'Нет входа',context:'Вход недоступен.',reason,expected:'Доступный источник',actual:'Источник недоступен',impact:'Нельзя проверить результат',options:[{id:'repair',title:'Восстановить вход',description:'Отдельная ограниченная попытка.'}]}));
    const blocker=reported.requests.find((r:any)=>r.kind==='Blocker');
    await f.command({type:'resolveDecision',decisionRequestId:blocker.id,specRevisionId:execution.specRevisionId,outcome:{kind:'approve',chosenOptionId:'repair'}});
    assert.equal(code(await f.invoke('ouro.confirm_resumed',execution.id)),'INVALID_TRANSITION');
    const state=await f.command({type:'authorizeRemediation',decisionRequestId:blocker.id,agentId:agent.id});
    const remediation=state.executions.at(-1)!;
    payload(await f.invoke('ouro.confirm_started',remediation.id));
    assert.equal(code(await f.invoke('ouro.clear_blocker',remediation.id,{decisionRequestId:blocker.id,evidence:'Рано'})),'INVALID_TRANSITION');
    payload(await f.invoke('ouro.complete_execution',remediation.id,{result:'succeeded',evidence:'Источник восстановлен и проверен.'}));
    const cleared=payload(await f.invoke('ouro.clear_blocker',remediation.id,{decisionRequestId:blocker.id,evidence:'Доступность подтверждена повторной проверкой.'}));
    assert.equal(cleared.events[0].type,'BlockerCleared');
    assert.equal((await f.store.getProject()).executions.find(e=>e.id===execution.id)!.state,'waiting_for_human');
  }finally{await f.store.close();}
});

test('tool writes preserve idempotency and version conflicts without automatic retries',async()=>{
  const f=await fixture();
  try{
    const {execution}=await f.work();
    const args={executionId:execution.id,requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version};
    const first=payload(await f.service.callTool('ouro.confirm_started',args));
    const duplicate=payload(await f.service.callTool('ouro.confirm_started',args));
    assert.equal(duplicate.replayed,true);assert.deepEqual(duplicate.events,first.events);
    const stale=await f.service.callTool('ouro.report_action',{...args,requestId:randomUUID(),phase:'completed',actionId:randomUUID(),title:'Факт',context:'Контекст',evidence:'Основание'});
    assert.equal(code(stale),'VERSION_CONFLICT');
    const actionArgs={executionId:execution.id,requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version,phase:'completed',actionId:randomUUID(),title:'Факт',context:'Контекст',evidence:'Основание'};
    payload(await f.service.callTool('ouro.report_action',actionArgs));
    assert.equal(code(await f.service.callTool('ouro.report_action',{...actionArgs,title:'Иное тело'})),'IDEMPOTENCY_CONFLICT');
  }finally{await f.store.close();}
});

test('historical completed Action remains reportable against its assigned immutable revision',async()=>{
  const f=await fixture();
  try{
    const {spec,execution}=await f.work();payload(await f.invoke('ouro.confirm_started',execution.id));
    const original=(await f.store.getProject()).revisions.find(r=>r.id===execution.specRevisionId)!;
    await f.command({type:'proposeRevision',specId:spec.id,content:{...original,title:'Новая редакция'}});
    const state=await f.store.getProject();await f.command({type:'activateRevision',specId:spec.id,revisionId:state.revisions.at(-1)!.id});
    const result=payload(await f.invoke('ouro.report_action',execution.id,{actionId:randomUUID(),phase:'completed',title:'Поздний факт',context:'Старый контракт исполнения.',evidence:'Основание старой попытки.'}));
    assert.equal(result.events[0].specRevisionId,execution.specRevisionId);assert.equal(result.events[0].payload.historicalContext,true);
    assert.equal(result.execution.stopRequested,true);
  }finally{await f.store.close();}
});

test('assigned agent receives revision stop controls without exposing a sibling assignment',async()=>{
  const f=await fixture();
  try{
    const own=await f.work(),foreign=await f.work(f.otherAgent,'PRIVATE REVISION SIBLING');
    const before=(await f.store.getProject()).version;
    const original=(await f.store.getProject()).revisions.find(r=>r.id===own.execution.specRevisionId)!;
    await f.command({type:'proposeRevision',specId:own.spec.id,content:{...original,title:'Новое ожидание для своей попытки'}});
    let state=await f.store.getProject();
    await f.command({type:'activateRevision',specId:own.spec.id,revisionId:state.revisions.at(-1)!.id});
    const updates=payload(await f.service.callTool('ouro.get_updates',{afterCursor:before}));
    assert(updates.events.some((e:any)=>e.type==='RevisionActivated'&&e.specId===own.spec.id));
    assert(!JSON.stringify(updates).includes(foreign.execution.id));
    const context=payload(await f.service.callTool('ouro.get_context',{executionId:own.execution.id}));
    assert.equal(context.work[0].execution.stopRequested,true);
    assert.equal(context.work[0].revision.id,own.execution.specRevisionId,'Immutable assigned revision remains unchanged');
    assert.equal(context.work[0].permissions.canAcknowledgeStop,true);
    assert.equal(context.work[0].permissions.canAcknowledgeStart,false);
  }finally{await f.store.close();}
});
