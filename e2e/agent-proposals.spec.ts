import {test,expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import type {AgentProposalContent,ProjectState} from '../packages/core/src';
import packageInfo from '../package.json';
const content=(title:string)=>({title,goal:'Проверить осмысленное ожидание по первичным фактам.',dod:[{id:'proof',text:'Человек проверил результат',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});
async function state(page:Page):Promise<ProjectState>{return (await(await page.request.get('/api/project')).json()).state;}
async function human(page:Page,payload:Record<string,unknown>){const response=await page.request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:(await state(page)).version}});expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state as ProjectState;}
async function fixture(page:Page,baseURL:string,kind:'reality_summary'|'spec_proposal'='spec_proposal'){
 await page.request.get('/api/session');
 const registered=await page.request.post('/api/agents',{data:{name:`Proposal browser agent ${Date.now()}`}});expect(registered.ok(),await registered.text()).toBeTruthy();const {agent,token}=await registered.json();
 let current=await human(page,{type:'createSpec',content:content(`Первичные факты ${Date.now()}`)}),spec=current.specs.at(-1)!,revision=current.revisions.at(-1)!;
 await human(page,{type:'activateRevision',specId:spec.id,revisionId:revision.id});current=await human(page,{type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.id});const execution=current.executions.at(-1)!;
 const client=new Client({name:'ouro-proposal-browser-fixture',version:'1'}),url=new URL('/api/mcp',baseURL);
 await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
 const invoke=async(name:string,extra:Record<string,unknown>={})=>{
  const result=await client.callTool({name,arguments:{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:(await state(page)).version,...extra}});expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);return result.structuredContent as any;
 };
 expect((await client.listTools()).tools.map(t=>t.name)).toContain('ouro.submit_proposal');
 await invoke('ouro.confirm_started');const action=await invoke('ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:'Наблюдение из настоящего SDK',context:'Это protocol fixture, а не вызов модели.',evidence:'fixture://proposal/browser-observation'}),sourceId=action.events[0].id;
 const title=`Предложение SDK ${Date.now()} ${crypto.randomUUID().slice(0,5)}`;
 const summary={title,findings:[{text:'Назначенный агент предъявил источник.',sourceEventIds:[sourceId]}],interpretation:'Имеет смысл проверить следующее ожидание.',limitations:'Семантическую корректность оценивает человек.'};
 const flow={entryNodeId:'begin',nodes:[{id:'begin',kind:'action' as const,title:'Проверить новый контракт',description:'Ограниченное проверяемое действие.',owner:'agent' as const},{id:'result',kind:'result' as const,title:'Предъявить результат',description:'Приёмка DoD отдельно.',owner:'agent' as const}],edges:[{id:'begin-result',source:'begin',target:'result',label:'Есть evidence'}]};
 const proposalContent:AgentProposalContent=kind==='spec_proposal'?{...summary,kind,draft:{...content('Черновик из предложения'),flow}}:{...summary,kind};
 const submitted=await invoke('ouro.submit_proposal',{sourceCursor:(await state(page)).version,content:proposalContent}),proposal=submitted.proposals.at(-1),proposalRevision=submitted.proposalRevisions.find((r:any)=>r.id===proposal.latestRevisionId);
 const open=async()=>{await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();await page.getByRole('button',{name:'Предложения агента',exact:true}).click({timeout:12000});await page.getByRole('button',{name:`Открыть предложение ${title}`,exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();};
 return {client,invoke,proposal,proposalRevision,proposalContent,title,spec,revision,execution,sourceId,agent,token,url,flow,open};
}

test('P06/P07 real HTTP and stdio proposals show sources and human adoption retries one exact draft after a lost response',async({page,baseURL})=>{
 test.setTimeout(90000);const f=await fixture(page,baseURL!);const stdio=new Client({name:'ouro-proposal-stdio-fixture',version:'1'});
 try{
  await f.open();const panel=page.getByRole('region',{name:'Предложение агента',exact:true});
  await expect(panel).toContainText(f.sourceId);await expect(panel).toContainText(f.execution.id);await expect(panel).toContainText('Наблюдение из настоящего SDK');
  await expect(panel).toContainText('Смысл вывода проверяет человек');
  await expect(page.getByRole('region',{name:'Схема предлагаемого черновика',exact:true})).toContainText('фактов исполнения нет');
  const form=page.getByRole('form',{name:'Рассмотрение предложения'}),title=form.getByRole('textbox',{name:'Название новой спеки',exact:true});
  const adoptedTitle=`Отредактировано человеком ${Date.now()}`;await title.fill(adoptedTitle);await form.getByRole('textbox',{name:'Комментарий агенту',exact:true}).fill('Прочитал источники, уточнил ожидание.');
  let requestId='',lost=true;await page.route('**/api/commands',async route=>{
   const body=route.request().postDataJSON();if(body.type!=='adoptAgentSpecProposal'){await route.continue();return;}
   if(!requestId)requestId=body.requestId;expect(body.requestId).toBe(requestId);
   if(lost){lost=false;const response=await route.fetch();expect(response.ok()).toBeTruthy();await route.abort('failed');}else await route.continue();
  });
  await form.getByRole('button',{name:'Создать черновик спеки',exact:true}).click();
  await expect(form).toContainText('Результат записи неизвестен');await expect(title).toHaveJSProperty('readOnly',true);
  await expect(form.getByRole('button',{name:'Обновить основу, сохранив мой текст',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'История',exact:true}).click();await page.getByRole('button',{name:'Предложения агента',exact:true}).click();await page.getByRole('button',{name:`Открыть предложение ${f.title}`,exact:true}).click();
  await expect(form).toContainText('Результат записи неизвестен');await expect(title).toHaveValue(adoptedTitle);await expect(title).toHaveJSProperty('readOnly',true);
  await human(page,{type:'createSpec',content:content(`Другая более новая спека ${Date.now()}`)});
  await form.getByRole('button',{name:'Повторить сохранение',exact:true}).click();
  await expect(page.getByRole('heading',{name:adoptedTitle,exact:true})).toBeVisible();
  const current=await state(page),drafts=current.specs.filter(s=>s.origin?.kind==='agent_proposal'&&s.origin.proposalId===f.proposal.id);expect(drafts).toHaveLength(1);
  const draft=drafts[0];expect(draft.activeRevisionId).toBeNull();expect(draft.state).toBe('idea');expect(await page.getByLabel('Выбрать спецификацию',{exact:true}).inputValue()).toBe(draft.id);
  expect(current.revisions.find(r=>r.id===draft.revisionIds[0])!.flow).toEqual(f.flow);
  await expect(page.getByRole('region',{name:'Происхождение предложения агента'})).toContainText('v1');
  const updates=await f.client.callTool({name:'ouro.get_updates',arguments:{afterCursor:f.proposalRevision.sourceCursor}});expect(JSON.stringify(updates.structuredContent)).not.toContain(adoptedTitle);
  await stdio.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/mcp/bin/ouro-mcp.mjs')],env:{PATH:process.env.PATH??'',OURO_URL:f.url.href,OURO_AGENT_TOKEN:f.token},stderr:'pipe'}));
  expect(f.client.getServerVersion()?.version).toBe(packageInfo.version);expect(stdio.getServerVersion()?.version).toBe(packageInfo.version);
  expect((await stdio.listTools()).tools.map(t=>t.name)).toContain('ouro.submit_proposal');
  const summary={kind:'reality_summary',title:'Сводка через настоящий stdio',findings:[{text:'Есть первичный источник.',sourceEventIds:[f.sourceId]}],interpretation:'Интерпретация внешнего клиента.',limitations:'Это тест протокола, не качества модели.'};
  const before=await state(page),saved=await stdio.callTool({name:'ouro.submit_proposal',arguments:{executionId:f.execution.id,requestId:crypto.randomUUID(),expectedVersion:before.version,sourceCursor:before.version,content:summary}});expect(saved.isError,JSON.stringify(saved.structuredContent)).not.toBe(true);
  await page.getByRole('button',{name:'Прочитать предложение и источники',exact:true}).click();await expect(page.getByRole('heading',{name:f.title,exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Версия предложения',exact:true})).toHaveValue(f.proposalRevision.id);
 }finally{await stdio.close();await f.client.close();}
});

test('P07 a pinned adoption draft keeps focus during agent r2 and requires explicit basis review',async({page,baseURL})=>{
 const f=await fixture(page,baseURL!);try{
  await f.open();const form=page.getByRole('form',{name:'Рассмотрение предложения'}),goal=form.getByRole('textbox',{name:'Цель новой спеки',exact:true});
  const edited='Моя уточнённая цель остаётся при внешней новой версии.';await goal.fill(edited);await goal.focus();await goal.evaluate((element:HTMLTextAreaElement)=>element.setSelectionRange(4,14));
  const revised={...f.proposalContent,title:f.title,interpretation:'Агент добавил новое объяснение.'};await f.invoke('ouro.submit_proposal',{sourceCursor:(await state(page)).version,content:revised,proposalId:f.proposal.id,baseProposalRevisionId:f.proposalRevision.id});
  await expect(form).toContainText('Агент предложил новую версию');await expect(goal).toHaveValue(edited);await expect(goal).toBeFocused();expect(await goal.evaluate((element:HTMLTextAreaElement)=>[element.selectionStart,element.selectionEnd])).toEqual([4,14]);
  await expect(form.getByRole('button',{name:'Создать черновик спеки',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Прочитать новую версию',exact:true}).click();await expect(page.getByRole('region',{name:'Предложение агента',exact:true})).toContainText('Агент добавил новое объяснение.');
  await form.getByRole('button',{name:'Обновить основу, сохранив мой текст',exact:true}).click();await expect(goal).toHaveValue(edited);
  await form.getByRole('textbox',{name:'Комментарий агенту',exact:true}).fill('Новая версия прочитана; сохраняю свой текст.');await form.getByRole('button',{name:'Создать черновик спеки',exact:true}).click();
  const current=await state(page),draft=current.specs.find(s=>s.origin?.kind==='agent_proposal'&&s.origin.proposalId===f.proposal.id)!;expect(draft).toBeTruthy();expect(current.revisions.find(r=>r.id===draft.revisionIds[0])!.goal).toBe(edited);if(draft.origin?.kind!=='agent_proposal')throw new Error('Нет точного происхождения предложения');expect(draft.origin.proposalRevisionId).not.toBe(f.proposalRevision.id);
 }finally{await f.client.close();}
});

test('P07 retry proves an uncommitted uncertain save before permitting an explicit new basis',async({page,baseURL})=>{
 const f=await fixture(page,baseURL!);try{
  await f.open();const form=page.getByRole('form',{name:'Рассмотрение предложения'}),title=form.getByRole('textbox',{name:'Название новой спеки',exact:true});await title.fill(`Незаписанный запрос ${Date.now()}`);await form.getByRole('textbox',{name:'Комментарий агенту',exact:true}).fill('Нужно сохранить ровно одно новое ожидание.');
  let dropped=true;const ids:string[]=[];await page.route('**/api/commands',async route=>{const body=route.request().postDataJSON();if(body.type!=='adoptAgentSpecProposal'){await route.continue();return;}ids.push(body.requestId);if(dropped){dropped=false;await route.abort('failed');}else await route.continue();});
  await form.getByRole('button',{name:'Создать черновик спеки',exact:true}).click();await expect(form).toContainText('Результат записи неизвестен');await expect(title).toHaveJSProperty('readOnly',true);
  const newer=await human(page,{type:'createSpec',content:content('Новое независимое событие после недоставленного запроса')});await expect(page.locator('footer')).toContainText(`cursor ${newer.version}`);
  await form.getByRole('button',{name:'Повторить сохранение',exact:true}).click();await expect(form.getByRole('alert')).toContainText('Состояние изменилось');expect(ids[1]).toBe(ids[0]);await expect(title).toHaveJSProperty('readOnly',false);
  await form.getByRole('button',{name:'Обновить основу, сохранив мой текст',exact:true}).click();await form.getByRole('button',{name:'Создать черновик спеки',exact:true}).click();await expect(page.getByRole('region',{name:'Происхождение предложения агента'})).toBeVisible();
  const current=await state(page);expect(current.specs.filter(s=>s.origin?.kind==='agent_proposal'&&s.origin.proposalId===f.proposal.id)).toHaveLength(1);expect(ids[2]).not.toBe(ids[0]);
 }finally{await f.client.close();}
});

test('P07 light mobile summary review is attributed and never creates a Lesson, DoD or draft spec',async({page,baseURL})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const f=await fixture(page,baseURL!,'reality_summary');try{
  await f.open();await page.getByRole('button',{name:'Включить светлую тему'}).click();await page.setViewportSize({width:390,height:844});
  const before=await state(page),form=page.getByRole('form',{name:'Рассмотрение предложения'});await form.getByRole('textbox',{name:'Комментарий агенту',exact:true}).fill('Прочитал первичные источники и ограничения.');
  await form.getByRole('button',{name:'Отметить рассмотренным',exact:true}).click();await expect(page.getByRole('region',{name:'Предложение агента',exact:true})).toContainText('Рассмотрено человеком');
  const current=await state(page);expect(current.specs.length).toBe(before.specs.length);expect(current.agentProposals.find(p=>p.id===f.proposal.id)!.state).toBe('reviewed');expect(current.executions.find(e=>e.id===f.execution.id)!.state).toBe('running');expect(current.specs.find(s=>s.id===f.spec.id)!.acceptance).toBeUndefined();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(errors).toEqual([]);
 }finally{await f.client.close();}
});
