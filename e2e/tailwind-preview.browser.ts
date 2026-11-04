import {test,expect,type Locator} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {proposalsCollaborationFixture} from './proposals-collaboration-fixture';
import type {ProjectState} from '../packages/core/src';
import type {} from '../apps/web/tests/fixtures/PreviewPresentation';

/** Читает геометрию, рисуемые свойства и доступные library controls без className diagnostic. */
async function presentation(target:Locator){return target.evaluate(root=>[root,...root.querySelectorAll('*')].filter(node=>node.getClientRects().length).map(node=>{const b=node.getBoundingClientRect(),s=getComputedStyle(node);return {tag:node.tagName,text:node.children.length?'':node.textContent,x:b.x,y:b.y,width:b.width,height:b.height,font:s.font,color:s.color,background:s.backgroundColor,border:s.border,borderRadius:s.borderRadius,padding:s.padding,margin:s.margin,stroke:s.stroke,fill:s.fill,display:s.display,transform:s.transform};}));}

test('TWF01 workspace proposal graph retains nodes, edges, labels and controls',async({page,baseURL})=>{
 test.setTimeout(180000);expect(baseURL).toBeTruthy();const fixture=await proposalsCollaborationFixture(page,baseURL!);
 const read=async()=>{const r=await page.request.get('/api/project?projectId='+encodeURIComponent(fixture.projectId));expect(r.ok(),await r.text()).toBe(true);return (await r.json()).state as ProjectState;};
 const state=await read(),output=resolve(process.env.OURO_PREVIEW_VISUAL_DIR??'.operations/preview-before'),baseline=process.env.OURO_PREVIEW_COMPARE;
 await mkdir(output,{recursive:true});const measured:Record<string,unknown>={};
 for(const theme of ['dark','light'] as const)for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});await page.goto('/tests/fixtures/preview-presentation.html');await page.waitForFunction(()=>!!window.previewPresentation);await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
  await page.evaluate(({state,id})=>window.previewPresentation.configure(state,id),{state,id:fixture.proposals.spec.id});await page.evaluate(()=>document.fonts.ready);
  const target=page.getByRole('region',{name:'Предложенная блок-схема',exact:true});await expect(target).toBeVisible();await expect(target.locator('.react-flow__node')).toHaveCount(2);await expect(target.locator('.react-flow__edge-text')).toHaveText(['Факт проверен']);
  await expect(target.locator('.react-flow__viewport')).not.toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
  const capture=async(scene:string)=>{await page.mouse.move(0,0);await target.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));const key=`${theme}-${width}-${scene}`;measured[key]=await presentation(target);await target.screenshot({path:join(output,key+'.png'),animations:'disabled',caret:'hide'});expect(await presentation(target),'Стабильный DOM во время '+key).toEqual(measured[key]);};
  await capture('fit');await target.getByRole('button',{name:'Zoom Out',exact:true}).click();await page.waitForTimeout(250);await capture('zoom');
  await target.getByRole('button',{name:'Fit View',exact:true}).click();await page.waitForTimeout(250);await target.getByRole('button',{name:'Шаги и переходы процесса',exact:true}).click();await expect(target.getByText('Сопоставить сохранённый факт с ожиданием.',{exact:true})).toBeVisible();await capture('details');
 }
 expect(await read()).toEqual(state);await writeFile(join(output,'presentation.json'),JSON.stringify(measured,null,2));if(baseline)expect(measured).toEqual(JSON.parse(await readFile(resolve(baseline,'presentation.json'),'utf8')));
});
