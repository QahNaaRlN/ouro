import { test,expect,type Page } from '@playwright/test';
import { AGENT_ID,type ProjectState } from '../packages/core/src';

async function snapshot(page:Page):Promise<ProjectState>{return (await(await page.request.get('/api/project')).json()).state;}
async function human(page:Page,payload:Record<string,unknown>){
 const current=await snapshot(page);
 const response=await page.request.post('/api/commands',{data:{...payload,requestId:crypto.randomUUID(),expectedVersion:current.version}});
 expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).state as ProjectState;
}
async function simulate(page:Page,specId:string,scenario:string){
 const current=await snapshot(page);
 const response=await page.request.post('/api/simulator',{data:{scenario,specId,expectedVersion:current.version,requestId:crypto.randomUUID()}});
 expect(response.ok(),await response.text()).toBeTruthy();
 await page.getByRole('button',{name:'Обновить проект',exact:true}).click();
}

test('F09 state diagrams expose four axes and distinguish human permission, agent ACK and DoD in light theme',async({page})=>{
 test.setTimeout(90000);
 await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 let state=await human(page,{type:'createSpec',content:{title:`Переходы состояний ${Date.now()}`,goal:'Разделить разрешения, фактические ACK и приёмку.',dod:[{id:'diagram-check',text:'Человек проверил результат',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
 const spec=state.specs.at(-1)!,revision=state.revisions.at(-1)!;
 await human(page,{type:'activateRevision',specId:spec.id,revisionId:revision.id});
 await human(page,{type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:AGENT_ID});
 await page.reload();await page.getByRole('button',{name:'Спецификации',exact:true}).click();
 await page.getByLabel('Выбрать спецификацию',{exact:true}).selectOption(spec.id);
 await page.getByRole('button',{name:'Состояния',exact:true}).click();
 const panel=page.getByRole('region',{name:'Визуальные переходы состояний',exact:true});
 const axes=panel.locator('.state-axis-tabs');
 await expect(panel.getByRole('button',{name:'В очереди, текущее состояние',exact:true})).toBeVisible();
 await expect(panel.getByText('Запуск разрешён человеком. Ожидается ACK фактического начала.',{exact:true})).toBeVisible();
 const beforeReadOnlySelection=(await snapshot(page)).version;
 await panel.getByRole('button',{name:'Выполняется',exact:true}).click();
 await expect(panel.getByRole('heading',{name:'Выполняется',exact:true})).toBeVisible();
 const allTransitions=panel.getByRole('button',{name:'Все возможные переходы',exact:true});
 await expect(allTransitions).toHaveAttribute('aria-pressed','false');
 await allTransitions.click();await expect(allTransitions).toHaveAttribute('aria-pressed','true');
 await allTransitions.click();await expect(allTransitions).toHaveAttribute('aria-pressed','false');
 expect((await snapshot(page)).version).toBe(beforeReadOnlySelection);
 await panel.getByRole('button',{name:'В очереди, текущее состояние',exact:true}).click();
 await axes.getByRole('button',{name:'Спецификация',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Специфицировано, текущее состояние',exact:true})).toBeVisible();
 await axes.getByRole('button',{name:'Дорожная карта',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Активна, текущее состояние',exact:true})).toBeVisible();
 await axes.getByRole('button',{name:'Запрос решения',exact:true}).click();
 await expect(panel.getByText('В выбранном контексте ещё нет этой сущности',{exact:true})).toBeVisible();
 await expect(panel.getByRole('button',{name:'Отозван',exact:true})).toBeVisible();
 await axes.getByRole('button',{name:'Исполнение',exact:true}).click();
 await page.getByRole('button',{name:'Включить светлую тему'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.emulateMedia({reducedMotion:'reduce'});
 await simulate(page,spec.id,'apply');
 await expect(panel.getByRole('button',{name:'Выполняется, текущее состояние',exact:true})).toBeVisible();
 await simulate(page,spec.id,'question');
 await expect(panel.getByRole('button',{name:'Ожидает человека, текущее состояние',exact:true})).toBeVisible();
 state=await snapshot(page);const question=state.requests.findLast(r=>r.specId===spec.id)!;
 await human(page,{type:'resolveDecision',decisionRequestId:question.id,specRevisionId:revision.id,outcome:{kind:'answer',answer:'Показать проверяемый результат отдельно от DoD.'}});
 await page.getByRole('button',{name:'Обновить проект',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Ожидает человека, текущее состояние',exact:true})).toBeVisible();
 await human(page,{type:'resumeExecution',executionId:question.executionId});
 await page.getByRole('button',{name:'Обновить проект',exact:true}).click();
 await expect(panel.getByText('Продолжение разрешено человеком. Состояние изменится только после ACK агента.',{exact:true})).toBeVisible();
 await expect(panel.getByRole('button',{name:'Ожидает человека, текущее состояние',exact:true})).toBeVisible();
 await simulate(page,spec.id,'apply');
 await expect(panel.getByRole('button',{name:'Выполняется, текущее состояние',exact:true})).toBeVisible();
 await simulate(page,spec.id,'complete');
 await expect(panel.getByRole('button',{name:'Попытка успешна, текущее состояние',exact:true})).toBeVisible();
 await axes.getByRole('button',{name:'Спецификация',exact:true}).click();
 await expect(panel.getByRole('button',{name:'В работе, текущее состояние',exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Список',exact:true}).click();
 await expect(panel.getByRole('table')).toBeVisible();
 await expect(panel.getByRole('row').filter({hasText:'Текущее'})).toContainText('В работе');
 await expect(panel.getByRole('row',{name:/^Принято /})).toContainText('Возможное');
});
