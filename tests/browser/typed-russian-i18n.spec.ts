import {test,expect} from '@playwright/test';
declare global{interface Window{typedRussianI18nProbe:{state:()=>{ready:Array<{name:string;ready:boolean;provided:boolean;text:string}>;sameA:boolean;sameB:boolean;isolated:boolean;submissions:unknown[]};mutateFirst:()=>void}}}
const fixture='/tests/fixtures/typed-russian-i18n.html',heading='Задача для подключённого агента';
test.beforeEach(async({page})=>{await page.route('**/api/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({actor:{id:'i18n-fixture-human',kind:'human',projectIds:['i18n-fixture-project']},account:{id:'i18n-fixture-human'}})}));});

test('root and web hooks share each explicit production Provider while independent Providers remain isolated',async({page},testInfo)=>{
 await page.goto(fixture);await expect.poll(()=>page.evaluate(()=>window.typedRussianI18nProbe.state().ready.length)).toBe(4);await testInfo.attach('public-context-state',{body:JSON.stringify(await page.evaluate(()=>window.typedRussianI18nProbe.state()),null,2),contentType:'application/json'});for(const name of ['a-root','a-web','b-root','b-web'])await expect(page.getByTestId(name)).toHaveText(heading);
 const state=await page.evaluate(()=>window.typedRussianI18nProbe.state());expect(state.ready).toHaveLength(4);expect(state.ready.every(value=>value.ready&&value.provided)).toBe(true);expect(state.sameA).toBe(true);expect(state.sameB).toBe(true);expect(state.isolated).toBe(true);
 await page.evaluate(()=>window.typedRussianI18nProbe.mutateFirst());await expect(page.getByTestId('a-root')).toHaveText('Изменён только первый экземпляр');await expect(page.getByTestId('a-web')).toHaveText('Изменён только первый экземпляр');await expect(page.getByTestId('b-root')).toHaveText(heading);await expect(page.getByTestId('b-web')).toHaveText(heading);
});

test('real assignment form keeps raw inputs through RU refresh and an unconfirmed submission',async({page})=>{
 let posts=0;page.on('request',request=>{if(request.method()==='POST')posts++;});await page.goto(fixture);
 const goal=page.getByRole('textbox',{name:'Задача для агента',exact:true}),title=page.getByRole('textbox',{name:'Название задачи',exact:true}),dod=page.getByRole('textbox',{name:'Критерии готовности',exact:true});
 await goal.fill('  Первая строка\nВторая строка  ');await title.fill('  Ручное название  ');await dod.fill('  Критерий один\n\nКритерий два  ');const agentBefore=await page.getByRole('combobox',{name:'Исполнитель задачи',exact:true}).textContent();
 await page.getByRole('button',{name:'Обновить RU',exact:true}).click();await expect(page.getByTestId('rerenders')).toHaveText('1');await expect(goal).toHaveValue('  Первая строка\nВторая строка  ');await expect(title).toHaveValue('  Ручное название  ');await expect(dod).toHaveValue('  Критерий один\n\nКритерий два  ');expect(await page.getByRole('combobox',{name:'Исполнитель задачи',exact:true}).textContent()).toBe(agentBefore);
 expect(await page.evaluate(()=>window.typedRussianI18nProbe.state().submissions)).toHaveLength(0);expect(posts).toBe(0);
 await page.getByRole('button',{name:'Назначить работу',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.typedRussianI18nProbe.state().submissions.length)).toBe(1);await expect(goal).toHaveValue('  Первая строка\nВторая строка  ');await expect(title).toHaveValue('  Ручное название  ');await expect(dod).toHaveValue('  Критерий один\n\nКритерий два  ');expect(posts).toBe(0);
});
