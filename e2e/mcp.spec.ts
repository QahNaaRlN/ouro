import { test, expect, type APIRequestContext } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProjectState } from '../packages/core/src';

test('AC11 MCP boundary rejects unauthenticated access and unsupported session methods',async({request})=>{
  const denied=await request.post('/api/mcp',{data:{jsonrpc:'2.0',id:1,method:'tools/list'}});
  expect(denied.status()).toBe(401);
  expect((await request.get('/api/mcp')).status()).toBe(405);
  expect((await request.delete('/api/mcp')).status()).toBe(405);
});

async function human(request:APIRequestContext,payload:Record<string,unknown>) {
  const state=(await(await request.get('/api/project')).json()).state as ProjectState;
  const response=await request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:state.version}});
  expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state as ProjectState;
}

test('AC03/04/06/07/08 SDK HTTP and stdio agents complete assigned work while human keeps decisions and DoD',async({request,baseURL})=>{
  test.setTimeout(90000);
  await request.get('/api/session');
  const created=await request.post('/api/agents',{data:{name:`SDK accept ${Date.now()}`}});
  expect(created.ok(),await created.text()).toBeTruthy();
  const {agent,token}=await created.json();
  const response=await request.post('/api/agents',{data:{name:`Isolated SDK ${Date.now()}`}});
  const other=await response.json();
  let state=await human(request,{type:'createSpec',content:{title:`Подключить внешний SDK ${Date.now()}`,goal:'Получать реальные MCP tool calls по назначению.',dod:[{id:'mcp-checked',text:'Протокол завершён с отдельным human DoD',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
  const spec=state.specs.at(-1)!,revision=spec.revisionIds[0];
  await human(request,{type:'activateRevision',specId:spec.id,revisionId:revision});
  state=await human(request,{type:'startExecution',specId:spec.id,specRevisionId:revision,agentId:agent.id});
  const execution=state.executions.at(-1)!;
  const url=new URL('/api/mcp',baseURL);
  const client=new Client({name:'ouro-sdk-http-acceptance',version:'1.0'});
  const stranger=new Client({name:'ouro-sdk-stranger',version:'1.0'});
  const stdio=new Client({name:'ouro-sdk-stdio-acceptance',version:'1.0'});
  const parse=(r:unknown)=> (r as {structuredContent:Record<string,any>}).structuredContent;
  try {
    await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
    const tools=await client.listTools();expect(tools.tools.map(t=>t.name)).toContain('ouro.confirm_started');
    expect(tools.tools.some(t=>/resolve_decision|accept_spec/.test(t.name))).toBe(false);
    const context=await client.callTool({name:'ouro.get_context',arguments:{executionId:execution.id}});expect(context.isError).not.toBe(true);
    expect(JSON.stringify(context.structuredContent)).toContain(spec.title);
    const mutate=async(name:string,args:Record<string,unknown>={})=>{
      const current=(await(await request.get('/api/project')).json()).state as ProjectState;
      const result=await client.callTool({name,arguments:{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:current.version,...args}});
      expect(result.isError,JSON.stringify(result)).not.toBe(true);return result;
    };
    await mutate('ouro.confirm_started');
    const actionState=(await(await request.get('/api/project')).json()).state as ProjectState;
    const action={executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:actionState.version,actionId:crypto.randomUUID(),phase:'completed',title:'SDK прочитал контракт',context:'Реальный MCP protocol client, без внешнего LLM.',evidence:'test://mcp-sdk/contract'};
    const actionResult=await client.callTool({name:'ouro.report_action',arguments:action});expect(actionResult.isError).not.toBe(true);
    const repeated=parse(await client.callTool({name:'ouro.report_action',arguments:action}));expect(repeated.replayed).toBe(true);
    await mutate('ouro.report_question',{title:'Как обработать пустой ввод?',context:'Нужно авторитетное решение человека.',question:'Показать пустой список?',blockingScope:'execution'});
    state=(await(await request.get('/api/project')).json()).state;
    const question=state.requests.findLast(r=>r.executionId===execution.id)!;
    await human(request,{type:'resolveDecision',decisionRequestId:question.id,specRevisionId:revision,outcome:{kind:'answer',answer:'Да, пустой список с явной подписью.'}});
    const answered=await client.callTool({name:'ouro.get_context',arguments:{executionId:execution.id}});expect(JSON.stringify(answered.structuredContent)).toContain('Да, пустой список');
    await mutate('ouro.confirm_decision_applied',{decisionRequestId:question.id,evidence:'test://mcp-sdk/decision-received'});
    await human(request,{type:'resumeExecution',executionId:execution.id});await mutate('ouro.confirm_resumed');
    const beforeStop=(await(await request.get('/api/project')).json()).state as ProjectState;
    await human(request,{type:'requestStop',executionId:execution.id,reason:'Проверка доставки stop и отдельного подтверждения.'});
    const updates=await client.callTool({name:'ouro.get_updates',arguments:{afterCursor:beforeStop.version}});
    expect(JSON.stringify(updates.structuredContent)).toContain('StopRequested');
    await mutate('ouro.confirm_stopped');
    await human(request,{type:'resumeExecution',executionId:execution.id});await mutate('ouro.confirm_resumed');
    const reason='Продолжение зависит от решения человека: доступные варианты меняют проверяемый результат и требуют явного выбора.';
    await mutate('ouro.report_fork',{title:'Выбор формата',context:'Возможны два совместимых формата.',reason,options:[{id:'json',title:'JSON',description:'Структурированный результат для интеграции.'},{id:'text',title:'Текст',description:'Читаемый результат для ручной проверки.'}]});
    state=(await(await request.get('/api/project')).json()).state;
    const fork=state.requests.findLast(r=>r.executionId===execution.id&&r.kind==='Fork')!;
    await human(request,{type:'resolveDecision',decisionRequestId:fork.id,specRevisionId:revision,outcome:{kind:'approve',chosenOptionId:'json'}});
    await mutate('ouro.confirm_decision_applied',{decisionRequestId:fork.id,evidence:'test://mcp-sdk/format-json'});
    await human(request,{type:'resumeExecution',executionId:execution.id});await mutate('ouro.confirm_resumed');
    await mutate('ouro.report_blocker',{title:'Нет входных данных',context:'Источник недоступен.',reason,expected:'Доступный проверяемый вход',actual:'Источник недоступен',impact:'Нельзя проверить результат',options:[{id:'fixture',title:'Восстановить вход',description:'Отдельная ограниченная попытка восстановления.'}]});
    state=(await(await request.get('/api/project')).json()).state;
    const blocker=state.requests.findLast(r=>r.executionId===execution.id&&r.kind==='Blocker')!;
    await human(request,{type:'resolveDecision',decisionRequestId:blocker.id,specRevisionId:revision,outcome:{kind:'approve',chosenOptionId:'fixture'}});
    state=await human(request,{type:'authorizeRemediation',decisionRequestId:blocker.id,agentId:agent.id});
    const remediation=state.executions.at(-1)!;
    await mutate('ouro.confirm_started',{executionId:remediation.id});
    await mutate('ouro.complete_execution',{executionId:remediation.id,result:'succeeded',evidence:'test://mcp-sdk/input-restored'});
    await mutate('ouro.clear_blocker',{executionId:remediation.id,decisionRequestId:blocker.id,evidence:'test://mcp-sdk/input-verified'});
    await mutate('ouro.confirm_decision_applied',{decisionRequestId:blocker.id,evidence:'test://mcp-sdk/blocker-applied'});
    await human(request,{type:'resumeExecution',executionId:execution.id});await mutate('ouro.confirm_resumed');
    await mutate('ouro.complete_execution',{result:'succeeded',evidence:'test://mcp-sdk/result'});
    state=(await(await request.get('/api/project')).json()).state;expect(state.specs.find(s=>s.id===spec.id)?.state).not.toBe('done');
    await human(request,{type:'acceptSpec',specId:spec.id,specRevisionId:revision,evidence:{'mcp-checked':'Независимый MCP SDK client проверил сценарий.'}});

    await stranger.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${other.token}`}}}));
    const foreign=await stranger.callTool({name:'ouro.get_context',arguments:{executionId:execution.id}});expect(foreign.isError).toBe(true);
    const publicList=await(await request.get('/api/agents')).json();expect(JSON.stringify(publicList)).not.toContain(token);
    expect(JSON.stringify(publicList)).not.toContain(other.token);

    await stdio.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/mcp/bin/ouro-mcp.mjs')],env:{PATH:process.env.PATH??'',OURO_URL:url.href,OURO_AGENT_TOKEN:token},stderr:'pipe'}));
    expect((await stdio.listTools()).tools.map(t=>t.name)).toContain('ouro.get_context');
    const stdioContext=await stdio.callTool({name:'ouro.get_context',arguments:{executionId:execution.id}});expect(stdioContext.isError).not.toBe(true);
    expect(JSON.stringify(stdioContext.structuredContent)).toContain(spec.title);
    const smoke=await promisify(execFile)(process.execPath,[path.resolve('scripts/check-agent.mjs')],{env:{...process.env,OURO_URL:url.href,OURO_AGENT_TOKEN:token,OURO_AGENT_TOKEN_FILE:''}});
    expect(JSON.parse(smoke.stdout).connected).toBe(true);expect(smoke.stdout).not.toContain(token);
    await request.post(`/api/agents/${agent.id}/revoke`,{data:{}});
    await expect(client.callTool({name:'ouro.get_context',arguments:{}})).rejects.toThrow();
  }finally{await stdio.close();await stranger.close();await client.close();}
});
