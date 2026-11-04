import {test,expect,type Locator,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

/** Снимает только оформление; подставленные ответы не доказывают авторизацию или работу backend. */
async function captureAccount(page:Page,panel:Locator,name:string,output:string,metrics:Record<string,unknown>){
 for(const theme of ['dark','light'])for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);await page.evaluate(()=>document.fonts.ready);
  const key=`${name}-${theme}-${width}`;
  metrics[key]=await panel.evaluate(node=>[node,...node.querySelectorAll('h1,h2,p,section,label,input,button,article,article>div,strong,small,code,.participant-badge')].map(element=>{
   const style=getComputedStyle(element),box=element.getBoundingClientRect();
   return {tag:element.tagName,text:element.textContent?.trim().slice(0,90),x:box.x,y:box.y,width:box.width,height:box.height,display:style.display,padding:style.padding,margin:style.margin,gap:style.gap,border:style.border,borderRadius:style.borderRadius,color:style.color,background:style.backgroundColor,font:style.font};
  }));
  await panel.screenshot({path:join(output,`${key}.png`),animations:'disabled'});
 }
}

test('TWA account login modes and membership presentation retain shared participant styling',async({page},testInfo)=>{
 test.setTimeout(90000);
 const output=resolve(process.env.OURO_TAILWIND_VISUAL_DIR??testInfo.outputPath('visual')),metrics:Record<string,unknown>={};await mkdir(output,{recursive:true});
 await page.route('**/api/session',route=>route.fulfill({status:401,json:{error:{code:'UNAUTHENTICATED',message:'Изолированная проверка оформления'}}}));
 await page.goto('/projects');const login=page.getByRole('region',{name:'Вход в аккаунт',exact:true});await expect(login).toBeVisible();
 for(const [mode,label] of [['login','Вход'],['invitation','Приглашение'],['reset','Сброс пароля']] as const){
  await login.getByRole('button',{name:label,exact:true}).click();await captureAccount(page,login,`account-${mode}`,output,metrics);
 }
 await page.unroute('**/api/session');
 await page.route('**/api/session',route=>route.fulfill({json:{actor:{kind:'human',id:'presentation-owner',name:'Владелец',projectIds:['presentation-project']},account:{id:'presentation-owner'},canManageParticipants:false}}));
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[{id:'presentation-project',name:'Макет доступа',slug:'presentation-project',createdAt:'2026-11-04T00:00:00.000Z',createdBy:'presentation-owner',role:'Owner'}]}}));
 await page.route('**/api/projects/presentation-project/members',route=>route.fulfill({json:{members:[{id:'presentation-membership',userId:'presentation-owner',name:'Владелец',email:'owner@example.invalid',role:'Owner'}]}}));
 await page.goto('/projects/presentation-project/members');const members=page.locator('.participants-panel');await expect(members.getByText('owner@example.invalid',{exact:true})).toBeVisible();
 await captureAccount(page,members,'members',output,metrics);await writeFile(join(output,'account-presentation.json'),JSON.stringify(metrics,null,2));
});

/** Повторно использует один изолированный реестр для точного сравнения оформления до и после. */
test('TWP participant presentation preserves theme, responsive geometry and focus',async({page},testInfo)=>{
 test.setTimeout(90000);
 const output=resolve(process.env.OURO_TAILWIND_VISUAL_DIR??testInfo.outputPath('visual'));
 await mkdir(output,{recursive:true});
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible({timeout:15000});
 const directory=await page.request.get('/api/participants');expect(directory.ok()).toBe(true);
 const body=await directory.json() as {participants:{id:string;name:string;revokedAt?:string}[]};
 for(const name of ['Tailwind активный','Tailwind отозванный']){
  let participant=body.participants.find(value=>value.name===name);
  if(!participant){const created=await page.request.post('/api/participants',{data:{name}});expect(created.ok()).toBe(true);participant=(await created.json()).participant as {id:string;name:string};}
  if(name==='Tailwind отозванный'&&!participant.revokedAt){const revoked=await page.request.post(`/api/participants/${encodeURIComponent(participant.id)}/revoke`,{data:{}});expect(revoked.ok()).toBe(true);}
 }
 await page.getByRole('button',{name:'Участники',exact:true}).click();
 const panel=page.locator('.participants-panel');
 await expect(panel.getByText('Tailwind активный',{exact:true})).toBeVisible();
 await expect(panel.locator('article').filter({hasText:'Tailwind отозванный'}).getByText('Доступ отозван',{exact:true})).toBeVisible();
 const metrics:Record<string,unknown>={};
 for(const theme of ['dark','light'])for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
  await page.evaluate(()=>document.fonts.ready);
  const input=panel.getByLabel('Ключ участника',{exact:true});await input.focus();
  await expect(input).toBeFocused();
  const key=`${theme}-${width}`;
  metrics[key]=await panel.evaluate(node=>Array.from(node.querySelectorAll('h1,h2,p,section,label,input,button,article,article>div,strong,small,code,.participant-badge')).map(element=>{
   const style=getComputedStyle(element),box=element.getBoundingClientRect();
   return {tag:element.tagName,text:element.textContent?.trim().slice(0,90),x:box.x,y:box.y,width:box.width,height:box.height,display:style.display,padding:style.padding,margin:style.margin,gap:style.gap,border:style.border,borderRadius:style.borderRadius,color:style.color,background:style.backgroundColor,font:style.font,outline:style.outline,outlineOffset:style.outlineOffset};
  }));
  await panel.screenshot({path:join(output,`${key}.png`),animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 }
 await writeFile(join(output,'presentation.json'),JSON.stringify(metrics,null,2));
});

test('TWPL a CI-shaped long participant name stays readable and revocable within a narrow viewport',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 const name=`Meridian Boris ${crypto.randomUUID()}`,response=await page.request.post('/api/participants',{data:{name}});
 expect(response.ok(),await response.text()).toBe(true);const participant=(await response.json()).participant as {id:string;name:string};
 await page.getByRole('button',{name:'Участники',exact:true}).click();const panel=page.locator('.participants-panel'),card=panel.locator('article').filter({hasText:participant.id}),revoke=card.getByRole('button',{name:`Отозвать доступ ${name}`,exact:true});
 await expect(revoke).toBeVisible();await page.setViewportSize({width:390,height:844});
 for(const theme of ['dark','light']){
  await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);await page.evaluate(()=>document.fonts.ready);
  await expect(card.getByText(name,{exact:true})).toBeVisible();await revoke.focus();await expect(revoke).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await panel.evaluate(element=>element.scrollWidth-element.clientWidth)).toBeLessThanOrEqual(0);
  const text=await revoke.evaluate(element=>{const box=element.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(element);return {width:box.width,cardWidth:element.closest('article')!.getBoundingClientRect().width,lines:Array.from(range.getClientRects(),rect=>({left:rect.left-box.left,right:rect.right-box.left}))};});
  expect(text.width).toBeLessThanOrEqual(text.cardWidth);expect(text.lines.length).toBeGreaterThan(1);
  for(const line of text.lines){expect(line.left).toBeGreaterThanOrEqual(0);expect(line.right).toBeLessThanOrEqual(text.width+1);}
 }
 await revoke.click();await expect(card.getByText('Доступ отозван',{exact:true})).toBeVisible();await expect(revoke).toHaveCount(0);
 const directory=await(await page.request.get('/api/participants')).json() as {participants:{id:string;revokedAt?:string}[]};expect(directory.participants.find(value=>value.id===participant.id)?.revokedAt).toBeTruthy();
});
