import {test,expect,type Page} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

/** Отдельная карта сохраняется между original/corrected production-серверами без повторных записей. */
async function fullscreenFixture(page:Page){
 await page.request.get('/api/session');const root=resolve(process.env.OURO_E2E_DATA_DIR!),manifest=join(root,'fullscreen-visual-fixture.json');
 try{return JSON.parse(await readFile(manifest,'utf8')) as {id:string};}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const folder=join(root,'fullscreen-project');await mkdir(folder,{recursive:true});
 const created=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),name:'Fullscreen visual fixture',rootPath:folder}});expect(created.ok(),await created.text()).toBe(true);const {project}=await created.json(),scope=`/api/projects/${project.id}`;
 const issued=await page.request.post(`${scope}/agents`,{data:{name:'Fullscreen fixture agent'}});expect(issued.ok()).toBe(true);const {agent}=await issued.json();
 for(let index=0;index<3;index++){const state=await(await page.request.get(scope)).json();const assigned=await page.request.post(`${scope}/tasks`,{data:{requestId:crypto.randomUUID(),expectedVersion:state.cursor,agentId:agent.id,content:{title:`Полноэкранная карта ${index+1}`,goal:'Сохранить собственную палитру и геометрию карты в fullscreen.',dod:[{id:'fullscreen',text:'Внешний вид проверен человеком.',required:true}],constraints:'Отдельный browser fixture.',assumptions:'',risks:'',inputs:'',comment:''}}});expect(assigned.ok(),await assigned.text()).toBe(true);}
 const fixture={id:project.id};await writeFile(manifest,JSON.stringify(fixture));return fixture;
}

test('TWG02 fullscreen retains the document palette, exact screen geometry and Escape viewport restoration',async({page},testInfo)=>{
 test.setTimeout(120000);const fixture=await fullscreenFixture(page),output=resolve(process.env.OURO_FULLSCREEN_VISUAL_DIR??testInfo.outputPath('visual'));await mkdir(output,{recursive:true});const metrics:Record<string,unknown>={};
 const project=(await(await page.request.get(`/api/projects/${fixture.id}`)).json()).state as {specs:{id:string}[]};
 for(const theme of ['dark','light'])for(const width of [1440,390])for(const kind of ['roadmap','reality']){
  const height=width===1440?1000:844;await page.setViewportSize({width,height});await page.goto(`/projects/${fixture.id}${kind==='reality'?`?view=spec&spec=${project.specs[0].id}`:''}`);await page.evaluate(value=>document.documentElement.setAttribute('data-theme',value),theme);
  if(kind==='reality'){const detail=page.getByRole('region',{name:'Выбранная задача',exact:true});await detail.getByRole('navigation',{name:'Разделы спецификации',exact:true}).getByRole('button',{name:'Процесс',exact:true}).click();await detail.getByRole('button',{name:'Фактическое исполнение',exact:true}).click();}
  const graph=page.locator(kind==='roadmap'?'.workspace-roadmap':'.workspace-reality');await expect(graph.locator('.react-flow__node').first()).toBeVisible();await page.evaluate(()=>document.fonts.ready);await graph.getByRole('button',{name:kind==='roadmap'?'Вписать граф':'Вписать события',exact:true}).click();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));const previous=await graph.locator('.react-flow__viewport').getAttribute('style');
  const enter=graph.getByRole('button',{name:'На весь экран',exact:true});await expect(enter).toBeEnabled();await enter.click();await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.classList.contains('workspace-graph')??false)).toBe(true);
  await expect.poll(()=>graph.evaluate(root=>{const outer=root.getBoundingClientRect();return Array.from(root.querySelectorAll('.react-flow__node')).every(node=>{const box=node.getBoundingClientRect();return box.left>=outer.left-2&&box.right<=outer.right+2&&box.top>=outer.top-2&&box.bottom<=outer.bottom+2;});})).toBe(true);
  await page.mouse.move(0,0);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));const key=`${theme}-${width}-${kind}-fullscreen`;
  metrics[key]=await graph.evaluate(root=>[root,...root.querySelectorAll('.react-flow__node,.spec-node,.node-top,.node-title,.node-goal,.node-bottom,.node-updated,.react-flow__handle,.react-flow__controls,.react-flow__controls-button,.react-flow__minimap,.graph-caption')].map(element=>{const s=getComputedStyle(element),b=element.getBoundingClientRect();return {hook:element.classList[0],x:b.x,y:b.y,width:b.width,height:b.height,minHeight:s.minHeight,color:s.color,background:s.backgroundColor,border:s.border,borderRadius:s.borderRadius,padding:s.padding,margin:s.margin,font:s.font};}));
  await graph.screenshot({path:join(output,`${key}.png`),animations:'disabled'});await writeFile(join(output,'presentation.json'),JSON.stringify(metrics,null,2));
  const background=await page.locator('body').evaluate(element=>getComputedStyle(element).backgroundColor);await expect(graph).toHaveCSS('background-color',background);await expect(graph).toHaveCSS('min-height','0px');await expect(graph).toHaveCSS('border-top-width','0px');await expect(graph).toHaveCSS('border-radius','0px');expect(await graph.boundingBox()).toEqual({x:0,y:0,width,height});
  await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);await expect(graph.locator('.react-flow__viewport')).toHaveAttribute('style',previous!);
 }
});
