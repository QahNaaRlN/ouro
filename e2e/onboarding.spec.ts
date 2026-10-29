import {test,expect,type Page} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const invitation=(page:Page)=>page.getByRole('region',{name:'Знакомство с Ouro',exact:true});
const tour=(page:Page)=>page.getByRole('dialog');
const launch=(page:Page)=>page.getByRole('button',{name:'Обучение',exact:true});
const catalogTitles=['Выберите папку проекта','Возвращайтесь к своим проектам','Подключите MCP-клиент'];
const projectTitles=['Подключите агента','Опишите задачу и готовность','Следите за дорожной картой','Решайте вопросы и развилки','Проверяйте факты в живой ленте'];
const scope=(id:string)=>`/api/projects/${encodeURIComponent(id)}`;

async function createProject(page:Page,rootPath:string){
  await page.request.get('/api/session');
  const response=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),name:`Обучение ${crypto.randomUUID().slice(0,8)}`,rootPath}});
  expect(response.ok(),await response.text()).toBe(true);
  return (await response.json()).project as {id:string;name:string};
}
async function snapshot(page:Page,id:string){const response=await page.request.get(scope(id));expect(response.ok()).toBe(true);return response.json();}
async function finishSteps(page:Page,titles:string[]){
  for(let index=0;index<titles.length;index++){
    await expect(tour(page).getByRole('heading',{name:titles[index],exact:true})).toBeVisible();
    await expect(tour(page).locator('[data-onboarding-highlight]')).toBeVisible();
    await expect(tour(page)).toContainText(`Шаг ${index+1} из ${titles.length}`);
    await tour(page).getByRole('button',{name:index===titles.length-1?'Завершить':'Далее',exact:true}).click();
  }
  await expect(tour(page)).toHaveCount(0);
}
async function expectInsideViewport(page:Page){
  const viewport=page.viewportSize()!,card=await tour(page).locator('[data-onboarding-card]').boundingBox(),highlight=await tour(page).locator('[data-onboarding-highlight]').boundingBox();
  expect(card).toBeTruthy();expect(highlight).toBeTruthy();
  for(const bounds of [card!,highlight!]){expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width+1);expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height+1);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
}

test('ON01 catalog invitation is opt-in, dismissal persists, and a completed tour can restart',async({page})=>{
  await page.goto('/projects');await expect(launch(page)).toBeVisible();await expect(invitation(page)).toBeVisible();await expect(tour(page)).toHaveCount(0);
  await page.getByLabel('Название проекта',{exact:true}).fill('Форма доступна без обучения');
  await invitation(page).getByRole('button',{name:'Не сейчас',exact:true}).click();await expect(invitation(page)).toHaveCount(0);
  await page.reload();await expect(launch(page)).toBeVisible();await expect(invitation(page)).toHaveCount(0);await expect(tour(page)).toHaveCount(0);
  await launch(page).click();await finishSteps(page,catalogTitles);await expect(launch(page)).toBeFocused();
  await page.reload();await expect(invitation(page)).toHaveCount(0);await launch(page).click();await expect(tour(page).getByRole('heading',{name:catalogTitles[0],exact:true})).toBeVisible();
  await tour(page).getByRole('button',{name:'Закрыть обучение',exact:true}).click();await expect(launch(page)).toBeFocused();
});

test('ON02 modal tour traps keyboard focus, keeps background inert, supports back and restores focus on Escape',async({page})=>{
  await page.goto('/projects');await launch(page).click();await expect(tour(page)).toBeVisible();
  await expect(tour(page).getByRole('button',{name:'Назад',exact:true})).toBeDisabled();
  await tour(page).getByRole('button',{name:'Далее',exact:true}).click();await expect(tour(page).getByRole('heading',{name:catalogTitles[1],exact:true})).toBeVisible();
  await tour(page).getByRole('button',{name:'Назад',exact:true}).click();await expect(tour(page).getByRole('heading',{name:catalogTitles[0],exact:true})).toBeVisible();
  await page.getByLabel('Название проекта',{exact:true}).evaluate(element=>(element as HTMLInputElement).focus());
  expect(await tour(page).evaluate(element=>element.contains(document.activeElement))).toBe(true);
  for(let index=0;index<12;index++){await page.keyboard.press(index%2?'Shift+Tab':'Tab');expect(await tour(page).evaluate(element=>element.contains(document.activeElement))).toBe(true);}
  await page.keyboard.press('Escape');await expect(tour(page)).toHaveCount(0);await expect(launch(page)).toBeFocused();
  await page.getByLabel('Название проекта',{exact:true}).fill('После выхода форма доступна');
});

test('ON03 empty-project tour teaches real controls without registering an agent, creating tasks or changing history',async({page})=>{
  const folder=await mkdtemp(join(tmpdir(),'ouro-onboarding-empty-'));
  try{
    const project=await createProject(page,folder);await page.goto(`/projects/${project.id}`);await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();
    const before=await snapshot(page,project.id),writes:string[]=[];page.on('request',request=>{if(['POST','PATCH','DELETE','PUT'].includes(request.method()))writes.push(request.url());});
    await expect(invitation(page)).toBeVisible();await expect(tour(page)).toHaveCount(0);await launch(page).click();await finishSteps(page,projectTitles);
    const after=await snapshot(page,project.id);expect(after.cursor).toBe(before.cursor);expect(after.state).toEqual(before.state);expect(after.agents).toEqual(before.agents);expect(writes).toEqual([]);
    await page.reload();await expect(invitation(page)).toHaveCount(0);
  }finally{await rm(folder,{recursive:true,force:true});}
});

test('ON04 populated-project tour explains the actual selected Flow and restores a closed setup disclosure',async({page})=>{
  const folder=await mkdtemp(join(tmpdir(),'ouro-onboarding-flow-'));let projectId='',agentId='';
  try{
    const project=await createProject(page,folder);projectId=project.id;
    const registered=await page.request.post(`${scope(project.id)}/agents`,{data:{name:'Onboarding acceptance'}});expect(registered.ok()).toBe(true);agentId=(await registered.json()).agent.id;
    const current=await snapshot(page,project.id),content={title:'Настоящая выбранная спека',goal:'Проверить подсказку о Flow без поддельной схемы.',dod:[{id:'criterion-1',text:'Человек проверил подсказку.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
    const created=await page.request.post(`${scope(project.id)}/tasks`,{data:{requestId:crypto.randomUUID(),expectedVersion:current.cursor,agentId,content}});expect(created.ok(),await created.text()).toBe(true);
    await page.goto(`/projects/${project.id}`);await expect(page.getByRole('region',{name:'Текущий процесс',exact:true})).toBeVisible();
    const setup=page.locator('details.ws-setup');await expect(setup).not.toHaveAttribute('open','');const before=await snapshot(page,project.id),writes:string[]=[];page.on('request',request=>{if(request.method()==='POST')writes.push(request.url());});
    const titles=[...projectTitles.slice(0,3),'Откройте процесс выбранной спеки',...projectTitles.slice(3)];await launch(page).click();await expect(setup).toHaveAttribute('open','');await finishSteps(page,titles);
    await expect(setup).not.toHaveAttribute('open','');expect((await snapshot(page,project.id)).state).toEqual(before.state);expect(writes).toEqual([]);
  }finally{if(projectId&&agentId)await page.request.post(`${scope(projectId)}/agents/${agentId}/revoke`,{data:{}});await rm(folder,{recursive:true,force:true});}
});

test('ON05 spotlight and tooltip stay inside a narrow viewport while scrolling and resizing with reduced motion',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/projects');await launch(page).click();await expectInsideViewport(page);
  await tour(page).getByRole('button',{name:'Далее',exact:true}).click();await expect(tour(page).getByRole('heading',{name:catalogTitles[1],exact:true})).toBeVisible();await expectInsideViewport(page);
  await page.setViewportSize({width:360,height:640});await expect.poll(async()=>{const b=await tour(page).locator('[data-onboarding-card]').boundingBox();return !!b&&b.x+b.width<=360&&b.y+b.height<=640;}).toBe(true);await expectInsideViewport(page);
  await page.setViewportSize({width:1280,height:900});await expectInsideViewport(page);await tour(page).getByRole('button',{name:'Пропустить обучение',exact:true}).click();await expect(tour(page)).toHaveCount(0);
});

test('ON06 blocked browser storage does not stop the tour or project form',async({page})=>{
  await page.addInitScript(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(key:string){if(key.startsWith('ouro:onboarding:'))throw new DOMException('Blocked','SecurityError');return get.call(this,key);};Storage.prototype.setItem=function(key:string,value:string){if(key.startsWith('ouro:onboarding:'))throw new DOMException('Blocked','SecurityError');return set.call(this,key,value);};});
  await page.goto('/projects');await expect(invitation(page)).toBeVisible();await launch(page).click();await tour(page).getByRole('button',{name:'Пропустить обучение',exact:true}).click();await expect(tour(page)).toHaveCount(0);await expect(invitation(page)).toHaveCount(0);
  await launch(page).click();await finishSteps(page,catalogTitles);await page.getByLabel('Название проекта',{exact:true}).fill('Хранилище браузера не обязательно');
});

test('ON07 a missing active target leaves a readable explanation and an accessible exit',async({page})=>{
  await page.goto('/projects');await launch(page).click();await expect(tour(page).getByRole('heading',{name:catalogTitles[0],exact:true})).toBeVisible();
  await page.getByLabel('Папка проекта',{exact:true}).evaluate(element=>element.remove());
  await expect(tour(page)).toContainText('Элемент сейчас недоступен');await expect(tour(page).getByRole('button',{name:'Пропустить обучение',exact:true})).toBeEnabled();
  await page.keyboard.press('Escape');await expect(tour(page)).toHaveCount(0);await expect(launch(page)).toBeFocused();await page.getByLabel('Название проекта',{exact:true}).fill('Выход сохранился');
});

test('ON08 malformed tour preferences are ignored and never hide the functional restart button',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('ouro:onboarding:catalog:v1','{broken'));
  await page.goto('/projects');await expect(invitation(page)).toBeVisible();await expect(launch(page)).toBeVisible();await launch(page).click();await finishSteps(page,catalogTitles);
});
