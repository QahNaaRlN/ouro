import {test,expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {FlowDefinition,ProjectState,RevisionContent} from '../packages/core/src';

type Project={id:string;name:string};
type Registration={agent:{id:string;projectId:string};token:string};
const scope=(id:string)=>`/api/projects/${encodeURIComponent(id)}`;
const content=(title:string):RevisionContent=>({title,goal:'Изучить назначенный контекст и предложить проверяемое улучшение.',dod:[{id:'analysis',text:'Анализ предъявлен с первичными источниками.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});
async function snapshot(page:Page,projectId:string):Promise<{state:ProjectState;cursor:number}>{
 const response=await page.request.get(scope(projectId));expect(response.ok(),await response.text()).toBe(true);return response.json();
}
async function registerProject(page:Page,name:string,rootPath:string):Promise<Project>{
 const response=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),name,rootPath}});expect(response.ok(),await response.text()).toBe(true);return(await response.json()).project;
}
async function catalog(page:Page){await page.getByRole('navigation',{name:'Навигация проектов',exact:true}).getByRole('link',{name:'Проекты',exact:true}).click();await expect(page.getByRole('heading',{name:'Проекты',exact:true})).toBeVisible();}
async function openProject(page:Page,project:Project){await page.locator(`a[href="/projects/${project.id}"]`).first().click();await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();await expect(page.getByText(/История обновляется/)).toBeVisible();}

test('PW09/PW10 a standard MCP proposal becomes a human-edited draft and exact roadmap Flow through the live project dashboard',async({page,baseURL})=>{
 test.setTimeout(120000);
 const folderA=await mkdtemp(join(tmpdir(),'ouro-proposal-dashboard-a-')),folderB=await mkdtemp(join(tmpdir(),'ouro-proposal-dashboard-b-'));
 await writeFile(join(folderA,'README.md'),'# Proposal acceptance fixture\nThis is an SDK integration check, not an LLM run.\n');
 let client:Client|undefined,projectA:Project|undefined,registration:Registration|undefined,executionId:string|undefined;
 try{
  await page.request.get('/api/session');
  const suffix=crypto.randomUUID().slice(0,8);
  projectA=await registerProject(page,`Предложение агента ${suffix}`,folderA);const projectB=await registerProject(page,`Изолированный проект ${suffix}`,folderB);
  const issued=await page.request.post(`${scope(projectA.id)}/agents`,{data:{name:'Любой совместимый MCP-клиент · proposal acceptance'}});expect(issued.ok()).toBe(true);registration=await issued.json() as Registration;
  const started=await page.request.post(`${scope(projectA.id)}/tasks`,{data:{requestId:crypto.randomUUID(),expectedVersion:(await snapshot(page,projectA.id)).cursor,agentId:registration.agent.id,content:content(`Исходная задача ${suffix}`)}});
  expect(started.ok(),await started.text()).toBe(true);const assignment=(await started.json()).state as ProjectState,execution=assignment.executions.at(-1)!;executionId=execution.id;
  expect(execution.state).toBe('queued');expect(assignment.events.some(event=>event.type==='ExecutionStarted')).toBe(false);
  await page.goto(`/projects/${projectA.id}`);await expect(page.getByRole('heading',{name:projectA.name,exact:true})).toBeVisible();await expect(page.getByText(/История обновляется/)).toBeVisible();
  const documentMarker=await page.evaluate(()=>{const marker=crypto.randomUUID();(window as Window&{__ouroProposalDocument?:string}).__ouroProposalDocument=marker;return marker;});
  client=new Client({name:'any-standard-mcp-proposal-client',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(`${scope(projectA.id)}/mcp`,baseURL),{requestInit:{headers:{Authorization:`Bearer ${registration.token}`}}}));
  const call=async(name:string,args:Record<string,unknown>={})=>{
   const result=await client!.callTool({name,arguments:{executionId,requestId:crypto.randomUUID(),expectedVersion:(await snapshot(page,projectA!.id)).cursor,...args}});
   expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);return result;
  };
  const inventory=await client.listTools();expect(inventory.tools.some(tool=>tool.name==='ouro.submit_proposal')).toBe(true);
  const context=await client.callTool({name:'ouro.get_context',arguments:{executionId}});expect(context.isError).not.toBe(true);expect((context.structuredContent as {project:{id:string}}).project.id).toBe(projectA.id);
  await call('ouro.confirm_started');
  const evidence=`test://project-proposal/${suffix}/source`,sourceTitle=`Первичный факт исследования ${suffix}`;
  const action=await call('ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:sourceTitle,context:'Официальный SDK сообщает тестовый первичный факт для проверки контрактов.',evidence});
  const source=(action.structuredContent as unknown as {events:ProjectState['events']}).events.find(event=>event.type==='ActionReported')!;expect(source).toBeTruthy();
  const flow:FlowDefinition={entryNodeId:'inspect',nodes:[
   {id:'inspect',kind:'action',title:`Изучить вход ${suffix}`,description:'Проверить исходное наблюдение.',owner:'agent'},
   {id:'choice',kind:'fork',title:`Выбор человека ${suffix}`,description:'Продолжить или уточнить вход.',owner:'human'},
   {id:'repair',kind:'action',title:`Уточнить вход ${suffix}`,description:'Вернуться с уточнёнными данными.',owner:'agent'},
   {id:'verify',kind:'action',title:`Ручная проверка ${suffix}`,description:'Человек отдельно подтверждает собственный шаг.',owner:'human'},
   {id:'result',kind:'result',title:`Предъявить итог ${suffix}`,description:'DoD принимает человек отдельно.',owner:'agent'},
  ],edges:[
   {id:'inspect-choice',source:'inspect',target:'choice',label:'Наблюдение проверено'},
   {id:'choice-verify',source:'choice',target:'verify',label:'Перейти к человеческой проверке',optionId:'finish'},
   {id:'choice-repair',source:'choice',target:'repair',label:'Уточнить данные',optionId:'repair'},
   {id:'repair-choice',source:'repair',target:'choice',label:'Повторить человеческий выбор'},
   {id:'verify-result',source:'verify',target:'result',label:'Ручная проверка предъявлена'},
  ]};
  const proposalTitle=`Следующая спека из источника ${suffix}`,finding=`Подтверждён первичный факт ${suffix}`,draft={...content(`Предложенное ожидание ${suffix}`),goal:'Создать ограниченный план с отдельным человеческим выбором.',flow};
  await call('ouro.submit_proposal',{sourceCursor:(await snapshot(page,projectA.id)).cursor,content:{kind:'spec_proposal',title:proposalTitle,findings:[{text:finding,sourceEventIds:[source.id]}],interpretation:'Это предложение следующего шага, а не подтверждённая приёмка.',limitations:'Проверка интерфейса и MCP-контракта; внешний LLM не запускался.',draft}});
  const panel=page.getByRole('region',{name:'Предложения агентов',exact:true}),card=panel.getByRole('article',{name:`Предложение: ${proposalTitle}`,exact:true});
  await expect(card).toBeVisible();await expect(card).toContainText(finding);await expect(card).toContainText('Интерпретация агента');await expect(card).toContainText('Ограничения вывода');
  const proposedFlow=card.getByRole('region',{name:'Предложенное ожидание',exact:true}).getByRole('region',{name:'Предложенная блок-схема',exact:true});
  await expect(proposedFlow.locator('.react-flow__node')).toHaveCount(flow.nodes.length);await expect(proposedFlow.locator('.react-flow__node[data-id="choice"]')).toContainText(`Выбор человека ${suffix}`);
  await card.locator('summary').filter({hasText:`Действие агента · v${source.version}`}).first().click();await expect(card).toContainText(source.id);await expect(card).toContainText(evidence);
  const proposalBefore=(await snapshot(page,projectA.id)).state.agentProposals.at(-1)!;
  const review=card.getByRole('form',{name:`Рассмотрение предложения ${proposalTitle}`,exact:true}),editedTitle=`Человеческий черновик ${suffix}`,humanComment=`Проверил первичный факт и уточнил ожидание ${suffix}.`;
  await review.getByLabel('Название новой спеки',{exact:true}).fill(editedTitle);await review.getByLabel('Комментарий агенту',{exact:true}).fill(humanComment);
  await review.getByRole('checkbox',{name:'Добавить связь происхождения с исходной спекой',exact:true}).check();
  const adopt=review.getByRole('button',{name:'Создать черновик спеки',exact:true});await expect(adopt).toBeEnabled();
  await call('ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:`Событие во время рассмотрения ${suffix}`,context:'Новое событие не должно подменить просмотренную основу формы.',evidence:`test://project-proposal/${suffix}/concurrent`});
  await expect(review).toContainText('Появились новые события или версия предложения. Ваш текст сохранён');await expect(adopt).toBeDisabled();
  await expect(review.getByLabel('Название новой спеки',{exact:true})).toHaveValue(editedTitle);await expect(review.getByLabel('Комментарий агенту',{exact:true})).toHaveValue(humanComment);
  await review.getByRole('button',{name:'Проверил изменения — обновить основу, сохранив мой текст',exact:true}).click();await expect(adopt).toBeEnabled();
  const checkedVersion=(await snapshot(page,projectA.id)).cursor;
  const adoptedResponse=page.waitForResponse(response=>new URL(response.url()).pathname===`${scope(projectA!.id)}/commands`&&response.request().method()==='POST'&&response.request().postDataJSON().type==='adoptAgentSpecProposal');
  await adopt.click();const response=await adoptedResponse;expect(response.ok(),await response.text()).toBe(true);expect(response.request().postDataJSON().expectedVersion).toBe(checkedVersion);
  const after=await snapshot(page,projectA.id),proposal=after.state.agentProposals.find(item=>item.id===proposalBefore.id)!;
  expect(proposal.state).toBe('adopted');expect(proposal.review?.comment).toBe(humanComment);
  const draftId=proposal.review!.draftSpecId!,newSpec=after.state.specs.find(spec=>spec.id===draftId)!,newRevision=after.state.revisions.find(revision=>revision.specId===draftId)!;
  expect(newSpec.state).toBe('idea');expect(newSpec.activeRevisionId).toBeNull();expect(newSpec.title).toBe(editedTitle);expect(newRevision.flow).toEqual(flow);
  expect(after.state.executions.some(attempt=>attempt.specId===draftId)).toBe(false);expect(after.state.events.some(event=>event.specId===draftId&&['ExecutionStarted','SpecAccepted','RevisionActivated'].includes(event.type))).toBe(false);
  expect(after.state.dependencies.some(dependency=>dependency.type==='derived_from'&&dependency.from===execution.specId&&dependency.to===draftId)).toBe(true);
  expect(after.state.events.find(event=>event.id===source.id)).toEqual(source);
  expect(after.state.agentProposalRevisions.find(revision=>revision.id===proposal.latestRevisionId)!.content).toMatchObject({title:proposalTitle,findings:[{text:finding,sourceEventIds:[source.id]}],draft:{title:draft.title,flow}});
  const roadmap=page.getByRole('region',{name:'Дорожная карта проекта',exact:true}),draftNode=roadmap.locator(`.react-flow__node[data-id="${draftId}"]`);
  await expect(draftNode).toContainText(editedTitle);await draftNode.click();
  await expect(page.locator('[aria-label="Выбранная задача"]')).toHaveAttribute('data-spec-id',draftId);
  const process=page.getByRole('region',{name:'Текущий процесс',exact:true});await expect(process).toContainText('r1 · предложение');
  for(const node of flow.nodes)await expect(process.locator(`.react-flow__node[data-id="${node.id}"]`)).toContainText(node.title);
  await expect(process.locator('.react-flow__edge')).toHaveCount(flow.edges.length);await expect(process).toContainText('Схема не является фактом исполнения');
  expect(await page.evaluate(()=>(window as Window&{__ouroProposalDocument?:string}).__ouroProposalDocument)).toBe(documentMarker);
  await catalog(page);await openProject(page,projectB);
  await expect(page.getByRole('region',{name:'Предложения агентов',exact:true})).toContainText('Предложений пока нет');await expect(page.locator(`[data-proposal-id="${proposal.id}"]`)).toHaveCount(0);
  expect((await snapshot(page,projectB.id)).state.specs).toHaveLength(0);expect((await snapshot(page,projectB.id)).state.agentProposals).toHaveLength(0);
  const denied=await page.request.post(`${scope(projectB.id)}/mcp`,{headers:{Authorization:`Bearer ${registration.token}`},data:{jsonrpc:'2.0',id:44,method:'tools/call',params:{name:'ouro.get_context',arguments:{executionId}}}});expect(denied.status()).toBe(401);expect(await denied.text()).not.toContain(proposalTitle);
  await catalog(page);await openProject(page,projectA);await expect(panel.getByRole('article',{name:`Предложение: ${proposalTitle}`,exact:true})).toContainText('Создан черновик спеки');
  const final=await snapshot(page,projectA.id);expect(final.state.events.find(event=>event.id===source.id)).toEqual(source);expect(final.state.specs.find(spec=>spec.id===draftId)?.activeRevisionId).toBeNull();
  expect(await page.evaluate(()=>(window as Window&{__ouroProposalDocument?:string}).__ouroProposalDocument)).toBe(documentMarker);

  // Adoption remains separate from activation, assignment, a real ACK and
  // human-owned step evidence, all through the same scoped dashboard.
  const selected=page.locator('[aria-label="Выбранная задача"]');await expect(selected).toHaveAttribute('data-spec-id',draftId);
  await selected.getByRole('button',{name:'Активировать новую ревизию',exact:true}).click();
  const assign=selected.getByRole('region',{name:'Назначить попытку по ревизии',exact:true});await expect(assign).toBeVisible();
  await assign.getByLabel('Агент для новой попытки',{exact:true}).selectOption(registration.agent.id);await assign.getByRole('checkbox',{name:'Строгий учёт проходов',exact:true}).check();
  const strictAssigned=page.waitForResponse(response=>new URL(response.url()).pathname===`${scope(projectA!.id)}/commands`&&response.request().method()==='POST'&&response.request().postDataJSON().type==='startExecution');
  await assign.getByRole('button',{name:'Назначить попытку',exact:true}).click();const assignedResponse=await strictAssigned;expect(assignedResponse.ok(),await assignedResponse.text()).toBe(true);expect(assignedResponse.request().postDataJSON().flowTracking).toBe('enforced');
  const assignedState=(await snapshot(page,projectA.id)).state,strict=assignedState.executions.find(attempt=>attempt.specId===draftId)!;expect(strict.state).toBe('queued');expect(strict.flowRuntime!.runs).toHaveLength(1);
  expect(assignedState.events.some(event=>event.type==='ExecutionStarted'&&event.executionId===strict.id)).toBe(false);
  const strictCall=(name:string,args:Record<string,unknown>={})=>call(name,{executionId:strict.id,...args});
  const run=async()=>{const attempt=(await snapshot(page,projectA!.id)).state.executions.find(item=>item.id===strict.id)!;return attempt.flowRuntime!.runs.find(item=>item.id===attempt.flowRuntime!.currentRunId)!;};
  await strictCall('ouro.confirm_started');let current=await run();expect(current.nodeId).toBe('inspect');
  await strictCall('ouro.report_flow_step',{runId:current.id,phase:'start'});await strictCall('ouro.report_flow_step',{runId:current.id,phase:'complete',evidence:`test://project-proposal/${suffix}/inspect`});
  current=await run();expect(current.nodeId).toBe('choice');await strictCall('ouro.report_flow_step',{runId:current.id,phase:'start'});
  const forkTitle=`Плановый выбор ${suffix}`;
  await strictCall('ouro.report_fork',{flowStepRunId:current.id,title:forkTitle,context:'Выбор принадлежит человеку этого прохода новой спеки.',reason:'Пути имеют разные последствия для процесса, поэтому назначенный агент запрашивает отдельный явный выбор человека по текущей ревизии.',options:[{id:'finish',title:'Проверить человеком',description:'Перейти к ручной проверке.'},{id:'repair',title:'Уточнить вход',description:'Повторить анализ и человеческий выбор.'}]});
  const decision=page.getByRole('region',{name:'Вопросы и решения',exact:true}).getByRole('article',{name:`Запрос: ${forkTitle}`,exact:true});await expect(decision).toBeVisible();
  await decision.getByLabel(`Решение по запросу ${forkTitle}`,{exact:true}).selectOption('finish');await decision.getByRole('button',{name:'Записать решение',exact:true}).click();
  await expect(decision).toContainText('Ожидается подтверждение применения агентом');
  const request=(await snapshot(page,projectA.id)).state.requests.find(item=>item.executionId===strict.id)!;
  await strictCall('ouro.confirm_decision_applied',{decisionRequestId:request.id,evidence:`test://project-proposal/${suffix}/choice-applied`});
  const resume=selected.getByRole('button',{name:'Разрешить продолжение',exact:true});await expect(resume).toBeEnabled();await resume.click();
  await expect(selected).toContainText('Ожидается отдельное MCP-подтверждение агента');await strictCall('ouro.confirm_resumed');
  await strictCall('ouro.report_flow_step',{runId:current.id,phase:'complete',edgeId:'choice-verify',evidence:`test://project-proposal/${suffix}/chosen-transition`});
  current=await run();expect(current.nodeId).toBe('verify');const humanRunId=current.id;
  const forbidden=await client.callTool({name:'ouro.report_flow_step',arguments:{executionId:strict.id,runId:humanRunId,phase:'start',requestId:crypto.randomUUID(),expectedVersion:(await snapshot(page,projectA.id)).cursor}});expect(forbidden.isError).toBe(true);expect((forbidden.structuredContent as {error:{code:string}}).error.code).toBe('FORBIDDEN');
  const currentStep=page.getByRole('region',{name:'Текущий проход процесса',exact:true});await expect(currentStep).toContainText(`Ручная проверка ${suffix}`);await expect(currentStep).toContainText(humanRunId);
  const humanStep=async(phase:'start'|'complete')=>{
   const form=currentStep.getByRole('form',{name:'Действие человека в текущем проходе',exact:true});await form.getByLabel('Действие на шаге',{exact:true}).selectOption(phase);
   await form.getByLabel('Основание действия',{exact:true}).fill(`Человек подтвердил ${phase} ручной проверки по точному проходу ${humanRunId}.`);
   const refreshBasis=form.getByRole('button',{name:'Проверил события текущего прохода',exact:true});if(await refreshBasis.count())await refreshBasis.click();
   const committedStep=page.waitForResponse(response=>new URL(response.url()).pathname===`${scope(projectA!.id)}/commands`&&response.request().method()==='POST'&&response.request().postDataJSON().type==='reportFlowStep'&&response.request().postDataJSON().phase===phase);
   await form.getByRole('button',{name:'Записать действие на шаге',exact:true}).click();const saved=await committedStep;expect(saved.ok(),await saved.text()).toBe(true);expect(saved.request().postDataJSON()).toMatchObject({executionId:strict.id,runId:humanRunId,phase});
   const events=(await saved.json()).events as ProjectState['events'];expect(events.find(event=>event.type===(phase==='start'?'FlowStepStarted':'FlowStepCompleted'))?.actor.kind).toBe('human');
  };
  await humanStep('start');await expect(currentStep).toContainText('Выполняется');await humanStep('complete');
  current=await run();expect(current.nodeId).toBe('result');await strictCall('ouro.report_flow_step',{runId:current.id,phase:'start'});await strictCall('ouro.report_flow_step',{runId:current.id,phase:'complete',evidence:`test://project-proposal/${suffix}/flow-result`});
  const beforeResult=(await snapshot(page,projectA.id)).state,finished=beforeResult.executions.find(attempt=>attempt.id===strict.id)!;expect(finished.flowRuntime!.state).toBe('completed');expect(finished.state).toBe('running');expect(beforeResult.specs.find(spec=>spec.id===draftId)!.state).not.toBe('done');
  await strictCall('ouro.complete_execution',{result:'succeeded',evidence:`test://project-proposal/${suffix}/strict-result`});
  const reported=(await snapshot(page,projectA.id)).state;expect(reported.executions.find(attempt=>attempt.id===strict.id)!.state).toBe('succeeded');expect(reported.specs.find(spec=>spec.id===draftId)!.state).not.toBe('done');expect(reported.events.some(event=>event.type==='SpecAccepted'&&event.specId===draftId)).toBe(false);
  expect(reported.events.find(event=>event.id===source.id)).toEqual(source);expect(await page.evaluate(()=>(window as Window&{__ouroProposalDocument?:string}).__ouroProposalDocument)).toBe(documentMarker);
  await call('ouro.complete_execution',{result:'succeeded',evidence:`test://project-proposal/${suffix}/analysis-complete`});
 }finally{
  await client?.close();if(projectA&&registration)await page.request.post(`${scope(projectA.id)}/agents/${registration.agent.id}/revoke`,{data:{}});
  await rm(folderA,{recursive:true,force:true});await rm(folderB,{recursive:true,force:true});
 }
});
