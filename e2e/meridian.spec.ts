import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Synthetic DTO adapted from pinned host tests; never a native-runtime capture.
const raw=readFileSync('tests/fixtures/meridian/scope.json','utf8');
const importRegion=(page:Page)=>page.getByRole('region',{name:'Импорт контекста Meridian',exact:true});
async function openImport(page:Page){
  await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  await page.getByRole('button',{name:'Интеграции',exact:true}).click();
  await page.getByRole('button',{name:'Meridian',exact:true}).click();
  await expect(importRegion(page)).toBeVisible();
}
async function loadFile(page:Page,document=raw){
  await importRegion(page).getByLabel('JSON контекста Meridian',{exact:true}).setInputFiles({name:'scope.json',mimeType:'application/json',buffer:Buffer.from(document,'utf8')});
}

test('M05 invalid imported source creates no history and stays explicit in mobile light theme',async({page})=>{
  await page.setViewportSize({width:760,height:950});
  await openImport(page);
  await page.getByRole('button',{name:'Включить светлую тему',exact:true}).click();
  await expect(importRegion(page)).toHaveAttribute('data-theme','light');
  expect(await importRegion(page).evaluate(element=>getComputedStyle(element).getPropertyValue('--text').trim())).toBe('#18181b');
  const before=(await(await page.request.get('/api/project')).json()).state;
  const invalid=JSON.parse(raw);invalid.actions_authorized=true;
  await loadFile(page,JSON.stringify(invalid));
  await expect(importRegion(page).getByRole('alert')).toContainText('контракт');
  await expect(importRegion(page).getByRole('button',{name:'Создать черновик спеки',exact:true})).toHaveCount(0);
  const after=(await(await page.request.get('/api/project')).json()).state;
  expect(after.version).toBe(before.version);expect(after.events).toEqual(before.events);
});

test('M05 file preview edits expectations then creates only an inactive draft with immutable source and pins',async({page})=>{
  await openImport(page);await loadFile(page);
  const panel=importRegion(page),preview=panel.getByRole('region',{name:'Предпросмотр Meridian',exact:true});
  await expect(preview).toContainText('synthetic-workspace');await expect(preview).toContainText('synthetic-attempt');
  await expect(preview).toContainText('Подлинность источника не проверена');
  const title=`Meridian import ${crypto.randomUUID()}`;
  await panel.getByRole('textbox',{name:'Название черновика',exact:true}).fill(title);
  await panel.getByRole('textbox',{name:'Цель черновика',exact:true}).fill('Уточнённое человеком ожидание');
  await page.getByRole('button',{name:'GitHub',exact:true}).click();
  await page.getByRole('button',{name:'Meridian',exact:true}).click();
  await page.getByRole('button',{name:'Включить светлую тему',exact:true}).click();
  await expect(panel.getByRole('textbox',{name:'Название черновика',exact:true})).toHaveValue(title);
  await expect(panel.getByRole('textbox',{name:'Цель черновика',exact:true})).toHaveValue('Уточнённое человеком ожидание');
  const receipt=page.waitForResponse(response=>response.url().endsWith('/api/meridian/import')&&response.request().method()==='POST');
  await panel.getByRole('button',{name:'Создать черновик спеки',exact:true}).click();
  const response=await receipt;expect(response.ok(),await response.text()).toBeTruthy();
  const result=await response.json(),created=result.events.find((event:{type:string})=>event.type==='SpecCreated');
  const spec=result.state.specs.find((candidate:{id:string})=>candidate.id===created.specId);
  expect(spec.title).toBe(title);expect(spec.state).toBe('idea');expect(spec.activeRevisionId).toBeNull();
  expect(result.state.executions.filter((execution:{specId:string})=>execution.specId===spec.id)).toHaveLength(0);
  expect(spec.acceptance).toBeUndefined();expect(spec.origin.transportVerification).toBe('unverified_import');
  expect(spec.origin.documentSha256).toBe(createHash('sha256').update(raw,'utf8').digest('hex'));
  expect(created.payload.meridianSource.rawDocument).toBe(raw);
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  const origin=page.getByRole('region',{name:'Происхождение Meridian',exact:true});
  await expect(origin).toContainText('synthetic-attempt');await expect(origin).toContainText(spec.origin.documentSha256);
  const download=page.waitForEvent('download');await origin.getByRole('button',{name:'Скачать исходный JSON',exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
});

test('M05 lost response retries the same import after later events and opens the exact receipt spec',async({page})=>{
  await openImport(page);await loadFile(page);
  const panel=importRegion(page),title=`Meridian retry ${crypto.randomUUID()}`;
  await panel.getByRole('textbox',{name:'Название черновика',exact:true}).fill(title);
  const sent:unknown[]=[];let committedId='';
  await page.route('**/api/meridian/import',async route=>{
    sent.push(route.request().postDataJSON());
    if(sent.length===1){const response=await route.fetch(),body=await response.json();expect(response.ok()).toBeTruthy();committedId=body.events.find((event:{type:string})=>event.type==='SpecCreated').specId;await route.abort('failed');}
    else if(sent.length===2)await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'UNAUTHENTICATED',message:'Сеанс временно недоступен.'}})});
    else await route.continue();
  });
  await panel.getByRole('button',{name:'Создать черновик спеки',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('не подтверждён');
  await expect(panel.getByRole('textbox',{name:'Название черновика',exact:true})).toHaveJSProperty('readOnly',true);
  await page.getByRole('button',{name:'Дорожная карта',exact:true}).click();
  await page.getByRole('button',{name:'Интеграции',exact:true}).click();
  await page.getByRole('button',{name:'Meridian',exact:true}).click();
  await expect(panel.getByRole('textbox',{name:'Название черновика',exact:true})).toHaveValue(title);
  await expect(panel.getByRole('textbox',{name:'Название черновика',exact:true})).toHaveJSProperty('readOnly',true);
  const guarded=await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
  expect(guarded).toBe(true);
  const current=(await(await page.request.get('/api/project')).json()).state;
  const unrelated=await page.request.post('/api/commands',{data:{type:'createSpec',requestId:crypto.randomUUID(),expectedVersion:current.version,content:{title:'Later unrelated draft',goal:'Keep selection exact',constraints:'',assumptions:'',risks:'',inputs:'',comment:'',dod:[{id:'separate-dod',text:'Separate outcome',required:true}]}}});
  expect(unrelated.ok(),await unrelated.text()).toBeTruthy();
  await panel.getByRole('button',{name:'Повторить тот же импорт',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('Сеанс временно недоступен');
  await expect(panel.getByRole('textbox',{name:'Название черновика',exact:true})).toHaveJSProperty('readOnly',true);
  await panel.getByRole('button',{name:'Повторить тот же импорт',exact:true}).click();
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  expect(sent).toHaveLength(3);expect(sent[1]).toEqual(sent[0]);expect(sent[2]).toEqual(sent[0]);
  const final=(await(await page.request.get('/api/project')).json()).state;
  expect(final.specs.filter((spec:{title:string})=>spec.title===title)).toHaveLength(1);
  expect(final.specs.find((spec:{title:string})=>spec.title===title).id).toBe(committedId);
});

test('M05 a proven absent receipt releases an uncommitted import only for explicit human rebase',async({page})=>{
  await openImport(page);await loadFile(page);
  const panel=importRegion(page),title=`Meridian absent ${crypto.randomUUID()}`;
  await panel.getByRole('textbox',{name:'Название черновика',exact:true}).fill(title);
  const before=(await(await page.request.get('/api/project')).json()).state;
  const guarded=()=>page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
  const sent:{requestId:string;expectedVersion:number;rawDocument:string;content:{title:string}}[]=[];
  await page.route('**/api/meridian/import',async route=>{
    sent.push(route.request().postDataJSON());
    // No route.fetch: the original request never reaches the application.
    if(sent.length===1)await route.abort('failed');else await route.continue();
  });
  await panel.getByRole('button',{name:'Создать черновик спеки',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('не подтверждён');
  await expect(panel.getByRole('textbox',{name:'Название черновика',exact:true})).toHaveJSProperty('readOnly',true);
  expect(await guarded()).toBe(true);
  const unchanged=(await(await page.request.get('/api/project')).json()).state;
  expect(unchanged.version).toBe(before.version);
  expect(unchanged.specs.filter((spec:{title:string})=>spec.title===title)).toHaveLength(0);

  await page.getByRole('button',{name:'Дорожная карта',exact:true}).click();
  await page.getByRole('button',{name:'Интеграции',exact:true}).click();
  await page.getByRole('button',{name:'Meridian',exact:true}).click();
  await expect(panel.getByRole('textbox',{name:'Название черновика',exact:true})).toHaveValue(title);
  const unrelated=await page.request.post('/api/commands',{data:{type:'createSpec',requestId:crypto.randomUUID(),expectedVersion:before.version,content:{title:'Advance cursor before absent receipt proof',goal:'Exercise explicit human rebase',constraints:'',assumptions:'',risks:'',inputs:'',comment:'',dod:[{id:'separate-dod',text:'Separate outcome',required:true}]}}});
  expect(unrelated.ok(),await unrelated.text()).toBeTruthy();
  const later=await unrelated.json();
  const conflictPromise=page.waitForResponse(response=>response.url().endsWith('/api/meridian/import')&&response.request().method()==='POST');
  await panel.getByRole('button',{name:'Повторить тот же импорт',exact:true}).click();
  const conflict=await conflictPromise;expect(conflict.status()).toBe(409);
  const proof=await conflict.json();
  expect(proof.error.code).toBe('VERSION_CONFLICT');expect(proof.error.details.meridianReceipt).toBe('absent');
  expect(sent).toHaveLength(2);expect(sent[1]).toEqual(sent[0]);
  expect(sent[0].expectedVersion).toBe(before.version);
  await expect(panel.getByRole('textbox',{name:'Название черновика',exact:true})).toHaveJSProperty('readOnly',false);
  await expect(panel.getByRole('button',{name:'Повторить тот же импорт',exact:true})).toHaveCount(0);
  expect(await guarded()).toBe(false);
  await expect(panel.getByText(`ЧЕРНОВИК · БАЗА ${before.version}`,{exact:true})).toBeVisible();
  const revisedTitle=`${title} after review`;
  await panel.getByRole('textbox',{name:'Название черновика',exact:true}).fill(revisedTitle);
  await panel.getByRole('button',{name:'Обновить базу после проверки',exact:true}).click();
  await expect(panel.getByText(`ЧЕРНОВИК · БАЗА ${later.cursor}`,{exact:true})).toBeVisible();
  const receiptPromise=page.waitForResponse(response=>response.url().endsWith('/api/meridian/import')&&response.request().method()==='POST');
  await panel.getByRole('button',{name:'Создать черновик спеки',exact:true}).click();
  const receipt=await receiptPromise;expect(receipt.ok(),await receipt.text()).toBeTruthy();
  const result=await receipt.json();
  await expect(page.getByRole('heading',{name:revisedTitle,exact:true})).toBeVisible();
  expect(sent).toHaveLength(3);expect(sent[2].requestId).not.toBe(sent[0].requestId);
  expect(sent[2].expectedVersion).toBe(later.cursor);expect(sent[2].rawDocument).toBe(sent[0].rawDocument);
  expect(result.state.specs.filter((spec:{title:string})=>spec.title.startsWith(title))).toHaveLength(1);
  expect(result.state.specs.find((spec:{title:string})=>spec.title===revisedTitle).activeRevisionId).toBeNull();
  expect(await guarded()).toBe(false);
});

test('M06 a named participant owns import receipts across cookie switches; revocation cannot fall back to demo',async({page,browser,baseURL})=>{
  test.setTimeout(60000);
  await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  const createdA=await page.request.post('/api/participants',{data:{name:`Meridian Alice ${crypto.randomUUID()}`}}),createdB=await page.request.post('/api/participants',{data:{name:`Meridian Boris ${crypto.randomUUID()}`}});
  expect(createdA.ok()).toBeTruthy();expect(createdB.ok()).toBeTruthy();
  const a=await createdA.json(),b=await createdB.json(),context=await browser.newContext({baseURL});
  try{
    const participant=await context.newPage();
    const login=async(credential:string)=>{const response=await context.request.post('/api/participants/session',{data:{credential}});expect(response.ok(),await response.text()).toBeTruthy();};
    await login(a.credential);await openImport(participant);await loadFile(participant);
    const panel=importRegion(participant),title=`Named Meridian ${crypto.randomUUID()}`;
    await panel.getByRole('textbox',{name:'Название черновика',exact:true}).fill(title);
    let committedId='';const sent:unknown[]=[];
    await participant.route('**/api/meridian/import',async route=>{
      sent.push(route.request().postDataJSON());
      if(sent.length===1){const response=await route.fetch(),body=await response.json();expect(response.ok()).toBeTruthy();const created=body.events.find((event:{type:string})=>event.type==='SpecCreated');expect(created.actor.id).toBe(a.participant.id);committedId=created.specId;await route.abort('failed');}
      else await route.continue();
    });
    await panel.getByRole('button',{name:'Создать черновик спеки',exact:true}).click();
    await expect(panel.getByRole('alert')).toContainText('не подтверждён');
    // A different tab changes the shared cookie while this Home still belongs to A.
    await login(b.credential);
    const rejected=participant.waitForResponse(response=>response.url().endsWith('/api/meridian/import')&&response.request().method()==='POST');
    await panel.getByRole('button',{name:'Повторить тот же импорт',exact:true}).click();
    const mismatch=await rejected,denied=await mismatch.json();
    expect(mismatch.status()).toBe(401);expect(denied.error.code).toBe('PARTICIPANT_CHANGED');expect(denied.error.details?.meridianReceipt).toBeUndefined();
    await expect(panel.getByRole('textbox',{name:'Название черновика',exact:true})).toHaveJSProperty('readOnly',true);
    await participant.getByRole('button',{name:'История',exact:true}).click();
    await participant.getByRole('spinbutton',{name:'Исторический cursor',exact:true}).fill('0');
    await participant.getByRole('button',{name:'Открыть состояние на cursor',exact:true}).click();
    await expect(participant.getByRole('region',{name:'Историческое состояние',exact:true})).toBeVisible();
    await participant.getByRole('button',{name:'Вернуться к текущей работе',exact:true}).click();
    await participant.getByRole('button',{name:'Интеграции',exact:true}).click();
    await participant.getByRole('button',{name:'Meridian',exact:true}).click();
    await expect(panel.getByRole('textbox',{name:'Название черновика',exact:true})).toHaveValue(title);
    await expect(panel.getByRole('textbox',{name:'Название черновика',exact:true})).toHaveJSProperty('readOnly',true);
    await login(a.credential);
    await panel.getByRole('button',{name:'Повторить тот же импорт',exact:true}).click();
    await expect(participant.getByRole('heading',{name:title,exact:true})).toBeVisible();
    expect(sent).toHaveLength(3);expect(sent[1]).toEqual(sent[0]);expect(sent[2]).toEqual(sent[0]);
    const before=(await(await page.request.get('/api/project')).json()).state;
    expect(before.specs.filter((spec:{title:string})=>spec.title===title)).toHaveLength(1);expect(before.specs.find((spec:{title:string})=>spec.title===title).id).toBe(committedId);
    const revoke=await page.request.post(`/api/participants/${a.participant.id}/revoke`,{data:{}});expect(revoke.ok(),await revoke.text()).toBeTruthy();
    const blocked=await context.request.post('/api/meridian/import',{headers:{'X-Ouro-Expected-Participant':a.participant.id},data:sent[0]});expect(blocked.status()).toBe(401);
    expect((await(await page.request.get('/api/project')).json()).state.version).toBe(before.version);
  }finally{await context.close();}
});
