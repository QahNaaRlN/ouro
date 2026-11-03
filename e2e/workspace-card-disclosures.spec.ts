import {test,expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Execution,FlowDefinition,ProjectState,RevisionContent} from '../packages/core/src';
import {chooseSelectOption} from './select-helpers';

const flow:FlowDefinition={entryNodeId:'work',nodes:[{id:'work',kind:'action',title:'Проверить назначенное ожидание',description:'Сохранённый план, не факт исполнения.',owner:'agent'},{id:'result',kind:'result',title:'Предъявить результат',description:'Приёмка остаётся отдельной.',owner:'agent'}],edges:[{id:'work-result',source:'work',target:'result',label:'Результат предъявлен'}]};
const content=(title:string):RevisionContent=>({title,goal:'Проверить фактическое время карточки и раскрытия без потери состояния.',dod:[{id:'checked',text:'Человек проверил результат.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',flow});
const scope=(id:string)=>`/api/projects/${encodeURIComponent(id)}`;
async function state(page:Page,url='/api/project'):Promise<ProjectState>{const response=await page.request.get(url);expect(response.ok(),await response.text()).toBe(true);return(await response.json()).state;}
async function human(page:Page,url:string,body:Record<string,unknown>,readUrl:string){const current=await state(page,readUrl),response=await page.request.post(url,{data:{...body,requestId:crypto.randomUUID(),expectedVersion:current.version}});expect(response.ok(),await response.text()).toBe(true);return(await response.json()).state as ProjectState;}
async function sdk(page:Page,baseURL:string,url:string,token:string,execution:Execution,readUrl:string){
  const client=new Client({name:'ouro-card-disclosures-e2e',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(url,baseURL),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  const call=async(name:string,args:Record<string,unknown>={})=>{const result=await client.callTool({name,arguments:{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:(await state(page,readUrl)).version,...args}});expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);return result;};
  return{client,call};
}
async function closeSdk(connection:Awaited<ReturnType<typeof sdk>>|undefined){if(connection)await Promise.race([connection.client.close().catch(()=>{}),new Promise<void>(resolve=>{const timer=setTimeout(resolve,2000);timer.unref();})]);}

test('CD01 first showing the hidden roadmap displays the actual event timestamp and SSE preserves the chosen viewport',async({page,baseURL})=>{
  await page.request.get('/api/session');const folder=await mkdtemp(join(tmpdir(),'ouro-card-time-'));let projectId='',agentId='',connection:Awaited<ReturnType<typeof sdk>>|undefined;
  try{
    const created=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),name:`Card timestamps ${crypto.randomUUID()}`,rootPath:folder}});expect(created.ok(),await created.text()).toBe(true);projectId=(await created.json()).project.id;
    const registered=await page.request.post(`${scope(projectId)}/agents`,{data:{name:'Card timestamp agent'}});expect(registered.ok()).toBe(true);const registration=await registered.json();agentId=registration.agent.id;
    const before=await state(page,scope(projectId)),assigned=await page.request.post(`${scope(projectId)}/tasks`,{data:{requestId:crypto.randomUUID(),expectedVersion:before.version,agentId,content:content('Фактическое обновление карточки')}});expect(assigned.ok(),await assigned.text()).toBe(true);
    const initial=(await assigned.json()).state as ProjectState,spec=initial.specs.at(-1)!,execution=initial.executions.at(-1)!,last=initial.events.findLast(event=>event.specId===spec.id)!;
    await page.goto(`/projects/${projectId}?view=agents`);
    await page.getByRole('navigation',{name:'Разделы проекта',exact:true}).getByRole('button',{name:'Дорожная карта',exact:true}).click();
    const graph=page.locator('.workspace-roadmap'),card=graph.locator(`.react-flow__node[data-id="${spec.id}"]`),time=card.locator('time');
    await expect(time).toBeVisible();await expect(time).toHaveAttribute('datetime',last.occurredAt);
    await expect.poll(()=>card.evaluate(node=>{const box=node.getBoundingClientRect(),graph=node.closest('.workspace-roadmap')!.getBoundingClientRect(),time=node.querySelector('time')!.getBoundingClientRect();return box.left>=graph.left-2&&box.right<=graph.right+2&&box.top>=graph.top-2&&box.bottom<=graph.bottom+2&&time.bottom<=box.bottom&&time.right<=box.right;})).toBe(true);
    await graph.getByRole('button',{name:'Приблизить',exact:true}).click();const viewport=graph.locator('.react-flow__viewport'),transform=await viewport.getAttribute('style');
    connection=await sdk(page,baseURL!,`${scope(projectId)}/mcp`,registration.token,execution,scope(projectId));await connection.call('ouro.confirm_started');
    const updated=(await state(page,scope(projectId))).events.findLast(event=>event.specId===spec.id)!;
    expect(updated.id).not.toBe(last.id);await expect(time).toHaveAttribute('datetime',updated.occurredAt);await expect(viewport).toHaveAttribute('style',transform!);
  }finally{await closeSdk(connection);if(projectId&&agentId)await page.request.post(`${scope(projectId)}/agents/${agentId}/revoke`,{data:{},timeout:3000}).catch(()=>{});await rm(folder,{recursive:true,force:true});}
});

test('CD02 legacy Flow disclosures support keyboard/default-open, retain drafts and survive incoming facts under reduced motion',async({page,baseURL})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.request.get('/api/session');let agentId='',connection:Awaited<ReturnType<typeof sdk>>|undefined;
  try{
    let current=await human(page,'/api/commands',{type:'createSpec',content:content(`Legacy disclosure ${crypto.randomUUID()}`)},'/api/project');const spec=current.specs.at(-1)!,revision=current.revisions.at(-1)!;
    await human(page,'/api/commands',{type:'activateRevision',specId:spec.id,revisionId:revision.id},'/api/project');
    const registration=await page.request.post('/api/agents',{data:{name:`Disclosure agent ${crypto.randomUUID()}`}});expect(registration.ok()).toBe(true);const registered=await registration.json();agentId=registered.agent.id;
    // An unbound fact belongs to a real legacy attempt. Strict reports always
    // bind to a started run; they cannot manufacture this legacy empty binding.
    current=await human(page,'/api/commands',{type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId},'/api/project');const legacyExecution=current.executions.at(-1)!;
    connection=await sdk(page,baseURL!,'/api/mcp',registered.token,legacyExecution,'/api/project');await connection.call('ouro.confirm_started');
    await connection.call('ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:'Факт без привязки к узлу',context:'Реальный сохранённый отчёт для проверки раскрытия.',evidence:'test://card-disclosures/unbound'});
    await connection.call('ouro.complete_execution',{result:'succeeded',evidence:'test://card-disclosures/legacy-result'});await closeSdk(connection);connection=undefined;
    current=await human(page,'/api/commands',{type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId,flowTracking:'enforced'},'/api/project');const execution=current.executions.at(-1)!;
    connection=await sdk(page,baseURL!,'/api/mcp',registered.token,execution,'/api/project');await connection.call('ouro.confirm_started');
    await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
    const legacyCard=page.locator(`.workspace-roadmap .react-flow__node[data-id="${spec.id}"]`);await expect(legacyCard.locator('time')).toBeVisible();
    await expect.poll(()=>legacyCard.evaluate(node=>{const measured=node.getBoundingClientRect(),card=node.querySelector('.spec-node')!.getBoundingClientRect();return Math.abs(measured.height-card.height)<1&&Array.from(node.querySelectorAll('.node-bottom,.node-attention,.node-proposals,.node-updated')).every(child=>{const r=child.getBoundingClientRect();return r.left>=card.left-1&&r.right<=card.right+1&&r.top>=card.top-1&&r.bottom<=card.bottom+1;});}),{message:'Legacy graph measurement must include the full status, counts and timestamp.'}).toBe(true);
    await page.getByRole('button',{name:'Спецификации',exact:true}).click();await chooseSelectOption(page.getByLabel('Выбрать спецификацию',{exact:true}),spec.id);await page.getByRole('button',{name:'Процесс',exact:true}).click();
    const panel=page.getByRole('region',{name:'Процесс спецификации',exact:true});await panel.getByRole('button',{name:'Таблица',exact:true}).click();await panel.getByRole('button',{name:`Открыть узел ${flow.nodes[0].title}`,exact:true}).click();
    const history=panel.locator('.flow-run-history'),historyTrigger=history.locator(':scope > .ws-accordion-trigger');await expect(historyTrigger).toHaveAttribute('aria-expanded','true');
    const source=history.getByRole('button',{name:'Исходная запись',exact:true}).first();await source.focus();await source.press('Enter');await expect(source).toHaveAttribute('aria-expanded','true');await source.press('Space');await expect(source).toHaveAttribute('aria-expanded','false');
    const beforeToggle=await state(page);await historyTrigger.focus();await historyTrigger.press('Space');await expect(historyTrigger).toHaveAttribute('aria-expanded','false');await expect(history.locator(':scope > .ws-accordion-grid')).toHaveAttribute('inert','');
    expect((await state(page)).version).toBe(beforeToggle.version);
    const run=execution.flowRuntime!.runs.find(run=>run.id===execution.flowRuntime!.currentRunId)!;await connection.call('ouro.report_flow_step',{runId:run.id,phase:'start'});await expect(historyTrigger).toHaveAttribute('aria-expanded','false');await historyTrigger.press('Enter');await expect(historyTrigger).toHaveAttribute('aria-expanded','true');
    await chooseSelectOption(panel.getByLabel('Попытка процесса',{exact:true}),legacyExecution.id);
    await panel.getByRole('button',{name:'Предложить изменение схемы',exact:true}).click();const draft=panel.getByLabel('Название нового узла',{exact:true});await draft.fill('Несохранённый шаг после раскрытия');
    await connection.call('ouro.report_action',{flowStepRunId:run.id,flowNodeId:run.nodeId,actionId:crypto.randomUUID(),phase:'completed',title:'Новый факт при открытом черновике',context:'SSE не сбрасывает локальные поля.',evidence:'test://card-disclosures/draft-kept'});await expect(panel.getByText(/После начала редактирования появились изменения/)).toBeVisible();await expect(draft).toHaveValue('Несохранённый шаг после раскрытия');
    const facts=panel.getByRole('button',{name:/^Факты без привязки к узлам/});await expect(facts).toHaveAttribute('aria-expanded','false');await facts.focus();await facts.press('Enter');await expect(facts).toHaveAttribute('aria-expanded','true');await expect(panel.getByText(/Факт без привязки к узлу/).last()).toBeVisible();await facts.press('Space');await expect(draft).toHaveValue('Несохранённый шаг после раскрытия');
    const transitionLayer=facts.locator('xpath=..').locator(':scope > .ws-accordion-grid');await expect(transitionLayer).toHaveCount(1);await expect(transitionLayer).toHaveCSS('transition-duration','0s');
    await expect(page.locator('details')).toHaveCount(0);
  }finally{await closeSdk(connection);if(agentId)await page.request.post(`/api/agents/${agentId}/revoke`,{data:{},timeout:3000}).catch(()=>{});}
});
