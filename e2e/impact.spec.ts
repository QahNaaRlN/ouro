import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ProjectState, Spec } from '../packages/core/src/types';

async function project(request:APIRequestContext):Promise<ProjectState>{
  const response=await request.get('/api/project');expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state;
}
async function human(request:APIRequestContext,payload:Record<string,unknown>):Promise<ProjectState>{
  const state=await project(request);
  const response=await request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:state.version}});
  expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state;
}

test('M07 impact baseline, event sources and real JSON export explain a fixed cohort without writing domain history',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  const specs:Spec[]=[];
  for(const name of ['A','B']){
    let state=await human(page.request,{type:'createSpec',content:{title:`Метрика ${name} ${Date.now()}`,goal:`Сохранить исходное ожидание ${name}.`,dod:[{id:'checked',text:'Человек проверил результат',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
    const spec=state.specs.at(-1)!;
    state=await human(page.request,{type:'activateRevision',specId:spec.id,revisionId:spec.revisionIds[0]});
    specs.push(state.specs.find(item=>item.id===spec.id)!);
  }
  const baseline=await project(page.request),c0=baseline.version;
  await page.reload();await page.getByRole('button',{name:'Показатели',exact:true}).click();
  const panel=page.getByRole('region',{name:'Показатели ожиданий'});
  await expect(panel.getByRole('heading',{name:'Показатели ожиданий',exact:true})).toBeVisible();
  await expect(panel).toContainText('Нет исходной утверждённой базы');
  await panel.getByLabel('Исходная точка истории',{exact:true}).fill(String(c0));
  await panel.getByLabel('Область отчёта',{exact:true}).selectOption('selected');
  for(const spec of specs)await panel.getByRole('checkbox',{name:`${spec.humanId} — ${spec.title}`,exact:true}).check();
  await panel.getByRole('button',{name:'Пересчитать отчёт',exact:true}).click();
  await expect(panel).toContainText('0 из 2 исходных спек');
  const first=baseline.revisions.find(revision=>revision.id===specs[0].activeRevisionId)!;
  let state=await human(page.request,{type:'proposeRevision',specId:specs[0].id,content:{title:first.title,goal:'Наблюдаемое изменённое ожидание.',dod:first.dod,constraints:first.constraints,assumptions:first.assumptions,risks:first.risks,inputs:first.inputs,comment:first.comment,...(first.flow?{flow:first.flow}:{})}});
  state=await human(page.request,{type:'activateRevision',specId:specs[0].id,revisionId:state.revisions.at(-1)!.id});
  await expect(panel).toContainText('1 из 2 исходных спек');
  await expect(panel.getByLabel('Доля изменённых исходных ожиданий',{exact:true})).toHaveText('50,0%');
  await expect(panel).toContainText('Не оценивает качество агента');
  const source=panel.getByRole('group',{name:`Основание изменения ${specs[0].humanId}`});
  await source.locator('summary').first().click();await expect(source).toContainText('RevisionActivated');
  await expect(source).toContainText('Цель');
  const downloading=page.waitForEvent('download');await panel.getByRole('button',{name:'Экспорт отчёта JSON',exact:true}).click();
  const download=await downloading,path=await download.path();expect(path).toBeTruthy();
  const exported=JSON.parse(await readFile(path!,'utf8'));
  expect(exported.algorithmId).toBe('expectation-impact/v1');expect(exported.K).toBe(1);expect(exported.N).toBe(2);expect(exported.c0).toBe(c0);
  expect(exported.changedSpecs).toHaveLength(1);
  await panel.getByLabel('Конечная точка отчёта',{exact:true}).selectOption('historical');
  await panel.getByLabel('Конечная точка истории',{exact:true}).fill(String(c0));
  await panel.getByRole('button',{name:'Пересчитать отчёт',exact:true}).click();await expect(panel).toContainText('0 из 2 исходных спек');
  for(const spec of specs)await panel.getByRole('checkbox',{name:`${spec.humanId} — ${spec.title}`,exact:true}).uncheck();
  await panel.getByRole('button',{name:'Пересчитать отчёт',exact:true}).click();await expect(panel).toContainText('Нет исходной утверждённой базы');
  expect((await project(page.request)).version).toBe(state.version);
});

test('M07 impact controls remain readable in light theme on a narrow screen',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  await page.getByRole('button',{name:'Показатели',exact:true}).click();
  await page.getByRole('button',{name:'Включить светлую тему',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('region',{name:'Показатели ожиданий'})).toBeVisible();
  await expect(page.getByLabel('Исходная точка истории',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});
