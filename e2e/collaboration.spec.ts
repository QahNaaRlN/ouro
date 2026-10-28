import { test,expect,type Page,type Browser,type BrowserContext,type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ProjectState } from '../packages/core/src';

async function project(request:APIRequestContext):Promise<ProjectState>{const response=await request.get('/api/project');expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state;}
async function command(request:APIRequestContext,body:Record<string,unknown>){const response=await request.post('/api/commands',{data:{...body,requestId:crypto.randomUUID(),expectedVersion:(await project(request)).version}});expect(response.ok(),await response.text()).toBeTruthy();return response.json();}
async function setup(operator:Page,browser:Browser,baseURL:string|undefined){
  await operator.goto('/');await expect(operator.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible({timeout:15000});
  const a=await(await operator.request.post('/api/participants',{data:{name:`Редактор А ${Date.now()}`}})).json(),b=await(await operator.request.post('/api/participants',{data:{name:`Редактор Б ${Date.now()}`}})).json();
  expect(a.participant).toBeTruthy();expect(b.participant).toBeTruthy();
  const created=await command(operator.request,{type:'createSpec',content:{title:`Общее ожидание ${Date.now()}`,goal:'Начальный текст',dod:[{id:'shared-check',text:'Проверяемый критерий',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',flow:{entryNodeId:'work',nodes:[{id:'work',kind:'action',title:'Общая работа',description:'',owner:'agent'},{id:'result',kind:'result',title:'Проверка',description:'',owner:'human'}],edges:[{id:'work-result',source:'work',target:'result',label:'Проверить'}]}}});
  const spec=created.state.specs.at(-1)!,revision=created.state.revisions.at(-1)!;
  const activated=await command(operator.request,{type:'activateRevision',specId:spec.id,revisionId:revision.id});
  const ca=await browser.newContext({baseURL}),cb=await browser.newContext({baseURL});
  expect((await ca.request.post('/api/participants/session',{data:{credential:a.credential}})).ok()).toBeTruthy();expect((await cb.request.post('/api/participants/session',{data:{credential:b.credential}})).ok()).toBeTruthy();
  const pa=await ca.newPage(),pb=await cb.newPage();
  for(const page of [pa,pb]){await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible({timeout:15000});await page.getByRole('button',{name:'Черновики',exact:true}).click();await expect(page.getByRole('heading',{name:'Совместные черновики',exact:true})).toBeVisible();}
  return {a:a.participant,b:b.participant,aCredential:a.credential,ca,cb,pa,pb,spec,revision,cursor:activated.cursor};
}

async function reenter(page:Page,context:BrowserContext,credential:string){
  const cookie=(await context.cookies()).find(cookie=>cookie.name==='ouro_participant')!;await context.addCookies([{...cookie,value:'invalid'}]);
  await page.reload();const login=page.getByRole('region',{name:'Войти участником',exact:true});await expect(login).toBeVisible();await login.getByLabel('Ключ участника',{exact:true}).fill(credential);await login.getByRole('button',{name:'Войти',exact:true}).click();await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible({timeout:15000});
}

const editor=(page:Page)=>page.getByRole('region',{name:'Редактор общего черновика',exact:true});
const goal=(page:Page)=>editor(page).getByRole('textbox',{name:'Цель черновика',exact:true});
async function saved(page:Page){await expect(editor(page).getByRole('status').filter({hasText:'Все изменения сохранены'})).toBeVisible();}
async function createShared(page:Page,specId:string){
  await page.getByRole('combobox',{name:'Спецификация для черновика',exact:true}).selectOption(specId);
  const created=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/drafts'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Создать общий черновик',exact:true}).click();const response=await created;expect(response.ok(),await response.text()).toBeTruthy();const body=await response.json();
  await expect(editor(page)).toHaveAttribute('data-draft-id',body.draft.id);await saved(page);return body.draft;
}
async function openShared(page:Page,id:string){await page.getByRole('button',{name:'Обновить список',exact:true}).click();await page.getByRole('region',{name:'Общие черновики',exact:true}).getByRole('button').filter({hasText:id}).click();await expect(editor(page)).toHaveAttribute('data-draft-id',id);await saved(page);}

test('C06 two real human sessions converge concurrent text and DoD, preserve relative caret, reconnect offline edits and publish distinct authors',async({page,browser,baseURL})=>{
  test.setTimeout(120000);const f=await setup(page,browser,baseURL);
  try{
    const draft=await createShared(f.pa,f.spec.id);await openShared(f.pb,draft.id);
    await goal(f.pa).focus();await goal(f.pa).evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(el.value.length,el.value.length));
    await goal(f.pb).focus();await goal(f.pb).evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(0,0));
    await Promise.all([f.pa.keyboard.insertText(' + А'),f.pb.keyboard.insertText('Б + ')]);
    await editor(f.pb).getByRole('textbox',{name:'Критерий 1',exact:true}).fill('Критерий от второго участника');
    await expect(goal(f.pa)).toHaveValue('Б + Начальный текст + А');await expect(goal(f.pb)).toHaveValue('Б + Начальный текст + А');
    await expect(editor(f.pa).getByRole('textbox',{name:'Критерий 1',exact:true})).toHaveValue('Критерий от второго участника');await saved(f.pa);await saved(f.pb);
    expect((await project(page.request)).version).toBe(f.cursor);
    await goal(f.pa).focus();await goal(f.pa).evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(5,11));
    await goal(f.pb).focus();await goal(f.pb).evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(0,0));await f.pb.keyboard.insertText('Новый: ');
    await expect(goal(f.pa)).toHaveValue('Новый: Б + Начальный текст + А');await expect(goal(f.pa)).toBeFocused();
    expect(await goal(f.pa).evaluate((el:HTMLTextAreaElement)=>[el.selectionStart,el.selectionEnd])).toEqual([12,18]);
    await f.ca.setOffline(true);await goal(f.pa).focus();await goal(f.pa).evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(el.value.length,el.value.length));await f.pa.keyboard.insertText(' + офлайн А');
    await goal(f.pb).focus();await goal(f.pb).evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(el.value.length,el.value.length));await f.pb.keyboard.insertText(' + онлайн Б');await saved(f.pb);
    await expect(editor(f.pa).getByRole('status')).toContainText(/Нет связи|Не отправлено/);
    await f.ca.setOffline(false);
    await expect.poll(async()=>({a:await goal(f.pa).inputValue(),b:await goal(f.pb).inputValue()})).toEqual(expect.objectContaining({a:expect.stringContaining('офлайн А'),b:expect.stringContaining('офлайн А')}));
    await expect.poll(async()=>await goal(f.pa).inputValue()).toBe(await goal(f.pb).inputValue());await saved(f.pa);await saved(f.pb);
    const published=f.pa.waitForResponse(response=>new URL(response.url()).pathname===`/api/drafts/${draft.id}/publish`&&response.request().method()==='POST');
    await editor(f.pa).getByRole('button',{name:'Опубликовать новую ревизию',exact:true}).click();const first=await published;expect(first.ok(),await first.text()).toBeTruthy();const firstBody=await first.json();
    await expect(goal(f.pb)).toHaveJSProperty('readOnly',true);await expect(f.pb.locator('footer')).toContainText(`cursor ${firstBody.cursor}`);
    const next=await createShared(f.pb,f.spec.id);await goal(f.pb).fill('Следующее согласованное ожидание');await saved(f.pb);
    const second=f.pb.waitForResponse(response=>new URL(response.url()).pathname===`/api/drafts/${next.id}/publish`&&response.request().method()==='POST');await editor(f.pb).getByRole('button',{name:'Опубликовать новую ревизию',exact:true}).click();expect((await second).ok()).toBeTruthy();
    const state=await project(page.request),events=state.events.filter(event=>event.type==='RevisionProposed'&&event.specId===f.spec.id);
    expect(events.map(event=>event.actor.id)).toEqual([f.a.id,f.b.id]);expect(state.specs.find(spec=>spec.id===f.spec.id)?.activeRevisionId).toBe(f.revision.id);
    expect(state.revisions.find(revision=>revision.id===f.revision.id)).toEqual(f.revision);for(const revision of state.revisions.filter(revision=>revision.specId===f.spec.id))expect(revision.flow).toEqual(f.revision.flow);
    expect(state.specs.find(spec=>spec.id===f.spec.id)?.acceptance).toBeUndefined();
  }finally{await f.ca.setOffline(false);await f.ca.close();await f.cb.close();}
});

test('C06 late offline edits remain copyable and exportable after another human publishes, without entering the immutable revision',async({page,browser,baseURL})=>{
  test.setTimeout(90000);const f=await setup(page,browser,baseURL);
  try{
    const draft=await createShared(f.pa,f.spec.id);await openShared(f.pb,draft.id);await f.ca.setOffline(true);
    const local='Несохранённое ожидание первого участника';await goal(f.pa).fill(local);
    const committed=f.pb.waitForResponse(response=>new URL(response.url()).pathname===`/api/drafts/${draft.id}/publish`&&response.request().method()==='POST');await editor(f.pb).getByRole('button',{name:'Опубликовать новую ревизию',exact:true}).click();const result=await committed;expect(result.ok(),await result.text()).toBeTruthy();
    await f.ca.setOffline(false);await expect(editor(f.pa).getByRole('alert')).toContainText('Локальные изменения не приняты');await expect(goal(f.pa)).toHaveValue(local);await expect(goal(f.pa)).toHaveJSProperty('readOnly',true);
    const exported=f.pa.waitForEvent('download');await editor(f.pa).getByRole('button',{name:'Экспортировать локальный текст',exact:true}).click();const file=await(await exported).path();expect(file).toBeTruthy();expect(JSON.parse(await readFile(file!,'utf8')).content.goal).toBe(local);
    const state=await project(page.request),newRevision=state.revisions.findLast(revision=>revision.specId===f.spec.id)!;expect(newRevision.goal).toBe('Начальный текст');expect(newRevision.goal).not.toBe(local);expect(state.specs.find(spec=>spec.id===f.spec.id)?.activeRevisionId).toBe(f.revision.id);
    await f.pa.getByRole('button',{name:'Спецификации',exact:true}).click();await expect(f.pa.getByRole('combobox',{name:'Выбрать спецификацию',exact:true})).toBeVisible();
  }finally{await f.ca.setOffline(false);await f.ca.close();await f.cb.close();}
});

test('C05 browser keeps a lost publication intent across a 401 response and re-entry, then retries exactly once',async({page,browser,baseURL})=>{
  test.setTimeout(90000);const f=await setup(page,browser,baseURL);
  try{
    const draft=await createShared(f.pa,f.spec.id),requests:unknown[]=[];let attempts=0;
    await f.pa.route(`**/api/drafts/${draft.id}/publish`,async route=>{requests.push(route.request().postDataJSON());attempts++;if(attempts===1){const response=await route.fetch();expect(response.ok()).toBeTruthy();await route.abort('failed');}else if(attempts===2)await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'UNAUTHENTICATED',message:'Войдите повторно как прежний участник.'}})});else await route.continue();});
    await editor(f.pa).getByRole('button',{name:'Опубликовать новую ревизию',exact:true}).click();await expect(editor(f.pa).getByRole('button',{name:'Проверить публикацию',exact:true})).toBeEnabled();
    const unrelated=await command(page.request,{type:'createSpec',content:{title:`После потерянного ответа ${Date.now()}`,goal:'Не откатывать новый cursor',dod:[{id:'receipt',text:'Одна ревизия и новый cursor',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
    await expect(f.pa.locator('footer')).toContainText(`cursor ${unrelated.cursor}`);
    const unauthorized=f.pa.waitForResponse(response=>new URL(response.url()).pathname===`/api/drafts/${draft.id}/publish`&&response.request().method()==='POST');await editor(f.pa).getByRole('button',{name:'Проверить публикацию',exact:true}).click();expect((await unauthorized).status()).toBe(401);
    await expect(editor(f.pa).getByRole('button',{name:'Проверить публикацию',exact:true})).toBeEnabled();
    await reenter(f.pa,f.ca,f.aCredential);
    await f.pa.getByRole('button',{name:'Черновики',exact:true}).click();await openShared(f.pa,draft.id);
    const retried=f.pa.waitForResponse(response=>new URL(response.url()).pathname===`/api/drafts/${draft.id}/publish`&&response.request().method()==='POST');await editor(f.pa).getByRole('button',{name:'Проверить публикацию',exact:true}).click();const replay=await retried;expect(replay.ok(),await replay.text()).toBeTruthy();expect((await replay.json()).replayed).toBe(true);
    await expect(editor(f.pa)).toContainText('Новая ревизия предложена');expect(requests).toHaveLength(3);expect(requests[1]).toEqual(requests[0]);expect(requests[2]).toEqual(requests[0]);await expect(f.pa.locator('footer')).toContainText(`cursor ${unrelated.cursor}`);
    expect((await project(page.request)).events.filter(event=>event.type==='RevisionProposed'&&event.specId===f.spec.id)).toHaveLength(1);
  }finally{await f.ca.close();await f.cb.close();}
});

test('C05 browser freezes an uncertain create intent through 401 and login so retries cannot create a second shared draft',async({page,browser,baseURL})=>{
  test.setTimeout(90000);const f=await setup(page,browser,baseURL);
  try{
    const requests:unknown[]=[];let attempts=0,createdId='';
    await f.pa.getByRole('combobox',{name:'Спецификация для черновика',exact:true}).selectOption(f.spec.id);
    await f.pa.route('**/api/drafts',async route=>{
      if(route.request().method()!=='POST'){await route.continue();return;}
      requests.push(route.request().postDataJSON());attempts++;
      if(attempts===1){const response=await route.fetch();expect(response.ok()).toBeTruthy();createdId=(await response.json()).draft.id;await route.abort('failed');}
      else if(attempts===2)await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'UNAUTHENTICATED',message:'Повторите вход прежним участником.'}})});
      else await route.continue();
    });
    const createButton=f.pa.getByRole('button',{name:/^(Создать общий черновик|Проверить создание черновика)$/});
    await createButton.click();await expect.poll(()=>createdId).not.toBe('');await expect(createButton).toBeEnabled();
    const denied=f.pa.waitForResponse(response=>new URL(response.url()).pathname==='/api/drafts'&&response.request().method()==='POST');await createButton.click();expect((await denied).status()).toBe(401);
    await expect(f.pa.getByRole('combobox',{name:'Спецификация для черновика',exact:true})).toBeDisabled();
    await reenter(f.pa,f.ca,f.aCredential);await f.pa.getByRole('button',{name:'Черновики',exact:true}).click();
    await expect(f.pa.getByRole('combobox',{name:'Спецификация для черновика',exact:true})).toBeDisabled();
    const recovered=f.pa.waitForResponse(response=>new URL(response.url()).pathname==='/api/drafts'&&response.request().method()==='POST');await f.pa.getByRole('button',{name:'Проверить создание черновика',exact:true}).click();const response=await recovered;expect(response.ok(),await response.text()).toBeTruthy();expect((await response.json()).draft.id).toBe(createdId);
    await expect(editor(f.pa)).toHaveAttribute('data-draft-id',createdId);expect(requests).toHaveLength(3);expect(requests[1]).toEqual(requests[0]);expect(requests[2]).toEqual(requests[0]);
    expect((await(await f.pa.request.get(`/api/drafts?specId=${f.spec.id}`)).json()).drafts).toHaveLength(1);
  }finally{await f.ca.close();await f.cb.close();}
});

test('C05 delayed pre-publication GET cannot reopen the editor after publication at the same technical version',async({page,browser,baseURL})=>{
  test.setTimeout(90000);const f=await setup(page,browser,baseURL);let release=()=>{};
  try{
    const draft=await createShared(f.pa,f.spec.id);let publishing=false,held=false,captured=()=>{};
    const waiting=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{captured=resolve;});
    await f.pa.route(`**/api/drafts/${draft.id}`,async route=>{
      const response=await route.fetch(),body=await response.body();
      if(publishing&&!held){held=true;const parsed=JSON.parse(body.toString());expect(parsed.draft.publishedRevisionId).toBeUndefined();captured();await waiting;}
      await route.fulfill({response,body});
    });
    await f.pa.route(`**/api/drafts/${draft.id}/publish`,async route=>{publishing=true;await ready;const response=await route.fetch();expect(response.ok()).toBeTruthy();await route.fulfill({response});});
    await editor(f.pa).getByRole('button',{name:'Опубликовать новую ревизию',exact:true}).click();
    await expect(editor(f.pa)).toContainText('Новая ревизия предложена');await expect(goal(f.pa)).toHaveJSProperty('readOnly',true);
    const delayed=f.pa.waitForResponse(response=>new URL(response.url()).pathname===`/api/drafts/${draft.id}`&&response.request().method()==='GET');
    release();await(await delayed).finished();await f.pa.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(goal(f.pa)).toHaveJSProperty('readOnly',true);
    const stored=(await(await f.pa.request.get(`/api/drafts/${draft.id}`)).json()).draft;expect(stored.version).toBe(draft.version);expect(stored.publishedRevisionId).toBeTruthy();
    await expect(editor(f.pa)).toContainText('Черновик опубликован');await expect(editor(f.pa).getByRole('button',{name:'Опубликовать новую ревизию',exact:true})).toBeDisabled();
  }finally{release();await f.ca.close();await f.cb.close();}
});
