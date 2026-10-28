import {test,expect} from '@playwright/test';
import type {ProjectState} from '../packages/core/src';

test('text-only revision preserves the original process snapshot',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  const flow={entryNodeId:'work',nodes:[{id:'work',kind:'action',title:'Проверить контракт',description:'Проверка',owner:'agent'},{id:'result',kind:'result',title:'Предъявить результат',description:'Доказательство',owner:'agent'}],edges:[{id:'work-result',source:'work',target:'result',label:'Проверено'}]};
  const read=async()=>(await(await page.request.get('/api/project')).json()).state as ProjectState;
  const mutate=async(data:Record<string,unknown>)=>{const current=await read();const response=await page.request.post('/api/commands',{data:{...data,requestId:crypto.randomUUID(),expectedVersion:current.version}});expect(response.ok(),await response.text()).toBeTruthy();return(await response.json()).state as ProjectState;};
  let state=await mutate({type:'createSpec',content:{title:`Сохранить процесс ${Date.now()}`,goal:'Не потерять процесс при уточнении текста.',dod:[{id:'flow-kept',text:'Схема сохранена',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',flow}});
  const spec=state.specs.at(-1)!,original=state.revisions.at(-1)!;
  await mutate({type:'activateRevision',specId:spec.id,revisionId:original.id});
  await page.reload();await page.getByRole('button',{name:'Спецификации',exact:true}).click();
  await page.getByLabel('Выбрать спецификацию',{exact:true}).selectOption(spec.id);
  await page.getByRole('button',{name:'Предложить ревизию',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:'Цель',exact:true}).fill('Уточнённая цель с прежним процессом.');
  await dialog.getByRole('button',{name:'Сохранить предложение',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  state=await read();
  const revised=state.revisions.findLast(r=>r.specId===spec.id)!;
  expect(revised.id).not.toBe(original.id);
  expect(revised.goal).toBe('Уточнённая цель с прежним процессом.');
  expect(revised.flow).toEqual(flow);
  expect(state.revisions.find(r=>r.id===original.id)).toEqual(original);
});
