import {test,expect,type Browser,type Page,type Locator} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {proposalsCollaborationFixture,type ProposalsCollaborationFixture} from './proposals-collaboration-fixture';
import {chooseSelectOption} from './select-helpers';
import type {ProjectState} from '../packages/core/src';

/** Читает actual slots, native controls и собственные graph labels для сопоставления оформления. */
async function presentation(target:Locator){
 return target.evaluate(root=>[root,...root.querySelectorAll('h1,h2,h3,p,button,input,textarea,label,fieldset,legend,section,article,code,pre,table,th,td,small,strong,[class*="proposal-"],[class*="collab-"],.react-flow__node,.react-flow__edge-path,.react-flow__edge-text,.react-flow__edge-textbg')].filter(node=>node.getClientRects().length).map(node=>{
  const box=node.getBoundingClientRect(),css=getComputedStyle(node);
  return {tag:node.tagName,text:(node.textContent??'').trim().slice(0,90),width:box.width,height:box.height,padding:css.padding,margin:css.margin,gap:css.gap,border:css.border,borderRadius:css.borderRadius,color:css.color,background:css.backgroundColor,font:css.font,display:css.display,whiteSpace:css.whiteSpace,outline:css.outline,outlineOffset:css.outlineOffset,fill:css.fill,stroke:css.stroke};
 }));
}

async function navigate(page:Page,name:string){
 const menu=page.getByRole('button',{name:'Открыть меню',exact:true});
 if(await menu.isVisible()&&!await page.locator('.sidebar').evaluate(element=>element.classList.contains('mobile-open')))await menu.click();
 await page.getByRole('navigation',{name:'Основная навигация',exact:true}).getByRole('button',{name,exact:true}).click();
}

/** Для каждого несохранённого scene создаёт отдельную вкладку; закрытие не отправляет её локальные updates. */
async function openScene(browser:Browser,baseURL:string,fixture:ProposalsCollaborationFixture,theme:'light'|'dark',width:number,empty=false){
 const context=await browser.newContext({baseURL,viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'});
 await context.addCookies([{name:'ouro_project',value:empty?fixture.emptyProjectId:fixture.projectId,url:baseURL}]);
 const page=await context.newPage();await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:theme==='light'?'Включить светлую тему':'Включить тёмную тему',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme',theme);return {page,close:()=>context.close()};
}

test('PCV01 proposals and collaborative drafts retain frozen real-profile presentation, inputs and focus',async({page,browser,baseURL},testInfo)=>{
 test.setTimeout(360000);expect(baseURL).toBeTruthy();
 const fixture=await proposalsCollaborationFixture(page,baseURL!),output=resolve(process.env.OURO_PROPOSALS_VISUAL_DIR??testInfo.outputPath('visual'));
 await mkdir(output,{recursive:true});const measured:Record<string,unknown>={},overflow:Record<string,{viewport:number;scrollWidth:number}>={},legacyBaseline=process.env.OURO_CAPTURE_LEGACY_OVERFLOW==='1';
 const read=async(url:string)=>{const response=await page.request.get(url+'?projectId='+encodeURIComponent(fixture.projectId));expect(response.ok(),await response.text()).toBe(true);return response.json();};
 const before={project:await read('/api/project'),drafts:await read('/api/drafts'),active:await read('/api/drafts/'+fixture.activeDraftId),published:await read('/api/drafts/'+fixture.publishedDraftId)};
 const capture=async(name:string,target:Locator)=>{
  await target.page().evaluate(()=>document.fonts.ready);await target.scrollIntoViewIfNeeded();await target.page().evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  measured[name]=await presentation(target);await target.screenshot({path:join(output,name+'.png'),animations:'disabled',caret:'hide'});
  const viewport=target.page().viewportSize()!.width,scrollWidth=await target.page().evaluate(()=>document.documentElement.scrollWidth);overflow[name]={viewport,scrollWidth};
  if(!legacyBaseline)expect(scrollWidth).toBeLessThanOrEqual(viewport);
 };
 for(const theme of ['dark','light'] as const)for(const width of [1440,390]){
  const prefix=theme+'-'+width;
  const proposalScenes=['empty','spec','draft','history','summary','reviewed','dismissed','adopted'] as const;
  for(const scene of proposalScenes){
   const opened=await openScene(browser,baseURL!,fixture,theme,width,scene==='empty');
   try{
    await navigate(opened.page,'Предложения агента');const panel=opened.page.locator('.agent-proposals-panel');await expect(panel).toBeVisible();
    if(scene!=='empty'){
     const record=fixture.proposals[scene==='draft'||scene==='history'?'spec':scene];
     await panel.getByRole('button',{name:'Открыть предложение '+record.title,exact:true}).click();await expect(panel.getByRole('heading',{name:record.title,exact:true})).toBeVisible();
     if(scene==='history')await chooseSelectOption(panel.getByRole('combobox',{name:'Версия предложения',exact:true}),record.previousRevisionId!);
     if(scene==='spec'){
      await panel.getByRole('button',{name:/^Действие/}).first().click();await panel.getByRole('button',{name:'Полная исходная запись',exact:true}).click();
      await panel.getByRole('button',{name:'Таблица процесса',exact:true}).click();await expect(panel.locator('.react-flow__node')).toHaveCount(2);
     }
     if(scene==='draft'){
      const goal=panel.getByRole('textbox',{name:'Цель новой спеки',exact:true});await goal.fill('Несохранённый текст человека остаётся в форме.');await panel.getByRole('textbox',{name:'Комментарий агенту',exact:true}).fill('Проверяю исходный источник, запись ещё не отправлена.');
      await goal.focus();await goal.evaluate((element:HTMLTextAreaElement)=>element.setSelectionRange(5,17));await expect(goal).toBeFocused();expect(await goal.evaluate((element:HTMLTextAreaElement)=>[element.selectionStart,element.selectionEnd])).toEqual([5,17]);
     }
    }else await expect(panel).toContainText('Предложений пока нет');
    await capture(prefix+'-proposal-'+scene,panel);
   }finally{await opened.close();}
  }
  const collaborativeScenes=['empty','list','saved','flow','pending','offline','denied','publish-unknown','published'] as const;
  for(const scene of collaborativeScenes){
   const opened=await openScene(browser,baseURL!,fixture,theme,width,scene==='empty');let release:()=>void=()=>undefined;
   try{
    await navigate(opened.page,'Черновики');const panel=opened.page.locator('.collab-panel');await expect(panel).toBeVisible();
    if(scene==='empty')await expect(panel).toContainText('Создайте черновик от последней ревизии');
    else {
     const id=scene==='published'?fixture.publishedDraftId:fixture.activeDraftId;
     await expect(panel.getByRole('region',{name:'Общие черновики',exact:true}).getByRole('button').filter({hasText:id})).toBeVisible();
     if(scene!=='list'){
      await panel.getByRole('region',{name:'Общие черновики',exact:true}).getByRole('button').filter({hasText:id}).click();
      const editor=panel.getByRole('region',{name:'Редактор общего черновика',exact:true});await expect(editor).toHaveAttribute('data-draft-id',id);await expect(editor.getByRole('status').filter({hasText:'Все изменения сохранены'})).toBeVisible();
      if(scene==='flow'){await editor.getByRole('button',{name:/^Схема основы r/}).click();await expect(editor.getByRole('heading',{name:'Схема процесса',exact:true})).toBeVisible();}
      if(['pending','offline','denied'].includes(scene)){
       const gate=new Promise<void>(resolve=>{release=resolve;});
       await opened.page.route('**/api/drafts/'+id+'/updates**',async route=>{if(scene==='pending')await gate;await route.fulfill({status:scene==='denied'?403:503,json:{error:{code:scene==='denied'?'FORBIDDEN':'PRESENTATION_UNAVAILABLE',message:scene==='denied'?'Доступ закрыт в изолированном снимке.':'Связь недоступна в изолированном снимке.'}}}).catch(()=>{});});
       const goal=editor.getByRole('textbox',{name:'Цель черновика',exact:true});await goal.fill('Локальное несохранённое ожидание сохраняется в открытой вкладке.');await goal.focus();await goal.evaluate((element:HTMLTextAreaElement)=>element.setSelectionRange(3,15));
       await expect(editor.getByRole('status').filter({hasText:scene==='pending'?'Не отправлено':scene==='offline'?'Нет связи':'Доступ участника закрыт'})).toBeVisible();
       await expect(goal).toHaveValue('Локальное несохранённое ожидание сохраняется в открытой вкладке.');
       if(scene==='denied')await editor.getByRole('textbox',{name:'Ключ участника',exact:true}).focus();else {await expect(goal).toBeFocused();expect(await goal.evaluate((element:HTMLTextAreaElement)=>[element.selectionStart,element.selectionEnd])).toEqual([3,15]);}
      }
      if(scene==='publish-unknown'){
       await opened.page.route('**/api/drafts/'+id+'/publish**',route=>route.fulfill({status:503,json:{error:{code:'PRESENTATION_UNAVAILABLE',message:'Публикация не подтверждена в изолированном снимке.'}}}));
       await editor.getByRole('button',{name:'Опубликовать новую ревизию',exact:true}).click();await expect(editor.getByRole('button',{name:'Проверить публикацию',exact:true})).toBeVisible();await expect(editor).toContainText('Ответ на публикацию не подтверждён');
      }
      if(scene==='published'){await expect(editor).toContainText('Черновик опубликован');await expect(editor.getByRole('textbox',{name:'Цель черновика',exact:true})).toHaveJSProperty('readOnly',true);}
     }
    }
    await capture(prefix+'-collaboration-'+scene,scene==='empty'||scene==='list'?panel:panel.getByRole('region',{name:'Редактор общего черновика',exact:true}));
   }finally{release();await opened.close();}
  }
 }
 expect({project:await read('/api/project'),drafts:await read('/api/drafts'),active:await read('/api/drafts/'+fixture.activeDraftId),published:await read('/api/drafts/'+fixture.publishedDraftId)}).toEqual(before);
 await writeFile(join(output,'presentation.json'),JSON.stringify(measured,null,2));
 await writeFile(join(output,'overflow.json'),JSON.stringify(overflow,null,2));
});

test('PCV02 mobile long spec names fit the document and remain readable with keyboard selection',async({page,browser,baseURL})=>{
 test.setTimeout(90000);expect(baseURL).toBeTruthy();
 const fixture=await proposalsCollaborationFixture(page,baseURL!);
 const response=await page.request.get('/api/project?projectId='+encodeURIComponent(fixture.projectId));expect(response.ok()).toBe(true);
 const project=await response.json() as {state:ProjectState},spec=project.state.specs.find(spec=>spec.id===fixture.specId);expect(spec).toBeTruthy();
 const fullName=spec!.humanId+' · '+spec!.title;
 for(const theme of ['dark','light'] as const){
  const opened=await openScene(browser,baseURL!,fixture,theme,390);
  try{
   await navigate(opened.page,'Черновики');const panel=opened.page.locator('.collab-panel'),create=panel.getByRole('region',{name:'Создать совместный черновик',exact:true});
   const select=create.getByRole('combobox',{name:'Спецификация для черновика',exact:true});
   await chooseSelectOption(select,fixture.specId);await expect(select).toHaveAttribute('data-value',fixture.specId);
   await expect(select).toHaveText(fullName);
   const assertBounds=async(target:Locator)=>{const bounds=await target.boundingBox();expect(bounds).toBeTruthy();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);};
   expect(await opened.page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await assertBounds(select);
   await select.focus();await select.press('ArrowDown');await expect(select).toHaveAttribute('aria-expanded','true');
   const selectedOption=opened.page.getByRole('option',{name:fullName,exact:true});await expect(selectedOption).toBeVisible();await expect(selectedOption).toHaveText(fullName);await assertBounds(selectedOption);
   const optionText=await selectedOption.evaluate(element=>{const css=getComputedStyle(element);return {whiteSpace:css.whiteSpace,wrap:css.overflowWrap,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth};});
   expect(optionText.whiteSpace).not.toBe('nowrap');expect(optionText.wrap).toBe('anywhere');expect(optionText.scrollWidth).toBeLessThanOrEqual(optionText.clientWidth);
   await select.press('Escape');await expect(select).toHaveAttribute('aria-expanded','false');await expect(select).toHaveAttribute('data-value',fixture.specId);await expect(select).toBeFocused();
   expect(await select.evaluate(element=>getComputedStyle(element).outlineWidth)).toBe('2px');
   await panel.getByRole('region',{name:'Общие черновики',exact:true}).getByRole('button').filter({hasText:fixture.activeDraftId}).click();
   const editor=panel.getByRole('region',{name:'Редактор общего черновика',exact:true});await expect(editor.getByRole('status').filter({hasText:'Все изменения сохранены'})).toBeVisible();
   for(const name of ['Название черновика','Цель черновика']){const field=editor.getByRole('textbox',{name,exact:true});await assertBounds(field);await field.focus();await expect(field).toBeFocused();}
   expect(await opened.page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }finally{await opened.close();}
 }
});
