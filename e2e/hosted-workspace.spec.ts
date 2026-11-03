import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {multiprojectFixturePath,type MultiprojectFixture} from './multiproject-global-setup';

test('cloud accounts use the accepted workspace, with scoped roles and unavailable local filesystem actions',async({page,browser,baseURL})=>{
 test.setTimeout(120000);
 const fixture:MultiprojectFixture=JSON.parse(await readFile(multiprojectFixturePath,'utf8'));
 const {project,contributor,viewer}=fixture.hosted,base='/api/projects/'+project.id;
 const contributorContext=await browser.newContext({baseURL}),viewerContext=await browser.newContext({baseURL});
 try{
  await page.goto('/projects');
  // The same entry supports local installations; account login is through the
  // existing verified email/password API, with the real cookie used by the UI.
  const login=await page.request.post('/api/auth/login',{data:fixture.owner});expect(login.ok(),await login.text()).toBe(true);
  await page.goto('/projects');
  await expect(page.getByRole('heading',{name:'Проекты',exact:true})).toBeVisible();
  await expect(page.getByLabel('Папка проекта',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Выбрать папку',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:new RegExp(project.name)}).click();
  await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Дорожная карта проекта',exact:true})).toBeVisible();
  await expect(page.getByText('Облачный проект · локальные папки не подключены',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Назначить первую работу',exact:true})).toBeVisible();
  const empty=await page.request.get(base);expect((await empty.json()).state.events).toEqual([]);
  await page.getByRole('button',{name:'Агенты',exact:false}).first().click();
  await page.getByRole('button',{name:'Подключить агента',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Зарегистрировать агента',exact:true}).click();
  await expect(dialog.getByRole('region',{name:'Новое подключение агента',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Ключ сохранён — скрыть',exact:true}).click();
  await dialog.getByRole('button',{name:'Закрыть окно',exact:true}).click();

  const memberPage=await contributorContext.newPage();
  expect((await memberPage.request.post('/api/auth/login',{data:contributor})).ok()).toBe(true);
  await memberPage.goto('/projects/'+project.id);
  await memberPage.getByRole('button',{name:'Назначить работу',exact:true}).click();
  const task=memberPage.getByRole('dialog');
  await task.getByLabel('Задача для агента',{exact:true}).fill('Cloud workspace preserves human control');
  await task.getByLabel('Критерии готовности',{exact:true}).fill('Assigned work stays queued until the agent acknowledges.');
  await task.getByRole('button',{name:'Назначить работу',exact:true}).click();
  await expect(task).not.toBeVisible();
  const snapshot=await memberPage.request.get(base),body=await snapshot.json();expect(snapshot.ok()).toBe(true);expect(body.state.executions[0].state).toBe('queued');
  expect(body.state.events.every((event:{actor:{name:string}})=>event.actor.name==='Hosted Contributor')).toBe(true);
  expect((await memberPage.request.post(base+'/agents',{data:{name:'Contributor cannot register'}})).status()).toBe(403);
  expect((await memberPage.request.get('/api/projects/'+fixture.second.id)).status()).toBe(401);
  expect((await memberPage.request.post(base+'/verification/run',{data:{}})).status()).toBe(403);
  expect((await memberPage.request.post(base+'/verification/observe',{data:{}})).status()).toBe(403);
  expect((await memberPage.request.get('/api/workspace/folders')).status()).toBe(403);

  const viewerPage=await viewerContext.newPage();expect((await viewerPage.request.post('/api/auth/login',{data:viewer})).ok()).toBe(true);
  await viewerPage.goto('/projects/'+project.id);
  await expect(viewerPage.getByText('Роль Viewer: проект доступен только для чтения.',{exact:true})).toBeVisible();
  await expect(viewerPage.getByRole('button',{name:'Назначить работу',exact:true})).toBeDisabled();
  await viewerPage.getByRole('button',{name:'Агенты',exact:false}).first().click();
  await expect(viewerPage.getByRole('button',{name:'Подключить агента',exact:true})).toBeDisabled();
  await expect(viewerPage.getByRole('button',{name:'Отозвать ключ',exact:true})).toHaveCount(0);
  const before=(await (await page.request.get(base)).json()).cursor;
  expect((await viewerPage.request.post(base+'/commands',{data:{type:'createSpec',requestId:crypto.randomUUID(),expectedVersion:before,content:{title:'Forbidden',goal:'Denied',dod:[],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}}})).status()).toBe(403);
  await page.getByRole('link',{name:'Участники и приглашения',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Участники',exact:true})).toBeVisible();
  const members=await page.request.get(base+'/members'),member=(await members.json()).members.find((item:{email:string})=>item.email===viewer.email);
  expect((await page.request.delete(base+'/members/'+member.id,{data:{}})).ok()).toBe(true);
  expect((await viewerPage.request.get(base)).status()).toBe(401);
  expect((await viewerPage.request.get(base+'/stream')).status()).toBe(401);
  expect((await (await page.request.get(base)).json()).cursor).toBe(before);
 }finally{await contributorContext.close();await viewerContext.close()}
});
