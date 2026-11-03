import {test,expect,type Page} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {selectPopup} from './select-helpers';

async function createProject(page:Page,rootPath:string){
  await page.request.get('/api/session');
  const response=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),rootPath,name:`Поиск в списке ${crypto.randomUUID().slice(0,8)}`}});
  expect(response.ok()).toBe(true);return(await response.json()).project as {id:string;name:string};
}

test('SS01 large async agent choices search by label, retain required string selection and drafts, and contain Escape in the native dialog',async({page})=>{
  test.setTimeout(90000);
  const rootPath=await mkdtemp(join(tmpdir(),'ouro-select-search-')),agents:string[]=[];let projectId:string|undefined;
  try{
    const project=await createProject(page,rootPath);projectId=project.id;
    await page.goto(`/projects/${project.id}`);await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();
    const opener=page.getByRole('button',{name:'Назначить работу',exact:true});await opener.click();
    const dialog=page.getByRole('dialog',{name:'Назначить работу агенту',exact:true}),agent=dialog.getByRole('combobox',{name:'Исполнитель задачи',exact:true});
    const goal=dialog.getByRole('textbox',{name:'Задача для агента',exact:true}),title=dialog.getByRole('textbox',{name:'Название задачи',exact:true}),dod=dialog.getByRole('textbox',{name:'Критерии готовности',exact:true});
    await goal.fill('Выбрать исполнителя из длинного списка без отправки задачи.');await title.fill('Сохранённый черновик поиска');await dod.fill('Значение и текст остаются после закрытия.');
    expect(await dialog.locator('form').evaluate(form=>(form as HTMLFormElement).checkValidity())).toBe(false);
    let popup=await selectPopup(agent);
    const emptyPopup=popup.locator('xpath=ancestor-or-self::*[contains(@class,"ouro-select-popup")][1]');
    await expect(emptyPopup.getByRole('status')).toHaveText('Нет вариантов для выбора.');
    await expect(emptyPopup.getByRole('combobox')).toHaveCount(0);
    // Crossing the threshold while the popup is open preserves the form and moves focus into search.
    for(let index=0;index<12;index++){
      const name=index===11?'Маяк исполнитель для поиска':`Агент ${String(index+1).padStart(2,'0')}`;
      const response=await page.request.post(`/api/projects/${project.id}/agents`,{data:{name}});expect(response.ok()).toBe(true);agents.push((await response.json()).agent.id);
    }
    await expect(agent).toHaveAttribute('data-searchable','',{timeout:20000});
    await expect(agent).toHaveAttribute('aria-expanded','true');
    await expect.poll(async()=>agents.includes((await agent.getAttribute('data-value'))??'')).toBe(true);
    await expect(title).toHaveValue('Сохранённый черновик поиска');
    expect(await dialog.locator('form').evaluate(form=>(form as HTMLFormElement).checkValidity())).toBe(true);
    popup=await selectPopup(agent);
    expect(await popup.evaluate(node=>!!node.closest('dialog[open]'))).toBe(true);
    const search=popup.getByRole('combobox',{name:'Поиск вариантов: Исполнитель задачи',exact:true});
    await expect(search).toBeFocused();await search.fill('маЯК');
    await expect(popup.getByRole('option')).toHaveCount(1);
    await expect(popup.getByRole('option')).toContainText('Маяк исполнитель для поиска');
    await page.keyboard.press('Enter');await expect(agent).toHaveAttribute('data-value',agents[11]);await expect(agent).toBeFocused();
    popup=await selectPopup(agent);const reopenedSearch=popup.getByRole('combobox',{name:'Поиск вариантов: Исполнитель задачи',exact:true});
    await expect(reopenedSearch).toHaveValue('');await expect(popup.getByRole('option')).toHaveCount(13);
    await reopenedSearch.fill('Такого подключения нет');
    await expect(popup.getByRole('option')).toHaveCount(0);await expect(popup.getByRole('status')).toHaveText('По запросу ничего не найдено.');
    await expect(agent).toHaveAttribute('data-value',agents[11]);
    await popup.getByRole('button',{name:'Очистить поиск',exact:true}).click();
    await expect(reopenedSearch).toHaveValue('');await expect(reopenedSearch).toBeFocused();await expect(popup.getByRole('option')).toHaveCount(13);
    await expect(agent).toHaveAttribute('data-value',agents[11]);
    await reopenedSearch.fill('Незавершённый запрос');await page.keyboard.press('Escape');
    await expect(agent).toHaveAttribute('aria-expanded','false');await expect(dialog).toBeVisible();await expect(agent).toBeFocused();
    popup=await selectPopup(agent);await expect(popup.getByRole('combobox',{name:'Поиск вариантов: Исполнитель задачи',exact:true})).toHaveValue('');
    await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();
    await opener.click();await expect(agent).toHaveAttribute('data-value',agents[11]);await expect(title).toHaveValue('Сохранённый черновик поиска');await expect(goal).toHaveValue('Выбрать исполнителя из длинного списка без отправки задачи.');await expect(dod).toHaveValue('Значение и текст остаются после закрытия.');
    const snapshot=await(await page.request.get(`/api/projects/${project.id}`)).json();expect(snapshot.state.specs).toHaveLength(0);expect(snapshot.state.executions).toHaveLength(0);
  }finally{
    if(projectId)for(const id of agents)await page.request.post(`/api/projects/${projectId}/agents/${id}/revoke`,{data:{},timeout:3000}).catch(()=>{});
    if(dirname(resolve(rootPath))!==resolve(tmpdir())||!basename(rootPath).startsWith('ouro-select-search-'))throw new Error('Unexpected temporary fixture path');
    await rm(rootPath,{recursive:true,force:true});
  }
});
