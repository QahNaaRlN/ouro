import { test, expect, type Page } from '@playwright/test';
import type { ProjectState } from '../packages/core/src/types';

async function project(page: Page): Promise<ProjectState> {
  const response=await page.request.get('/api/project'); expect(response.ok()).toBeTruthy();
  return (await response.json()).state;
}
async function simulate(page:Page, scenario:string) {
  const result=page.waitForResponse(r=>r.url().includes('/api/simulator')&&r.request().method()==='POST');
  await page.getByLabel('Сценарий симулятора').selectOption(scenario);
  const response=await result; expect(response.ok(),await response.text()).toBeTruthy();
  await expect(page.locator('.error-banner')).toHaveCount(0);
}

test('graph, table, theme and mobile navigation use the same project', async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:'Дорожная карта'})).toBeVisible();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  const count=(await project(page)).specs.length;
  await expect(page.locator('.react-flow__node')).toHaveCount(count);
  await page.getByRole('button',{name:'Таблица',exact:true}).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(count+1);
  await page.getByRole('button',{name:'Включить светлую тему'}).click();await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('heading',{name:'Дорожная карта'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.getByRole('button',{name:'Открыть меню'}).click();
  await page.getByRole('button',{name:'Методология и источники'}).click();
  await expect(page.getByRole('heading',{name:'Методология и источники'})).toBeVisible();
  await expect(page.getByRole('link',{name:'OMG BPMN 2.0.2'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('human flow creates a revision, answers a question and accepts DoD only after agent evidence',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/');await expect(page.getByRole('heading',{name:'Дорожная карта'})).toBeVisible();
  await page.getByRole('button',{name:'Новая спека',exact:true}).click();
  const dialog=page.getByRole('dialog');
  const title=`Проверить человеческое решение ${Date.now()}`;
  await dialog.getByLabel('Название',{exact:true}).fill(title);
  await dialog.getByLabel('Цель',{exact:true}).fill('Подтвердить раздельные решение, исполнение и человеческую приёмку.');
  await dialog.getByLabel('Definition of Done').fill('Ответ человека сохранён в неизменяемой истории');
  await dialog.getByRole('button',{name:'Создать спецификацию'}).click();
  await expect(dialog).not.toBeVisible();await expect(page.getByRole('heading',{name:title})).toBeVisible();
  let state=await project(page);let spec=state.specs.find(s=>s.title===title)!;
  expect(spec.state).toBe('idea');expect(spec.activeRevisionId).toBeNull();
  await page.getByRole('button',{name:'Активировать ревизию 1'}).click();
  await page.getByRole('button',{name:'Разрешить одну попытку',exact:true}).first().click();
  await simulate(page,'apply');
  state=await project(page);expect(state.executions.findLast(e=>e.specId===spec.id)?.state).toBe('running');
  await simulate(page,'question');
  state=await project(page);const question=state.requests.findLast(r=>r.specId===spec.id)!;
  expect(question.state).toBe('pending');expect(state.executions.findLast(e=>e.specId===spec.id)?.state).toBe('waiting_for_human');
  await page.getByRole('button',{name:/Какой критерий считать обязательным/}).first().click();
  await page.getByLabel('Ваш ответ').fill('При отсутствии данных показывать пустой список и явную подпись.');
  await page.getByRole('button',{name:'Записать ответ'}).click();
  state=await project(page);expect(state.requests.find(r=>r.id===question.id)?.state).toBe('resolved');
  expect(state.executions.findLast(e=>e.specId===spec.id)?.state).toBe('waiting_for_human');
  await page.getByRole('button',{name:'Разрешить продолжение',exact:true}).first().click();
  await simulate(page,'apply');await simulate(page,'apply');await simulate(page,'action');await simulate(page,'complete');
  state=await project(page);spec=state.specs.find(s=>s.id===spec.id)!;
  expect(spec.state).not.toBe('done');expect(state.executions.findLast(e=>e.specId===spec.id)?.state).toBe('succeeded');
  await page.getByRole('button',{name:'Открыть ожидание и реальность'}).click();
  await page.getByRole('button',{name:'Принять по DoD',exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Проверено в браузере: ответ сохранён, попытка завершена отдельно, исходные события доступны.');
  await page.getByRole('button',{name:'Подтверждаю приёмку по DoD'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  state=await project(page);expect(state.specs.find(s=>s.id===spec.id)?.state).toBe('done');
  const resolved=state.events.find(e=>e.type==='DecisionResolved'&&e.payload.decisionRequestId===question.id)!;
  const requested=state.events.find(e=>e.type==='DecisionRequested'&&(e.payload.request as {id:string}).id===question.id)!;
  expect(resolved.causationId).toBe(requested.id);
  await page.reload();expect((await project(page)).specs.find(s=>s.id===spec.id)?.state).toBe('done');
});

test('HTTP boundary preserves idempotency, rejects stale decisions and restores committed cursor',async({request})=>{
  const noAuth=await request.get('/api/project');expect(noAuth.status()).toBe(401);
  await request.get('/api/session');
  const initial=(await (await request.get('/api/project')).json()).state as ProjectState;
  const body={type:'createSpec',requestId:crypto.randomUUID(),expectedVersion:initial.version,content:{title:'Идемпотентная HTTP-команда',goal:'Сохранить ровно одну спеку при повторе.',dod:[{id:'http-criterion',text:'Единственная запись',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}};
  const first=await request.post('/api/commands',{data:body});expect(first.ok(),await first.text()).toBeTruthy();
  const result=await first.json();
  const repeat=await request.post('/api/commands',{data:body});expect((await repeat.json()).replayed).toBe(true);
  const conflict=await request.post('/api/commands',{data:{...body,content:{...body.content,title:'Иное тело'}}});expect(conflict.status()).toBe(409);
  const stale=await request.post('/api/commands',{data:{...body,requestId:crypto.randomUUID()}});expect(stale.status()).toBe(409);
  const events=await (await request.get(`/api/events?after=${initial.version}`)).json();
  expect(events.cursor).toBe(result.cursor);expect(events.events).toHaveLength(1);
  const cross=await request.post('/api/commands',{headers:{origin:'https://other.invalid'},data:body});expect(cross.status()).toBe(403);
  const ahead=await request.get(`/api/events?after=${result.cursor+1000}`);expect(ahead.status()).toBe(409);
});

test('simulated Blocker requires successful separate remediation before the primary attempt can resume',async({request})=>{
  await request.get('/api/session');
  const read=async()=> (await (await request.get('/api/project')).json()).state as ProjectState;
  const cmd=async(payload:Record<string,unknown>)=>{
    const state=await read();const response=await request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:state.version}});
    expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state as ProjectState;
  };
  let state=await cmd({type:'createSpec',content:{title:`Устранить блокер ${Date.now()}`,goal:'Отделить план устранения от подтверждённого снятия.',dod:[{id:'clear-evidence',text:'Evidence снятия сохранено',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
  const spec=state.specs.at(-1)!;const revision=spec.revisionIds[0];
  state=await cmd({type:'activateRevision',specId:spec.id,revisionId:revision});
  const agent=state.executions[0].agentId;
  state=await cmd({type:'startExecution',specId:spec.id,specRevisionId:revision,agentId:agent});
  const primary=state.executions.at(-1)!;
  const sim=async(scenario:string,success=true)=>{
    const before=await read();const body={scenario,specId:spec.id,requestId:crypto.randomUUID(),expectedVersion:before.version};
    const response=await request.post('/api/simulator',{data:body});expect(response.ok(),await response.text()).toBe(success);
    if(success) return {body,result:await response.json()};return null;
  };
  await sim('apply');const reported=(await sim('blocker'))!;
  const repeat=await request.post('/api/simulator',{data:reported.body});expect((await repeat.json()).replayed).toBe(true);
  state=await read();const blocker=state.requests.find(r=>r.specId===spec.id)!;
  state=await cmd({type:'resolveDecision',decisionRequestId:blocker.id,specRevisionId:revision,outcome:{kind:'approve',chosenOptionId:blocker.options[0].id}});
  expect(state.requests.find(r=>r.id===blocker.id)?.clearedEvidence).toBeUndefined();
  await sim('complete',false);
  state=await cmd({type:'authorizeRemediation',decisionRequestId:blocker.id,agentId:agent});
  expect(state.executions.at(-1)?.kind).toBe('remediation');
  await sim('apply');await sim('complete');await sim('clear');
  state=await read();expect(state.requests.find(r=>r.id===blocker.id)?.clearedEvidence).toBeTruthy();
  expect(state.executions.find(e=>e.id===primary.id)?.state).toBe('waiting_for_human');
  await cmd({type:'resumeExecution',executionId:primary.id});await sim('apply');await sim('complete');
  state=await cmd({type:'acceptSpec',specId:spec.id,specRevisionId:revision,evidence:{'clear-evidence':'Успешная remediation и отдельный факт BlockerCleared проверены.'}});
  expect(state.specs.find(s=>s.id===spec.id)?.state).toBe('done');
});
