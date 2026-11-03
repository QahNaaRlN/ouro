import {test,expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AgentProposal,Execution,ProjectState,RevisionContent} from '../packages/core/src';
import {chooseSelectOption} from './select-helpers';

type Project={id:string;name:string};
type Registration={agent:{id:string};token:string};
const scope=(id:string)=>`/api/projects/${encodeURIComponent(id)}`;
const content=(title:string):RevisionContent=>({title,goal:'Проверить предложения выбранной спеки, ревизии и попытки по сохранённым источникам.',dod:[{id:'source',text:'Человек проверил первичные источники предложения.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});
async function snapshot(page:Page,project:Project):Promise<{state:ProjectState;cursor:number}>{
  const response=await page.request.get(scope(project.id));expect(response.ok(),await response.text()).toBe(true);return response.json();
}
async function human(page:Page,project:Project,body:Record<string,unknown>){
  const response=await page.request.post(`${scope(project.id)}/commands`,{data:{...body,requestId:crypto.randomUUID(),expectedVersion:(await snapshot(page,project)).cursor}});
  expect(response.ok(),await response.text()).toBe(true);return (await response.json()).state as ProjectState;
}
async function assign(page:Page,project:Project,registration:Registration,title:string){
  const response=await page.request.post(`${scope(project.id)}/tasks`,{data:{requestId:crypto.randomUUID(),expectedVersion:(await snapshot(page,project)).cursor,agentId:registration.agent.id,content:content(title)}});
  expect(response.ok(),await response.text()).toBe(true);return ((await response.json()).state as ProjectState).executions.at(-1)!;
}
const selected=(page:Page)=>page.getByRole('region',{name:'Выбранная задача',exact:true});
const proposals=(page:Page)=>selected(page).getByRole('region',{name:'Предложения выбранной ревизии и попытки',exact:true});
async function specTab(page:Page){await selected(page).getByRole('navigation',{name:'Разделы спецификации',exact:true}).getByRole('button',{name:/^Предложения/}).click();}
async function expectProposals(page:Page,titles:string[],pending:number){
  const panel=proposals(page);await expect(panel.getByRole('heading',{name:'Предложения спеки',exact:true})).toBeVisible();
  await expect(panel).toContainText(`Всего ${titles.length} · ожидают рассмотрения ${pending}`);
  await expect(panel.getByRole('button')).toHaveCount(titles.length);
  for(const title of titles)await expect(panel.getByRole('button',{name:title,exact:true})).toBeVisible();
  await expect(selected(page).getByRole('navigation',{name:'Разделы спецификации',exact:true}).getByRole('button',{name:/^Предложения/})).toHaveText(new RegExp(`^Предложения\\s*${titles.length}$`));
}

test('SP21 spec proposal links use exact revision/attempt scope, update through SSE and reuse the unchanged full review draft',async({page,baseURL})=>{
  test.setTimeout(150000);page.setDefaultTimeout(15000);
  const rootPath=await mkdtemp(join(tmpdir(),'ouro-spec-proposals-review-'));let project:Project|undefined,registration:Registration|undefined,client:Client|undefined;
  try{
    await page.request.get('/api/session');
    const created=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),name:`Предложения спеки ${crypto.randomUUID().slice(0,8)}`,rootPath}});
    expect(created.ok(),await created.text()).toBe(true);project=(await created.json()).project as Project;
    const issued=await page.request.post(`${scope(project.id)}/agents`,{data:{name:'Совместимый MCP-клиент · предложения спеки'}});expect(issued.ok()).toBe(true);registration=await issued.json() as Registration;
    const a1=await assign(page,project,registration,'Спека с несколькими попытками'),b=await assign(page,project,registration,'Другая спека предложений');
    client=new Client({name:'ouro-spec-proposals-review-sdk',version:'1'});
    await client.connect(new StreamableHTTPClientTransport(new URL(`${scope(project.id)}/mcp`,baseURL),{requestInit:{headers:{Authorization:`Bearer ${registration.token}`}}}));
    const call=async(execution:Execution,name:string,args:Record<string,unknown>={})=>{
      const result=await client!.callTool({name,arguments:{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:(await snapshot(page,project!)).cursor,...args}});
      expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);
    };
    const begin=async(execution:Execution)=>{
      await call(execution,'ouro.confirm_started');
      await call(execution,'ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:`Первичный источник ${execution.id}`,context:'Назначенный агент фиксирует источник для проверки навигации и области предложений.',evidence:`test://spec-proposals/${execution.id}`});
    };
    const submit=async(execution:Execution,title:string,kind:'spec_proposal'|'reality_summary'='spec_proposal'):Promise<AgentProposal>=>{
      const before=await snapshot(page,project!),source=before.state.events.findLast(event=>event.executionId===execution.id&&event.type==='ActionReported')!;
      await call(execution,'ouro.submit_proposal',{sourceCursor:before.cursor,content:{kind,title,findings:[{text:'Сохранён первичный источник этой попытки.',sourceEventIds:[source.id]}],interpretation:'Предложение следующего шага, которое должен рассмотреть человек.',limitations:'Проверка интерфейса и области данных; внешний LLM не запускался.',...(kind==='spec_proposal'?{draft:content(`Черновик · ${title}`)}:{})}});
      return (await snapshot(page,project!)).state.agentProposals.at(-1)!;
    };
    const finish=async(execution:Execution)=>call(execution,'ouro.complete_execution',{result:'succeeded',evidence:'Тестовая попытка предъявила результат; человеческая приёмка не создаётся.'});
    await begin(a1);const first=await submit(a1,'Предложение первой попытки','reality_summary');
    await human(page,project,{type:'reviewAgentProposal',proposalId:first.id,proposalRevisionId:first.latestRevisionId,outcome:'reviewed',comment:'Источники просмотрены без создания или принятия новой спеки.'});await finish(a1);
    let state=await human(page,project,{type:'startExecution',specId:a1.specId,specRevisionId:a1.specRevisionId,agentId:registration.agent.id}),a2=state.executions.at(-1)!;
    await begin(a2);await submit(a2,'Первое предложение второй попытки');await submit(a2,'Второе предложение второй попытки');await finish(a2);
    state=await human(page,project,{type:'proposeRevision',specId:a1.specId,content:content('Спека с новой активной ревизией')});const revision2=state.revisions.findLast(revision=>revision.specId===a1.specId)!;
    await human(page,project,{type:'activateRevision',specId:a1.specId,revisionId:revision2.id});
    state=await human(page,project,{type:'startExecution',specId:a1.specId,specRevisionId:revision2.id,agentId:registration.agent.id});const a3=state.executions.at(-1)!;
    await begin(a3);const current=await submit(a3,'Предложение активной ревизии');await begin(b);await submit(b,'Предложение чужой спеки');
    const beforeRead=await snapshot(page,project),humanId=beforeRead.state.specs.find(spec=>spec.id===a1.specId)!.humanId;
    await page.goto(`/projects/${project.id}`);await expect(page.getByText('Обновления активны',{exact:true})).toBeVisible();
    const openFromGraph=page.getByRole('button',{name:`Предложения спеки ${humanId}`,exact:true});await expect(openFromGraph).toContainText('1');await openFromGraph.click();
    await expect(page).toHaveURL(new RegExp(`spec=${a1.specId}`));await expect(page).toHaveURL(/execution=all/);await expect(page).toHaveURL(/tab=proposals/);
    await expectProposals(page,['Предложение активной ревизии'],1);await expect(proposals(page)).not.toContainText('Предложение чужой спеки');await expect(proposals(page)).not.toContainText('Предложение первой попытки');
    await chooseSelectOption(selected(page).getByRole('combobox',{name:'Ревизия задачи',exact:true}),a1.specRevisionId);await specTab(page);
    await chooseSelectOption(selected(page).getByRole('combobox',{name:'Попытка задачи',exact:true}),'all');await expectProposals(page,['Предложение первой попытки','Первое предложение второй попытки','Второе предложение второй попытки'],2);
    await chooseSelectOption(selected(page).getByRole('combobox',{name:'Попытка задачи',exact:true}),a1.id);await expectProposals(page,['Предложение первой попытки'],0);
    await chooseSelectOption(selected(page).getByRole('combobox',{name:'Попытка задачи',exact:true}),a2.id);await expectProposals(page,['Первое предложение второй попытки','Второе предложение второй попытки'],2);
    expect((await snapshot(page,project)).state.events).toEqual(beforeRead.state.events);
    await page.goto(`/projects/${project.id}?view=spec&spec=${a1.specId}&revision=${revision2.id}&execution=${a1.id}&tab=proposals`);
    await expect(proposals(page).getByRole('heading',{name:'Предложения спеки',exact:true})).toBeVisible();await expect(proposals(page).getByRole('button')).toHaveCount(0);await expect(proposals(page)).not.toContainText('Предложение активной ревизии');
    await page.goto(`/projects/${project.id}?view=spec&spec=${a1.specId}&revision=${revision2.id}&execution=all&tab=proposals`);await expectProposals(page,['Предложение активной ревизии'],1);
    const documentMarker=await page.evaluate(()=>{const marker=crypto.randomUUID();(window as Window&{__ouroSpecProposalDocument?:string}).__ouroSpecProposalDocument=marker;return marker;});
    await proposals(page).getByRole('button',{name:'Предложение активной ревизии',exact:true}).click();
    const card=page.getByRole('article',{name:'Предложение: Предложение активной ревизии',exact:true}),review=card.getByRole('form',{name:'Рассмотрение предложения Предложение активной ревизии',exact:true}),title=review.getByRole('textbox',{name:'Название новой спеки',exact:true});
    await expect(card).toBeVisible();const draft='Мой сохранённый черновик из ссылки спеки';await title.fill(draft);
    await page.getByRole('navigation',{name:'Разделы проекта',exact:true}).getByRole('button',{name:/^Дорожная карта/}).click();await openFromGraph.click();await expectProposals(page,['Предложение активной ревизии'],1);
    await submit(a3,'Новое предложение по SSE');await expectProposals(page,['Предложение активной ревизии','Новое предложение по SSE'],2);
    const afterSse=await snapshot(page,project);
    await proposals(page).getByRole('button',{name:'Предложение активной ревизии',exact:true}).click();await expect(title).toHaveValue(draft);
    await expect(page.locator(`article.ws-proposal[data-proposal-id="${current.id}"]`)).toHaveCount(1);await expect(review).toContainText('Появились новые события или версия предложения. Ваш текст сохранён');
    await page.getByRole('navigation',{name:'Разделы проекта',exact:true}).getByRole('button',{name:/^Дорожная карта/}).click();await expect(openFromGraph).toContainText('2');
    expect(await page.evaluate(()=>(window as Window&{__ouroSpecProposalDocument?:string}).__ouroSpecProposalDocument)).toBe(documentMarker);
    const afterRead=await snapshot(page,project);expect(afterRead.cursor).toBe(afterSse.cursor);expect(afterRead.state.events).toEqual(afterSse.state.events);expect(afterRead.state.agentProposals.find(proposal=>proposal.id===current.id)?.state).toBe('pending');expect(afterRead.state.specs).toHaveLength(2);expect(afterRead.state.events.some(event=>event.type==='SpecAccepted')).toBe(false);
  }finally{
    if(client)await Promise.race([client.close().catch(()=>{}),new Promise<void>(resolve=>{const timer=setTimeout(resolve,2000);timer.unref();})]);
    if(project&&registration)await page.request.post(`${scope(project.id)}/agents/${registration.agent.id}/revoke`,{data:{},timeout:3000}).catch(()=>{});
    await rm(rootPath,{recursive:true,force:true});
  }
});
