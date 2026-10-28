import { test,expect,type Page } from '@playwright/test';
import { AGENT_ID,type ProjectState,type RequestKind } from '../packages/core/src';

async function project(page:Page):Promise<ProjectState> {
 const response=await page.request.get('/api/project');expect(response.ok()).toBeTruthy();return (await response.json()).state;
}
function matchingPending(state:ProjectState,kind:RequestKind,agentId=AGENT_ID) {
 return state.specs.filter(spec=>state.requests.some(request=>request.specId===spec.id&&request.specRevisionId===spec.activeRevisionId&&request.state==='pending'&&request.kind===kind&&request.agentId===agentId&&state.executions.some(execution=>execution.id===request.executionId&&execution.agentId===agentId&&execution.specRevisionId===spec.activeRevisionId)));
}
async function brightGraphIds(page:Page) {
 return page.locator('.react-flow__node-spec').evaluateAll(nodes=>nodes.filter(node=>Number(getComputedStyle(node).opacity)===1).map(node=>node.getAttribute('data-id')).sort());
}
async function tableHumanIds(page:Page) {
 return (await page.locator('tbody .table-spec .mono').allTextContents()).map(text=>text.trim()).sort();
}

test('R07 graph and table share agent/pending-kind matches while selection, camera and global attention stay intact',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 await expect(page.locator('.react-flow__node-spec').first()).toBeVisible();
 const state=await project(page);
 const held=state.specs.find(spec=>!state.requests.some(request=>request.specId===spec.id&&request.specRevisionId===spec.activeRevisionId&&request.state==='pending'))!;
 expect(held,'The seeded project includes a spec outside pending request filters.').toBeTruthy();
 // A large persisted fixture can place this card outside the current viewport;
 // use the equally supported table path to choose it without assuming geometry.
 await page.getByRole('button',{name:'Таблица',exact:true}).click();
 await page.locator('.table-spec').filter({hasText:held.humanId}).click();
 await page.getByRole('button',{name:'Дорожная карта',exact:true}).click();
 await page.getByRole('button',{name:'Граф',exact:true}).click();
 await expect(page.locator('.selection-strip .mono')).toHaveText(held.humanId);
 const attention=await page.locator('.attention-counter').textContent();
 const agent=page.getByLabel('Фильтр по агенту',{exact:true});
 const kind=page.getByLabel('Фильтр по открытому запросу',{exact:true});
 await expect(agent.getByRole('option',{name:'Все агенты',exact:true})).toHaveCount(1);
 await expect(kind.getByRole('option',{name:'Все открытые запросы',exact:true})).toHaveCount(1);
 await expect(agent.getByRole('option',{name:'Симулятор агента',exact:true})).toHaveCount(1);
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 const camera=await page.locator('.react-flow__viewport').getAttribute('style');
 await agent.selectOption(AGENT_ID);
 await kind.selectOption('Fork');
 const fork=matchingPending(state,'Fork');expect(fork.length).toBeGreaterThan(0);
 await expect.poll(()=>brightGraphIds(page)).toEqual(fork.map(spec=>spec.id).sort());
 await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style',camera!);
 await expect(page.getByRole('status').filter({hasText:'Выбранная спека вне фильтра'})).toBeVisible();
 await expect(page.locator('.selection-strip .mono')).toHaveText(held.humanId);
 await expect(page.locator('.attention-counter')).toHaveText(attention!);

 for(const [requestKind,label] of [['Fork','Развилка'],['Question','Вопрос'],['Blocker','Блокер']] as const) {
  await kind.selectOption(requestKind);
  await expect(kind.getByRole('option',{name:label,exact:true})).toHaveCount(1);
  const expected=matchingPending(state,requestKind);expect(expected.length).toBeGreaterThan(0);
  await expect(page.locator('.react-flow__node-spec')).toHaveCount(state.specs.length);
  await expect.poll(()=>brightGraphIds(page)).toEqual(expected.map(spec=>spec.id).sort());
  await page.getByRole('button',{name:'Таблица',exact:true}).click();
  await expect.poll(()=>tableHumanIds(page)).toEqual(expected.map(spec=>spec.humanId).sort());
  await expect(page.locator('.selection-strip .mono')).toHaveText(held.humanId);
  await expect(page.locator('.attention-counter')).toHaveText(attention!);
  await page.getByRole('button',{name:'Граф',exact:true}).click();
 }
 await kind.selectOption('');await agent.selectOption('');
 await expect.poll(()=>brightGraphIds(page)).toEqual(state.specs.map(spec=>spec.id).sort());
 await expect(page.getByRole('status').filter({hasText:'Выбранная спека вне фильтра'})).toHaveCount(0);
 await expect(page.locator('.selection-strip .mono')).toHaveText(held.humanId);
});

test('R07 agent and request filters remain usable in light mobile view',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 const state=await project(page);
 await page.getByRole('button',{name:'Включить светлую тему'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.setViewportSize({width:390,height:844});
 const agent=page.getByLabel('Фильтр по агенту',{exact:true}),kind=page.getByLabel('Фильтр по открытому запросу',{exact:true});
 await expect(agent).toBeVisible();await expect(kind).toBeVisible();
 await agent.selectOption(AGENT_ID);await kind.selectOption('Blocker');
 const expected=matchingPending(state,'Blocker');expect(expected.length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Таблица',exact:true}).click();
 await expect.poll(()=>tableHumanIds(page)).toEqual(expected.map(spec=>spec.humanId).sort());
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 expect(errors).toEqual([]);
});
