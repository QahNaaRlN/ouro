import { test,expect,type Page } from '@playwright/test';
import type { ProjectState } from '../packages/core/src';
async function open(page:Page){await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible({timeout:15000});}
async function login(page:Page,credential:string){
  await open(page);await page.getByRole('button',{name:'Участники',exact:true}).click();
  const form=page.getByRole('region',{name:'Войти участником',exact:true});await form.getByLabel('Ключ участника',{exact:true}).fill(credential);
  const signed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/participants/session'&&response.request().method()==='POST');
  await form.getByRole('button',{name:'Войти',exact:true}).click();expect((await signed).ok()).toBeTruthy();
  await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible({timeout:15000});
}
async function createSpec(page:Page,title:string){
  await page.getByRole('button',{name:'Новая спека',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:'Название',exact:true}).fill(title);
  await dialog.getByRole('textbox',{name:'Цель',exact:true}).fill('Проверить отдельное человеческое авторство.');
  await dialog.getByRole('textbox',{name:/^Definition of Done/}).fill('Автор сохранён сервером');
  await dialog.getByRole('button',{name:'Создать спецификацию',exact:true}).click();await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
}
test('C01 two independently logged-in human browsers keep distinct authors and no participant key in browser storage',async({page,browser,baseURL})=>{
  test.setTimeout(60000);await open(page);await page.getByRole('button',{name:'Участники',exact:true}).click();
  const name=`Алиса ${Date.now()}`;await page.getByRole('textbox',{name:'Имя участника',exact:true}).fill(name);
  const created=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/participants'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Создать участника',exact:true}).click();const a=await(await created).json();
  const key=page.getByRole('textbox',{name:'Выданный ключ участника',exact:true});await expect(key).toHaveValue(a.credential);
  await page.getByRole('button',{name:'Я сохранил ключ — скрыть',exact:true}).click();await expect(key).toHaveCount(0);
  const result=await page.request.post('/api/participants',{data:{name:`Борис ${Date.now()}`}});expect(result.ok(),await result.text()).toBeTruthy();const b=await result.json();
  const ca=await browser.newContext({baseURL}),cb=await browser.newContext({baseURL});
  try{
    const pa=await ca.newPage(),pb=await cb.newPage();await test.step('Алиса входит через UI',()=>login(pa,a.credential));await test.step('Борис входит через UI',()=>login(pb,b.credential));
    const sa=await(await pa.request.get('/api/session')).json(),sb=await(await pb.request.get('/api/session')).json();
    expect(sa.actor.id).toBe(a.participant.id);expect(sb.actor.id).toBe(b.participant.id);expect(sa.actor.id).not.toBe(sb.actor.id);
    const ta=`Ожидание Алисы ${Date.now()}`,tb=`Ожидание Бориса ${Date.now()}`;await test.step('Алиса создаёт ожидание',()=>createSpec(pa,ta));
    const afterAlice:ProjectState=(await(await pa.request.get('/api/project')).json()).state;
    await expect(pb.locator('footer')).toContainText(`cursor ${afterAlice.version}`);await test.step('Борис создаёт ожидание',()=>createSpec(pb,tb));
    const state:ProjectState=(await(await page.request.get('/api/project')).json()).state;
    for(const [title,id] of [[ta,a.participant.id],[tb,b.participant.id]]){
      const spec=state.specs.find(spec=>spec.title===title)!;expect(spec).toBeTruthy();expect(state.events.find(event=>event.type==='SpecCreated'&&event.specId===spec.id)?.actor.id).toBe(id);
    }
    for(const [context,participantPage,credential] of [[ca,pa,a.credential],[cb,pb,b.credential]] as const){
      const cookies=await context.cookies();expect(cookies.find(cookie=>cookie.name==='ouro_participant')).toMatchObject({httpOnly:true,sameSite:'Strict'});
      const stored=await participantPage.evaluate(()=>({local:{...localStorage},session:{...sessionStorage},cookies:document.cookie}));expect(JSON.stringify(stored)).not.toContain(credential);expect(stored.cookies).not.toContain('ouro_participant');
      expect((await participantPage.request.post('/api/mcp',{data:{}})).status()).toBe(401);
    }
  }finally{await Promise.allSettled([ca.close(),cb.close()]);}
});
test('C02 operator revocation blocks current cookie reads and writes; bootstrap cannot silently restore demo identity',async({page,browser,baseURL})=>{
  await open(page);const response=await page.request.post('/api/participants',{data:{name:`Отозванный участник ${Date.now()}`}});expect(response.ok()).toBeTruthy();const created=await response.json();
  const context=await browser.newContext({baseURL});
  try{
    const participant=await context.newPage();await login(participant,created.credential);
    const before:ProjectState=(await(await page.request.get('/api/project')).json()).state;
    await page.getByRole('button',{name:'Участники',exact:true}).click();await page.getByRole('button',{name:`Отозвать доступ ${created.participant.name}`,exact:true}).click();
    await expect(page.getByRole('region',{name:'Реестр участников'}).locator('article').filter({hasText:created.participant.id})).toContainText('Доступ отозван');
    expect((await participant.request.get('/api/project')).status()).toBe(401);expect((await participant.request.get('/api/events')).status()).toBe(401);
    const denied=await participant.request.post('/api/commands',{data:{type:'createSpec',requestId:crypto.randomUUID(),expectedVersion:before.version,content:{title:'Не сохранять',goal:'Отозванная сессия',dod:[{id:'no',text:'Не должно появиться',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}}});expect(denied.status()).toBe(401);
    const bootstrap=await participant.request.get('/api/session');expect(bootstrap.status()).toBe(401);expect(bootstrap.headers()['set-cookie']).toBeUndefined();
    expect((await(await page.request.get('/api/project')).json()).state.version).toBe(before.version);
    await participant.reload();await expect(participant.getByRole('region',{name:'Войти участником',exact:true})).toBeVisible();
  }finally{await context.close();}
});
