import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createStore } from '../lib/store';
import { AGENT_ID, PROJECT_ID, type Actor } from '../packages/core/src';
import { createAgentService } from '../packages/mcp/src/agent-service';
import { createOuroMcpServer } from '../packages/mcp/src/server';

const human:Actor={id:'flow-mcp-human',kind:'human',projectIds:[PROJECT_ID]};
const actor:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
const flow={entryNodeId:'action',nodes:[{id:'action',kind:'action',title:'Проверить вход',description:'Проверить доступность входных данных.',owner:'agent'},{id:'question',kind:'question',title:'Уточнить ожидание',description:'Ответ человека.',owner:'human'},{id:'result',kind:'result',title:'Предъявить результат',description:'DoD принимает человек.',owner:'human'}],edges:[{id:'a',source:'action',target:'question',label:'Нужен ответ'},{id:'b',source:'question',target:'result',label:'Ответ получен'}]};
async function fixture(){
  const store=await createStore({dataDir:'memory://'});
  const humanCommand=async(data:Record<string,unknown>)=>(await store.executeCommand({...data,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},human)).state;
  let state=await humanCommand({type:'createSpec',content:{title:'Связать MCP с процессом',goal:'Хранить явную привязку к назначенному шагу.',dod:[{id:'checked',text:'Связь проверена',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',flow}});
  const spec=state.specs.at(-1)!,revision=state.revisions.at(-1)!;await humanCommand({type:'activateRevision',specId:spec.id,revisionId:revision.id});state=await humanCommand({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:actor.id});
  const execution=state.executions.at(-1)!;await store.executeCommand({type:'confirmResumed',executionId:execution.id,requestId:randomUUID(),expectedVersion:state.version},actor);
  return {store,spec,revision,execution,humanCommand};
}

test('F05: facade supports optional Flow links, rejects spoofed/invalid links and preserves decisions without autoapproval',async()=>{
  const f=await fixture();const service=createAgentService({store:f.store,actor});
  const call=async(name:string,args:Record<string,unknown>)=>service.callTool(name,{executionId:f.execution.id,requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version,...args});
  try{
    const first=await call('ouro.report_action',{flowNodeId:'action',actionId:randomUUID(),phase:'completed',title:'Факт',context:'Прочитан назначенный шаг.',evidence:'test://flow-mcp/action'});
    assert.equal(first.isError,undefined,JSON.stringify(first.structuredContent));assert.equal((first.structuredContent.events as any[])[0].payload.flowNodeId,'action');
    const version=(await f.store.getProject()).version;
    for(const flowNodeId of ['missing','question',42,null,'',{}]){const denied=await call('ouro.report_action',{flowNodeId,actionId:randomUUID(),phase:'completed',title:'Факт',context:'Контекст.',evidence:'test://denied'});assert.equal(denied.isError,true);assert.equal((denied.structuredContent.error as any).code,'VALIDATION_ERROR');}
    const spoof=await call('ouro.report_action',{flowNodeId:'action',specRevisionId:'foreign',actionId:randomUUID(),phase:'completed',title:'Факт',context:'Контекст.',evidence:'test://denied'});assert.equal(spoof.isError,true);assert.equal((await f.store.getProject()).version,version);
    const question=await call('ouro.report_question',{flowNodeId:'question',title:'Вопрос',context:'Шаг требует участия человека.',question:'Какой вход использовать?',blockingScope:'execution'});assert.equal(question.isError,undefined);
    const state=await f.store.getProject(),request=state.requests.findLast(r=>r.executionId===f.execution.id)!;assert.equal((request as any).flowNodeId,'question');assert.equal(request.state,'pending');assert.equal(state.executions.find(e=>e.id===f.execution.id)!.state,'waiting_for_human');assert.notEqual(state.specs.find(s=>s.id===f.spec.id)!.state,'done');
  }finally{await f.store.close();}
});

test('F05: independent official SDK publishes optional flowNodeId and records it through runtime schemas',async()=>{
  const f=await fixture(),server=createOuroMcpServer({store:f.store,actor}),client=new Client({name:'flow-acceptance',version:'1.0'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  try{
    await server.connect(serverTransport);await client.connect(clientTransport);
    const tools=await client.listTools();
    for(const name of ['ouro.report_action','ouro.report_question','ouro.report_fork','ouro.report_blocker']){const tool=tools.tools.find(t=>t.name===name)!;assert.equal((tool.inputSchema.properties?.flowNodeId as any)?.type,'string',name);assert(!tool.inputSchema.required?.includes('flowNodeId'));}
    const context=await client.callTool({name:'ouro.get_context',arguments:{executionId:f.execution.id}});assert.deepEqual((context.structuredContent as any).work[0].revision.flow,flow);
    const write={executionId:f.execution.id,requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version,flowNodeId:'action',actionId:randomUUID(),phase:'completed',title:'SDK факт',context:'Официальный независимый MCP Client.',evidence:'test://sdk/flow'};
    const accepted=await client.callTool({name:'ouro.report_action',arguments:write});assert.equal(accepted.isError,undefined,JSON.stringify(accepted));assert.equal((accepted.structuredContent as any).events[0].payload.flowNodeId,'action');
    const replay=await client.callTool({name:'ouro.report_action',arguments:write});assert.equal((replay.structuredContent as any).replayed,true);
    const denied=await client.callTool({name:'ouro.report_action',arguments:{...write,requestId:randomUUID(),expectedVersion:(await f.store.getProject()).version,flowNodeId:42}});assert.equal(denied.isError,true);
  }finally{await client.close();await server.close();await f.store.close();}
});
