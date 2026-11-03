import {test,expect,type Page} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {chooseSelectOption,selectPopup} from './select-helpers';

test('BS01 legacy filters use the visible Base UI listbox with keyboard selection, Escape and an empty all-states value',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  const before=await(await page.request.get('/api/project')).json();
  const status=page.getByRole('combobox',{name:'Фильтр по статусу',exact:true});
  await expect(status).toHaveAttribute('data-value','');
  expect(await status.evaluate(node=>node.tagName)).toBe('BUTTON');
  await expect(page.locator('select:visible')).toHaveCount(0);
  await status.focus();await page.keyboard.press('ArrowDown');
  const popup=await selectPopup(status);await expect(popup.getByRole('option',{name:'Все статусы',exact:true})).toBeVisible();
  await page.keyboard.press('End');await page.keyboard.press('Enter');
  await expect(status).toHaveAttribute('data-value','invalidated');
  await expect(status).toHaveAttribute('aria-expanded','false');
  await expect(status).toBeFocused();
  await chooseSelectOption(status,'');await expect(status).toHaveText('Все статусы');
  await selectPopup(status);await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');
  await expect(status).toHaveAttribute('data-value','');await expect(status).toHaveAttribute('aria-expanded','false');await expect(status).toBeFocused();
  const after=await(await page.request.get('/api/project')).json();expect(after.state.version).toBe(before.state.version);
});

async function folderProject(page:Page,rootPath:string){
  await page.request.get('/api/session');
  const response=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),rootPath,name:`Base UI ${crypto.randomUUID().slice(0,8)}`}});
  expect(response.ok()).toBe(true);return(await response.json()).project as {id:string;name:string};
}

test('BS02 a required select and its popup work inside the native task dialog, retain a draft and follow updated agent options',async({page})=>{
  test.setTimeout(90000);
  const rootPath=await mkdtemp(join(tmpdir(),'ouro-base-select-')),registered:string[]=[];let projectId:string|undefined;
  try{
    const project=await folderProject(page,rootPath);projectId=project.id;
    await page.goto(`/projects/${project.id}`);await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();
    const opener=page.getByRole('button',{name:'Назначить работу',exact:true});await opener.click();
    const dialog=page.getByRole('dialog',{name:'Назначить работу агенту',exact:true}),agent=dialog.getByRole('combobox',{name:'Исполнитель задачи',exact:true});
    const goal=dialog.getByRole('textbox',{name:'Задача для агента',exact:true}),title=dialog.getByRole('textbox',{name:'Название задачи',exact:true}),dod=dialog.getByRole('textbox',{name:'Критерии готовности',exact:true});
    await goal.fill('Сохранить черновик при работе со списком и обновлении подключений.');await title.fill('Неотправленная задача');await dod.fill('Выбор доступен с клавиатуры.');
    await expect(agent).toHaveAttribute('data-value','');await expect(dialog.getByRole('button',{name:'Назначить работу',exact:true})).toBeDisabled();
    expect(await dialog.locator('form').evaluate(form=>(form as HTMLFormElement).checkValidity())).toBe(false);
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();
    for(const name of ['Alpha Agent','Beta Agent','Gamma Agent']){
      const response=await page.request.post(`/api/projects/${project.id}/agents`,{data:{name}});expect(response.ok()).toBe(true);registered.push((await response.json()).agent.id);
    }
    await opener.click();await expect(dialog).toBeVisible();
    await expect.poll(async()=>registered.includes((await agent.getAttribute('data-value'))??''),{timeout:20000}).toBe(true);
    await expect(goal).toHaveValue('Сохранить черновик при работе со списком и обновлении подключений.');
    const popup=await selectPopup(agent);
    expect(await popup.evaluate(node=>!!node.closest('dialog[open]'))).toBe(true);
    await expect(popup.getByRole('option').filter({hasText:'Gamma Agent'})).toBeVisible();
    await page.keyboard.press('g');
    await expect(popup.getByRole('option').filter({hasText:'Gamma Agent'})).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(agent).toHaveAttribute('data-value',registered[2]);await expect(agent).toBeFocused();
    expect(await dialog.locator('form').evaluate(form=>(form as HTMLFormElement).checkValidity())).toBe(true);
    await selectPopup(agent);await page.keyboard.press('Escape');
    await expect(agent).toHaveAttribute('aria-expanded','false');await expect(dialog).toBeVisible();await expect(agent).toBeFocused();
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();
    await opener.click();await expect(agent).toHaveAttribute('data-value',registered[2]);await expect(title).toHaveValue('Неотправленная задача');await expect(dod).toHaveValue('Выбор доступен с клавиатуры.');
    const snapshot=await(await page.request.get(`/api/projects/${project.id}`)).json();expect(snapshot.state.specs).toHaveLength(0);expect(snapshot.state.executions).toHaveLength(0);
  }finally{
    if(projectId)for(const id of registered)await page.request.post(`/api/projects/${projectId}/agents/${id}/revoke`,{data:{},timeout:3000}).catch(()=>{});
    if(dirname(resolve(rootPath))!==resolve(tmpdir())||!basename(rootPath).startsWith('ouro-base-select-'))throw new Error('Unexpected temporary fixture path');
    await rm(rootPath,{recursive:true,force:true});
  }
});
