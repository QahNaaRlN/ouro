import {test,expect,type Page} from '@playwright/test';
import type {FlowDefinition,ProjectState,Spec,SpecRevision} from '../packages/core/src';

const processFlow=(title:string):FlowDefinition=>({entryNodeId:'work',nodes:[
 {id:'work',kind:'action',title,description:'План, не подтверждение исполнения.',owner:'agent'},
 {id:'result',kind:'result',title:'Предъявить результат',description:'DoD принимает человек.',owner:'agent'},
],edges:[{id:'work-result',source:'work',target:'result',label:'Есть результат'}]});
const content=(title:string,flow?:FlowDefinition)=>({title,goal:'Проверить открытие точного процесса из дорожной карты.',dod:[{id:'opened',text:'Открыта правильная ревизия без изменения истории.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',...(flow?{flow}:{})});
async function project(page:Page):Promise<ProjectState>{return (await(await page.request.get('/api/project')).json()).state;}
async function command(page:Page,payload:Record<string,unknown>){
 const response=await page.request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:(await project(page)).version}});
 expect(response.ok(),await response.text()).toBeTruthy();return response.json();
}
async function create(page:Page,title:string,flow?:FlowDefinition){
 const body=await command(page,{type:'createSpec',content:content(title,flow)}),event=body.events.find((event:{type:string})=>event.type==='SpecCreated');
 return {spec:event.payload.spec as Spec,revision:event.payload.revision as SpecRevision};
}
async function roadmap(page:Page){await page.getByRole('button',{name:'Дорожная карта',exact:true}).click();await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();}
async function card(page:Page,spec:Spec){
 await page.getByLabel('Поиск спецификаций',{exact:true}).fill(spec.humanId);
 await page.getByRole('button',{name:'Показать весь граф',exact:true}).click();
 const node=page.locator(`.react-flow__node[data-id="${spec.id}"]`);await expect(node).toBeVisible();return node;
}
const panel=(page:Page)=>page.getByRole('region',{name:'Процесс спецификации',exact:true});

test('F11 roadmap graph and table open the exact active process instead of a remembered draft',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 const a=await create(page,`Процесс A ${Date.now()}`,processFlow('Активный шаг A'));
 await command(page,{type:'activateRevision',specId:a.spec.id,revisionId:a.revision.id});
 const proposed=await command(page,{type:'proposeRevision',specId:a.spec.id,content:content(a.spec.title,processFlow('Предложенный шаг A'))});
 const draft=proposed.events.find((event:{type:string})=>event.type==='RevisionProposed').payload.revision as SpecRevision;
 const b=await create(page,`Процесс B ${Date.now()}`,processFlow('Активный шаг B'));
 await command(page,{type:'activateRevision',specId:b.spec.id,revisionId:b.revision.id});
 const before=await project(page);await page.reload();await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 await(await card(page,a.spec)).click();
 await expect(panel(page)).toBeVisible();await expect(page.getByLabel('Ревизия схемы',{exact:true})).toHaveValue(a.revision.id);
 await expect(panel(page).locator('.react-flow__node[data-id="work"]')).toContainText('Активный шаг A');
 await page.getByLabel('Ревизия схемы',{exact:true}).selectOption(draft.id);
 await expect(panel(page).locator('.react-flow__node[data-id="work"]')).toContainText('Предложенный шаг A');
 await roadmap(page);await expect(page.getByLabel('Поиск спецификаций',{exact:true})).toHaveValue(a.spec.humanId);
 await page.getByRole('button',{name:'Таблица',exact:true}).click();await page.getByLabel('Поиск спецификаций',{exact:true}).fill(b.spec.humanId);
 await page.getByRole('table').locator('.table-spec').filter({hasText:b.spec.title}).click();
 await expect(panel(page)).toBeVisible();await expect(page.getByLabel('Ревизия схемы',{exact:true})).toHaveValue(b.revision.id);
 await expect(panel(page).locator('.react-flow__node[data-id="work"]')).toContainText('Активный шаг B');
 await roadmap(page);await page.getByRole('button',{name:'Граф',exact:true}).click();await(await card(page,a.spec)).click();
 await expect(page.getByLabel('Ревизия схемы',{exact:true})).toHaveValue(a.revision.id);
 expect((await project(page)).version).toBe(before.version);
 expect((await project(page)).specs.find(spec=>spec.id===a.spec.id)?.activeRevisionId).toBe(a.revision.id);
});

test('F11 keyboard roadmap activation opens an explicit empty process without inventing a flow or events',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 const created=await create(page,`Схема ещё не задана ${Date.now()}`),before=await project(page);
 await page.reload();await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 for(const key of ['Enter',' ']){
  const node=await card(page,created.spec);await node.focus();await node.press(key);
  await expect(panel(page)).toBeVisible();await expect(panel(page).getByRole('heading',{name:'Схема ещё не описана',exact:true})).toBeVisible();
  await expect(panel(page).getByRole('button',{name:'Создать схему',exact:true})).toBeVisible();
  await expect(page.getByLabel('Ревизия схемы',{exact:true})).toHaveValue(created.revision.id);
  await roadmap(page);
 }
 const after=await project(page);expect(after.version).toBe(before.version);
 expect(after.revisions.find(revision=>revision.id===created.revision.id)).toEqual(created.revision);
});
