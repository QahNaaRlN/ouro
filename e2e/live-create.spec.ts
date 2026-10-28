import {test,expect} from '@playwright/test';
import type {ProjectState} from '../packages/core/src';

test('a create response selects its own spec even when another human creates a newer one first',async({page,request})=>{
  await request.get('/api/session');await page.goto('/');
  await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  await page.getByRole('button',{name:'Новая спека',exact:true}).click();
  const dialog=page.getByRole('dialog'),title=`Моя спека ${Date.now()}`;
  await dialog.getByRole('textbox',{name:'Название',exact:true}).fill(title);
  await dialog.getByRole('textbox',{name:'Цель',exact:true}).fill('Выбрать именно созданную мной спеку.');
  await dialog.getByRole('textbox',{name:/Definition of Done/}).fill('Выбор не переходит к другой работе');
  let release=()=>{},captured=()=>{},ownId='';
  const held=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{captured=resolve;});
  await page.route('**/api/commands',async route=>{
    const response=await route.fetch(),body=await response.body();
    const data=JSON.parse(body.toString());
    ownId=data.events.find((event:{type:string})=>event.type==='SpecCreated').payload.spec.id;
    captured();await held;await route.fulfill({response,body});
  });
  try{
    await dialog.getByRole('button',{name:'Создать спецификацию',exact:true}).click();await ready;
    const before=(await(await request.get('/api/project')).json()).state as ProjectState;
    const other=await request.post('/api/commands',{data:{type:'createSpec',requestId:crypto.randomUUID(),expectedVersion:before.version,content:{title:`Другая спека ${Date.now()}`,goal:'Другая работа не меняет мой явный выбор.',dod:[{id:'own',text:'Выбор сохранён',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}}});
    expect(other.ok(),await other.text()).toBeTruthy();const changed=(await other.json()).state as ProjectState;
    await expect(page.locator('footer')).toContainText(`cursor ${changed.version}`);
    release();await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel('Выбрать спецификацию',{exact:true})).toHaveValue(ownId);
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  }finally{release();await page.unroute('**/api/commands');}
});
