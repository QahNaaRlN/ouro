import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createStore } from '../lib/store';
import { AGENT_ID, PROJECT_ID, type Actor } from '../packages/core/src';
import { createAgentService } from '../packages/mcp/src/agent-service';
import { createOuroMcpServer } from '../packages/mcp/src/server';

const human:Actor={id:'methodology-mcp-human',kind:'human',projectIds:[PROJECT_ID]};
const actor:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const maintenance=['ouro.withdraw_decision','ouro.submit_decision_clarification'];
const errorCode=(response:{structuredContent?:Record<string,unknown>})=>(response.structuredContent?.error as {code?:string}|undefined)?.code;
async function fixture(){
  const store=await createStore({dataDir:'memory://'}),service=createAgentService({store,actor});
  const call=async(name:string,executionId:string,args:Record<string,unknown>)=>service.callTool(name,{executionId,requestId:randomUUID(),expectedVersion:(await store.getProject()).version,...args});
  const command=async(args:Record<string,unknown>)=>(await store.executeCommand({...args,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},human));
  return {store,service,call,command};
}

test('MCP-M01: published maintenance schemas are strict, bounded and grant no human decision tools',async()=>{
  const f=await fixture();
  try{
    for(const name of maintenance){
      const tool=f.service.listTools().find(tool=>tool.name===name);assert.ok(tool,name);
      assert.equal(tool.annotations.idempotentHint,true);assert.equal(tool.annotations.readOnlyHint,false);
      const state=await f.store.getProject(),r=state.requests.find(r=>r.kind==='Fork')!;
      const args={executionId:r.executionId,decisionRequestId:r.id,requestId:randomUUID(),expectedVersion:state.version,...(name===maintenance[0]?{reason:'Запрос больше не актуален.'}:{clarificationEventId:'event',response:'Дополнительные факты.'})};
      for(const extra of [{actor:{kind:'human'}},{specRevisionId:r.specRevisionId},{unknown:'field'}]){
        const denied=await f.service.callTool(name,{...args,...extra});assert.equal(errorCode(denied),'VALIDATION_ERROR');
      }
      const field=name===maintenance[0]?'reason':'response';
      for(const value of ['',42,null,'x'.repeat(20_001)]){
        const denied=await f.service.callTool(name,{...args,[field]:value});assert.equal(errorCode(denied),'VALIDATION_ERROR');
      }
      assert.equal((await f.store.getProject()).version,state.version);
    }
    assert(!f.service.listTools().some(tool=>/resolve|correct|request_decision_clarification|attest|force_cancel/.test(tool.name)));
  }finally{await f.store.close();}
});

test('MCP-M02: assigned author withdrawal is idempotent, preserves waiting and rejects foreign context',async()=>{
  const f=await fixture();
  try{
    const state=await f.store.getProject(),r=state.requests.find(r=>r.kind==='Fork')!;
    const foreign=state.executions.find(e=>e.id!==r.executionId)!;
    const denied=await f.call('ouro.withdraw_decision',foreign.id,{decisionRequestId:r.id,reason:'Чужой запрос.'});assert.equal(errorCode(denied),'FORBIDDEN');
    assert.equal((await f.store.getProject()).version,state.version);
    const args={executionId:r.executionId,decisionRequestId:r.id,reason:'Дополнительный выбор больше не требуется.',requestId:randomUUID(),expectedVersion:state.version};
    const saved=await f.service.callTool('ouro.withdraw_decision',args);assert.equal(saved.isError,undefined,JSON.stringify(saved.structuredContent));
    assert.equal((saved.structuredContent.events as any[])[0].type,'DecisionWithdrawn');
    const next=await f.store.getProject();assert.equal(next.requests.find(request=>request.id===r.id)!.state,'withdrawn');
    assert.equal(next.executions.find(e=>e.id===r.executionId)!.state,'waiting_for_human');
    assert.equal(next.requests.find(request=>request.id===r.id)!.decision,undefined);
    const replayed=await f.service.callTool('ouro.withdraw_decision',args);assert.equal(replayed.structuredContent.replayed,true);
    assert.equal((await f.store.getProject()).version,next.version);
    const repeated=await f.call('ouro.withdraw_decision',r.executionId,{decisionRequestId:r.id,reason:'Повторная новая команда.'});assert.equal(repeated.isError,true);
    const context=await f.service.callTool('ouro.get_context',{executionId:r.executionId});
    assert.equal((context.structuredContent.work as any[])[0].permissions.canStartAction,false);
    assert.equal((context.structuredContent.work as any[])[0].permissions.canCompleteSuccessfully,false);
  }finally{await f.store.close();}
});

test('MCP-M03: withdrawing a Blocker never removes its physical barrier or authorizes normal work',async()=>{
  const f=await fixture();
  try{
    const r=(await f.store.getProject()).requests.find(r=>r.kind==='Blocker')!;
    const saved=await f.call('ouro.withdraw_decision',r.executionId,{decisionRequestId:r.id,reason:'Отзываю вопрос, техническое препятствие остаётся.'});assert.equal(saved.isError,undefined,JSON.stringify(saved.structuredContent));
    const state=await f.store.getProject(),request=state.requests.find(request=>request.id===r.id)!;
    assert.equal(request.state,'withdrawn');assert.equal(request.clearedEvidence,undefined);
    await assert.rejects(f.command({type:'resumeExecution',executionId:r.executionId}),(error:unknown)=>(error as {code?:string}).code==='INVALID_TRANSITION');
    assert.equal((await f.store.getProject()).version,state.version);
  }finally{await f.store.close();}
});

test('MCP-M04: explicit human clarification receives a source-linked author response without resolving or resuming',async()=>{
  const f=await fixture();
  try{
    assert(f.service.listTools().some(tool=>tool.name==='ouro.submit_decision_clarification'));
    const r=(await f.store.getProject()).requests.find(r=>r.kind==='Fork')!;
    const clarified=await f.command({type:'requestDecisionClarification',decisionRequestId:r.id,question:'Как подтверждено сохранение позиции?'});
    const source=clarified.events.find(event=>event.type==='DecisionClarificationRequested')!;assert.ok(source);
    const before=await f.store.getProject();
    const invalid=await f.call('ouro.submit_decision_clarification',r.executionId,{decisionRequestId:r.id,clarificationEventId:before.events[0].id,response:'Это ссылка на другой факт.'});assert.equal(invalid.isError,true);
    const foreign=before.requests.find(request=>request.id!==r.id)!;
    const wrongRequest=await f.call('ouro.submit_decision_clarification',foreign.executionId,{decisionRequestId:foreign.id,clarificationEventId:source.id,response:'Этот запрос не получал уточнение.'});assert.equal(wrongRequest.isError,true);
    assert.equal((await f.store.getProject()).version,before.version);
    const args={executionId:r.executionId,decisionRequestId:r.id,clarificationEventId:source.id,response:'Координаты сохранены по устойчивому ID в проверке браузера.',requestId:randomUUID(),expectedVersion:before.version};
    const saved=await f.service.callTool('ouro.submit_decision_clarification',args);assert.equal(saved.isError,undefined,JSON.stringify(saved.structuredContent));
    const event=(saved.structuredContent.events as any[])[0];assert.equal(event.type,'DecisionClarificationSubmitted');assert.equal(event.causationId,source.id);
    const state=await f.store.getProject(),request=state.requests.find(request=>request.id===r.id)!;
    assert.equal(request.state,'pending');assert.equal(request.decision,undefined);assert.equal(request.context,r.context);assert.deepEqual(request.options,r.options);
    assert.equal(state.executions.find(e=>e.id===r.executionId)!.state,'waiting_for_human');
    const replayed=await f.service.callTool('ouro.submit_decision_clarification',args);assert.equal(replayed.structuredContent.replayed,true);
    const second=await f.call('ouro.submit_decision_clarification',r.executionId,{decisionRequestId:r.id,clarificationEventId:source.id,response:'Двойной ответ по новому requestId.'});assert.equal(second.isError,true);
    const updates=await f.service.callTool('ouro.get_updates',{afterCursor:before.version});assert((updates.structuredContent.events as any[]).some(item=>item.id===event.id&&item.type==='DecisionClarificationSubmitted'));
  }finally{await f.store.close();}
});

test('MCP-M05: independent official SDK discovers and executes withdrawal using the actual published schema',async()=>{
  const f=await fixture(),server=createOuroMcpServer({store:f.store,actor}),client=new Client({name:'methodology-maintenance-acceptance',version:'1.0'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  try{
    await server.connect(serverTransport);await client.connect(clientTransport);
    const tools=await client.listTools();
    for(const name of maintenance){const tool=tools.tools.find(tool=>tool.name===name);assert.ok(tool,name);assert.equal(tool.inputSchema.additionalProperties,false);assert(tool.inputSchema.required?.includes('decisionRequestId'));}
    const r=(await f.store.getProject()).requests.find(r=>r.kind==='Fork')!;
    const clarified=await f.command({type:'requestDecisionClarification',decisionRequestId:r.id,question:'Каким браузером проверяли?'});
    const clarification=clarified.events.find(event=>event.type==='DecisionClarificationRequested')!;
    const response={executionId:r.executionId,decisionRequestId:r.id,clarificationEventId:clarification.id,response:'Проверка выполнена в Chromium.',requestId:randomUUID(),expectedVersion:clarified.cursor};
    const answered=await client.callTool({name:'ouro.submit_decision_clarification',arguments:response});assert.equal(answered.isError,undefined,JSON.stringify(answered));assert.equal((answered.structuredContent as any).events[0].causationId,clarification.id);
    const answerReplay=await client.callTool({name:'ouro.submit_decision_clarification',arguments:response});assert.equal((answerReplay.structuredContent as any).replayed,true);
    const state=await f.store.getProject();
    const args={executionId:r.executionId,decisionRequestId:r.id,reason:'Проверяемый отзыв через официальный SDK.',requestId:randomUUID(),expectedVersion:state.version};
    const denied=await client.callTool({name:'ouro.withdraw_decision',arguments:{...args,actor:{kind:'human'}}});assert.equal(denied.isError,true);assert.equal((await f.store.getProject()).version,state.version);
    const saved=await client.callTool({name:'ouro.withdraw_decision',arguments:args});assert.equal(saved.isError,undefined,JSON.stringify(saved));assert.equal((saved.structuredContent as any).requests.find((request:any)=>request.id===r.id).state,'withdrawn');
    const replayed=await client.callTool({name:'ouro.withdraw_decision',arguments:args});assert.equal((replayed.structuredContent as any).replayed,true);
  }finally{await client.close();await server.close();await f.store.close();}
});
