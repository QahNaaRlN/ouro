import {test,expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {AGENT_ID,type ProjectState} from '../packages/core/src';

async function project(page:Page):Promise<ProjectState>{return(await(await page.request.get('/api/project')).json()).state;}

test('FR09/FR11 an uncertain human skip survives navigation and recovers its exact receipt after SSE advances',async({page,baseURL})=>{
 test.setTimeout(90000);
 await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 const human=async(payload:Record<string,unknown>)=>{
  const response=await page.request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:(await project(page)).version}});
  expect(response.ok(),await response.text()).toBeTruthy();return response.json();
 };
 const created=await human({type:'createSpec',content:{title:`Восстановление прохода ${Date.now()}`,goal:'Одна команда пропуска даже при потере ответа после commit.',dod:[{id:'once',text:'Переход записан один раз.',required:true}],constraints:'Изолированный production E2E.',assumptions:'',risks:'',inputs:'',comment:'',flow:{entryNodeId:'work',nodes:[{id:'work',kind:'action',title:'Шаг для явного пропуска',description:'Решение принимает человек.',owner:'agent'},{id:'result',kind:'result',title:'Предъявить результат',description:'Отдельная приёмка.',owner:'agent'}],edges:[{id:'to-result',source:'work',target:'result',label:'Перейти после решения человека'}]}}});
 const event=created.events.find((event:{type:string})=>event.type==='SpecCreated'),spec=event.payload.spec,revision=event.payload.revision;
 await human({type:'activateRevision',specId:spec.id,revisionId:revision.id});
 const registration=await page.request.post('/api/agents',{data:{name:`Runtime receipt recovery ${Date.now()}`}});expect(registration.ok()).toBeTruthy();const {agent,token}=await registration.json();
 const assigned=await human({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.id,flowTracking:'enforced'}),execution=assigned.state.executions.findLast((item:{specId:string})=>item.specId===spec.id),runId=execution.flowRuntime.currentRunId;
 const client=new Client({name:'ouro-flow-runtime-recovery-acceptance',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
 const agentWrite=async(name:string,values:Record<string,unknown>={})=>client.callTool({name,arguments:{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:(await project(page)).version,...values}});
 try{
  expect((await agentWrite('ouro.confirm_started')).isError).not.toBe(true);
  await page.reload();await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  await page.getByRole('button',{name:'Спецификации',exact:true}).click();await page.getByLabel('Выбрать спецификацию',{exact:true}).selectOption(spec.id);
  await page.getByRole('button',{name:'Процесс',exact:true}).click();
  const flow=page.getByRole('region',{name:'Процесс спецификации',exact:true});
  await flow.getByRole('button',{name:'Таблица',exact:true}).click();await flow.getByRole('button',{name:'Открыть узел Шаг для явного пропуска',exact:true}).click();
  const form=page.getByLabel('Действие человека на шаге',{exact:true});
  await form.getByLabel('Действие человека',{exact:true}).selectOption({label:'Пропустить шаг'});
  await form.getByLabel('Причина действия',{exact:true}).fill('Этот учебный шаг явно исключён человеком.');
  await form.getByLabel('Основание действия',{exact:true}).fill('test://flow-runtime/recovery/human-skip');
  const sent:Array<Record<string,unknown>>=[];
  await page.route('**/api/commands',async route=>{
   const body=route.request().postDataJSON();if(body?.type!=='skipFlowStep'){await route.continue();return;}
   sent.push(body);
   if(sent.length===1){const response=await route.fetch();expect(response.ok(),await response.text()).toBeTruthy();await route.abort('failed');}
   else await route.continue();
  });
  await form.getByRole('button',{name:'Записать действие человека',exact:true}).click();
  await expect(form.getByRole('button',{name:'Повторить то же действие',exact:true})).toBeVisible();
  await expect(form).toContainText('Результат не подтверждён');
  await expect.poll(async()=>{const runtime=(await project(page)).executions.find(item=>item.id===execution.id)!.flowRuntime!;return {runs:runtime.runs.length,traversals:runtime.traversals.length,first:runtime.runs[0].state};}).toEqual({runs:2,traversals:1,first:'skipped'});
  // The reply was lost, while committed SSE already opened the next run. The
  // pending command belongs to its original run even if its component unmounts.
  await page.getByRole('button',{name:'Дорожная карта',exact:true}).click();
  await page.getByRole('button',{name:'Спецификации',exact:true}).click();
  await page.getByRole('button',{name:'Процесс',exact:true}).click();
  await flow.getByRole('button',{name:'Проверить отправленное действие',exact:true}).click();
  const receipt=page.waitForResponse(response=>response.url().includes('/api/commands')&&response.request().postDataJSON()?.type==='skipFlowStep');
  await page.getByRole('button',{name:'Повторить то же действие',exact:true}).click();
  const response=await receipt;expect(response.ok(),await response.text()).toBeTruthy();expect((await response.json()).replayed).toBe(true);
  expect(sent).toHaveLength(2);expect(sent[1]).toEqual(sent[0]);expect(sent[0].runId).toBe(runId);
  await expect(page.getByRole('button',{name:'Повторить то же действие',exact:true})).toHaveCount(0);
  const current=(await project(page)).executions.find(item=>item.id===execution.id)!.flowRuntime!;
  expect(current.traversals).toHaveLength(1);expect(current.runs).toHaveLength(2);expect(current.runs[0].state).toBe('skipped');
 }finally{
  await page.unroute('**/api/commands');
  await agentWrite('ouro.complete_execution',{result:'failed',evidence:'test://flow-runtime/recovery/acceptance-cleanup'});
  await client.close();await page.request.post(`/api/agents/${agent.id}/revoke`,{data:{}});
 }
});

test('FR10/FR11 the teaching UI completes a strict process with explicit synthetic evidence',async({page})=>{
 test.setTimeout(90000);
 await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 const human=async(payload:Record<string,unknown>)=>{
  const response=await page.request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:(await project(page)).version}});
  expect(response.ok(),await response.text()).toBeTruthy();return response.json();
 };
 const created=await human({type:'createSpec',content:{title:`Учебные проходы ${Date.now()}`,goal:'Проверить учебный маршрут без внешнего агента.',dod:[{id:'observed',text:'Человек проверил учебные факты.',required:true}],constraints:'Синтетический сценарий.',assumptions:'',risks:'',inputs:'',comment:'',flow:{entryNodeId:'work',nodes:[{id:'work',kind:'action',title:'Учебный шаг',description:'',owner:'agent'},{id:'result',kind:'result',title:'Учебный результат',description:'',owner:'agent'}],edges:[{id:'next',source:'work',target:'result',label:'Учебный переход'}]}}});
 const event=created.events.find((event:{type:string})=>event.type==='SpecCreated'),spec=event.payload.spec,revision=event.payload.revision;
 await human({type:'activateRevision',specId:spec.id,revisionId:revision.id});
 const assigned=await human({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:AGENT_ID,flowTracking:'enforced'}),execution=assigned.state.executions.findLast((item:{specId:string})=>item.specId===spec.id);
 const simulate=async(scenario:string)=>{
  const response=await page.request.post('/api/simulator',{data:{scenario,specId:spec.id,requestId:crypto.randomUUID(),expectedVersion:(await project(page)).version}});
  expect(response.ok(),await response.text()).toBeTruthy();
 };
 await simulate('apply');
 await page.reload();await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 await page.getByRole('button',{name:'Спецификации',exact:true}).click();await page.getByLabel('Выбрать спецификацию',{exact:true}).selectOption(spec.id);
 await page.getByRole('button',{name:'Процесс',exact:true}).click();
 const flow=page.getByRole('region',{name:'Процесс спецификации',exact:true});
 for(let visit=0;visit<2;visit++){
  await flow.getByRole('button',{name:'Открыть текущий шаг',exact:true}).click();
  const form=page.getByLabel('Действие человека на шаге',{exact:true});
  for(const action of ['Начать шаг','Завершить шаг']){
   await form.getByLabel('Действие человека',{exact:true}).selectOption({label:`Учебный симулятор: ${action}`});
   await expect(form).toContainText('Evidence будет явно синтетическим');
   const review=form.getByRole('button',{name:'Проверил события перед действием',exact:true});if(await review.count())await review.click();
   const receipt=page.waitForResponse(response=>response.url().includes('/api/simulator')&&response.request().method()==='POST'&&response.request().postDataJSON().scenario.startsWith('flow_'));
   await form.getByRole('button',{name:'Записать действие человека',exact:true}).click();
   const response=await receipt;expect(response.ok(),await response.text()).toBeTruthy();
  }
 }
 await expect(flow.getByRole('region',{name:'Учёт проходов процесса',exact:true})).toContainText('Процесс завершён');
 const snapshot=await project(page),completed=snapshot.events.filter(event=>event.executionId===execution.id&&event.type==='FlowStepCompleted');
 expect(completed).toHaveLength(2);for(const event of completed){expect(event.actor.id).toBe(AGENT_ID);expect(event.payload.evidence).toMatch(/^simulation:\/\//);}
 expect(snapshot.executions.find(item=>item.id===execution.id)!.state).toBe('running');expect(snapshot.specs.find(item=>item.id===spec.id)!.state).not.toBe('done');
 await simulate('complete');
});
