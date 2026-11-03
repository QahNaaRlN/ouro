import {test,expect,type Page} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

async function project(page:Page,rootPath:string){
  await page.request.get('/api/session');
  const response=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),rootPath,name:`Проверка диалогов ${crypto.randomUUID().slice(0,8)}`}});
  expect(response.ok()).toBe(true);return(await response.json()).project as {id:string;name:string};
}

test('shared native dialog contains focus, restores its trigger on Escape and preserves an unsent autosized task draft',async({page})=>{
  test.setTimeout(90000);
  const rootPath=await mkdtemp(join(tmpdir(),'ouro-controls-'));let projectId:string|undefined,agentId:string|undefined;
  try{
    const created=await project(page,rootPath);projectId=created.id;
    const registration=await page.request.post(`/api/projects/${projectId}/agents`,{data:{name:'Агент для проверки формы'}});expect(registration.ok()).toBe(true);agentId=(await registration.json()).agent.id;
    await page.goto(`/projects/${projectId}`);await expect(page.getByRole('heading',{name:created.name,exact:true})).toBeVisible();
    const trigger=page.getByRole('button',{name:'Назначить работу',exact:true});await trigger.click();
    const dialog=page.getByRole('dialog',{name:'Назначить работу агенту',exact:true});await expect(dialog).toBeVisible();
    const goal=dialog.getByRole('textbox',{name:'Задача для агента',exact:true}),title=dialog.getByRole('textbox',{name:'Название задачи',exact:true}),dod=dialog.getByRole('textbox',{name:'Критерии готовности',exact:true});
    const initialHeight=await goal.evaluate(node=>node.clientHeight);
    const draft=Array.from({length:24},(_,i)=>`Строка ${i+1}: сохранить введённое ожидание без назначения.`).join('\n');
    await goal.fill(draft);await title.fill('Неотправленный черновик');await dod.fill('Первый проверяемый критерий\nВторой критерий');
    await expect.poll(()=>goal.evaluate(node=>node.clientHeight)).toBeGreaterThan(initialHeight);
    const geometry=await goal.evaluate(node=>({client:node.clientHeight,scroll:node.scrollHeight,resize:getComputedStyle(node).resize}));
    expect(geometry.client).toBeGreaterThanOrEqual(geometry.scroll-1);expect(geometry.resize).toBe('none');
    for(let i=0;i<9;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('dialog[open]'))).toBe(true);}
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
    await trigger.click();await expect(dialog).toBeVisible();await expect(goal).toHaveValue(draft);await expect(title).toHaveValue('Неотправленный черновик');await expect(dod).toHaveValue('Первый проверяемый критерий\nВторой критерий');
    const snapshot=await(await page.request.get(`/api/projects/${projectId}`)).json();expect(snapshot.state.executions).toHaveLength(0);expect(snapshot.state.specs).toHaveLength(0);
  }finally{
    if(projectId&&agentId)await page.request.post(`/api/projects/${projectId}/agents/${agentId}/revoke`,{data:{},timeout:3000}).catch(()=>{});
    await rm(rootPath,{recursive:true,force:true});
  }
});

test('metadata copying reports a denied clipboard and keeps the complete value available',async({page})=>{
  test.setTimeout(90000);
  const rootPath=await mkdtemp(join(tmpdir(),'ouro-copy-controls-'));let projectId:string|undefined,agentId:string|undefined;
  try{
    const created=await project(page,rootPath);projectId=created.id;
    await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Clipboard denied for regression test');}}});});
    await page.goto(`/projects/${created.id}`);await expect(page.getByRole('heading',{name:created.name,exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Сведения о проекте',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Сведения о проекте',exact:true});await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:'Копировать ID проекта',exact:true}).click();
    await expect(dialog.getByText('Не удалось скопировать. Выделите текст вручную.',{exact:true})).toBeVisible();
    await expect(dialog.getByText(created.id,{exact:true})).toBeVisible();await expect(dialog.getByRole('status').filter({hasText:'Скопировано'})).toHaveCount(0);
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
    const registration=await page.request.post(`/api/projects/${created.id}/agents`,{data:{name:'Агент для проверки полного ID'}});expect(registration.ok()).toBe(true);agentId=(await registration.json()).agent.id;
    const before=await(await page.request.get(`/api/projects/${created.id}`)).json();
    const assigned=await page.request.post(`/api/projects/${created.id}/tasks`,{data:{requestId:crypto.randomUUID(),expectedVersion:before.cursor,agentId,content:{title:'Полный идентификатор спеки',goal:'Проверить полный ID после отказа буфера обмена.',dod:[{id:'full-id',text:'Полный ID доступен вручную.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}}});
    expect(assigned.ok()).toBe(true);const spec=(await assigned.json()).state.specs.at(-1) as {id:string;humanId:string};
    await page.goto(`/projects/${created.id}?view=spec&spec=${encodeURIComponent(spec.id)}`);
    const selected=page.getByRole('region',{name:'Выбранная задача',exact:true});await expect(selected.getByRole('heading',{name:'Полный идентификатор спеки',exact:true})).toBeVisible();
    const copySpec=selected.getByRole('button',{name:'Копировать ID спеки',exact:true});await expect(selected.locator('code').filter({hasText:spec.humanId})).toBeVisible();await copySpec.click();
    await expect(selected.getByText(spec.id,{exact:true})).toBeVisible();
    const description=await copySpec.evaluate(node=>(node.getAttribute('aria-describedby')??'').split(/\s+/).map(id=>document.getElementById(id)?.textContent??'').join(' '));expect(description).toContain(spec.id);
  }finally{
    if(projectId&&agentId)await page.request.post(`/api/projects/${projectId}/agents/${agentId}/revoke`,{data:{},timeout:3000}).catch(()=>{});
    await rm(rootPath,{recursive:true,force:true});
  }
});
