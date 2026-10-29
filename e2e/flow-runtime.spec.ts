import {test,expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {Execution,FlowDefinition,ProjectState,Spec,SpecRevision} from '../packages/core/src';
import type {MutationOutput} from '../packages/protocol/src';

type Run={id:string;nodeId:string;visit:number;state:string;evidence?:string;reason?:string};
type Runtime={state:string;currentRunId:string|null;runs:Run[];traversals:{id:string;edgeId:string;fromRunId:string;toRunId:string}[]};
const linear:FlowDefinition={entryNodeId:'work',nodes:[
 {id:'work',kind:'action',title:'Прочитать назначенное ожидание',description:'Отдельный зарегистрированный проход.',owner:'agent'},
 {id:'result',kind:'result',title:'Предъявить evidence',description:'Приёмка DoD остаётся отдельной.',owner:'agent'},
],edges:[{id:'work-result',source:'work',target:'result',label:'Результат предъявлен'}]};
const loop:FlowDefinition={entryNodeId:'work',nodes:[
 {id:'work',kind:'action',title:'Повторяемое действие',description:'Каждый реальный возврат создаёт новый проход.',owner:'agent'},
 {id:'check',kind:'condition',title:'Проверить исход',description:'Выбранное ребро сообщается явно с evidence.',owner:'agent'},
 {id:'result',kind:'result',title:'Предъявить evidence',description:'Это не человеческая приёмка.',owner:'agent'},
],edges:[
 {id:'work-check',source:'work',target:'check',label:'Проверить результат'},
 {id:'check-work',source:'check',target:'work',label:'Повторить работу'},
 {id:'check-result',source:'check',target:'result',label:'Результат достаточен'},
]};
const fork:FlowDefinition={entryNodeId:'choice',nodes:[
 {id:'choice',kind:'fork',title:'Выбор человека',description:'Для каждого прохода нужен отдельный действующий выбор.',owner:'human'},
 {id:'work',kind:'action',title:'Выполнить выбранную работу',description:'После действия вернуться к новому выбору.',owner:'agent'},
 {id:'result',kind:'result',title:'Предъявить evidence',description:'Завершить процесс, не принимая DoD.',owner:'agent'},
],edges:[
 {id:'choose-work',source:'choice',target:'work',label:'Выполнить ещё один шаг',optionId:'work'},
 {id:'choose-result',source:'choice',target:'result',label:'Перейти к результату',optionId:'result'},
 {id:'work-choice',source:'work',target:'choice',label:'Запросить новый выбор'},
]};

async function project(page:Page):Promise<ProjectState>{const response=await page.request.get('/api/project');expect(response.ok()).toBeTruthy();return(await response.json()).state;}
async function human(page:Page,payload:Record<string,unknown>){
 const response=await page.request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:(await project(page)).version}});
 expect(response.ok(),await response.text()).toBeTruthy();return response.json();
}
function runtime(state:ProjectState,executionId:string):Runtime{
 const execution=state.executions.find(execution=>execution.id===executionId) as (Execution&{flowRuntime?:Runtime})|undefined;
 expect(execution?.flowRuntime).toBeTruthy();return execution!.flowRuntime!;
}
function currentRun(state:ProjectState,executionId:string):Run{const value=runtime(state,executionId),run=value.runs.find(run=>run.id===value.currentRunId);expect(run).toBeTruthy();return run!;}
async function prepare(page:Page,flow:FlowDefinition,title:string){
 await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 const created=await human(page,{type:'createSpec',content:{title:`${title} ${Date.now()}`,goal:'Проверить явные состояния проходов и границы человеческих решений.',dod:[{id:'tracked',text:'Факты доступны без фиктивной приёмки.',required:true}],constraints:'Изолированные E2E-данные.',assumptions:'',risks:'',inputs:'',comment:'',flow}});
 const event=created.events.find((event:{type:string})=>event.type==='SpecCreated'),spec=event.payload.spec as Spec,revision=event.payload.revision as SpecRevision;
 await human(page,{type:'activateRevision',specId:spec.id,revisionId:revision.id});
 const registration=await page.request.post('/api/agents',{data:{name:`Flow runtime SDK ${Date.now()}`}});expect(registration.ok()).toBeTruthy();
 const {agent,token}=await registration.json();return {spec,revision,agent:agent as {id:string},token:token as string};
}
async function openProcess(page:Page,specId:string){
 await page.reload();await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 await page.getByRole('button',{name:'Спецификации',exact:true}).click();await page.getByLabel('Выбрать спецификацию',{exact:true}).selectOption(specId);
 await page.getByRole('button',{name:'Процесс',exact:true}).click();await expect(flowPanel(page)).toBeVisible();
}
const flowPanel=(page:Page)=>page.getByRole('region',{name:'Процесс спецификации',exact:true});
const runsPanel=(page:Page)=>page.getByRole('region',{name:'Проходы узла',exact:true});
async function inspectNode(page:Page,title:string){
 const panel=flowPanel(page);await panel.getByRole('button',{name:'Таблица',exact:true}).click();
 await panel.getByRole('button',{name:`Открыть узел ${title}`,exact:true}).click();
}
async function humanStep(page:Page,action:'retry'|'skip',reason:string,evidence?:string){
 const region=page.getByRole('form',{name:'Действие человека на шаге',exact:true});await expect(region).toBeVisible();
 await region.getByLabel('Действие человека',{exact:true}).selectOption(`human:${action}`);
 await region.getByLabel('Причина действия',{exact:true}).fill(reason);
 if(evidence!==undefined)await region.getByLabel('Основание действия',{exact:true}).fill(evidence);
 const review=region.getByRole('button',{name:'Проверил события перед действием',exact:true});if(await review.isVisible())await review.click();
 const receipt=page.waitForResponse(response=>response.url().includes('/api/commands')&&response.request().method()==='POST'&&response.request().postDataJSON().type===(action==='retry'?'retryFlowStep':'skipFlowStep'));
 await region.getByRole('button',{name:'Записать действие человека',exact:true}).click();const response=await receipt;expect(response.ok(),await response.text()).toBeTruthy();
}
async function sdk(baseURL:string|undefined,token:string){
 expect(baseURL).toBeTruthy();const client=new Client({name:'ouro-flow-runtime-browser-acceptance',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));return client;
}
async function setup(page:Page,baseURL:string|undefined,flow:FlowDefinition,title:string,enforced=true){
 const fixture=await prepare(page,flow,title),assigned=await human(page,{type:'startExecution',specId:fixture.spec.id,specRevisionId:fixture.revision.id,agentId:fixture.agent.id,...(enforced?{flowTracking:'enforced'}:{})});
 const execution=assigned.state.executions.findLast((execution:Execution)=>execution.specId===fixture.spec.id) as Execution,client=await sdk(baseURL,fixture.token);
 const write=async(name:string,args:Record<string,unknown>={})=>{
  const request={executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:(await project(page)).version,...args},result=await client.callTool({name,arguments:request});
  expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);return {request,result};
 };
 await openProcess(page,fixture.spec.id);await flowPanel(page).getByLabel('Попытка процесса',{exact:true}).selectOption(execution.id);
 return {...fixture,execution,client,write};
}
async function finish(page:Page,fixture:Awaited<ReturnType<typeof setup>>){
 const run=currentRun(await project(page),fixture.execution.id);expect(run.nodeId).toBe('result');
 await fixture.write('ouro.report_flow_step',{runId:run.id,phase:'start'});
 await fixture.write('ouro.report_flow_step',{runId:run.id,phase:'complete',evidence:'test://flow-runtime/result'});
 expect(runtime(await project(page),fixture.execution.id).state).toBe('completed');
 expect((await project(page)).specs.find(spec=>spec.id===fixture.spec.id)?.state).not.toBe('done');
 await fixture.write('ouro.complete_execution',{result:'succeeded',evidence:'test://flow-runtime/execution-result'});
}

test('FR02/FR07 human explicitly enables enforced flow tracking and can skip only the ready action',async({page,baseURL})=>{
 test.setTimeout(90000);const fixture=await prepare(page,linear,'Строгий процесс');
 await page.reload();await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 await page.getByRole('button',{name:'Спецификации',exact:true}).click();await page.getByLabel('Выбрать спецификацию',{exact:true}).selectOption(fixture.spec.id);
 await page.getByLabel('Исполнитель попытки',{exact:true}).first().selectOption(fixture.agent.id);
 const tracking=page.getByRole('checkbox',{name:'Строгий учёт проходов',exact:true});await expect(tracking).toBeVisible();await expect(tracking).not.toBeChecked();await tracking.check();
 const assignment=page.waitForResponse(response=>response.url().includes('/api/commands')&&response.request().method()==='POST'&&response.request().postDataJSON().type==='startExecution');
 await page.getByRole('button',{name:'Разрешить одну попытку',exact:true}).first().click();const response=await assignment;
 expect(response.request().postDataJSON().flowTracking).toBe('enforced');expect(response.ok(),await response.text()).toBeTruthy();
 const execution=(await project(page)).executions.findLast(execution=>execution.specId===fixture.spec.id)!;
 const initial=runtime(await project(page),execution.id);expect(initial.runs).toHaveLength(1);expect(initial.runs[0]).toMatchObject({nodeId:'work',visit:1,state:'ready'});
 const client=await sdk(baseURL,fixture.token);
 const write=async(name:string,args:Record<string,unknown>={})=>{const result=await client.callTool({name,arguments:{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:(await project(page)).version,...args}});expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);};
 try{
  const context=await client.callTool({name:'ouro.get_context',arguments:{executionId:execution.id}});expect(context.isError).not.toBe(true);
  const beforeAck=await project(page),premature=await client.callTool({name:'ouro.report_flow_step',arguments:{executionId:execution.id,runId:initial.runs[0].id,phase:'start',requestId:crypto.randomUUID(),expectedVersion:beforeAck.version}});
  expect(premature.isError).toBe(true);expect((await project(page)).version).toBe(beforeAck.version);
  await write('ouro.confirm_started');await page.getByRole('button',{name:'Процесс',exact:true}).click();await inspectNode(page,'Прочитать назначенное ожидание');
  await expect(runsPanel(page)).toHaveAttribute('data-step-run-id',initial.runs[0].id);
  await humanStep(page,'skip','В учебном примере шаг намеренно исключён человеком.','test://flow-runtime/human-skip');
  await expect(runsPanel(page)).toContainText('Пропущен');
  const after=runtime(await project(page),execution.id);expect(after.runs.find(run=>run.id===initial.runs[0].id)?.state).toBe('skipped');
  const result=after.runs.find(run=>run.id===after.currentRunId)!;expect(result.nodeId).toBe('result');
  await write('ouro.report_flow_step',{runId:result.id,phase:'start'});await write('ouro.report_flow_step',{runId:result.id,phase:'complete',evidence:'test://flow-runtime/result-after-skip'});
  expect((await project(page)).specs.find(spec=>spec.id===fixture.spec.id)?.state).not.toBe('done');
  await write('ouro.complete_execution',{result:'succeeded',evidence:'test://flow-runtime/skip-example-finished'});
 }finally{await client.close();await page.request.post(`/api/agents/${fixture.agent.id}/revoke`,{data:{}});}
});

test('FR05/FR07/FR11 retries and loop visits retain prior evidence and the selected historical run during SSE updates',async({page,baseURL})=>{
 test.setTimeout(90000);const fixture=await setup(page,baseURL,loop,'Повторные проходы');
 try{
  await fixture.write('ouro.confirm_started');let run=currentRun(await project(page),fixture.execution.id);
  await fixture.write('ouro.report_flow_step',{runId:run.id,phase:'start'});await fixture.write('ouro.report_flow_step',{runId:run.id,phase:'fail',evidence:'test://flow-runtime/first-attempt-failed'});
  await inspectNode(page,'Повторяемое действие');await expect(runsPanel(page)).toHaveAttribute('data-step-run-id',run.id);await expect(runsPanel(page)).toContainText('Ошибка');
  await humanStep(page,'retry','Разрешён новый ограниченный проход после разбора ошибки.');
  run=currentRun(await project(page),fixture.execution.id);expect(run).toMatchObject({nodeId:'work',visit:2,state:'ready'});
  await runsPanel(page).getByLabel('Проход узла',{exact:true}).selectOption(run.id);
  await fixture.write('ouro.report_flow_step',{runId:run.id,phase:'start'});
  await fixture.write('ouro.report_action',{flowStepRunId:run.id,actionId:crypto.randomUUID(),phase:'completed',title:'Действие внутри второго прохода',context:'Факт Action не завершает проход.',evidence:'test://flow-runtime/action-only'});
  const lateActionId=crypto.randomUUID();await fixture.write('ouro.report_action',{flowStepRunId:run.id,actionId:lateActionId,phase:'started',title:'Ожидающий отчёт второго прохода',context:'Завершение может быть сообщено позднее.'});
  expect(currentRun(await project(page),fixture.execution.id)).toMatchObject({id:run.id,state:'running'});
  const completed=await fixture.write('ouro.report_flow_step',{runId:run.id,phase:'complete',evidence:'test://flow-runtime/second-visit-complete'}),afterComplete=await project(page);
  const replay=await fixture.client.callTool({name:'ouro.report_flow_step',arguments:completed.request});expect(replay.isError).not.toBe(true);expect((replay.structuredContent as MutationOutput).replayed).toBe(true);
  expect((await project(page)).version).toBe(afterComplete.version);
  await expect(runsPanel(page)).toContainText('Завершён');const pinned=run.id;
  const selector=runsPanel(page).getByLabel('Проход узла',{exact:true});await selector.focus();
  const check=currentRun(await project(page),fixture.execution.id);await fixture.write('ouro.report_flow_step',{runId:check.id,phase:'start'});
  await fixture.write('ouro.report_flow_step',{runId:check.id,phase:'complete',edgeId:'check-work',evidence:'test://flow-runtime/explicit-repeat'});
  const repeated=currentRun(await project(page),fixture.execution.id);expect(repeated).toMatchObject({nodeId:'work',visit:3,state:'ready'});
  await fixture.write('ouro.report_flow_step',{runId:repeated.id,phase:'start'});
  await fixture.write('ouro.report_action',{flowStepRunId:pinned,actionId:lateActionId,phase:'completed',title:'Поздний факт второго прохода',context:'Исходный runId сохраняется после перехода.',evidence:'test://flow-runtime/late-second-visit-action'});
  expect(currentRun(await project(page),fixture.execution.id)).toMatchObject({id:repeated.id,state:'running'});
  await expect(selector).toHaveValue(pinned);await expect(selector).toBeFocused();await expect(runsPanel(page)).toHaveAttribute('data-step-run-id',pinned);
  await expect(runsPanel(page)).toContainText('test://flow-runtime/second-visit-complete');
  await flowPanel(page).getByRole('button',{name:'Граф',exact:true}).click();
  await expect(flowPanel(page).locator('.react-flow__node[data-id="work"]')).toContainText('Проход 3 · Выполняется');
  await flowPanel(page).getByRole('button',{name:'Таблица',exact:true}).click();
  await expect(flowPanel(page).getByRole('table',{name:'Узлы процесса',exact:true}).getByRole('row').filter({hasText:'Повторяемое действие'})).toContainText('Выполняется');
  await selector.selectOption(repeated.id);await expect(runsPanel(page)).toContainText('Выполняется');
  const stored=runtime(await project(page),fixture.execution.id);expect(stored.runs.filter(run=>run.nodeId==='work').map(run=>run.state)).toEqual(['failed','succeeded','running']);
  await fixture.write('ouro.report_flow_step',{runId:repeated.id,phase:'complete',evidence:'test://flow-runtime/third-visit-complete'});
  const finalCheck=currentRun(await project(page),fixture.execution.id);await fixture.write('ouro.report_flow_step',{runId:finalCheck.id,phase:'start'});
  await fixture.write('ouro.report_flow_step',{runId:finalCheck.id,phase:'complete',edgeId:'check-result',evidence:'test://flow-runtime/explicit-finish'});
  await finish(page,fixture);
 }finally{await fixture.client.close();await page.request.post(`/api/agents/${fixture.agent.id}/revoke`,{data:{}});}
});

test('FR06 each fork visit needs its own human choice, application and resume before a transition is available',async({page,baseURL})=>{
 test.setTimeout(90000);const fixture=await setup(page,baseURL,fork,'Развилка по проходам');
 const requestChoice=async(runId:string)=>{
  await fixture.write('ouro.report_fork',{flowStepRunId:runId,title:'Какой исход разрешён сейчас?',context:'Выбор относится только к этому проходу.',reason:'Нужен отдельный выбор человека, поскольку продолжение работы и предъявление результата имеют разные проверяемые последствия.',options:[{id:'work',title:'Работа',description:'Разрешить ещё одно действие.'},{id:'result',title:'Результат',description:'Перейти к предъявлению результата.'}]});
  return(await project(page)).requests.findLast(request=>request.executionId===fixture.execution.id)!;
 };
 const decide=async(requestId:string,optionId:string)=>{
  await human(page,{type:'resolveDecision',decisionRequestId:requestId,specRevisionId:fixture.revision.id,outcome:{kind:'approve',chosenOptionId:optionId}});
  await fixture.write('ouro.confirm_decision_applied',{decisionRequestId:requestId,evidence:'test://flow-runtime/human-choice-applied'});
  await human(page,{type:'resumeExecution',executionId:fixture.execution.id});await fixture.write('ouro.confirm_resumed');
 };
 try{
  await fixture.write('ouro.confirm_started');const first=currentRun(await project(page),fixture.execution.id);await fixture.write('ouro.report_flow_step',{runId:first.id,phase:'start'});
  const request=await requestChoice(first.id);await expect(flowPanel(page).locator('.react-flow__node[data-id="choice"]')).toContainText('Проход 1 · Ожидает');await flowPanel(page).getByRole('button',{name:'Таблица',exact:true}).click();
  await flowPanel(page).getByRole('table',{name:'Связи процесса',exact:true}).getByRole('row').filter({hasText:'Выполнить ещё один шаг'}).getByRole('button',{name:'Открыть связь',exact:true}).click();
  const edge=page.getByRole('region',{name:'Доступность перехода',exact:true});await expect(edge.getByText('Недоступен',{exact:true})).toBeVisible();
  await human(page,{type:'resolveDecision',decisionRequestId:request.id,specRevisionId:fixture.revision.id,outcome:{kind:'approve',chosenOptionId:'work'}});
  await expect(edge.getByText('Недоступен',{exact:true})).toBeVisible();
  await fixture.write('ouro.confirm_decision_applied',{decisionRequestId:request.id,evidence:'test://flow-runtime/first-choice-applied'});
  await expect(edge.getByText('Недоступен',{exact:true})).toBeVisible();
  await human(page,{type:'resumeExecution',executionId:fixture.execution.id});await fixture.write('ouro.confirm_resumed');
  await expect(edge.getByText('Доступен',{exact:true})).toBeVisible();
  await fixture.write('ouro.report_flow_step',{runId:first.id,phase:'complete',edgeId:'choose-work',evidence:'test://flow-runtime/first-choice-traversal'});
  await expect(edge).toContainText('Переход зафиксирован');
  const work=currentRun(await project(page),fixture.execution.id);await fixture.write('ouro.report_flow_step',{runId:work.id,phase:'start'});await fixture.write('ouro.report_flow_step',{runId:work.id,phase:'complete',evidence:'test://flow-runtime/work-before-new-choice'});
  const second=currentRun(await project(page),fixture.execution.id);expect(second).toMatchObject({nodeId:'choice',visit:2});await fixture.write('ouro.report_flow_step',{runId:second.id,phase:'start'});
  const before=await project(page),invalid=await fixture.client.callTool({name:'ouro.report_flow_step',arguments:{executionId:fixture.execution.id,runId:second.id,phase:'complete',edgeId:'choose-work',evidence:'test://flow-runtime/old-choice-is-not-permission',requestId:crypto.randomUUID(),expectedVersion:before.version}});
  expect(invalid.isError).toBe(true);expect((await project(page)).version).toBe(before.version);
  await runsPanel(page).getByLabel('Проход узла',{exact:true}).selectOption(second.id);
  await expect(edge.getByText('Недоступен',{exact:true})).toBeVisible();
  const newRequest=await requestChoice(second.id);await decide(newRequest.id,'result');
  await fixture.write('ouro.report_flow_step',{runId:second.id,phase:'complete',edgeId:'choose-result',evidence:'test://flow-runtime/new-human-choice'});
  await expect(edge.getByText('Не выбран в этом проходе',{exact:true})).toBeVisible();
  const progress=runtime(await project(page),fixture.execution.id);expect(progress.traversals.filter(item=>item.edgeId==='choose-work')).toHaveLength(1);
  await finish(page,fixture);
 }finally{await fixture.client.close();await page.request.post(`/api/agents/${fixture.agent.id}/revoke`,{data:{}});}
});

test('FR01/FR12 legacy bound evidence stays readable on a light mobile screen without invented runtime visits',async({page,baseURL})=>{
 test.setTimeout(60000);const fixture=await setup(page,baseURL,linear,'Legacy evidence',false);
 try{
  await fixture.write('ouro.confirm_started');await fixture.write('ouro.report_action',{flowNodeId:'work',actionId:crypto.randomUUID(),phase:'completed',title:'Прежний факт без runId',context:'Это legacy Action, не шаг нового runtime.',evidence:'test://flow-runtime/legacy-action-evidence'});
  await fixture.write('ouro.complete_execution',{result:'succeeded',evidence:'test://flow-runtime/legacy-execution-result'});
  await expect(flowPanel(page)).toContainText('Строгий учёт проходов не включён');
  await expect(flowPanel(page).locator('.react-flow__node[data-id="work"]')).toContainText('1 связанных фактов');
  await page.getByRole('button',{name:'Включить светлую тему',exact:true}).click();await page.setViewportSize({width:390,height:844});
  await flowPanel(page).getByRole('button',{name:'Таблица',exact:true}).click();const open=flowPanel(page).getByRole('button',{name:'Открыть узел Прочитать назначенное ожидание',exact:true});await open.focus();await open.press('Enter');
  const inspector=flowPanel(page).getByRole('region',{name:'Выбранный узел',exact:true});await expect(inspector).toContainText('Прежний факт без runId');await expect(inspector).toContainText('test://flow-runtime/legacy-action-evidence');
  await expect(flowPanel(page).locator('[data-step-run-id]')).toHaveCount(0);
  expect((await project(page)).executions.find(execution=>execution.id===fixture.execution.id)).not.toHaveProperty('flowRuntime');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 }finally{await fixture.client.close();await page.request.post(`/api/agents/${fixture.agent.id}/revoke`,{data:{}});}
});
