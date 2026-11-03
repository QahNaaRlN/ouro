import {test,expect,type Locator} from '@playwright/test';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {selectPopup} from './select-helpers';

/** Снимок наблюдаемой геометрии и оформления примитива для сопоставления до и после переноса. */
async function presentation(locator:Locator){
  return locator.evaluate(node=>{
    const style=getComputedStyle(node),bounds=node.getBoundingClientRect();
    return {width:bounds.width,height:bounds.height,display:style.display,padding:style.padding,border:style.border,borderRadius:style.borderRadius,background:style.backgroundColor,color:style.color,font:style.font,boxShadow:style.boxShadow};
  });
}

test('TW primitives retain rendered theme, mobile geometry, popup keyboard scope and mounted draft',async({page},testInfo)=>{
  test.setTimeout(120000);
  const rootPath=await mkdtemp(join(tmpdir(),'ouro-tailwind-primitives-'));
  const artifactDir=process.env.OURO_TAILWIND_VISUAL_DIR?resolve(process.env.OURO_TAILWIND_VISUAL_DIR):testInfo.outputPath('visual');
  const agents:string[]=[];
  let projectId:string|undefined;
  const metrics:Record<string,Awaited<ReturnType<typeof presentation>>>={};
  try{
    await mkdir(artifactDir,{recursive:true});
    await page.request.get('/api/session');
    const created=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),rootPath,name:'Проверка Tailwind-примитивов'}});
    expect(created.ok()).toBe(true);
    projectId=((await created.json()).project as {id:string}).id;
    for(let index=1;index<=12;index++){
      const registration=await page.request.post(`/api/projects/${projectId}/agents`,{data:{name:`Исполнитель ${String(index).padStart(2,'0')}`}});
      expect(registration.ok()).toBe(true);
      agents.push(((await registration.json()).agent as {id:string}).id);
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(`/projects/${projectId}`);
    const trigger=page.getByRole('button',{name:'Назначить работу',exact:true});
    await expect(trigger).toBeVisible();
    for(const theme of ['dark','light'] as const){
      for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
        await page.setViewportSize(viewport);
        await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
        await page.evaluate(()=>document.fonts.ready);
        const name=`${theme}-${viewport.width}`;
        await page.getByRole('navigation',{name:'Навигация проектов',exact:true}).screenshot({path:join(artifactDir,`${name}-navigation.png`),animations:'disabled'});
        await trigger.click();
        const dialog=page.getByRole('dialog',{name:'Назначить работу агенту',exact:true});
        const agent=dialog.getByRole('combobox',{name:'Исполнитель задачи',exact:true});
        const title=dialog.getByRole('textbox',{name:'Название задачи',exact:true});
        const goal=dialog.getByRole('textbox',{name:'Задача для агента',exact:true});
        await expect(dialog).toBeVisible();
        await expect(agent).toHaveAttribute('data-searchable','');
        await goal.fill('Проверить внешний вид и сохранить неотправленное ожидание.');
        await title.fill('Неотправленная задача Tailwind');
        const titleElement=await title.elementHandle();
        metrics[`${name}-dialog`]=await presentation(dialog);
        metrics[`${name}-trigger`]=await presentation(agent);
        expect(metrics[`${name}-dialog`].padding).toBe('0px');
        expect(metrics[`${name}-dialog`].borderRadius).toBe('12px');
        expect(metrics[`${name}-trigger`].borderRadius).toBe('6px');
        expect(metrics[`${name}-trigger`].font).toContain('Inter');
        const dialogBounds=(await dialog.boundingBox())!;
        expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
        expect(dialogBounds.x+dialogBounds.width).toBeLessThanOrEqual(viewport.width+1);
        await dialog.screenshot({path:join(artifactDir,`${name}-dialog.png`),animations:'disabled'});
        const popup=await selectPopup(agent);
        expect(await popup.evaluate(node=>!!node.closest('dialog[open]'))).toBe(true);
        const search=popup.getByRole('combobox',{name:'Поиск вариантов: Исполнитель задачи',exact:true});
        await expect(search).toBeFocused();
        await search.fill('Исполнитель 12');
        await expect(popup.getByRole('option')).toHaveCount(1);
        metrics[`${name}-popup`]=await presentation(popup);
        await popup.screenshot({path:join(artifactDir,`${name}-popup.png`),animations:'disabled'});
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();
        await expect(agent).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(trigger).toBeFocused();
        expect(await titleElement!.evaluate(node=>node.isConnected)).toBe(true);
        await trigger.click();
        await expect(title).toHaveValue('Неотправленная задача Tailwind');
        await expect(goal).toHaveValue('Проверить внешний вид и сохранить неотправленное ожидание.');
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      }
    }
    const snapshot=await(await page.request.get(`/api/projects/${projectId}`)).json();
    expect(snapshot.state.specs).toHaveLength(0);
    expect(snapshot.state.executions).toHaveLength(0);
    await writeFile(join(artifactDir,'presentation.json'),JSON.stringify(metrics,null,2));
  }finally{
    if(projectId)for(const id of agents)await page.request.post(`/api/projects/${projectId}/agents/${id}/revoke`,{data:{},timeout:3000}).catch(()=>{});
    if(dirname(resolve(rootPath))!==resolve(tmpdir())||!basename(rootPath).startsWith('ouro-tailwind-primitives-'))throw new Error('Unexpected temporary fixture path');
    await rm(rootPath,{recursive:true,force:true});
  }
});

test('TW consumer className overrides primitive spacing and remains keyboard accessible',async({page},testInfo)=>{
  await page.goto('/');
  const status=page.getByRole('combobox',{name:'Фильтр по статусу',exact:true});
  await expect(status).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const theme of ['dark','light'] as const){
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});
      await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
      const style=await status.evaluate(node=>{
        const css=getComputedStyle(node);
        return {padding:css.padding,fontSize:css.fontSize,height:css.height};
      });
      expect(style).toEqual({padding:'4px 5px',fontSize:'12px',height:'34px'});
      await status.focus();
      await page.keyboard.press('ArrowDown');
      const popup=await selectPopup(status);
      await expect(popup.getByRole('option',{name:'Все статусы',exact:true})).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(status).toBeFocused();
      await expect(status).toHaveAttribute('data-value','');
      await page.screenshot({path:testInfo.outputPath(`${theme}-${width}-first-screen.png`),animations:'disabled'});
    }
  }
});
