import {test,expect,type Page} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {FlowDefinition,ProjectState} from '../packages/core/src';

const scope=(projectId:string)=>`/api/projects/${encodeURIComponent(projectId)}`;
async function settleGraphFrame(page:Page){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
async function cleanupGraphProject(page:Page,project:{id:string;agentId:string;folder:string}){await page.request.post(`${scope(project.id)}/agents/${project.agentId}/revoke`,{data:{},timeout:3000}).catch(()=>{});await rm(project.folder,{recursive:true,force:true});}
async function graphProject(page:Page,count=2,flow?:FlowDefinition){
  await page.request.get('/api/session');
  const folder=await mkdtemp(join(tmpdir(),'ouro-graphs-'));
  const created=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),name:`Graph checks ${crypto.randomUUID()}`,rootPath:folder}});
  expect(created.ok(),await created.text()).toBe(true);const {project}=await created.json();
  const registered=await page.request.post(`${scope(project.id)}/agents`,{data:{name:'Graph verification agent'}});expect(registered.ok()).toBe(true);const {agent}=await registered.json();
  let state:ProjectState|undefined;
  for(let i=0;i<count;i++){
    const snapshot=await page.request.get(scope(project.id));const current=await snapshot.json();
    const assigned=await page.request.post(`${scope(project.id)}/tasks`,{data:{requestId:crypto.randomUUID(),expectedVersion:current.cursor,agentId:agent.id,content:{title:`Graph task ${i+1}`,goal:'Проверить настоящую дорожную карту и сохранение текущего выбора.',dod:[{id:'graph',text:'Граф проверен человеком.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',...(flow?{flow}:{})}}});
    expect(assigned.ok(),await assigned.text()).toBe(true);state=(await assigned.json()).state;
  }
  return {id:project.id,folder,state:state!,agentId:agent.id};
}

test('GR01 installed React Flow keeps zoom, minimap and separate fullscreen/fit controls on a 50-spec map',async({page})=>{
  test.setTimeout(120000);const project=await graphProject(page,50);
  try{
    await page.goto(`/projects/${project.id}`);
    const graph=page.locator('.workspace-roadmap');await expect(graph).toBeVisible();
    await expect(graph.locator('.react-flow__node')).toHaveCount(50);
    await expect(graph.locator('.react-flow__minimap')).toBeVisible();
    await expect(graph.getByRole('button',{name:'Приблизить',exact:true})).toBeVisible();
    await expect(graph.getByRole('button',{name:'Отдалить',exact:true})).toBeVisible();
    await graph.getByRole('button',{name:'Вписать граф',exact:true}).click();
    await expect.poll(()=>graph.evaluate(element=>{const outer=element.getBoundingClientRect();return Array.from(element.querySelectorAll('.react-flow__node')).every(node=>{const box=node.getBoundingClientRect();return box.left>=outer.left-2&&box.right<=outer.right+2&&box.top>=outer.top-2&&box.bottom<=outer.bottom+2;});})).toBe(true);
    const selected=await graph.locator('.react-flow__node.selected').getAttribute('data-id');
    const viewport=await graph.locator('.react-flow__viewport').getAttribute('style');
    const fullscreen=graph.getByRole('button',{name:'На весь экран',exact:true});
    if(await page.evaluate(()=>document.fullscreenEnabled&&typeof Element.prototype.requestFullscreen==='function')){
      await fullscreen.click();
      await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.classList.contains('workspace-roadmap')??false)).toBe(true);
      await graph.getByRole('button',{name:'Выйти из полного экрана',exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);
      await expect(graph.locator('.react-flow__node.selected')).toHaveAttribute('data-id',selected!);
      await expect(graph.locator('.react-flow__viewport')).toHaveAttribute('style',viewport!);
      await fullscreen.click();
      await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.classList.contains('workspace-roadmap')??false)).toBe(true);
      await page.keyboard.press('Escape');
      await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);
      await expect(graph.getByRole('alert')).toHaveCount(0);
    }else{
      test.info().annotations.push({type:'fullscreen',description:'Browser lacks fullscreen; explicit unavailable state checked.'});
      await expect(fullscreen).toBeDisabled();await expect(graph.getByText('Полный экран недоступен',{exact:true})).toBeVisible();
    }
    await expect(graph.locator('.node-attention')).toHaveCount(0);
  }finally{await cleanupGraphProject(page,project);}
});

test('GR02 a browser fullscreen refusal is explicit and keeps the actual graph usable',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(document,'fullscreenEnabled',{configurable:true,get:()=>true});Element.prototype.requestFullscreen=()=>Promise.reject(new DOMException('Test fullscreen refusal','NotAllowedError'));});
  const project=await graphProject(page);
  try{
    await page.goto(`/projects/${project.id}`);const graph=page.locator('.workspace-roadmap');await expect(graph.locator('.react-flow__node')).toHaveCount(2);
    const before=await graph.locator('.react-flow__node.selected').getAttribute('data-id');
    await graph.getByRole('button',{name:'На весь экран',exact:true}).click();
    await expect(graph.getByRole('alert')).toContainText('Браузер не разрешил полноэкранный режим');
    await expect(graph.locator('.react-flow__node.selected')).toHaveAttribute('data-id',before!);
    await graph.getByRole('button',{name:'Вписать граф',exact:true}).click();
    await expect(graph.locator('.react-flow__minimap')).toBeVisible();
  }finally{await cleanupGraphProject(page,project);}
});

test('GR03 actual events remain available without planned Flow and keyboard activation opens the source event',async({page})=>{
  const project=await graphProject(page,1);
  try{
    const spec=project.state.specs[0],revision=project.state.revisions.find(item=>item.id===spec.activeRevisionId)!;
    expect(revision.flow).toBeUndefined();
    const execution=project.state.executions.find(item=>item.specId===spec.id)!;
    const fact=project.state.events.findLast(item=>item.executionId===execution.id)!;expect(fact).toBeTruthy();
    await page.goto(`/projects/${project.id}`);
    await page.locator(`.workspace-roadmap .react-flow__node[data-id="${spec.id}"]`).click();
    const detail=page.getByRole('region',{name:'Выбранная задача',exact:true});await expect(detail).toBeVisible();
    await detail.getByRole('navigation',{name:'Разделы спецификации',exact:true}).getByRole('button',{name:'Процесс',exact:true}).click();
    await detail.getByRole('button',{name:'Фактическое исполнение',exact:true}).click();
    const reality=detail.getByRole('region',{name:'Фактическое исполнение выбранной ревизии и попытки',exact:true});
    const node=reality.locator(`.react-flow__node[data-id="${fact.id}"]`);await expect(node).toBeVisible();await node.focus();await node.press('Enter');
    await expect(page.getByLabel('Подробности события',{exact:true})).toContainText(fact.id);
  }finally{await cleanupGraphProject(page,project);}
});

test('GR04 the initial three-spec viewport is fitted without pressing fit or reloading the project',async({page})=>{
  const project=await graphProject(page,3);
  try{
    await page.goto(`/projects/${project.id}`);const graph=page.locator('.workspace-roadmap');
    await expect(graph.locator('.react-flow__node')).toHaveCount(3);
    await expect.poll(()=>graph.evaluate(element=>{const outer=element.getBoundingClientRect();return Array.from(element.querySelectorAll('.react-flow__node')).every(node=>{const box=node.getBoundingClientRect();return getComputedStyle(node).visibility==='visible'&&box.left>=outer.left-2&&box.right<=outer.right+2&&box.top>=outer.top-2&&box.bottom<=outer.bottom+2;});}),{message:'All initial nodes must be visible inside the actual graph before any fit interaction.'}).toBe(true);
    const last=project.state.specs.at(-1)!;
    await graph.locator(`.react-flow__node[data-id="${last.id}"]`).click();
    await expect(page.getByRole('region',{name:'Выбранная задача',exact:true})).toContainText(last.title);
  }finally{await cleanupGraphProject(page,project);}
});

test('GR05 a hidden-mounted actual graph stays measured after showing and a same-project refresh',async({page})=>{
  const project=await graphProject(page,3);
  try{
    const spec=project.state.specs.at(-1)!,execution=project.state.executions.find(item=>item.specId===spec.id)!;
    const fact=project.state.events.findLast(item=>item.executionId===execution.id)!;
    await page.goto(`/projects/${project.id}?view=spec&spec=${spec.id}`);
    const detail=page.getByRole('region',{name:'Выбранная задача',exact:true});
    await detail.getByRole('navigation',{name:'Разделы спецификации',exact:true}).getByRole('button',{name:'Процесс',exact:true}).click();
    const reality=detail.getByRole('region',{name:'Фактическое исполнение выбранной ревизии и попытки',exact:true});
    const node=reality.locator(`.react-flow__node[data-id="${fact.id}"]`);await expect(node).toBeVisible();
    const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname===scope(project.id)&&response.request().method()==='GET');
    await page.getByRole('button',{name:'Обновить проект',exact:true}).click();await refreshed;await settleGraphFrame(page);
    await expect(node).toBeVisible();await node.focus();await node.press('Enter');
    await expect(page.getByLabel('Подробности события',{exact:true})).toContainText(fact.id);
  }finally{await cleanupGraphProject(page,project);}
});

test('GR06 the hidden-mounted planned graph is measured and fitted on its first opening',async({page})=>{
  const flow:FlowDefinition={entryNodeId:'step-1',nodes:Array.from({length:5},(_,i)=>({id:`step-${i+1}`,kind:i===4?'result':'action',title:`Плановый этап ${i+1}`,description:'Проверяемый этап плановой схемы.',owner:'agent'})),edges:Array.from({length:4},(_,i)=>({id:`edge-${i+1}`,source:`step-${i+1}`,target:`step-${i+2}`,label:'Следующий этап'}))};
  const project=await graphProject(page,1,flow);
  try{
    const spec=project.state.specs[0];await page.goto(`/projects/${project.id}?view=spec&spec=${spec.id}`);
    const detail=page.getByRole('region',{name:'Выбранная задача',exact:true});
    await detail.getByRole('navigation',{name:'Разделы спецификации',exact:true}).getByRole('button',{name:'Процесс',exact:true}).click();
    await detail.getByRole('button',{name:'План',exact:true}).click();
    const graph=detail.locator('.process-canvas');await expect(graph.locator('.react-flow__node')).toHaveCount(5);
    const fitted=()=>graph.evaluate(element=>{const outer=element.getBoundingClientRect();return Array.from(element.querySelectorAll('.react-flow__node')).every(node=>{const box=node.getBoundingClientRect();return getComputedStyle(node).visibility==='visible'&&box.left>=outer.left-2&&box.right<=outer.right+2&&box.top>=outer.top-2&&box.bottom<=outer.bottom+2;});});
    await expect.poll(fitted).toBe(true);
    await graph.locator('.react-flow__node[data-id="step-1"]').click();
    await expect(detail.getByRole('region',{name:'Выбранный узел',exact:true})).toContainText('Плановый этап 1');
    const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname===scope(project.id)&&response.request().method()==='GET');
    await page.getByRole('button',{name:'Обновить проект',exact:true}).click();await refreshed;await settleGraphFrame(page);
    await expect.poll(fitted).toBe(true);
  }finally{await cleanupGraphProject(page,project);}
});
