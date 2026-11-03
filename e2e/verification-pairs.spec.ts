import { test, expect, type Page, type Locator } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chooseSelectOption } from './select-helpers';
import type { ProjectState } from '../packages/core/src';
const scope = (id: string) => `/api/projects/${id}`;
async function reveal(control: Locator) {
    await control.waitFor({state:'attached'});
    const accordion=control.locator('xpath=ancestor::section[contains(concat(" ",normalize-space(@class)," ")," ws-accordion ")]').last();
    if(await accordion.count()){
        const toggle=accordion.locator(':scope > button[aria-expanded]');
        if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded','true');
    }
    await expect(control).toBeVisible();
}
test('paired verification browser path: create/edit contract, real Playwright imports, human RED, partial GREEN, stale evidence, keyboard flip without writes', async ({ page }) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => console.log('Browser error: ' + error.message));
    const folder = await mkdtemp(path.join(tmpdir(), 'ouro-verification-browser-')), artifactDir = path.resolve('artifacts/verification-browser');
    await mkdir(artifactDir, { recursive: true });
    const reports: Record<string, string> = {};
    for (const scenario of ['red', 'green', 'partial', 'infra']) {
        const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=tests/fixtures/verification/playwright.config.ts'], { cwd: process.cwd(), env: { ...process.env, OURO_VERIFICATION_SCENARIO: scenario }, encoding: 'utf8', timeout: 30000 });
        expect(result.status).toBe(['green', 'partial'].includes(scenario) ? 0 : 1);
        reports[scenario] = result.stdout;
        JSON.parse(result.stdout);
        await writeFile(path.join(artifactDir, scenario + '.json'), result.stdout);
    }
    const testIds = JSON.parse(reports.green).suites.flatMap((suite: any) => suite.specs ?? suite.suites?.flatMap((item: any) => item.specs) ?? []).map((item: any) => item.id);
    expect(testIds).toHaveLength(2);
    try {
        await page.goto('/projects');
        expect((await page.request.get('/api/session')).ok()).toBe(true);
        await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
        const created = await page.request.post('/api/projects', { data: { name: 'Verification isolated browser', rootPath: folder, requestId: crypto.randomUUID() } });
        expect(created.ok(), await created.text()).toBe(true);
        const project = (await created.json()).project;
        const getState = async () => { const response = await page.request.get(scope(project.id)); expect(response.ok()).toBe(true); return (await response.json()).state as ProjectState; };
        const command = async (body: Record<string, unknown>) => { const response = await page.request.post(scope(project.id) + '/commands', { data: { ...body, requestId: crypto.randomUUID(), expectedVersion: (await getState()).version } }); expect(response.ok(), await response.text()).toBe(true); return (await response.json()).state as ProjectState; };
        const content = { title: 'Work with verification pair', goal: 'Check two observable behaviors', dod: [{ id: 'first', text: 'Both observable behaviors hold', required: true }], constraints: '', assumptions: '', risks: '', inputs: '', comment: '' };
        let state = await command({ type: 'createSpec', content });
        const work = state.specs[0], workRevision = state.revisions[0];
        await command({ type: 'activateRevision', specId: work.id, revisionId: workRevision.id });
        await page.goto(`/projects/${project.id}?view=spec&spec=${work.id}&revision=${workRevision.id}`);
        console.log('Browser stage: author verification contract');
        const createPanel = page.getByRole('region', { name: 'Связанные проверки', exact: true });
        await reveal(createPanel.getByLabel('Название проверки'));
        await createPanel.getByLabel('Название проверки').fill('Behavior verification');
        await createPanel.getByLabel('Исходные условия', { exact: true }).fill('Clean fixture');
        await createPanel.getByLabel('Действие', { exact: true }).fill('Add 2 and 3');
        await createPanel.getByLabel('Ожидаемый наблюдаемый результат').fill('Returns five');
        await createPanel.getByLabel('Необходимые условия стенда').fill('Node and fixture available');
        await page.screenshot({path:path.join(artifactDir,'before-select.png'),fullPage:true});console.log('Create accordion expanded: '+await createPanel.getByRole('button',{name:'Создать связанную проверку',exact:true}).getAttribute('aria-expanded'));
        await chooseSelectOption(createPanel.getByRole('combobox', { name: 'Способ выполнения', exact: true }), 'playwright');
        await createPanel.getByLabel('ID теста в JSON-отчёте').fill(testIds[0]);
        await createPanel.getByRole('button', { name: 'Добавить случай', exact: true }).click();
        const cases = createPanel.locator('fieldset.verification-case');
        await cases.nth(1).getByLabel('Исходные условия', { exact: true }).fill('Clean fixture');
        await cases.nth(1).getByLabel('Действие', { exact: true }).fill('Add 3 and 4');
        await cases.nth(1).getByLabel('Ожидаемый наблюдаемый результат').fill('Returns seven');
        await cases.nth(1).getByLabel('Необходимые условия стенда').fill('Node and fixture available');
        await chooseSelectOption(cases.nth(1).getByRole('combobox', { name: 'Способ выполнения', exact: true }), 'playwright');
        await cases.nth(1).getByLabel('ID теста в JSON-отчёте').fill(testIds[1]);
        await createPanel.getByLabel('Основание изменения ожиданий').fill('Owner defines bounded verification examples');
        await createPanel.getByRole('button', { name: 'Сохранить проверочную ревизию' }).click();
        await expect.poll(async () => (await getState()).specs.length).toBe(2);
        state = await getState();
        const verification = state.specs[1], revision = state.revisions[1];
        await command({ type: 'activateRevision', specId: verification.id, revisionId: revision.id });
        const registration = await page.request.post(scope(project.id) + '/agents', { data: { name: 'Verification browser runner' } });
        expect(registration.ok()).toBe(true);
        const registered = await registration.json();
        state = await command({ type: 'startExecution', specId: verification.id, specRevisionId: revision.id, agentId: registered.agent.id });
        const execution = state.executions.at(-1)!;
        // ACK arrives through the real agent endpoint; all contract authoring and imports below use the browser UI.
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js'), { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
        const client = new Client({ name: 'verification-browser', version: '1' });
        await client.connect(new StreamableHTTPClientTransport(new URL(scope(project.id) + '/mcp', page.url()), { requestInit: { headers: { Authorization: 'Bearer ' + registered.token } } }));
        try {
            const result = await client.callTool({ name: 'ouro.confirm_started', arguments: { executionId: execution.id, requestId: crypto.randomUUID(), expectedVersion: (await getState()).version } });
            expect(result.isError).not.toBe(true);
        }
        finally {
            await client.close();
        }
        await page.goto(`/projects/${project.id}?view=spec&spec=${verification.id}&revision=${revision.id}&execution=all`);
        const panel = page.getByRole('region', { name: 'Проверка и результаты', exact: true });
        await expect(panel).toContainText('Не запускалось');
        const setSlice = async (product: string,testVersion='tests-unchanged') => { const save = panel.getByRole('button', { name: 'Сохранить текущий срез', exact: true, includeHidden: true }); await reveal(save); const form = save.locator('xpath=ancestor::form'); for (const [label, value] of [['Версия продукта', product], ['Версия тестов', testVersion], ['Версия данных и конфигурации', 'fixture-v1'], ['SHA-256 окружения', 'a'.repeat(64)], ['Основание выбора среза', 'Operator pinned isolated inputs']])
            await (label==='Начало прогона'||label==='Окончание прогона'?form.getByLabel(label,{exact:true}):form.getByRole('textbox',{name:label,exact:true})).fill(value); await save.click(); await expect.poll(async () => (await getState()).verificationSlices.at(-1)?.slice.productRevision).toBe(product); };
        const importRun = async (scenario: string, product: string,testVersion='tests-unchanged') => {
            const save = panel.getByRole('button', { name: 'Сохранить прогон', exact: true, includeHidden: true });
            await reveal(save);
            const form = save.locator('xpath=ancestor::form');
            const rawReport=reports[scenario], parsedReport=JSON.parse(rawReport), suites=[...parsedReport.suites];
            let specCount=0,attemptCount=0;
            while(suites.length){const suite=suites.pop();suites.push(...suite.suites??[]);for(const spec of suite.specs??[]){specCount++;for(const test of spec.tests??[])attemptCount+=(test.results??[]).length;}}
            const reportDiagnostic={scenario,sha256:createHash('sha256').update(rawReport).digest('hex'),bytes:Buffer.byteLength(rawReport),specCount,attemptCount,errorCount:parsedReport.errors?.length,stats:parsedReport.stats};
            const formDiagnostic=()=>form.evaluate(node=>{
                const form=node as HTMLFormElement;
                return {valid:form.checkValidity(),invalid:[...form.elements].filter((element):element is HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement=>element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement||element instanceof HTMLSelectElement).filter(element=>!element.validity.valid).map(element=>({type:element.type,label:element.labels?.[0]?.textContent?.trim(),message:element.validationMessage,valueLength:element.value.length,...(element instanceof HTMLInputElement&&element.type==='datetime-local'?{value:element.value}:{})}))};
            });
            try{
                for (const [label, value] of [['Версия продукта', product], ['Версия тестов', testVersion], ['Версия данных и конфигурации', 'fixture-v1'], ['SHA-256 окружения', 'a'.repeat(64)], ['Ссылка на исходный артефакт', 'artifact://isolated/' + scenario + '.json'], ['Начало прогона', '2026-11-03T10:00'], ['Окончание прогона', '2026-11-03T10:01'], ['JSON-отчёт Playwright', rawReport]])
                    await (label==='Начало прогона'||label==='Окончание прогона'?form.getByLabel(label,{exact:true}):form.getByRole('textbox',{name:label,exact:true})).fill(value);
                const validity=await formDiagnostic();
                expect(validity.valid,JSON.stringify({report:reportDiagnostic,form:validity})).toBe(true);
                const count=(await getState()).verificationRuns.length;
                const [response]=await Promise.all([page.waitForResponse(response=>{
                    if(new URL(response.url()).pathname!==scope(project.id)+'/commands'||response.request().method()!=='POST')return false;
                    try{return response.request().postDataJSON()?.type==='reportVerificationRun';}catch{return false;}
                },{timeout:15000}),save.click()]);
                const body=await response.json(),posted=response.request().postDataJSON();
                const apiDiagnostic={status:response.status(),error:body.error??null,replayed:body.replayed,cursor:body.cursor,runCount:body.state?.verificationRuns?.length,eventTypes:body.events?.map((event:{type:string})=>event.type),expectedVersion:posted.expectedVersion,postedRawSha256:createHash('sha256').update(posted.report.rawReport).digest('hex')};
                console.log('Verification import diagnostic: '+JSON.stringify({report:reportDiagnostic,api:apiDiagnostic}));
                expect(response.ok(),JSON.stringify(apiDiagnostic)).toBe(true);
                await expect.poll(async () => (await getState()).verificationRuns.length,{message:JSON.stringify(apiDiagnostic)}).toBe(count+1);
            }catch(error){
                console.log('Verification import failure: '+JSON.stringify({report:reportDiagnostic,form:await formDiagnostic(),alerts:await page.getByRole('alert').allTextContents()}));
                throw error;
            }
        };
        const review = async (assessment: string) => { const run = panel.locator('.verification-run').first(); await reveal(run.getByRole('button', { name: 'Записать заключение', exact: true, includeHidden: true })); await chooseSelectOption(run.getByRole('combobox', { name: 'Заключение', exact: true }), assessment); await run.getByLabel('Основание классификации').fill('Inspected actual result against unchanged expectation'); await run.getByLabel('Подтверждение работоспособности условий стенда').fill('Isolated runner and fixture health checked'); const count = (await getState()).verificationReviews.length; await run.getByRole('button', { name: 'Записать заключение', exact: true, includeHidden: true }).click(); await expect.poll(async () => (await getState()).verificationReviews.length).toBe(count + 1); };
        await setSlice('product-red');
        await importRun('infra', 'product-red');
        await review('environment_error');
        await expect(panel.locator('.verification-readiness')).toContainText('Ошибка окружения');
        await importRun('red', 'product-red');
        await review('expected_red');
        await expect(panel.locator('.verification-readiness')).toContainText('Ожидаемое падение подтверждено');
        const redRun=(await getState()).verificationRuns.at(-1)!;
        const begin=panel.getByRole('form',{name:'Создать цикл проверки',includeHidden:true});
        await reveal(begin.getByRole('button',{name:'Создать цикл',exact:true,includeHidden:true}));
        await begin.getByRole('checkbox',{name:new RegExp(redRun.id)}).check();
        await begin.getByRole('textbox',{name:'Основание создания цикла',exact:true}).fill('Start an explicit cycle for these unchanged behavior examples');
        await begin.getByRole('button',{name:'Создать цикл',exact:true}).click();
        await expect.poll(async()=>(await getState()).verificationCycles.length).toBe(1);
        const cycle=(await getState()).verificationCycles[0];
        const cycleCard=panel.locator('article.verification-case').filter({hasText:cycle.id});
        const advance=async(phase:string)=>{const form=cycleCard.getByRole('form',{name:'Переход цикла '+cycle.id});await chooseSelectOption(form.getByRole('combobox',{name:'Следующая фаза цикла',exact:true}),phase);if(['refactoring','acceptance'].includes(phase))await form.getByRole('button',{name:'Выбрать текущие GREEN',exact:true}).click();await form.getByRole('textbox',{name:'Подтверждение перехода цикла',exact:true}).fill('Actual scoped transition '+phase+' with exact run links');await form.getByRole('button',{name:'Записать переход цикла',exact:true}).click();await expect.poll(async()=>(await getState()).verificationCycles[0].phase).toBe(phase);};
        state=await command({type:'startExecution',specId:work.id,specRevisionId:workRevision.id,agentId:registered.agent.id});const workExecution=state.executions.at(-1)!;
        const workCall=async(name:string,extra:Record<string,unknown>={})=>{const worker=new Client({name:'verification-work-browser',version:'1'});await worker.connect(new StreamableHTTPClientTransport(new URL(scope(project.id)+'/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+registered.token}}}));try{const result=await worker.callTool({name,arguments:{executionId:workExecution.id,requestId:crypto.randomUUID(),expectedVersion:(await getState()).version,...extra}});expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);}finally{await worker.close();}await expect(page.locator('.ws-project-footer')).toContainText('Позиция истории №'+(await getState()).version);};
        await workCall('ouro.confirm_started');
        await advance('implementation');
        await advance('verification');

        await setSlice('product-green');
        await importRun('partial', 'product-green');
        await expect(panel.locator('.verification-readiness')).toContainText('Неполное покрытие');
        await importRun('green', 'product-green');
        await review('usable');
        await expect(panel.locator('.verification-readiness')).toContainText('Применимо к выбранному срезу');
        await advance('refactoring');
        const refactorSave=panel.getByRole('button',{name:'Согласовать сопоставимость тестов',exact:true,includeHidden:true});await reveal(refactorSave);const refactor=refactorSave.locator('xpath=ancestor::form');
        for(const [prefix,tests] of [['До · ','tests-unchanged'],['После · ','tests-refactored']] as const){for(const [label,value] of [['Версия продукта','product-green'],['Версия тестов',tests],['Версия данных и конфигурации','fixture-v1'],['SHA-256 окружения','a'.repeat(64)]])await refactor.getByRole('textbox',{name:prefix+label,exact:true}).fill(value);}
        await refactor.getByRole('textbox',{name:'Основание сопоставимости',exact:true}).fill('Only test implementation was refactored; expected behavior is unchanged');await refactor.getByRole('textbox',{name:'Доказательство сохранения ожидания',exact:true}).fill('Reviewed the same two assertions and fixture/configuration scope');await refactorSave.click();await expect.poll(async()=>(await getState()).verificationRefactorAdmissions.length).toBe(1);
        await setSlice('product-green','tests-refactored');await advance('verification');await importRun('green','product-green','tests-refactored');await review('usable');await workCall('ouro.complete_execution',{result:'succeeded',evidence:'Both scoped behavior examples implemented and rechecked; human acceptance remains separate'});await advance('acceptance');
        const linkedCycle=(await getState()).verificationCycles[0];expect(linkedCycle.baselineRunIds).toEqual([redRun.id]);expect(linkedCycle.greenRunIds).toEqual([(await getState()).verificationRuns.at(-1)!.id]);

        const preserved = (await getState()).verificationRuns[3];
        await setSlice('product-later');
        await expect(panel.locator('.verification-readiness')).toContainText('Нужна повторная проверка');
        expect((await getState()).verificationRuns[3]).toEqual(preserved);
        await page.getByRole('navigation', { name: 'Разделы проекта' }).getByRole('button', { name: 'Дорожная карта', exact: true }).click();
        const card = page.locator('.react-flow__node .verification-pair');
        await expect(card).toHaveCount(1);
        await page.emulateMedia({reducedMotion:'no-preference'});
        const rotor=card.locator('.verification-rotor'),originalSize=await card.boundingBox();
        await expect(rotor).toHaveCount(1);
        await expect(rotor).toHaveCSS('transition-duration','0.7s');
        for(const link of await page.locator('.ws-topbar a').all()){await link.hover();await expect(link).toHaveCSS('text-decoration-line','none');}
        const version = (await getState()).version;
        await card.getByRole('button', { name: 'Работа', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(card).toHaveAttribute('data-foreground-id', work.id);
        expect(await rotor.evaluate(element=>element.getAnimations().some(animation=>animation.playState==='running'))).toBe(true);
        await expect(card.locator('.verification-face-work')).toHaveAttribute('aria-hidden','false');
        await expect(card.locator('.verification-face-verification')).toHaveAttribute('inert','');
        await expect.poll(()=>rotor.evaluate(element=>element.getAnimations().length)).toBe(0);
        expect((await card.boundingBox())?.height).toBe(originalSize?.height);
        await expect(card.getByRole('button',{name:'Работа',exact:true})).toBeFocused();
        await card.getByRole('button', { name: 'Проверка', exact: true }).click();
        await expect(card).toHaveAttribute('data-foreground-id', verification.id);
        await expect(card.locator('.verification-face-work')).toHaveAttribute('inert','');
        await expect.poll(()=>rotor.evaluate(element=>element.getAnimations().length)).toBe(0);
        expect((await card.boundingBox())?.height).toBe(originalSize?.height);
        await page.emulateMedia({reducedMotion:'reduce'});
        await card.getByRole('button',{name:'Работа',exact:true}).click();
        await expect(rotor).toHaveCSS('transition-duration','0s');
        expect(await rotor.evaluate(element=>element.getAnimations().length)).toBe(0);
        await expect(card.getByRole('button',{name:'Work with verification pair',exact:true})).toBeVisible();
        await card.getByRole('button',{name:'Проверка',exact:true}).click();
        expect((await getState()).version).toBe(version);
        await page.screenshot({ path: path.join(artifactDir, 'pair-graph.png'), fullPage: true });
        await page.getByRole('button', { name: 'Список', exact: true }).click();
        await expect(page.locator('.ws-spec-table .verification-pair')).toContainText('Нужна повторная проверка');
        await page.screenshot({ path: path.join(artifactDir, 'pair-list.png'), fullPage: true });
        await page.locator('.ws-spec-table .verification-pair').getByRole('button', { name: 'Behavior verification', exact: true }).click();
        const editorSave = page.getByRole('region', { name: 'Проверка и результаты', exact: true }).getByRole('button', { name: 'Сохранить проверочную ревизию', exact: true, includeHidden: true });
        await reveal(editorSave);
        const editor = editorSave.locator('xpath=ancestor::form');
        await editor.getByLabel('Ожидаемый наблюдаемый результат').first().fill('Returns five after explicit expectation revision');
        await editor.getByRole('button', { name: 'Удалить случай 2', exact: true }).click();
        await editor.getByLabel('Основание изменения ожиданий').fill('Owner explicitly narrows the scope; second case remains in history');
        const revisionCount = (await getState()).revisions.length;
        await editorSave.click();
        await expect.poll(async () => (await getState()).revisions.length).toBe(revisionCount + 1);
        const proposal = (await getState()).revisions.at(-1)!;
        await chooseSelectOption(page.getByLabel('Ревизия задачи', { exact: true }), proposal.id);
        await expect(page.getByRole('region', { name: 'Проверка и результаты', exact: true })).toContainText('Изменено ожидание');
        await expect(page.getByRole('region', { name: 'Проверка и результаты', exact: true })).toContainText('Удалён случай');
        await page.screenshot({ path: path.join(artifactDir, 'expectation-change.png'), fullPage: true });
        expect((await getState()).specs.every(spec => spec.state !== 'done')).toBe(true);
    }
    catch(error){await page.screenshot({path:path.join(artifactDir,'browser-failure.png'),fullPage:true});throw error;}
    finally {
        await rm(folder, { recursive: true, force: true });
    }
});
