import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { AGENT_ID, type ProjectState } from '../packages/core/src';

async function project(request:APIRequestContext):Promise<ProjectState>{
  const response=await request.get('/api/project');expect(response.ok(),await response.text()).toBeTruthy();
  return (await response.json()).state;
}
async function human(request:APIRequestContext,payload:Record<string,unknown>):Promise<ProjectState>{
  const response=await request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:(await project(request)).version}});
  expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state;
}
const content=(title:string)=>({title,goal:'Проверить согласованное живое обновление проекта.',dod:[{id:'live',text:'История и форма согласованы',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});
async function open(page:Page){
  await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
}
async function cursor(page:Page){
  return Number((await page.locator('footer').innerText()).match(/cursor\s+(\d+)/)?.[1]);
}
async function session(request:APIRequestContext){expect((await request.get('/api/session')).ok()).toBeTruthy();}
async function simulate(request:APIRequestContext,specId:string,scenario:string):Promise<ProjectState>{
  const response=await request.post('/api/simulator',{data:{scenario,specId,requestId:crypto.randomUUID(),expectedVersion:(await project(request)).version}});
  expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state;
}
async function freshAttempt(request:APIRequestContext,title:string){
  let state=await human(request,{type:'createSpec',content:content(title)});
  const spec=state.specs.at(-1)!,revision=state.revisions.find(r=>r.id===spec.revisionIds[0])!;
  await human(request,{type:'activateRevision',specId:spec.id,revisionId:revision.id});
  state=await human(request,{type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:AGENT_ID});
  await simulate(request,spec.id,'apply');
  return {spec,revision,execution:state.executions.at(-1)!};
}

test('R03/R05 browser subscribes after bootstrap and confirms live connection only after a snapshot',async({page})=>{
  let streamRequests=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/stream')streamRequests++;});
  await open(page);
  await expect.poll(()=>streamRequests).toBeGreaterThan(0);
  await expect(page.getByRole('status').filter({hasText:'Живые обновления подключены'})).toBeVisible();
});

test('R03 a delayed manual GET cannot replace a newer committed SSE snapshot',async({page,request})=>{
  await session(request);await open(page);
  await expect(page.getByRole('status').filter({hasText:'Живые обновления подключены'})).toBeVisible();
  let release=()=>{},markCaptured=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{markCaptured=resolve;});
  let intercepted=false;
  await page.route('**/api/project',async route=>{
    if(intercepted){await route.continue();return;}
    intercepted=true;const response=await route.fetch(),body=await response.body();
    markCaptured();await held;await route.fulfill({response,body});
  });
  try{
    await page.getByRole('button',{name:'Обновить проект',exact:true}).click();await captured;
    const title=`Событие новее задержанного GET ${Date.now()}`;
    const state=await human(request,{type:'createSpec',content:content(title)});
    await expect.poll(()=>cursor(page)).toBe(state.version);
    const delivered=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/project'&&response.request().method()==='GET');
    release();await(await delivered).finished();
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    expect(await cursor(page)).toBe(state.version);
    await page.getByRole('button',{name:'Таблица',exact:true}).click();
    await expect(page.getByRole('table').getByRole('row').filter({hasText:title})).toHaveCount(1);
    await expect(page.getByRole('status').filter({hasText:'Живые обновления подключены'})).toBeVisible();
  }finally{release();await page.unroute('**/api/project');}
});

test('R03/R05 offline reconnect restores two missed commits once without changing domain states',async({page,request})=>{
  test.setTimeout(60000);await session(request);await open(page);
  await expect(page.getByRole('status').filter({hasText:'Живые обновления подключены'})).toBeVisible();
  const before=await project(request),beforeCursor=await cursor(page);
  try{
    await page.context().setOffline(true);
    await expect(page.locator('footer').getByRole('status')).toContainText(/переподключ|нет связи|потеряна/i);
    expect(await cursor(page)).toBe(beforeCursor);
    await human(request,{type:'createSpec',content:content(`Первый пропущенный commit ${Date.now()}`)});
    const after=await human(request,{type:'createSpec',content:content(`Второй пропущенный commit ${Date.now()}`)});
    expect(after.events.length-before.events.length).toBe(2);
    expect(after.executions).toEqual(before.executions);expect(after.requests).toEqual(before.requests);
    await page.context().setOffline(false);
    await expect(page.getByRole('status').filter({hasText:'Живые обновления подключены'})).toBeVisible({timeout:15000});
    await expect.poll(()=>cursor(page)).toBe(after.version);
    await page.getByRole('button',{name:'История',exact:true}).first().click();
    await page.getByRole('button',{name:'Показать весь проект',exact:true}).click();
    await expect(page.locator('.timeline-item')).toHaveCount(after.events.length);
    const versions=await page.locator('.timeline-tags .mono').allTextContents();
    expect(new Set(versions).size).toBe(after.events.length);
    expect(versions.filter(v=>v===`#${after.version-1}`)).toHaveLength(1);
    expect(versions.filter(v=>v===`#${after.version}`)).toHaveLength(1);
    const final=await project(request);expect(final.version).toBe(after.version);
    expect(final.executions).toEqual(before.executions);expect(final.requests).toEqual(before.requests);
  }finally{await page.context().setOffline(false);}
});

test('R06 a decision draft preserves focus and selection across SSE and stays copyable after another human answers',async({page,request})=>{
  test.setTimeout(60000);await session(request);
  const {spec,revision,execution}=await freshAttempt(request,`Сохранить ответ человека ${Date.now()}`);
  const state=await simulate(request,spec.id,'question'),question=state.requests.findLast(r=>r.executionId===execution.id)!;
  await open(page);await expect.poll(()=>cursor(page)).toBe(state.version);
  await page.getByRole('button',{name:/^Решения/}).first().click();
  await page.locator('.decision-list').getByRole('button').filter({hasText:spec.humanId}).click();
  const answer=page.getByRole('textbox',{name:'Ваш ответ',exact:true}),draft='Мой несохранённый ответ остаётся в этом поле для проверки и копирования.';
  await answer.fill(draft);await answer.focus();
  await answer.evaluate((element:HTMLTextAreaElement)=>element.setSelectionRange(7,25));
  const changed=await human(request,{type:'createSpec',content:content(`Независимое событие во время ответа ${Date.now()}`)});
  await expect.poll(()=>cursor(page)).toBe(changed.version);
  await expect(answer).toHaveValue(draft);await expect(answer).toBeFocused();
  expect(await answer.evaluate((element:HTMLTextAreaElement)=>[element.selectionStart,element.selectionEnd])).toEqual([7,25]);
  await expect(page.locator('.decision-detail').getByRole('heading',{name:question.title,exact:true})).toBeVisible();
  const authoritative='Другой человек уже записал окончательный ответ.';
  const resolved=await human(request,{type:'resolveDecision',decisionRequestId:question.id,specRevisionId:revision.id,outcome:{kind:'answer',answer:authoritative}});
  await expect.poll(()=>cursor(page)).toBe(resolved.version);
  await expect(answer).toHaveValue(draft);await expect(answer).toHaveJSProperty('readOnly',true);await expect(answer).toBeFocused();
  expect(await answer.evaluate((element:HTMLTextAreaElement)=>[element.selectionStart,element.selectionEnd])).toEqual([7,25]);
  await expect(page.locator('.recorded-decision')).toContainText(authoritative);
  const submit=page.getByRole('button',{name:'Записать ответ',exact:true});
  if(await submit.count())await expect(submit).toBeDisabled();
  const final=await project(request);
  expect(final.requests.find(r=>r.id===question.id)?.decision?.outcome).toEqual({kind:'answer',answer:authoritative});
  expect(final.events.filter(e=>e.type==='DecisionResolved'&&e.payload.decisionRequestId===question.id)).toHaveLength(1);
});

test('R06 acceptance evidence stays pinned to r1 after another human activates r2 with the same criterion ID',async({page,request})=>{
  test.setTimeout(60000);await session(request);
  const {spec,revision}=await freshAttempt(request,`Не переносить evidence между ревизиями ${Date.now()}`);
  const completed=await simulate(request,spec.id,'complete');
  await open(page);await expect.poll(()=>cursor(page)).toBe(completed.version);
  await page.getByRole('button',{name:'Спецификации',exact:true}).click();
  await page.getByLabel('Выбрать спецификацию').selectOption(spec.id);
  await page.getByRole('button',{name:'Принять по DoD',exact:true}).click();
  const dialog=page.getByRole('dialog'),evidence=dialog.getByRole('textbox');
  const draft='Наблюдение для первой ревизии; не является доказательством по новому ожиданию.';
  await evidence.fill(draft);await evidence.focus();
  await evidence.evaluate((element:HTMLTextAreaElement)=>element.setSelectionRange(4,21));
  const {title,goal,dod,constraints,assumptions,risks,inputs,comment}=revision;
  const proposed=await human(request,{type:'proposeRevision',specId:spec.id,content:{title:`${title} · r2`,goal:`${goal} Дополнительное ожидание.`,dod,constraints,assumptions,risks,inputs,comment}});
  const newRevision=proposed.revisions.findLast(r=>r.specId===spec.id)!;
  const activated=await human(request,{type:'activateRevision',specId:spec.id,revisionId:newRevision.id});
  await expect.poll(()=>cursor(page)).toBe(activated.version);
  await expect(evidence).toHaveValue(draft);await expect(evidence).toBeFocused();
  expect(await evidence.evaluate((element:HTMLTextAreaElement)=>[element.selectionStart,element.selectionEnd])).toEqual([4,21]);
  await expect(dialog).toContainText('Ревизия изменилась');
  await expect(dialog.getByRole('button',{name:'Подтверждаю приёмку по DoD',exact:true})).toBeDisabled();
  const final=await project(request);expect(final.specs.find(s=>s.id===spec.id)?.activeRevisionId).toBe(newRevision.id);
  expect(final.events.some(e=>e.type==='SpecAccepted'&&e.specId===spec.id)).toBe(false);
});

test('R06 a spec draft retains its text and observed base instead of silently rebasing on SSE',async({page,request})=>{
  test.setTimeout(60000);await session(request);
  const created=await human(request,{type:'createSpec',content:content(`Не перебазировать черновик автоматически ${Date.now()}`)}),spec=created.specs.at(-1)!;
  const revision=created.revisions.find(r=>r.id===spec.revisionIds[0])!;
  const activated=await human(request,{type:'activateRevision',specId:spec.id,revisionId:revision.id});
  await open(page);await expect.poll(()=>cursor(page)).toBe(activated.version);
  await page.getByRole('button',{name:'Спецификации',exact:true}).click();
  await page.getByLabel('Выбрать спецификацию').selectOption(spec.id);
  await page.getByRole('button',{name:'Предложить ревизию',exact:true}).click();
  const dialog=page.getByRole('dialog'),title=dialog.getByLabel('Название',{exact:true}),save=dialog.getByRole('button',{name:'Сохранить предложение',exact:true});
  const draft='Моё название для следующей ревизии сохраняется после внешнего события';
  await title.fill(draft);await title.focus();await title.evaluate((element:HTMLInputElement)=>element.setSelectionRange(5,17));
  const unrelated=await human(request,{type:'createSpec',content:content(`Внешняя работа при открытой форме ${Date.now()}`)});
  await expect.poll(()=>cursor(page)).toBe(unrelated.version);
  await expect(title).toHaveValue(draft);await expect(title).toBeFocused();
  expect(await title.evaluate((element:HTMLInputElement)=>[element.selectionStart,element.selectionEnd])).toEqual([5,17]);
  if(await save.isEnabled()){
    const rejection=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/commands'&&response.request().method()==='POST');
    await save.click();expect((await rejection).status()).toBe(409);
  }
  await expect(dialog).toBeVisible();await expect(title).toHaveValue(draft);
  expect((await project(request)).specs.find(s=>s.id===spec.id)?.revisionIds).toEqual([revision.id]);
  const {title:baseTitle,goal,dod,constraints,assumptions,risks,inputs,comment}=revision;
  const proposed=await human(request,{type:'proposeRevision',specId:spec.id,content:{title:`${baseTitle} · внешняя r2`,goal,dod,constraints,assumptions,risks,inputs,comment}});
  const updated=await human(request,{type:'activateRevision',specId:spec.id,revisionId:proposed.revisions.findLast(r=>r.specId===spec.id)!.id});
  await expect.poll(()=>cursor(page)).toBe(updated.version);
  await expect(title).toHaveValue(draft);await expect(save).toBeDisabled();
  await expect(dialog).toContainText(/ревизия изменилась/i);
});
