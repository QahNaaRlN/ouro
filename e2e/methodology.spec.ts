import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { AGENT_ID, type ProjectState } from '../packages/core/src';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function project(request:APIRequestContext):Promise<ProjectState>{
  const response=await request.get('/api/project');expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state;
}
async function human(request:APIRequestContext,payload:Record<string,unknown>):Promise<ProjectState>{
  const response=await request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:(await project(request)).version}});
  expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state;
}
async function connectAgent(request:APIRequestContext,token:string){
  const response=await request.get('/api/project');
  const client=new Client({name:'ouro-methodology-browser-fixture',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',response.url()),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  return client;
}
async function agentTool(client:Client,request:APIRequestContext,name:string,args:Record<string,unknown>){
  const result=await client.callTool({name,arguments:{...args,requestId:crypto.randomUUID(),expectedVersion:(await project(request)).version}});
  expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);return result;
}
const content=(title:string)=>({title,goal:'Сохранить различие решения, исполнения и истории.',dod:[{id:'methodology',text:'История и права сохранены',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});
async function open(page:Page){await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();}
async function attempt(request:APIRequestContext,title:string,agentId=AGENT_ID){
  let state=await human(request,{type:'createSpec',content:content(title)});const spec=state.specs.at(-1)!,revision=state.revisions.at(-1)!;
  await human(request,{type:'activateRevision',specId:spec.id,revisionId:revision.id});
  state=await human(request,{type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId});
  return {spec,revision,execution:state.executions.at(-1)!};
}

test('M06 a historical cursor stays pinned during live commits and mounts no mutation controls',async({page,request})=>{
  await request.get('/api/session');await open(page);
  const before=await project(request);
  await page.getByRole('button',{name:'История',exact:true}).first().click();
  await page.getByRole('spinbutton',{name:'Исторический cursor',exact:true}).fill(String(before.version));
  await page.getByRole('button',{name:'Открыть состояние на cursor',exact:true}).click();
  const preview=page.getByRole('region',{name:'Историческое состояние',exact:true});
  await expect(preview).toBeVisible();await expect(preview).toContainText(`Состояние на cursor ${before.version}`);
  const title=`Появилось после исторической точки ${Date.now()}`;
  const after=await human(request,{type:'createSpec',content:content(title)});
  await expect.poll(async()=>Number((await page.locator('footer').innerText()).match(/cursor\s+(\d+)/)?.[1])).toBe(after.version);
  await expect(preview).toContainText(`Последний cursor ${after.version}`);
  await expect(preview).not.toContainText(title);
  await page.screenshot({path:'/tmp/ouro-methodology-history.png',fullPage:true});
  await expect(page.getByRole('button',{name:'Новая спека',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Разрешить одну попытку',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Сценарий симулятора')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const downloadPromise=page.waitForEvent('download');await preview.getByRole('button',{name:'Экспорт состояния JSON',exact:true}).click();
  const download=await downloadPromise,stream=await download.createReadStream();let bytes='';for await(const chunk of stream!)bytes+=chunk.toString();
  const exported=JSON.parse(bytes);expect(exported.cursor).toBe(before.version);expect(exported.events).toHaveLength(before.version);expect(JSON.stringify(exported)).not.toContain(title);
  await preview.getByRole('button',{name:'Вернуться к текущей работе',exact:true}).click();
  await expect(preview).toHaveCount(0);
  await page.getByRole('spinbutton',{name:'Исторический cursor',exact:true}).fill('0');
  await page.getByRole('button',{name:'Открыть состояние на cursor',exact:true}).click();
  await expect(preview).toContainText('Состояние на cursor 0');await expect(preview).toContainText('В этой точке спеки ещё не созданы');
});

test('M07 human clarification and a linked correction preserve the first recorded decision',async({page,request})=>{
  await request.get('/api/session');
  const registered=await request.post('/api/agents',{data:{name:`Автор уточнения ${Date.now()}`}});expect(registered.ok()).toBeTruthy();
  const {agent,token}=await registered.json();
  const {spec,execution}=await attempt(request,`Уточнение и исправление решения ${Date.now()}`,agent.id);
  const client=await connectAgent(request,token);
  try{
  await agentTool(client,request,'ouro.confirm_started',{executionId:execution.id});
  await agentTool(client,request,'ouro.report_question',{executionId:execution.id,title:'Уточнить критерий результата',context:'Нужно решение человека по наблюдаемому результату.',question:'Какой результат предъявить?',blockingScope:'execution'});
  let state=await project(request);
  const question=state.requests.findLast(r=>r.executionId===execution.id)!;
  await open(page);await page.getByRole('button',{name:/^Решения/}).first().click();
  await page.locator('.decision-list').getByRole('button').filter({hasText:spec.humanId}).click();
  await page.getByRole('button',{name:'Запросить уточнение',exact:true}).click();
  await page.getByRole('textbox',{name:'Что нужно уточнить',exact:true}).fill('Укажите наблюдаемый результат и источник проверки.');
  await page.getByRole('button',{name:'Записать запрос уточнения',exact:true}).click();
  await expect(page.getByRole('region',{name:'Уточнения запроса'})).toContainText('Укажите наблюдаемый результат и источник проверки.');
  state=await project(request);expect(state.requests.find(r=>r.id===question.id)?.state).toBe('pending');
  const clarification=state.events.findLast(event=>event.type==='DecisionClarificationRequested'&&event.payload.decisionRequestId===question.id)!;
  await agentTool(client,request,'ouro.submit_decision_clarification',{executionId:execution.id,decisionRequestId:question.id,clarificationEventId:clarification.id,response:'Наблюдение подтверждено сохранённой проверкой, итоговый критерий требует человека.'});
  await expect(page.getByRole('region',{name:'Уточнения запроса'})).toContainText('Наблюдение подтверждено сохранённой проверкой');
  await page.getByRole('textbox',{name:'Ваш ответ',exact:true}).fill('Первоначальный ответ сохраняется в истории.');
  const rebase=page.getByRole('button',{name:'Обновить версию после проверки',exact:true});if(await rebase.count())await rebase.click();
  await page.getByRole('button',{name:'Записать ответ',exact:true}).click();
  await expect(page.locator('.recorded-decision')).toContainText('Первоначальный ответ сохраняется в истории.');
  const resolved=(await project(request)).requests.find(r=>r.id===question.id)!;
  await page.getByRole('button',{name:'Исправить отдельным запросом',exact:true}).click();
  await page.getByRole('textbox',{name:'Основание исправления',exact:true}).fill('До применения обнаружено более точное ожидание.');
  await page.getByRole('button',{name:'Создать связанный запрос',exact:true}).click();
  await expect(page.locator('.decision-detail')).toContainText('Исправляет прежнее решение');
  await page.getByRole('textbox',{name:'Ваш ответ',exact:true}).fill('Уточнённый ответ фиксируется отдельно.');
  await page.getByRole('button',{name:'Записать ответ',exact:true}).click();
  await expect(page.locator('.recorded-decision')).toContainText('Уточнённый ответ фиксируется отдельно.');
  const final=await project(request),correction=final.requests.find(r=>(r as unknown as {supersedesDecisionId?:string}).supersedesDecisionId===resolved.decision!.id)!;
  expect(final.requests.find(r=>r.id===question.id)).toEqual(resolved);expect(correction.decision?.outcome).toEqual({kind:'answer',answer:'Уточнённый ответ фиксируется отдельно.'});
  expect(final.executions.find(e=>e.id===execution.id)?.state).toBe(state.executions.find(e=>e.id===execution.id)?.state);
  }finally{await client.close();}
});

test('M05 revoked-agent cancellation shows unknown physical stop until separate operator attestation',async({page,request})=>{
  await request.get('/api/session');
  const response=await request.post('/api/agents',{data:{name:`Агент для восстановления ${Date.now()}`}});expect(response.ok()).toBeTruthy();const {agent,token}=await response.json();
  const {spec,execution}=await attempt(request,`Восстановление после отзыва ${Date.now()}`,agent.id);
  const client=await connectAgent(request,token);
  try{await agentTool(client,request,'ouro.confirm_started',{executionId:execution.id});}finally{await client.close();}
  const revoked=await request.post(`/api/agents/${agent.id}/revoke`,{data:{}});expect(revoked.ok(),await revoked.text()).toBeTruthy();
  await open(page);await page.getByRole('button',{name:'Спецификации',exact:true}).click();await page.getByLabel('Выбрать спецификацию').selectOption(spec.id);
  await page.getByRole('button',{name:'Завершить авторизацию отозванного агента',exact:true}).first().click();
  const form=page.getByRole('region',{name:'Операторское завершение попытки'}).first();
  await form.getByRole('textbox',{name:'Причина завершения авторизации',exact:true}).fill('Ключ экстренно отозван, связь с процессом отсутствует.');
  await form.getByRole('textbox',{name:'Основание оператора',exact:true}).fill('Отзыв подтверждён в реестре; состояние процесса проверяется отдельно.');
  await form.getByRole('button',{name:'Отменить авторизацию без ACK',exact:true}).click();
  await expect(page.getByRole('region',{name:'Исполнение'}).first()).toContainText('Фактическая остановка не подтверждена');
  let state=await project(request);expect(state.executions.find(e=>e.id===execution.id)?.state).toBe('cancelled');
  const forbidden=await request.post('/api/commands',{data:{type:'startExecution',specId:spec.id,specRevisionId:spec.activeRevisionId,agentId:AGENT_ID,requestId:crypto.randomUUID(),expectedVersion:state.version}});
  expect(forbidden.status()).toBe(422);
  const executionPanel=page.getByRole('region',{name:'Исполнение'}).first();
  await executionPanel.getByRole('button',{name:'Подтвердить внешнюю остановку',exact:true}).click();
  await executionPanel.getByRole('textbox',{name:'Подтверждение внешней остановки',exact:true}).fill('Оператор проверил завершение внешнего процесса и отсутствие записей.');
  await executionPanel.getByRole('button',{name:'Записать свидетельство оператора',exact:true}).click();
  await expect(executionPanel).toContainText('Внешняя остановка засвидетельствована оператором');
  state=await project(request);expect(state.executions.find(e=>e.id===execution.id)?.state).toBe('cancelled');expect(state.executions.filter(e=>e.specId===spec.id)).toHaveLength(1);
});

test('M08 a withdrawn Blocker gets a linked plan and retires historically without a fake physical clearance',async({page,request})=>{
  test.setTimeout(60000);await request.get('/api/session');
  const response=await request.post('/api/agents',{data:{name:`Автор физического блокера ${Date.now()}`}});expect(response.ok()).toBeTruthy();const {agent,token}=await response.json();
  const {spec,revision,execution}=await attempt(request,`История физического блокера ${Date.now()}`,agent.id);
  const client=await connectAgent(request,token);
  try{
    await agentTool(client,request,'ouro.confirm_started',{executionId:execution.id});
    await agentTool(client,request,'ouro.report_blocker',{executionId:execution.id,title:'Недоступен исходный контур проверки',context:'Физическое препятствие исходного контракта.',reason:'В исходном контуре отсутствует необходимый доступ к данным проверки; продолжение без согласованного плана невозможно.',expected:'Контур доступен',actual:'Доступа нет',impact:'Исходная работа остановлена',options:[{id:'restore',title:'Восстановить доступ',description:'Проверить восстановленный доступ в отдельной попытке'}]});
    let state=await project(request);const blocker=state.requests.findLast(r=>r.executionId===execution.id)!;
    await agentTool(client,request,'ouro.withdraw_decision',{executionId:execution.id,decisionRequestId:blocker.id,reason:'Первый вопрос сформулирован неполно; само физическое препятствие сохраняется.'});
    await open(page);await page.getByRole('button',{name:/^Решения/}).first().click();await page.getByTestId(`decision-${blocker.id}`).click();
    await expect(page.locator('.decision-detail')).toContainText('Запрос отозван автором');
    await page.getByRole('button',{name:'Запросить новый план для блокера',exact:true}).click();
    await page.getByRole('textbox',{name:'Основание нового плана',exact:true}).fill('Нужен новый явный запрос по тому же физическому препятствию.');
    await page.getByRole('button',{name:'Создать новый запрос плана',exact:true}).click();
    await expect(page.locator('.decision-detail')).toContainText('Новый запрос плана для прежнего блокера');
    state=await project(request);const replacement=state.requests.find(r=>r.supersedesRequestId===blocker.id)!;
    expect(replacement.rootRequestId).toBe(blocker.id);expect(state.requests.find(r=>r.id===blocker.id)?.state).toBe('withdrawn');
    const proposed=await human(request,{type:'proposeRevision',specId:spec.id,content:{...content(`${revision.title} · независимый контур`),goal:'Проверить результат без прежнего внешнего контура.'}});
    await human(request,{type:'activateRevision',specId:spec.id,revisionId:proposed.revisions.at(-1)!.id});
    await agentTool(client,request,'ouro.confirm_stopped',{executionId:execution.id});
    await human(request,{type:'cancelExecution',executionId:execution.id,reason:'Прежняя попытка остановлена и закрыта перед сменой области работы.'});
    await page.getByTestId(`decision-${replacement.id}`).click();
    await page.getByRole('button',{name:'Завершить применимость прежнего блокера',exact:true}).click();
    await page.getByRole('textbox',{name:'Почему прежний блокер неприменим',exact:true}).fill('Новая ревизия исключила зависимость от прежнего внешнего контура.');
    await page.getByRole('textbox',{name:'Свидетельство неприменимости',exact:true}).fill('Оператор сверил новую цель и завершение всех старых попыток; контур не используется.');
    const retiredResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/commands'&&response.request().method()==='POST');
    await page.getByRole('button',{name:'Записать неприменимость блокера',exact:true}).click();
    const retired=await retiredResponse;expect(retired.ok(),await retired.text()).toBeTruthy();
    await expect(page.locator('.decision-detail')).toContainText('Применимость прежнего блокера завершена человеком');
    state=await project(request);expect(state.requests.find(r=>r.id===blocker.id)?.clearedEvidence).toBeUndefined();expect(state.requests.find(r=>r.id===replacement.id)?.clearedEvidence).toBeUndefined();
    expect(state.requests.find(r=>r.id===replacement.id)?.applicabilityEndedEvidence).toContain('Оператор сверил новую цель');
    expect(state.executions.filter(e=>e.specId===spec.id)).toHaveLength(1);
  }finally{await client.close();}
});

test('M06 historical read-only mode remains usable on a narrow screen in the light theme',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await page.getByRole('button',{name:'Включить светлую тему',exact:true}).click();
  await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
  await page.getByRole('button',{name:'История',exact:true}).first().click();
  await page.getByRole('spinbutton',{name:'Исторический cursor',exact:true}).fill('0');
  await page.getByRole('button',{name:'Открыть состояние на cursor',exact:true}).click();
  const preview=page.getByRole('region',{name:'Историческое состояние',exact:true});
  await expect(preview).toContainText('Состояние на cursor 0');await expect(preview.getByRole('heading',{name:'Историческое состояние',exact:true})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await page.screenshot({path:'/tmp/ouro-methodology-history-mobile-light.png',fullPage:true});
  await preview.getByRole('button',{name:'Вернуться к текущей работе',exact:true}).click();
  await expect(page.getByRole('spinbutton',{name:'Исторический cursor',exact:true})).toBeVisible();
});
