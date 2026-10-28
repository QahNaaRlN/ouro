import { test, expect, type Page } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FlowDefinition, ProjectState } from '../packages/core/src';

async function project(page:Page):Promise<ProjectState>{const response=await page.request.get('/api/project');expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state;}
async function openFlow(page:Page,flow?:FlowDefinition){
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  const initial=await project(page);
  const response=await page.request.post('/api/commands',{data:{type:'createSpec',requestId:crypto.randomUUID(),expectedVersion:initial.version,content:{title:`Процесс E2E ${Date.now()}`,goal:'Сохранить процессную схему в неизменяемой ревизии.',dod:[{id:'flow',text:'Схема проверена человеком',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',...(flow?{flow}:{})}}});
  expect(response.ok(),await response.text()).toBeTruthy();
  const state=(await response.json()).state as ProjectState,spec=state.specs.at(-1)!;
  await page.getByRole('button',{name:'Спецификации',exact:true}).click();
  await page.getByLabel('Выбрать спецификацию').selectOption(spec.id);
  await page.getByRole('button',{name:'Процесс',exact:true}).click();
  return {state,spec,original:state.revisions.find(r=>r.id===spec.revisionIds.at(-1))!};
}

test('F04/F07 process editor preserves its draft during updates and proposes an immutable revision without activating it',async({page})=>{
  const {spec,original}=await openFlow(page),selected=spec.id;
  const flow=page.getByRole('region',{name:'Процесс спецификации'});
  await flow.getByRole('button',{name:original.flow?'Предложить изменение схемы':'Создать схему',exact:true}).click();
  await flow.getByRole('button',{name:'Таблица',exact:true}).click();
  const firstNode=original.flow?.nodes[0]?.title??'Выполнить работу';
  await flow.getByRole('button',{name:`Изменить узел ${firstNode}`,exact:true}).click();
  const title=`Проверить длинное русское название шага без потери смысла ${Date.now()}`;
  await flow.getByLabel('Название узла',{exact:true}).fill(title);
  const version=(await project(page)).version;
  const concurrent=await page.request.post('/api/commands',{data:{type:'createSpec',requestId:crypto.randomUUID(),expectedVersion:version,content:{title:`Параллельное изменение ${Date.now()}`,goal:'Внешнее изменение проекта должно сохранить локальный черновик схемы.',dod:[{id:'external',text:'Не потерять черновик',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}}});
  expect(concurrent.ok(),await concurrent.text()).toBeTruthy();
  const externalVersion=((await concurrent.json()).state as ProjectState).version;
  await expect.poll(async()=>Number((await page.locator('footer').innerText()).match(/cursor\s+(\d+)/)?.[1])).toBe(externalVersion);
  await expect(flow.getByLabel('Название узла',{exact:true})).toHaveValue(title);
  await flow.getByRole('button',{name:'Предложить новую ревизию',exact:true}).click();
  await expect(flow.getByRole('alert')).toContainText('Черновик сохранён на экране');
  await expect(flow.getByLabel('Название узла',{exact:true})).toHaveValue(title);
  await flow.getByRole('button',{name:'Обновить базу после проверки',exact:true}).click();
  await flow.getByRole('button',{name:'Предложить новую ревизию',exact:true}).click();
  await expect(flow.getByRole('button',{name:'Предложить новую ревизию',exact:true})).toHaveCount(0);
  await expect.poll(async()=>((await project(page)).specs.find(s=>s.id===selected)?.revisionIds.length)).toBe(spec.revisionIds.length+1);
  const after=await project(page),updated=after.specs.find(s=>s.id===selected)!;
  expect(updated.activeRevisionId).toBe(spec.activeRevisionId);
  expect(after.revisions.find(r=>r.id===original.id)).toEqual(original);
  expect(after.revisions.find(r=>r.id===updated.revisionIds.at(-1))?.flow?.nodes.some(n=>n.title===title)).toBe(true);
});

test('F08 explicit MCP facts distinguish chosen and applied paths, unbound facts and separate executions',async({page,baseURL})=>{
  test.setTimeout(90000);
  const definition:FlowDefinition={entryNodeId:'choice',nodes:[
    {id:'choice',kind:'fork',title:'Выбрать проверяемый путь',description:'Решение принадлежит человеку.',owner:'human'},
    {id:'path-a',kind:'action',title:'Выполнить выбранный путь A',description:'Первый путь.',owner:'agent'},
    {id:'path-b',kind:'action',title:'Выполнить альтернативный путь B',description:'Второй путь.',owner:'agent'},
    {id:'result',kind:'result',title:'Предъявить результат',description:'DoD принимает человек.',owner:'agent'}
  ],edges:[{id:'choose-a',source:'choice',target:'path-a',label:'Выбрать A',optionId:'a'},{id:'choose-b',source:'choice',target:'path-b',label:'Выбрать B',optionId:'b'},{id:'a-result',source:'path-a',target:'result',label:'Путь A выполнен'},{id:'b-result',source:'path-b',target:'result',label:'Путь B выполнен'}]};
  const {spec,original}=await openFlow(page,definition);
  const flow=page.getByRole('region',{name:'Процесс спецификации'});
  const created=await page.request.post('/api/agents',{data:{name:`Flow SDK ${Date.now()}`}});
  expect(created.ok()).toBeTruthy();const {agent,token}=await created.json();
  const human=async(payload:Record<string,unknown>)=>{const state=await project(page);const response=await page.request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:state.version}});expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state as ProjectState;};
  await human({type:'activateRevision',specId:spec.id,revisionId:original.id});
  const assigned=await human({type:'startExecution',specId:spec.id,specRevisionId:original.id,agentId:agent.id});
  const execution=assigned.executions.at(-1)!;
  const client=new Client({name:'ouro-process-ui-acceptance',version:'1.0'});
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
    const mutate=async(name:string,args:Record<string,unknown>={})=>{const state=await project(page);const result=await client.callTool({name,arguments:{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:state.version,...args}});expect(result.isError,JSON.stringify(result)).not.toBe(true);return result;};
    await mutate('ouro.confirm_started');
    await mutate('ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:'Факт без привязки к процессу',context:'Ссылка намеренно не передана.',evidence:'test://flow-ui/unbound'});
    await mutate('ouro.report_fork',{flowNodeId:'choice',title:'Какой путь выбрать?',context:'Сравнили две возможности.',reason:'Нужен явный выбор человека, потому что два допустимых пути имеют разные последствия для проверяемого результата.',options:[{id:'a',title:'A',description:'Первый путь.'},{id:'b',title:'B',description:'Второй путь.'}]});
    const request=(await project(page)).requests.findLast(r=>r.executionId===execution.id)!;
    await expect(flow.locator('.react-flow__node[data-id="choice"]')).toContainText('Ожидает человека');
    await flow.getByLabel('Попытка процесса',{exact:true}).selectOption(execution.id);
    await expect(flow).toContainText('1 без привязки к схеме');
    await human({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:original.id,outcome:{kind:'approve',chosenOptionId:'a'}});
    const edgeA=flow.locator('.react-flow__edge[data-id="choose-a"]'),edgeB=flow.locator('.react-flow__edge[data-id="choose-b"]');
    await expect(edgeA).toContainText('выбран, не применён');
    await expect(edgeB).not.toContainText('выбран');
    await mutate('ouro.confirm_decision_applied',{decisionRequestId:request.id,evidence:'test://flow-ui/decision-applied'});
    await expect(edgeA).toContainText('выбор применён');
    await expect(edgeB).not.toContainText('выбор применён');
    await human({type:'resumeExecution',executionId:execution.id});await mutate('ouro.confirm_resumed');
    await mutate('ouro.report_action',{flowNodeId:'path-a',actionId:crypto.randomUUID(),phase:'completed',title:'Результат пути A',context:'Явная связь с выбранным шагом.',evidence:'test://flow-ui/path-a'});
    await mutate('ouro.complete_execution',{result:'succeeded',evidence:'test://flow-ui/primary-result'});
    await expect(flow.locator('.react-flow__node[data-id="path-a"]')).toContainText('1 связанных фактов');
    await flow.getByRole('button',{name:'Предложить изменение схемы',exact:true}).click();
    await expect(flow).toContainText('Факты относятся к базовой r1, не подтверждают этот черновик');
    await expect(flow.getByRole('heading',{name:'Факты базовой ревизии r1',exact:true})).toBeVisible();
    await expect(edgeA).not.toContainText('выбор применён');
    await expect(flow.locator('.react-flow__node[data-id="path-a"]')).toContainText('Черновик · не исполнялся');
    await flow.getByRole('button',{name:'Отменить изменения',exact:true}).click();
    await expect(edgeA).toContainText('выбор применён');
    const second=(await human({type:'startExecution',specId:spec.id,specRevisionId:original.id,agentId:agent.id})).executions.at(-1)!;
    await mutate('ouro.confirm_started',{executionId:second.id});
    await mutate('ouro.report_action',{executionId:second.id,flowNodeId:'path-b',actionId:crypto.randomUUID(),phase:'completed',title:'Факт другой попытки',context:'Не относится к выбранной первой попытке.',evidence:'test://flow-ui/second-path-b'});
    await mutate('ouro.complete_execution',{executionId:second.id,result:'succeeded',evidence:'test://flow-ui/second-result'});
    await flow.getByRole('button',{name:'Таблица',exact:true}).click();
    const table=flow.getByRole('table',{name:'Узлы процесса'});
    const aFacts=table.getByRole('row').filter({hasText:'Выполнить выбранный путь A'}).getByRole('cell').nth(2);
    const bFacts=table.getByRole('row').filter({hasText:'Выполнить альтернативный путь B'}).getByRole('cell').nth(2);
    await expect(aFacts).toHaveText('1');await expect(bFacts).toHaveText('Нет');
    await flow.getByLabel('Попытка процесса',{exact:true}).selectOption(second.id);
    await expect(aFacts).toHaveText('Нет');await expect(bFacts).toHaveText('1');
    await expect(flow).toContainText('0 без привязки к схеме');
    expect((await project(page)).specs.find(s=>s.id===spec.id)?.state).not.toBe('done');
  }finally{await client.close();await page.request.post(`/api/agents/${agent.id}/revoke`,{data:{}});}
});

test('F07/F10 process forms support adding and removing nodes and labelled connections in the light theme',async({page})=>{
  await openFlow(page);
  await page.getByRole('button',{name:'Включить светлую тему'}).click();
  const flow=page.getByRole('region',{name:'Процесс спецификации'});
  const edit=flow.getByRole('button',{name:'Предложить изменение схемы',exact:true});
  if(await edit.count())await edit.click();else await flow.getByRole('button',{name:'Создать схему',exact:true}).click();
  await flow.getByRole('button',{name:'Таблица',exact:true}).click();
  await flow.getByLabel('Название нового узла',{exact:true}).fill('Уточнить вход у человека');
  await flow.getByRole('combobox',{name:'Тип нового узла',exact:true}).selectOption('question');
  await flow.getByRole('button',{name:'Добавить узел',exact:true}).click();
  await expect(flow.getByRole('button',{name:'Изменить узел Уточнить вход у человека',exact:true})).toBeVisible();
  await flow.getByRole('button',{name:'Изменить узел Уточнить вход у человека',exact:true}).click();
  await expect(flow.getByRole('combobox',{name:'Исполнитель узла',exact:true})).toHaveValue('human');
  await flow.getByRole('button',{name:'Удалить выбранный узел',exact:true}).click();
  await expect(flow.getByRole('button',{name:'Изменить узел Уточнить вход у человека',exact:true})).toHaveCount(0);
  const row=flow.getByRole('table',{name:'Связи процесса'}).getByRole('row').nth(1);
  await row.getByRole('button',{name:'Изменить связь',exact:true}).click();
  await flow.getByLabel('Подпись перехода',{exact:true}).fill('Результат проверен и предъявлен');
  await expect(row).toContainText('Результат проверен и предъявлен');
  await flow.getByRole('combobox',{name:'Начало новой связи',exact:true}).selectOption('start');
  await flow.getByRole('combobox',{name:'Конец новой связи',exact:true}).selectOption('result');
  await flow.getByLabel('Подпись новой связи',{exact:true}).fill('Повторная проверка');
  await flow.getByRole('button',{name:'Добавить связь',exact:true}).click();
  const added=flow.getByRole('table',{name:'Связи процесса'}).getByRole('row').last();
  await expect(added).toContainText('Повторная проверка');
  await added.getByRole('button',{name:'Изменить связь',exact:true}).click();
  await flow.getByRole('button',{name:'Удалить выбранную связь',exact:true}).click();
  await expect(flow.getByRole('table',{name:'Связи процесса'}).getByRole('row')).toHaveCount(2);
  await flow.getByRole('button',{name:'Граф',exact:true}).click();
  await expect(flow.locator('.react-flow__node').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(flow).toContainText('Возможные пути');
});
