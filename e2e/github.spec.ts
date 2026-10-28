import { test, expect } from '@playwright/test';

test('G09 GitHub integrations screen describes server setup and immutable execution context',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  await page.getByRole('button',{name:'Интеграции',exact:true}).click();
  await expect(page.getByRole('heading',{name:'GitHub',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Настройка GitHub'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Привязать репозиторий к попытке'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Доставки GitHub'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Настройка GitHub'}).getByText('Проверка SHA через GitHub API',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Проверенные коммиты'})).toContainText('не подтверждает GPG-подпись, качество кода или DoD');
  const response=await page.request.get('/api/github');expect(response.ok(),await response.text()).toBeTruthy();
  const info=await response.json();
  await expect(page.getByRole('region',{name:'Настройка GitHub'})).toContainText(info.setup.webhookSecretConfigured?'Секрет webhook задан':'Секрет webhook не задан');
  await expect(page.getByRole('textbox',{name:'Webhook URL',exact:true})).toHaveValue(info.setup.webhookUrl);
  await expect(page.getByRole('textbox',{name:'Webhook URL',exact:true})).toHaveJSProperty('readOnly',true);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(Object.keys(info.setup).sort()).toEqual(['apiTokenConfigured','verification','webhookSecretConfigured','webhookUrl'].sort());
});

test('G09 binding form validates repository and ref before any remote verification or domain write',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  const before=(await(await page.request.get('/api/project')).json()).state;
  expect(before.executions.length).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Интеграции',exact:true}).click();
  const form=page.getByRole('region',{name:'Привязать репозиторий к попытке'});
  const execution=before.executions[0],revision=before.revisions.find((r:{id:string})=>r.id===execution.specRevisionId);
  await form.getByRole('combobox',{name:'Попытка исполнения',exact:true}).selectOption(execution.id);
  await expect(form.getByRole('region',{name:'Контекст привязки'})).toContainText(`Ревизия r${revision.revision}`);
  await expect(form.getByRole('region',{name:'Контекст привязки'})).toContainText(execution.id);
  const repository=form.getByRole('textbox',{name:'Репозиторий',exact:true}),ref=form.getByRole('textbox',{name:'Ветка GitHub',exact:true});
  let writes=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/github/bindings'&&request.method()==='POST')writes++;});
  await repository.fill('not-a-repository');
  await form.getByRole('button',{name:'Создать привязку',exact:true}).click();
  expect(await repository.evaluate((element:HTMLInputElement)=>element.checkValidity())).toBe(false);
  await repository.fill('example/repository');await ref.fill('main');
  await form.getByRole('button',{name:'Создать привязку',exact:true}).click();
  expect(await ref.evaluate((element:HTMLInputElement)=>element.checkValidity())).toBe(false);
  expect(writes).toBe(0);
  expect(((await(await page.request.get('/api/project')).json()).state).version).toBe(before.version);
});

test('G09 GitHub management requires a human session and unsigned webhooks create no fact',async({request})=>{
  expect((await request.get('/api/github')).status()).toBe(401);
  expect((await request.post('/api/github/bindings',{data:{}})).status()).toBe(401);
  expect((await request.get('/api/session')).ok()).toBeTruthy();
  const before=(await(await request.get('/api/project')).json()).state;
  const info=await request.get('/api/github');expect(info.ok(),await info.text()).toBeTruthy();
  const body=await info.json();expect(body.setup.verification).toBe('github-api-sha');
  expect(typeof body.setup.webhookSecretConfigured).toBe('boolean');expect(typeof body.setup.apiTokenConfigured).toBe('boolean');
  const denied=await request.post('/api/github/webhook',{headers:{'x-github-event':'push','x-github-delivery':crypto.randomUUID()},data:{repository:{id:1,full_name:'example/repository'},ref:'refs/heads/main'}});
  expect([401,403,503]).toContain(denied.status());
  const after=(await(await request.get('/api/project')).json()).state;
  expect(after.version).toBe(before.version);expect(after.events).toEqual(before.events);
});
