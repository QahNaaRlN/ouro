import {chooseSelectOption} from './select-helpers';
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {multiprojectFixturePath,type MultiprojectFixture} from './multiproject-global-setup';

test('R01 a second tab cannot redirect the first tab writes, agents or SSE to another project',async({page,baseURL})=>{
 test.setTimeout(90000);
 const fixture:MultiprojectFixture=JSON.parse(await readFile(multiprojectFixturePath,'utf8'));
 expect((await page.request.post('/api/auth/login',{data:fixture.owner})).status()).toBe(200);
 const create=async(name:string)=>{
  const response=await page.request.post('/api/projects',{data:{name}});
  expect(response.status(),await response.text()).toBe(201);
  return (await response.json()).project as {id:string};
 };
 const first=await create('Tab A '+Date.now()),second=await create('Tab B '+Date.now());
 await page.context().addCookies([{name:'ouro_project',value:first.id,url:baseURL!}]);
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 await expect(page.getByLabel('Текущий проект',{exact:true})).toHaveAttribute('data-value',first.id);
 const other=await page.context().newPage();
 try{
  await other.goto('/');
  await expect(other.getByLabel('Текущий проект',{exact:true})).toHaveAttribute('data-value',first.id);
  await chooseSelectOption(other.getByLabel('Текущий проект',{exact:true}),second.id);
  await expect(other.getByLabel('Текущий проект',{exact:true})).toHaveAttribute('data-value',second.id);
  await expect(other.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  await expect(page.getByLabel('Текущий проект',{exact:true})).toHaveAttribute('data-value',first.id);
  const title='Pinned tab spec '+Date.now();
  await page.getByRole('button',{name:'Новая спека',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Название',{exact:true}).fill(title);
  await dialog.getByLabel('Цель',{exact:true}).fill('Keep the original project after another tab switches.');
  await dialog.getByLabel('Definition of Done').fill('Only project A contains this spec.');
  const written=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/commands'&&response.request().method()==='POST');
  await dialog.getByRole('button',{name:'Создать спецификацию',exact:true}).click();
  const response=await written,body=await response.json();
  expect(response.status()).toBe(200);
  expect(body.state.projectId).toBe(first.id);
  const read=async(id:string)=>(await(await page.request.get('/api/project?projectId='+id)).json()).state;
  expect((await read(first.id)).specs.map((spec:{title:string})=>spec.title)).toContain(title);
  expect((await read(second.id)).specs).toHaveLength(0);
  const stream=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/stream');
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  expect(new URL((await stream).url()).searchParams.get('projectId')).toBe(first.id);
  await page.getByRole('button',{name:'Агенты',exact:true}).click();
  await page.getByLabel('Имя агента',{exact:true}).fill('Pinned tab agent');
  const registered=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/agents'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Создать ключ подключения',exact:true}).click();
  const registration=await registered;
  expect(registration.status()).toBe(201);
  expect((await registration.json()).agent.projectId).toBe(first.id);
  const secondAgents=await page.request.get('/api/agents?projectId='+second.id);
  expect((await secondAgents.json()).agents).toHaveLength(0);
 }finally{await other.close();}
});
