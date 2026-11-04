import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {ProjectState} from '../packages/core/src';
import {chooseSelectOption,selectPopup} from './select-helpers';
import {processFixture,type ProcessPresentationFixture as Fixture} from './process-presentation-fixture';

async function navigate(page:Page,name:string){const item=page.locator('.sidebar').getByRole('button',{name,exact:true});if(await item.evaluate(element=>element.getBoundingClientRect().right<=0))await page.getByRole('button',{name:'Открыть меню',exact:true}).click();await item.click();}

test('TWP01 process and state presentation preserves every node kind, draft forms, finite paints and four axes',async({page,baseURL},testInfo)=>{
 test.setTimeout(300000);await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 const fixture=await processFixture(page,baseURL),output=resolve(process.env.OURO_PROCESS_VISUAL_DIR??testInfo.outputPath('visual'));await mkdir(output,{recursive:true});const metrics:Record<string,unknown>={};
 for(const theme of ['dark','light'])for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  const open=async(kind:keyof Fixture)=>{
   await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();await expect(page.locator('footer')).toContainText('Живые обновления подключены');
   if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:theme==='dark'?'Включить тёмную тему':'Включить светлую тему',exact:true}).click();
   await navigate(page,'Спецификации');const trigger=page.getByLabel('Выбрать спецификацию',{exact:true});await selectPopup(trigger);await page.getByRole('combobox',{name:'Поиск вариантов: Выбрать спецификацию',exact:true}).fill(fixture[kind].title);await chooseSelectOption(trigger,fixture[kind].id);await page.getByRole('button',{name:'Процесс',exact:true}).click();await page.evaluate(()=>document.fonts.ready);const flow=page.getByRole('region',{name:'Процесс спецификации',exact:true});await expect(flow.locator('.process-node')).toHaveCount(7);return flow;
  };
  const capture=async(view:string)=>{
   await page.mouse.move(0,0);await page.evaluate(()=>{window.scrollTo(0,0);return new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});const key=`${theme}-${width}-${view}`;
   metrics[key]=await page.locator('.spec-flow,.state-transitions').evaluateAll(roots=>roots.flatMap(root=>[root,...root.querySelectorAll('div,section,form,label,input,textarea,button,h3,h4,p,strong,small,table,thead,tbody,tr,th,td,.react-flow__edge-path,.react-flow__edge-text,.react-flow__edge-textbg')].map(element=>{const s=getComputedStyle(element),b=element.getBoundingClientRect();return {tag:element.tagName,hook:element.classList[0],x:b.x,y:b.y,width:b.width,height:b.height,display:s.display,padding:s.padding,margin:s.margin,gap:s.gap,color:s.color,background:s.backgroundColor,font:s.font,border:s.border,borderRadius:s.borderRadius,fill:s.fill,stroke:s.stroke,strokeWidth:s.strokeWidth,strokeDasharray:s.strokeDasharray,opacity:s.opacity};})));
   await page.screenshot({path:join(output,`${key}.png`),fullPage:true,animations:'disabled'});
  };
  if(process.env.OURO_PROCESS_VISUAL_SCOPE==='states-table'){
   testInfo.annotations.push({type:'scope',description:'Четыре состояния таблицы после локальной правки нулевой нижней границы.'});
   await open('tracked');await page.getByRole('button',{name:'Состояния',exact:true}).click();const states=page.getByRole('region',{name:'Визуальные переходы состояний',exact:true});await states.locator('.state-axis-tabs').getByRole('button',{name:'Дорожная карта',exact:true}).click();await states.getByRole('button',{name:'Список',exact:true}).click();await capture('states-table');continue;
  }
  let flow=await open('planned');await capture('planned');await flow.locator('.react-flow__node[data-id="choice"]').click();await expect(flow.getByRole('region',{name:'Выбранный узел',exact:true})).toBeVisible();await capture('node-inspector');await flow.getByRole('button',{name:'Таблица',exact:true}).click();await capture('tables');
  await flow.getByRole('button',{name:'Предложить изменение схемы',exact:true}).click();await capture('draft');await flow.getByRole('button',{name:'Изменить узел Изучить исходные факты',exact:true}).click();await capture('draft-node');await flow.getByRole('table',{name:'Связи процесса',exact:true}).getByRole('button',{name:'Изменить связь',exact:true}).first().click();await capture('draft-edge');await flow.getByRole('button',{name:'Отменить изменения',exact:true}).click();
  for(const kind of ['chosen','applied','tracked'] as const){flow=await open(kind);await capture(kind);await flow.locator('.react-flow__node[data-id="choice"]').click();await capture(`${kind}-node`);}
  await page.getByRole('button',{name:'Состояния',exact:true}).click();const states=page.getByRole('region',{name:'Визуальные переходы состояний',exact:true});await expect(states).toBeVisible();
  for(const [axis,label] of [['execution','Исполнение'],['spec','Спецификация'],['request','Запрос решения'],['roadmap','Дорожная карта']] as const){await states.locator('.state-axis-tabs').getByRole('button',{name:label,exact:true}).click();await capture(`states-${axis}`);await states.getByRole('button',{name:'Все возможные переходы',exact:true}).click();await capture(`states-${axis}-all`);await states.getByRole('button',{name:'Все возможные переходы',exact:true}).click();}
  await states.getByRole('button',{name:'Список',exact:true}).click();await capture('states-table');
  const state=(await(await page.request.get('/api/project')).json()).state as ProjectState;
  for(const kind of ['planned','chosen','applied','tracked'] as const){
   await page.goto(`/projects/${state.projectId}?view=spec&spec=${fixture[kind].id}`);
   const detail=page.getByRole('region',{name:'Выбранная задача',exact:true});await expect(detail).toBeVisible();await page.evaluate(value=>document.documentElement.setAttribute('data-theme',value),theme);
   await detail.getByRole('navigation',{name:'Разделы спецификации',exact:true}).getByRole('button',{name:'Процесс',exact:true}).click();await detail.getByRole('button',{name:'План',exact:true}).click();await expect(detail.locator('.process-node')).toHaveCount(7);await page.evaluate(()=>document.fonts.ready);await capture(`workspace-${kind}`);
  }
 }
 await writeFile(join(output,'presentation.json'),JSON.stringify(metrics,null,2));
});
