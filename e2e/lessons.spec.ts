import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { AGENT_ID, type ProjectState } from '../packages/core/src';
import { getLessonCandidates } from '../packages/core/src/lessons';

async function project(request:APIRequestContext):Promise<ProjectState>{const response=await request.get('/api/project');expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state;}
async function human(request:APIRequestContext,payload:Record<string,unknown>){const response=await request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:(await project(request)).version}});expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state as ProjectState;}
async function open(page:Page){await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();}
const specContent=(title:string)=>({title,goal:'Проверить явное происхождение новой задачи и границы вывода.',dod:[{id:'lesson-dod',text:'Происхождение проверено',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});
async function simulate(request:APIRequestContext,specId:string,scenario:string){const response=await request.post('/api/simulator',{data:{scenario,specId,requestId:crypto.randomUUID(),expectedVersion:(await project(request)).version}});expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state as ProjectState;}
async function cursor(page:Page){return Number((await page.locator('footer').innerText()).match(/cursor\s+(\d+)/)?.[1]);}

test('L01/L06 lessons screen separates candidates from curated published snapshots',async({page})=>{
  await open(page);
  await page.getByRole('button',{name:'Уроки',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Архив уроков',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Кандидаты в уроки'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Архив уроков'})).toBeVisible();
  await expect(page.getByText('Отклонение или невыбранный вариант — материал для анализа, а не доказанный плохой подход.',{exact:true})).toBeVisible();
});

test('L01/L03/L04/L05/L06 human curates a candidate, publishes a snapshot and retries exact spec provenance after a lost response',async({page,request})=>{
  test.setTimeout(90000);expect((await request.get('/api/session')).ok()).toBeTruthy();
  const title=`Источник урока ${Date.now()}`;
  let state=await human(request,{type:'createSpec',content:specContent(title)});
  const sourceSpec=state.specs.find(s=>s.title===title)!,sourceRevision=state.revisions.find(r=>r.id===sourceSpec.revisionIds[0])!;
  await human(request,{type:'activateRevision',specId:sourceSpec.id,revisionId:sourceRevision.id});
  state=await human(request,{type:'startExecution',specId:sourceSpec.id,specRevisionId:sourceRevision.id,agentId:AGENT_ID});
  const execution=state.executions.findLast(e=>e.specId===sourceSpec.id)!;
  await simulate(request,sourceSpec.id,'apply');state=await simulate(request,sourceSpec.id,'fork');
  const fork=state.requests.findLast(r=>r.executionId===execution.id)!;
  const beforeLessons=(state.lessons??[]).length;
  state=await human(request,{type:'resolveDecision',decisionRequestId:fork.id,specRevisionId:sourceRevision.id,outcome:{kind:'approve',chosenOptionId:fork.options[0].id}});
  expect(state.lessons.length).toBe(beforeLessons);
  const candidate=getLessonCandidates(state).find(c=>c.decisionRequestId===fork.id&&c.kind==='unchosen_fork_option')!;
  expect(candidate).toBeTruthy();
  await open(page);await page.getByRole('button',{name:'Уроки',exact:true}).click();
  await page.getByTestId(`lesson-candidate-${candidate.id}`).getByRole('button',{name:'Разобрать кандидат',exact:true}).click();
  const editor=page.getByRole('region',{name:'Редактор урока'}),lessonTitle=`Урок о явной границе ${Date.now()}`;
  await editor.getByRole('textbox',{name:'Название урока',exact:true}).fill(lessonTitle);
  await editor.getByRole('textbox',{name:'Вывод урока',exact:true}).fill('Выбор человека фиксирует контекст; невыбранный путь не объявляется ошибкой.');
  await editor.getByRole('textbox',{name:'Область применимости',exact:true}).fill('Применимо к развилкам с обязательным человеческим выбором.');
  await editor.getByRole('textbox',{name:'Основание проверки',exact:true}).fill(`Проверено по событию ${candidate.sourceEventId} и вариантам исходной развилки.`);
  await editor.getByRole('textbox',{name:'Теги урока',exact:true}).fill('границы, проверка');
  await editor.getByRole('button',{name:'Сохранить черновик урока',exact:true}).click();
  await expect(editor).toHaveCount(0);
  state=await project(request);
  const savedRevision=state.lessonRevisions.find(r=>r.title===lessonTitle)!,lesson=state.lessons.find(l=>l.id===savedRevision.lessonId)!;
  expect(savedRevision.sourceEventIds).toEqual([candidate.sourceEventId]);expect(savedRevision.tags).toEqual(['границы','проверка']);expect(lesson.publishedRevisionId).toBeUndefined();
  const detail=page.getByRole('article',{name:'Выбранный урок'});
  await detail.getByRole('button',{name:'Опубликовать r1',exact:true}).click();
  await expect(detail.getByRole('button',{name:'Создать спеку из урока',exact:true})).toBeVisible();
  state=await project(request);expect(state.lessons.find(l=>l.id===lesson.id)?.publishedRevisionId).toBe(savedRevision.id);
  await detail.getByRole('button',{name:'Создать спеку из урока',exact:true}).click();
  const specForm=page.getByRole('region',{name:'Спецификация из урока'}),newTitle=`Применить границу вывода ${Date.now()}`;
  await specForm.getByRole('textbox',{name:'Название новой спеки',exact:true}).fill(newTitle);
  await specForm.getByRole('textbox',{name:'Цель новой спеки',exact:true}).fill('Показать происхождение задачи из точного опубликованного урока.');
  await specForm.getByRole('textbox',{name:'Definition of Done новой спеки',exact:true}).fill('Сохранена точная ревизия урока\nСпека остаётся неактивным черновиком');
  await expect(specForm.getByRole('combobox',{name:'Исходная спека для связи derived_from',exact:true})).toHaveValue('');
  await specForm.getByRole('combobox',{name:'Исходная спека для связи derived_from',exact:true}).selectOption(sourceSpec.id);
  let lost=false,createdSpecId='',firstRequestId='';
  await page.route('**/api/commands',async route=>{
    const payload=route.request().postDataJSON();
    if(payload.type==='createSpecFromLesson'&&!lost){
      lost=true;firstRequestId=payload.requestId;const response=await route.fetch();expect(response.ok(),await response.text()).toBeTruthy();
      const body=await response.json(),created=body.events.find((e:{type:string})=>e.type==='SpecCreated');createdSpecId=created.payload.spec.id;
      await route.abort('failed');
    }else{if(payload.type==='createSpecFromLesson')expect(payload.requestId).toBe(firstRequestId);await route.continue();}
  });
  try{
    await specForm.getByRole('button',{name:'Создать черновик спеки',exact:true}).click();
    await expect(page.locator('.lesson-error')).toBeVisible();await expect(specForm).toBeVisible();
    await expect(specForm.getByRole('textbox',{name:'Название новой спеки',exact:true})).toHaveValue(newTitle);
    expect(createdSpecId).not.toBe('');
    const unrelated=await human(request,{type:'createSpec',content:specContent(`Более новая чужая спека ${Date.now()}`)});
    await expect.poll(()=>cursor(page)).toBe(unrelated.version);
    await specForm.getByRole('button',{name:'Создать черновик спеки',exact:true}).click();
    await expect(page.getByRole('combobox',{name:'Выбрать спецификацию',exact:true})).toHaveValue(createdSpecId);
  }finally{await page.unroute('**/api/commands');}
  state=await project(request);
  const created=state.specs.find(s=>s.id===createdSpecId)!;
  expect(created.activeRevisionId).toBeNull();expect(created.state).toBe('idea');
  expect(created.origin).toEqual({kind:'lesson',lessonId:lesson.id,lessonRevisionId:savedRevision.id});
  expect(state.specs.filter(s=>s.title===newTitle)).toHaveLength(1);
  expect(state.dependencies.some(d=>d.type==='derived_from'&&d.from===sourceSpec.id&&d.to===createdSpecId)).toBe(true);
  await page.getByRole('button',{name:'Уроки',exact:true}).click();
  await page.getByRole('searchbox',{name:'Поиск уроков',exact:true}).fill('границы');
  await page.getByRole('combobox',{name:'Публикация урока',exact:true}).selectOption('published');
  await page.getByRole('combobox',{name:'Исходная спека урока',exact:true}).selectOption(sourceSpec.id);
  await page.locator('.lesson-list').getByRole('button').filter({hasText:lessonTitle}).click();
  await detail.getByRole('button',{name:'Предложить ревизию урока',exact:true}).click();
  await editor.getByRole('textbox',{name:'Вывод урока',exact:true}).fill('Уточнённый вывод пока остаётся черновиком второй ревизии.');
  await editor.getByRole('button',{name:'Сохранить черновик урока',exact:true}).click();await expect(editor).toHaveCount(0);
  state=await project(request);
  const revised=state.lessons.find(l=>l.id===lesson.id)!;
  expect(revised.latestRevisionId).not.toBe(savedRevision.id);expect(revised.publishedRevisionId).toBe(savedRevision.id);
  expect(state.lessonRevisions.find(r=>r.id===savedRevision.id)).toEqual(savedRevision);
  await detail.getByRole('combobox',{name:'Версия урока',exact:true}).selectOption(savedRevision.id);
  await expect(detail).toContainText('Историческая версия доступна только для чтения');
  await expect(detail.getByRole('button',{name:'Предложить ревизию урока',exact:true})).toHaveCount(0);
});

test('L02/L06 lesson curation preserves draft focus and requires explicit rebase after a concurrent event',async({page,request})=>{
  test.setTimeout(60000);expect((await request.get('/api/session')).ok()).toBeTruthy();await open(page);
  await page.getByRole('button',{name:'Уроки',exact:true}).click();await page.getByRole('button',{name:'Новый урок',exact:true}).click();
  const editor=page.getByRole('region',{name:'Редактор урока'}),title=editor.getByRole('textbox',{name:'Название урока',exact:true}),draft=`Сохранить черновик вывода ${Date.now()}`;
  await title.fill(draft);
  await editor.getByRole('textbox',{name:'Контекст урока',exact:true}).fill('Проверка формы при независимом изменении проекта.');
  await editor.getByRole('textbox',{name:'Вывод урока',exact:true}).fill('Обновление проекта не подменяет основу формы.');
  await editor.getByRole('textbox',{name:'Область применимости',exact:true}).fill('Формы с явной optimistic concurrency.');
  await editor.getByRole('textbox',{name:'Основание проверки',exact:true}).fill('Наблюдение текста, фокуса и конфликта версии.');
  const source=(await project(request)).events[0];
  await editor.getByRole('combobox',{name:'Добавить источник урока',exact:true}).selectOption(source.id);
  await editor.getByRole('button',{name:'Добавить источник',exact:true}).click();
  await title.focus();await title.evaluate((element:HTMLInputElement)=>element.setSelectionRange(3,14));
  const external=await human(request,{type:'createSpec',content:specContent(`Событие при редактировании урока ${Date.now()}`)});
  await expect.poll(()=>cursor(page)).toBe(external.version);
  await expect(title).toHaveValue(draft);await expect(title).toBeFocused();
  expect(await title.evaluate((element:HTMLInputElement)=>[element.selectionStart,element.selectionEnd])).toEqual([3,14]);
  const rejected=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/commands'&&response.request().method()==='POST');
  await editor.getByRole('button',{name:'Сохранить черновик урока',exact:true}).click();expect((await rejected).status()).toBe(409);
  await expect(editor).toBeVisible();await expect(title).toHaveValue(draft);
  expect((await project(request)).lessonRevisions.some(r=>r.title===draft)).toBe(false);
  await editor.getByRole('button',{name:'Обновить базу после проверки',exact:true}).click();
  await editor.getByRole('button',{name:'Сохранить черновик урока',exact:true}).click();await expect(editor).toHaveCount(0);
  const saved=(await project(request)).lessonRevisions.find(r=>r.title===draft)!;expect(saved.sourceEventIds).toEqual([source.id]);
});
