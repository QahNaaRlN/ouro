import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {ProjectState} from '../packages/core/src';
import {processFixture} from './process-presentation-fixture';

/** Настоящий workspace route дополняет scoped renderer проверкой фактического CSS порядка layout. */
test('TWR02 actual workspace runtime inspector preserves the layout cascade',async({page,baseURL})=>{
 const fixture=await processFixture(page,baseURL),output=resolve(process.env.OURO_RUNTIME_WORKSPACE_VISUAL_DIR??'.operations/runtime-workspace-original');await mkdir(output,{recursive:true});
 const metrics:Record<string,unknown>={};
 for(const theme of ['dark','light'])for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();const state=(await(await page.request.get('/api/project')).json()).state as ProjectState;
  await page.goto(`/projects/${state.projectId}?view=spec&spec=${fixture.tracked.id}`);const detail=page.getByRole('region',{name:'Выбранная задача',exact:true});await expect(detail).toBeVisible();await page.evaluate(value=>document.documentElement.setAttribute('data-theme',value),theme);
  await detail.getByRole('navigation',{name:'Разделы спецификации',exact:true}).getByRole('button',{name:'Процесс',exact:true}).click();await detail.getByRole('button',{name:'План',exact:true}).click();await expect(detail.locator('.process-node')).toHaveCount(7);await detail.locator('.react-flow__node[data-id="choice"]').click();await expect(detail.getByRole('region',{name:'Проходы узла',exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);await page.mouse.move(0,0);await page.evaluate(()=>window.scrollTo(0,0));const key=`${theme}-${width}-workspace-runtime`;
  metrics[key]=await detail.locator('.spec-flow').evaluateAll(roots=>roots.flatMap(root=>[root,...root.querySelectorAll('*')].map(element=>{const s=getComputedStyle(element),b=element.getBoundingClientRect();return {tag:element.tagName,x:b.x,y:b.y,width:b.width,height:b.height,display:s.display,padding:s.padding,margin:s.margin,gap:s.gap,color:s.color,background:s.backgroundColor,font:s.font,border:s.border,borderRadius:s.borderRadius};})));
  await page.screenshot({path:join(output,`${key}.png`),fullPage:true,animations:'disabled'});
 }
 await writeFile(join(output,'presentation.json'),JSON.stringify(metrics,null,2));
});
