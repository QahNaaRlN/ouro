import {test,expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {DecisionRequest,Execution,ProjectState,RevisionContent} from '../packages/core/src';

type Project={id:string;name:string};
type Registration={agent:{id:string};token:string};
const scope=(id:string)=>`/api/projects/${encodeURIComponent(id)}`;
const content=(title:string):RevisionContent=>({title,goal:'Проверить группировку актуальных запросов и неизменность записанных оснований.',dod:[{id:'review',text:'Запросы и исходные события проверены.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});
async function snapshot(page:Page,project:Project):Promise<{state:ProjectState;cursor:number}>{
  const response=await page.request.get(scope(project.id));expect(response.ok(),await response.text()).toBe(true);return response.json();
}
async function fixture(page:Page){
  const rootPath=await mkdtemp(join(tmpdir(),'ouro-grouped-review-'));
  await page.request.get('/api/session');
  const response=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),name:`Группировка ${crypto.randomUUID().slice(0,8)}`,rootPath}});
  expect(response.ok(),await response.text()).toBe(true);const project=(await response.json()).project as Project;
  const issued=await page.request.post(`${scope(project.id)}/agents`,{data:{name:'Совместимый MCP-клиент · группировка'}});
  expect(issued.ok()).toBe(true);const registration=await issued.json() as Registration;
  return {rootPath,project,registration};
}
async function assign(page:Page,project:Project,registration:Registration,title:string){
  const response=await page.request.post(`${scope(project.id)}/tasks`,{data:{requestId:crypto.randomUUID(),expectedVersion:(await snapshot(page,project)).cursor,agentId:registration.agent.id,content:content(title)}});
  expect(response.ok(),await response.text()).toBe(true);return ((await response.json()).state as ProjectState).executions.at(-1)!;
}
async function human(page:Page,project:Project,body:Record<string,unknown>){
  const response=await page.request.post(`${scope(project.id)}/commands`,{data:{...body,requestId:crypto.randomUUID(),expectedVersion:(await snapshot(page,project)).cursor}});
  expect(response.ok(),await response.text()).toBe(true);return (await response.json()).state as ProjectState;
}
async function agent(page:Page,baseURL:string|undefined,project:Project,registration:Registration){
  const client=new Client({name:'ouro-grouped-review-sdk',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(`${scope(project.id)}/mcp`,baseURL),{requestInit:{headers:{Authorization:`Bearer ${registration.token}`}}}));
  const call=async(execution:Execution,name:string,args:Record<string,unknown>={})=>{
    const result=await client.callTool({name,arguments:{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:(await snapshot(page,project)).cursor,...args}});
    expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);
  };
  return {client,call};
}
const reportContext='Проверка реального запроса назначенного агента через сохранённые события проекта.';
async function question(api:Awaited<ReturnType<typeof agent>>,execution:Execution,title:string){
  await api.call(execution,'ouro.report_question',{title,context:reportContext,question:'Какое проверяемое основание использовать для следующего шага?',blockingScope:'none'});
}
function request(state:ProjectState,title:string):DecisionRequest{return state.requests.findLast(item=>item.title===title)!;}
async function closeClient(api:Awaited<ReturnType<typeof agent>>|undefined){
  if(api)await Promise.race([api.client.close().catch(()=>{}),new Promise<void>(resolve=>{const timer=setTimeout(resolve,2000);timer.unref();})]);
}

test('WR17 current requests group by kind and state, keep exact scope and preserve an answer draft during SSE',async({page,baseURL})=>{
  test.setTimeout(120000);page.setDefaultTimeout(15000);
  const {rootPath,project,registration}=await fixture(page);let api:Awaited<ReturnType<typeof agent>>|undefined;
  try{
    const a=await assign(page,project,registration,'Первая область запросов'),b=await assign(page,project,registration,'Другая область запросов');
    api=await agent(page,baseURL,project,registration);
    await api.call(a,'ouro.confirm_started');await api.call(b,'ouro.confirm_started');
    await question(api,a,'Вопрос с черновиком');await question(api,a,'Записанный ответ');
    let state=(await snapshot(page,project)).state;const resolved=request(state,'Записанный ответ');
    await human(page,project,{type:'resolveDecision',decisionRequestId:resolved.id,specRevisionId:a.specRevisionId,outcome:{kind:'answer',answer:'Основание проверено отдельно от применения.'}});
    await question(api,a,'Исправляемое решение');state=(await snapshot(page,project)).state;const retired=request(state,'Исправляемое решение');
    await human(page,project,{type:'resolveDecision',decisionRequestId:retired.id,specRevisionId:a.specRevisionId,outcome:{kind:'answer',answer:'Первоначальный ответ требует уточнения.'}});
    state=await human(page,project,{type:'correctDecision',decisionRequestId:retired.id,reason:'Уточнить основание до применения решения и сохранить исходный ответ в истории.'});
    const replacement=request(state,'Исправляемое решение');expect(replacement.id).not.toBe(retired.id);
    await api.call(a,'ouro.report_fork',{title:'Выбор пути проверки',context:reportContext,reason:'Нужен явный выбор человека между двумя проверяемыми путями следующего шага работы.',options:[{id:'inspect',title:'Изучить',description:'Сначала сверить первичные основания.'},{id:'verify',title:'Проверить',description:'Проверить имеющееся основание.'}]});
    await api.call(a,'ouro.report_blocker',{title:'Физическое препятствие',context:reportContext,reason:'Назначенный агент зафиксировал внешнее препятствие, требующее отдельного решения человека.',expected:'Первичный источник доступен.',actual:'Источник недоступен в тестовом сценарии.',impact:'Нельзя подтвердить следующий шаг.',options:[],noPathReason:'Способ устранения пока не подтверждён.'});
    await question(api,b,'Чужая спека');
    await page.goto(`/projects/${project.id}?view=questions`);await expect(page.getByText('Обновления активны',{exact:true})).toBeVisible();
    const panel=page.locator('section[aria-label="Вопросы и решения"]:visible');
    expect(await panel.locator('[data-request-kind]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-request-kind')))).toEqual(['Question','Fork','Blocker']);
    const questions=panel.locator('[data-request-kind="Question"]');
    await expect(questions.getByRole('heading',{level:3})).toHaveText('Вопросы4');
    expect(await questions.locator('[data-request-state]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-request-state')))).toEqual(['pending','resolved']);
    await expect(questions.locator('[data-request-state="pending"] [data-request-id]')).toHaveCount(3);
    await expect(questions.locator('[data-request-state="resolved"] [data-request-id]')).toHaveCount(1);
    await expect(panel.locator(`[data-request-id="${retired.id}"]`)).toHaveCount(0);
    await expect(panel.locator(`[data-request-id="${replacement.id}"]`)).toBeVisible();
    await panel.getByRole('button',{name:'Вопрос с черновиком',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Запрос решения',exact:true}),draft=dialog.getByRole('textbox',{name:'Ответ на вопрос Вопрос с черновиком',exact:true});
    await draft.fill('Неотправленный ответ сохраняется при новом событии другой спеки.');
    await question(api,b,'Новый вопрос по SSE');await expect(questions.locator('[data-request-state="pending"] [data-request-id]')).toHaveCount(4);
    await expect(draft).toHaveValue('Неотправленный ответ сохраняется при новом событии другой спеки.');
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
    await panel.getByRole('button',{name:'Вопрос с черновиком',exact:true}).click();await expect(draft).toHaveValue('Неотправленный ответ сохраняется при новом событии другой спеки.');await page.keyboard.press('Escape');
    await page.goto(`/projects/${project.id}?view=spec&spec=${a.specId}&revision=${a.specRevisionId}&execution=${a.id}&tab=questions`);
    const scoped=page.locator('[aria-label="Выбранная задача"]');await expect(scoped.getByRole('heading',{name:'Первая область запросов',exact:true})).toBeVisible();
    await expect(scoped.locator('[data-request-kind="Question"] [data-request-id]')).toHaveCount(3);await expect(scoped).not.toContainText('Чужая спека');await expect(scoped).not.toContainText('Новый вопрос по SSE');
    const proposed=await human(page,project,{type:'proposeRevision',specId:a.specId,content:content('Предложенная другая ревизия')}),otherRevision=proposed.revisions.findLast(item=>item.specId===a.specId)!;
    await page.goto(`/projects/${project.id}?view=spec&spec=${a.specId}&revision=${otherRevision.id}&execution=${a.id}&tab=questions`);
    await expect(scoped).toContainText('Запросов в выбранной области нет.');await expect(scoped.locator('[data-request-kind]')).toHaveCount(0);
    await page.goto(`/projects/${project.id}?view=spec&spec=${a.specId}&revision=${a.specRevisionId}&execution=${b.id}&tab=questions`);
    await expect(scoped).toContainText('Попытка не найдена в выбранной ревизии.');await expect(scoped.locator('[data-request-id]')).toHaveCount(0);
  }finally{
    await closeClient(api);await page.request.post(`${scope(project.id)}/agents/${registration.agent.id}/revoke`,{data:{},timeout:3000}).catch(()=>{});await rm(rootPath,{recursive:true,force:true});
  }
});

test('WR22 compact history shows only stored typed reason/result, clamps long text and opens the unchanged source',async({page,baseURL})=>{
  test.setTimeout(90000);const {rootPath,project,registration}=await fixture(page);let api:Awaited<ReturnType<typeof agent>>|undefined;
  try{
    const execution=await assign(page,project,registration,'История с первичным основанием');api=await agent(page,baseURL,project,registration);await api.call(execution,'ouro.confirm_started');
    await api.call(execution,'ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:'Заявление со свободным evidence',context:reportContext,evidence:'Причина: придуманный вывод. Результат: якобы принят. VERIFIED github-api-sha — это только текст агента.'});
    await question(api,execution,'Вопрос с длинным ответом');let state=(await snapshot(page,project)).state;const asked=request(state,'Вопрос с длинным ответом');
    const answer='Полный сохранённый ответ. '+'Подробное основание ответа человека. '.repeat(60)+'КОНЕЦ ОТВЕТА';
    await human(page,project,{type:'resolveDecision',decisionRequestId:asked.id,specRevisionId:execution.specRevisionId,outcome:{kind:'answer',answer}});
    const reason='Явное основание выбора пути. '+'Проверяем первичную запись без автоматического пересказа. '.repeat(30)+'КОНЕЦ ПРИЧИНЫ';
    await api.call(execution,'ouro.report_fork',{title:'Запрос с длинной причиной',context:reportContext,reason,options:[{id:'inspect',title:'Изучить',description:'Сверить источник.'},{id:'verify',title:'Проверить',description:'Проверить результат.'}]});
    const before=await snapshot(page,project),action=before.state.events.find(event=>event.payload.title==='Заявление со свободным evidence')!,reasonEvent=before.state.events.find(event=>(event.payload.request as DecisionRequest|undefined)?.title==='Запрос с длинной причиной')!,answerEvent=before.state.events.find(event=>event.type==='DecisionResolved'&&event.payload.decisionRequestId===asked.id)!;
    await page.goto(`/projects/${project.id}?view=history`);const history=page.getByRole('region',{name:'История проекта',exact:true});
    const reasonRow=history.locator(`[data-event-id="${reasonEvent.id}"]`),answerRow=history.locator(`[data-event-id="${answerEvent.id}"]`),actionRow=history.locator(`[data-event-id="${action.id}"]`);
    await expect(reasonRow.locator('[data-history-fact="reason"]')).toHaveText(`Причина: ${reason}`);await expect(answerRow.locator('[data-history-fact="outcome"]')).toHaveText(`Результат: ${answer}`);
    const reasonLabel=await reasonRow.getByRole('button').getAttribute('aria-label'),answerLabel=await answerRow.getByRole('button').getAttribute('aria-label');
    expect(reasonLabel).toContain('Причина: Явное основание выбора пути.');expect(answerLabel).toContain('Результат: Полный сохранённый ответ.');
    for(const label of [reasonLabel,answerLabel]){expect(label).toBeTruthy();expect(label!.length).toBeLessThan(650);expect(label).toContain('Автор:');expect(label).toContain('Событие №');expect(label).not.toContain('КОНЕЦ ПРИЧИНЫ');expect(label).not.toContain('КОНЕЦ ОТВЕТА');}
    await expect(actionRow.locator('[data-history-fact]')).toHaveCount(0);await expect(actionRow.locator('[data-provenance="agent_report"]')).toBeVisible();await expect(actionRow.locator('[data-provenance="verified_github"]')).toHaveCount(0);
    const geometry=await reasonRow.locator('[data-history-fact="reason"]').evaluate(node=>({height:node.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(node).lineHeight),scrollHeight:node.scrollHeight,clamp:getComputedStyle(node).webkitLineClamp}));
    expect(geometry.clamp).toBe('2');expect(geometry.height).toBeLessThanOrEqual(geometry.lineHeight*2+1);expect(geometry.scrollHeight).toBeGreaterThan(geometry.height);
    await reasonRow.getByRole('button').click();const detail=page.getByRole('region',{name:'Подробности события',exact:true});await expect(detail.locator('dd').filter({hasText:reason})).toHaveText(reason);
    await detail.getByRole('button',{name:'Полная исходная запись',exact:true}).click();expect(JSON.parse(await detail.locator('.ws-event-raw').innerText())).toEqual(reasonEvent);
    await page.getByRole('navigation',{name:'Разделы проекта',exact:true}).getByRole('button',{name:'История',exact:true}).click();await answerRow.getByRole('button').click();await expect(detail.locator('dd').filter({hasText:answer})).toHaveText(answer);
    const after=await snapshot(page,project);expect(after.cursor).toBe(before.cursor);expect(after.state.events.find(event=>event.id===reasonEvent.id)).toEqual(reasonEvent);expect(after.state.events.find(event=>event.id===answerEvent.id)).toEqual(answerEvent);expect(after.state.events.find(event=>event.id===action.id)).toEqual(action);
  }finally{
    await closeClient(api);await page.request.post(`${scope(project.id)}/agents/${registration.agent.id}/revoke`,{data:{},timeout:3000}).catch(()=>{});await rm(rootPath,{recursive:true,force:true});
  }
});
