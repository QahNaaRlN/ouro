import {test,expect,type Locator,type Page,type Request} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {mkdtemp,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {ProjectState,RevisionContent} from '../packages/core/src';
import type {ContextOutput} from '../packages/protocol/src';

type Project={id:string;name:string;rootPath:string|null};
type Snapshot={project:Project;state:ProjectState;cursor:number};
type Registration={agent:{id:string;name:string;projectId:string};token:string};
type Assignment={project:Project;registration:Registration;executionId:string;specId:string};
type CapturedRequest={url:string;body:string|null;actor:string|undefined;project:string|undefined};
const scope=(id:string)=>`/api/projects/${encodeURIComponent(id)}`;
const region=(page:Page,name:string)=>page.getByRole('region',{name,exact:true});
const feed=(page:Page)=>region(page,'Живая лента событий');
const selected=(page:Page)=>page.locator('[aria-label="Выбранная задача"]');
const content=(title:string):RevisionContent=>({title,goal:`Проверить результат задачи «${title}».`,dod:[{id:'criterion-1',text:'Результат проверен человеком.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});

async function snapshot(page:Page,id:string):Promise<Snapshot>{const response=await page.request.get(scope(id));expect(response.ok(),await response.text()).toBe(true);return response.json();}
async function reveal(control:Locator){
  for(let attempt=0;attempt<3&&!await control.isVisible();attempt++){
    const closed=control.locator('xpath=ancestor::details[not(@open)]').last();
    if(!await closed.count())break;await closed.locator(':scope > summary').click();
  }
  await expect(control).toBeVisible();
}
async function catalog(page:Page){await page.getByRole('navigation',{name:'Навигация проектов',exact:true}).getByRole('link',{name:'Проекты',exact:true}).click();await expect(page.getByRole('heading',{name:'Проекты',exact:true})).toBeVisible();}
async function openSaved(page:Page,project:Project){await page.locator(`a[href="/projects/${project.id}"]`).first().click();await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();await expect(page.getByText(/История обновляется/)).toBeVisible();}
async function fillTask(page:Page,agentId:string,title:string,dod='Результат проверен человеком.'){
  const goal=page.getByLabel('Задача для агента',{exact:true});await reveal(goal);
  await page.getByLabel('Исполнитель задачи',{exact:true}).selectOption(agentId);
  await goal.fill(`Проверить назначение, реальные MCP-факты и отдельную приёмку: ${title}.`);
  await page.getByLabel('Название задачи',{exact:true}).fill(title);await page.getByLabel('Критерии готовности',{exact:true}).fill(dod);
}
async function apiProject(page:Page,name:string,rootPath:string):Promise<Project>{
  const response=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),name,rootPath}});expect(response.ok(),await response.text()).toBe(true);return(await response.json()).project;
}
async function apiAssignment(page:Page,project:Project,title:string):Promise<Assignment>{
  const registered=await page.request.post(`${scope(project.id)}/agents`,{data:{name:`Совместимый MCP ${title}`}});expect(registered.ok()).toBe(true);const registration=await registered.json() as Registration;
  const started=await page.request.post(`${scope(project.id)}/tasks`,{data:{requestId:crypto.randomUUID(),expectedVersion:(await snapshot(page,project.id)).cursor,agentId:registration.agent.id,content:content(title)}});
  expect(started.ok(),await started.text()).toBe(true);const state=(await started.json()).state as ProjectState,execution=state.executions.at(-1)!;
  return {project,registration,executionId:execution.id,specId:execution.specId};
}
async function connect(page:Page,baseURL:string|undefined,assignment:Assignment){
  expect(baseURL).toBeTruthy();const client=new Client({name:'ouro-project-browser-sdk',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(`${scope(assignment.project.id)}/mcp`,baseURL),{requestInit:{headers:{Authorization:`Bearer ${assignment.registration.token}`}}}));
  const call=async(name:string,args:Record<string,unknown>={})=>{
    const result=await client.callTool({name,arguments:{executionId:assignment.executionId,requestId:crypto.randomUUID(),expectedVersion:(await snapshot(page,assignment.project.id)).cursor,...args}});
    expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);return result;
  };
  return {client,call};
}
async function revoke(page:Page,assignment:Assignment){await page.request.post(`${scope(assignment.project.id)}/agents/${assignment.registration.agent.id}/revoke`,{data:{}});}
function capture(request:Request):CapturedRequest{const headers=request.headers();return {url:request.url(),body:request.postData(),actor:headers['x-ouro-expected-participant'],project:headers['x-ouro-expected-project']};}
async function navigationMarker(page:Page){return page.evaluate(()=>{const value=crypto.randomUUID();(window as Window&{__ouroWorkspaceProbe?:string}).__ouroWorkspaceProbe=value;return value;});}
async function marker(page:Page){return page.evaluate(()=>(window as Window&{__ouroWorkspaceProbe?:string}).__ouroWorkspaceProbe);}

test('PW01/PW03/PW09/PW10 any MCP agent updates one dashboard live while human owns answers and DoD',async({page,baseURL})=>{
  test.setTimeout(120000);const rootPath=await mkdtemp(join(tmpdir(),'ouro-browser-project-'));await writeFile(join(rootPath,'README.md'),'# Browser acceptance folder\nNo Git is needed.\n');
  let assignment:Assignment|undefined,agentClient:Awaited<ReturnType<typeof connect>>|undefined;
  try{
    expect(await readdir(rootPath)).toEqual(['README.md']);await page.goto('/projects');await expect(page.getByRole('heading',{name:'Проекты',exact:true})).toBeVisible();
    const name=`Своя папка ${crypto.randomUUID().slice(0,8)}`;await page.getByLabel('Название проекта',{exact:true}).fill(name);await page.getByLabel('Папка проекта',{exact:true}).fill(rootPath);
    const created=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/projects'&&response.request().method()==='POST');
    await page.getByRole('button',{name:'Добавить проект',exact:true}).click();const createResponse=await created;expect(createResponse.ok()).toBe(true);const project=(await createResponse.json()).project as Project;
    await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();expect((await snapshot(page,project.id)).state.specs).toHaveLength(0);
    const register=page.getByRole('button',{name:'Зарегистрировать агента',exact:true});await reveal(register);await page.getByLabel('Имя подключения',{exact:true}).fill('Совместимый SDK, без специального типа ChatGPT');
    const issued=page.waitForResponse(response=>new URL(response.url()).pathname===`${scope(project.id)}/agents`&&response.request().method()==='POST');await register.click();const registration=await(await issued).json() as Registration;
    const token=await page.getByLabel('Ключ агента',{exact:true}).inputValue();expect(token===registration.token&&token.length>20).toBe(true);
    const keyFile=join(rootPath,'..',`ouro-browser-${crypto.randomUUID()}.key`);await page.getByLabel('Файл ключа агента',{exact:true}).fill(keyFile);
    const rawConfig=await page.getByLabel('Конфигурация MCP проекта',{exact:true}).inputValue(),config=Object.values(JSON.parse(rawConfig).mcpServers)[0] as {args:string[];env:Record<string,string>};
    expect(config.env.OURO_URL).toBe(new URL(`${scope(project.id)}/mcp`,baseURL).href);expect(config.env.OURO_AGENT_TOKEN_FILE).toBe(keyFile);expect(config.env).not.toHaveProperty('OURO_AGENT_TOKEN');expect(rawConfig.includes(token)).toBe(false);expect(config.args.some(arg=>arg.includes(token))).toBe(false);
    await page.getByRole('button',{name:'Ключ сохранён — скрыть',exact:true}).click();await expect(page.getByLabel('Ключ агента',{exact:true})).toHaveCount(0);
    const title=`Единый живой дашборд ${crypto.randomUUID().slice(0,8)}`,dod='Наблюдаемые факты и результат проверены человеком.';await fillTask(page,registration.agent.id,title,dod);
    await expect(page.locator('[aria-label="Критерии перед запуском"]')).toContainText(dod);
    const started=page.waitForResponse(response=>new URL(response.url()).pathname===`${scope(project.id)}/tasks`&&response.request().method()==='POST');await page.getByRole('button',{name:'Начать работу',exact:true}).click();expect((await started).ok()).toBe(true);
    const assigned=await snapshot(page,project.id),execution=assigned.state.executions.at(-1)!;assignment={project,registration,executionId:execution.id,specId:execution.specId};expect(execution.state).toBe('queued');
    await expect(selected(page)).toContainText('Ожидает агента');expect(assigned.state.events.some(event=>event.type==='ExecutionStarted')).toBe(false);
    for(const name of ['Обзор проекта','Дорожная карта проекта','Текущий процесс','Вопросы и решения','Живая лента событий','Агенты и текущая работа'])await expect(region(page,name)).toBeVisible();
    await expect(region(page,'Дорожная карта проекта').locator('.react-flow__node')).toContainText(title);await expect(region(page,'Текущий процесс')).toContainText('Схема ещё не описана');
    const sameDocument=await navigationMarker(page);agentClient=await connect(page,baseURL,assignment);
    const context=await agentClient.client.callTool({name:'ouro.get_context',arguments:{executionId:execution.id}});expect(context.isError).not.toBe(true);expect((context.structuredContent as ContextOutput).project.id).toBe(project.id);
    const files=await agentClient.client.callTool({name:'ouro.read_workspace_file',arguments:{executionId:execution.id,path:'README.md'}});expect(files.isError).not.toBe(true);expect((files.structuredContent as {text:string}).text).toContain('No Git is needed.');
    await agentClient.call('ouro.confirm_started');await expect(selected(page)).toContainText('Выполняется');await expect(feed(page).locator('[data-event-type="ExecutionStarted"]')).toBeVisible();
    await agentClient.call('ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:'Реальный SDK прочитал контекст папки',context:'Отчёт отправлен официальным MCP SDK.',evidence:'test://workspace-browser/read-context'});
    await expect(feed(page)).toContainText('Реальный SDK прочитал контекст папки');await expect(feed(page)).toContainText('test://workspace-browser/read-context');
    const questionTitle='Нужен ли отдельный человеческий итог?';await agentClient.call('ouro.report_question',{title:questionTitle,context:'Ответ и дальнейший ACK должны остаться раздельными.',question:'Подтвердите порядок приёмки.',blockingScope:'execution'});
    const question=region(page,'Вопросы и решения').getByRole('article',{name:`Запрос: ${questionTitle}`,exact:true});await expect(question).toBeVisible();await expect(selected(page)).toContainText('Ожидает человека');
    const resume=page.getByRole('button',{name:'Разрешить продолжение',exact:true});await expect(resume).toBeDisabled();await question.getByLabel(`Ответ на вопрос ${questionTitle}`,{exact:true}).fill('Да. Предъяви результат, затем человек независимо проверит DoD.');
    await question.getByRole('button',{name:'Записать решение',exact:true}).click();await expect(question).toContainText('Ожидается подтверждение применения агентом.');await expect(resume).toBeDisabled();
    const request=(await snapshot(page,project.id)).state.requests.at(-1)!;await agentClient.call('ouro.confirm_decision_applied',{decisionRequestId:request.id,evidence:'test://workspace-browser/answer-applied'});await expect(resume).toBeEnabled();await resume.click();
    await expect(selected(page)).toContainText('Ожидается отдельное MCP-подтверждение агента.');expect((await snapshot(page,project.id)).state.executions.at(-1)?.state).toBe('waiting_for_human');
    await agentClient.call('ouro.confirm_resumed');await expect(selected(page)).toContainText('Выполняется');await agentClient.call('ouro.complete_execution',{result:'succeeded',evidence:'test://workspace-browser/result-ready'});
    await expect(selected(page)).toContainText('Результат предъявлен');await expect(feed(page).locator('[data-event-type="ExecutionCompleted"]')).toBeVisible();expect((await snapshot(page,project.id)).state.specs.at(-1)?.state).not.toBe('done');
    const acceptance=region(page,'Приёмка результата');await expect(acceptance).toBeVisible();await acceptance.getByLabel(`Подтверждение: ${dod}`,{exact:true}).fill('Независимо проверены MCP факты, ответ и итог; критерий выполнен.');
    const accept=acceptance.getByRole('button',{name:'Принять результат по DoD',exact:true});await accept.focus();await accept.press('Enter');await expect(feed(page).locator('[data-event-type="SpecAccepted"]')).toBeVisible();
    const accepted=await snapshot(page,project.id);expect(accepted.state.specs.at(-1)?.state).toBe('done');expect(accepted.state.events.find(event=>event.type==='SpecAccepted')?.actor.kind).toBe('human');expect(await marker(page)).toBe(sameDocument);
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    for(const name of ['Дорожная карта проекта','Текущий процесс','Вопросы и решения','Живая лента событий']){const bounds=await region(page,name).boundingBox();expect(bounds).toBeTruthy();expect(bounds!.width).toBeGreaterThanOrEqual(280);expect(bounds!.width).toBeLessThanOrEqual(390);}
    expect((await region(page,'Дорожная карта проекта').locator('.ws-map').boundingBox())!.width).toBeGreaterThanOrEqual(280);
    const mobileGoal=page.getByLabel('Задача для агента',{exact:true});await reveal(mobileGoal);expect((await mobileGoal.boundingBox())!.width).toBeGreaterThanOrEqual(240);await mobileGoal.focus();await mobileGoal.press('Tab');await expect(page.getByLabel('Название задачи',{exact:true})).toBeFocused();
    const projectLink=page.getByRole('navigation',{name:'Навигация проектов',exact:true}).getByRole('link',{name:'Проекты',exact:true});await projectLink.focus();await expect(projectLink).toBeFocused();await projectLink.press('Enter');await expect(page.getByRole('heading',{name:'Проекты',exact:true})).toBeVisible();expect(await marker(page)).toBe(sameDocument);
  }finally{await agentClient?.client.close();if(assignment)await revoke(page,assignment);await rm(rootPath,{recursive:true,force:true});}
});

test('PW02/PW06 a late A snapshot and A stream cannot replace the mounted B dashboard',async({page,baseURL})=>{
  test.setTimeout(90000);const folderA=await mkdtemp(join(tmpdir(),'ouro-browser-scope-a-')),folderB=await mkdtemp(join(tmpdir(),'ouro-browser-scope-b-'));let agentA:Awaited<ReturnType<typeof connect>>|undefined,agentB:Awaited<ReturnType<typeof connect>>|undefined,assignmentA:Assignment|undefined,assignmentB:Assignment|undefined;
  let release=()=>{};const released=new Promise<void>(resolve=>{release=resolve;});
  try{
    await page.request.get('/api/session');const a=await apiProject(page,`Проект A ${crypto.randomUUID().slice(0,8)}`,folderA),b=await apiProject(page,`Проект B ${crypto.randomUUID().slice(0,8)}`,folderB);
    assignmentA=await apiAssignment(page,a,'Только задача A');assignmentB=await apiAssignment(page,b,'Только задача B');agentA=await connect(page,baseURL,assignmentA);agentB=await connect(page,baseURL,assignmentB);await agentA.call('ouro.confirm_started');await agentB.call('ouro.confirm_started');
    await page.addInitScript(()=>{
      const observed:Array<{url:string;closed:boolean}>=[];(window as Window&{__ouroStreams?:typeof observed}).__ouroStreams=observed;const Native=window.EventSource;
      window.EventSource=class extends Native{record:{url:string;closed:boolean};constructor(url:string|URL,options?:EventSourceInit){super(url,options);this.record={url:new URL(String(url),location.href).pathname,closed:false};observed.push(this.record);}close(){this.record.closed=true;super.close();}};
    });
    await page.goto(`/projects/${a.id}`);await expect(page.getByRole('heading',{name:a.name,exact:true})).toBeVisible();await expect(page.getByText(/История обновляется/)).toBeVisible();const sameDocument=await navigationMarker(page);
    let captured=()=>{},delivered=()=>{};const held=new Promise<void>(resolve=>{captured=resolve;}),lateResponseDelivered=new Promise<void>(resolve=>{delivered=resolve;});let intercepted=false;
    await page.route(url=>url.pathname===scope(a.id),async route=>{if(intercepted){await route.continue();return;}intercepted=true;const response=await route.fetch();captured();await released;await route.fulfill({response});delivered();});
    await page.getByRole('button',{name:'Обновить проект',exact:true}).click();await held;await catalog(page);await openSaved(page,b);
    release();await lateResponseDelivered;await expect(page.getByRole('heading',{name:b.name,exact:true})).toBeVisible();await expect(selected(page)).toHaveAttribute('data-project-id',b.id);await expect(selected(page)).toContainText('Только задача B');
    await agentA.call('ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:'Поздний факт только A',context:'A остаётся отдельным MCP scope.',evidence:'test://workspace-browser/only-a'});
    await agentB.call('ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:'Живой факт только B',context:'B получает собственный committed stream.',evidence:'test://workspace-browser/only-b'});
    await expect(feed(page)).toContainText('Живой факт только B');await expect(feed(page)).not.toContainText('Поздний факт только A');await expect(page.getByRole('heading',{name:a.name,exact:true})).toHaveCount(0);
    const streams=await page.evaluate(()=>(window as Window&{__ouroStreams?:Array<{url:string;closed:boolean}>}).__ouroStreams??[]);expect(streams.some(stream=>stream.url===`${scope(a.id)}/stream`&&stream.closed)).toBe(true);expect(streams.filter(stream=>!stream.closed).map(stream=>stream.url)).toEqual([`${scope(b.id)}/stream`]);expect(await marker(page)).toBe(sameDocument);
    await catalog(page);await openSaved(page,a);await expect(feed(page)).toContainText('Поздний факт только A');await expect(feed(page)).not.toContainText('Живой факт только B');
  }finally{release();await agentA?.client.close();await agentB?.client.close();if(assignmentA)await revoke(page,assignmentA);if(assignmentB)await revoke(page,assignmentB);await rm(folderA,{recursive:true,force:true});await rm(folderB,{recursive:true,force:true});}
});

test('PW04/PW06 a committed task with a lost response retains the exact A intent across internal A-B-A navigation',async({page})=>{
  test.setTimeout(90000);const folderA=await mkdtemp(join(tmpdir(),'ouro-browser-receipt-a-')),folderB=await mkdtemp(join(tmpdir(),'ouro-browser-receipt-b-'));let cleanup:Assignment|undefined;
  try{
    await page.request.get('/api/session');const a=await apiProject(page,`Квитанция A ${crypto.randomUUID().slice(0,8)}`,folderA),b=await apiProject(page,`Квитанция B ${crypto.randomUUID().slice(0,8)}`,folderB);
    const registered=await page.request.post(`${scope(a.id)}/agents`,{data:{name:'MCP receipt acceptance'}});expect(registered.ok()).toBe(true);const registration=await registered.json() as Registration;
    await page.goto(`/projects/${a.id}`);await expect(page.getByRole('heading',{name:a.name,exact:true})).toBeVisible();await expect(page.getByText(/История обновляется/)).toBeVisible();const sameDocument=await navigationMarker(page);
    await fillTask(page,registration.agent.id,'Один старт после потерянного HTTP ответа');const requests:CapturedRequest[]=[],foreignWrites:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith(`${scope(b.id)}/`))foreignWrites.push(request.url());});
    await page.route(url=>url.pathname===`${scope(a.id)}/tasks`,async route=>{requests.push(capture(route.request()));if(requests.length>1){await route.continue();return;}const committed=await route.fetch();expect(committed.ok(),await committed.text()).toBe(true);await route.abort('failed');});
    await page.getByRole('button',{name:'Начать работу',exact:true}).click();const pending=region(page,'Неподтверждённые действия');await expect(pending).toContainText('Исход действия неизвестен.');
    const before=await snapshot(page,a.id),execution=before.state.executions.at(-1)!;cleanup={project:a,registration,executionId:execution.id,specId:execution.specId};expect(before.state.specs).toHaveLength(1);expect(before.state.executions).toHaveLength(1);expect(execution.state).toBe('queued');expect(requests).toHaveLength(1);expect(requests[0].actor).toBeTruthy();expect(requests[0].project).toBe(a.id);
    await catalog(page);await openSaved(page,b);await expect(region(page,'Неподтверждённые действия')).toHaveCount(0);expect((await snapshot(page,b.id)).state.specs).toHaveLength(0);await catalog(page);await openSaved(page,a);
    await expect(pending).toContainText('Исход действия неизвестен.');await pending.locator('summary').filter({hasText:'Исходный запрос'}).click();await expect(pending).toContainText(JSON.parse(requests[0].body!).requestId);
    const replayed=page.waitForResponse(response=>new URL(response.url()).pathname===`${scope(a.id)}/tasks`&&response.request().method()==='POST');await pending.getByRole('button',{name:'Повторить тот же запрос',exact:true}).click();const receipt=await replayed;expect(receipt.ok()).toBe(true);expect((await receipt.json()).replayed).toBe(true);
    expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);expect(JSON.parse(requests[1].body!).expectedVersion).toBe(JSON.parse(requests[0].body!).expectedVersion);await expect(pending).toHaveCount(0);
    const after=await snapshot(page,a.id);expect(after.cursor).toBe(before.cursor);expect(after.state.specs.map(spec=>spec.id)).toEqual(before.state.specs.map(spec=>spec.id));expect(after.state.executions.map(attempt=>attempt.id)).toEqual([execution.id]);expect(foreignWrites).toEqual([]);expect(await marker(page)).toBe(sameDocument);
  }finally{if(cleanup)await revoke(page,cleanup);await rm(folderA,{recursive:true,force:true});await rm(folderB,{recursive:true,force:true});}
});
