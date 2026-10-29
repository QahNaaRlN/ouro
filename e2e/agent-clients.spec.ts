import {test,expect} from '@playwright/test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('CO04/CO05 Cursor and Claude configurations stay project-bound after a one-time key is hidden',async({page,baseURL})=>{
 test.setTimeout(90000);const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
 const rootA=await mkdtemp(join(tmpdir(),'ouro-client-ui-a-')),rootB=await mkdtemp(join(tmpdir(),'ouro-client-ui-b-'));
 let projectA:{id:string;name:string}|undefined,projectB:{id:string;name:string}|undefined,agentId:string|undefined;
 try{
  await page.request.get('/api/session');
  const create=async(rootPath:string,name:string)=>{const response=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),rootPath,name}});expect(response.ok()).toBe(true);return(await response.json()).project as {id:string;name:string};};
  projectA=await create(rootA,`Cursor и Claude ${crypto.randomUUID().slice(0,8)}`);projectB=await create(rootB,`Изолированный клиент ${crypto.randomUUID().slice(0,8)}`);
  await page.goto(`/projects/${projectA.id}`);await expect(page.getByRole('heading',{name:projectA.name,exact:true})).toBeVisible();
  const panel=page.getByRole('region',{name:'Подключение MCP-агента',exact:true});
  const client=panel.getByRole('combobox',{name:'MCP-клиент',exact:true});await expect(client).toBeVisible();await expect(client).toHaveValue('cursor');
  const name=panel.getByRole('textbox',{name:'Имя подключения',exact:true});await expect(name).toHaveValue('Cursor');
  await name.fill('Мой Cursor');await client.selectOption('claude-code');await expect(name).toHaveValue('Мой Cursor');await client.selectOption('cursor');
  const registrations:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname===`/api/projects/${projectA!.id}/agents`)registrations.push(request.url());});
  const registration=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${projectA!.id}/agents`&&response.request().method()==='POST');await panel.getByRole('button',{name:'Зарегистрировать агента',exact:true}).click();
  const issued=await(await registration).json();agentId=issued.agent.id;const token=await panel.getByLabel('Ключ агента',{exact:true}).inputValue();expect(token===issued.token&&token.length>20).toBe(true);
  const config=panel.getByRole('textbox',{name:'Конфигурация MCP проекта',exact:true}),copy=panel.getByRole('button',{name:'Скопировать конфигурацию',exact:true}),download=panel.getByRole('button',{name:'Скачать JSON',exact:true});
  await expect(copy).toBeDisabled();await expect(download).toBeDisabled();await expect(config).toHaveValue('');
  const keyFile=join(rootA,'..',`ключ MCP's ${crypto.randomUUID()}.key`);await panel.getByLabel('Файл ключа агента',{exact:true}).fill(keyFile);
  const parsed=()=>config.inputValue().then(value=>JSON.parse(value) as {mcpServers:Record<string,{type?:string;command:string;args:string[];env:Record<string,string>}>});
  const cursor=await parsed(),serverName=Object.keys(cursor.mcpServers)[0],entry=cursor.mcpServers[serverName];expect(serverName).toBe(`ouro-${projectA.id}`);expect(entry.type).toBe('stdio');expect(entry.env.OURO_URL).toBe(new URL(`/api/projects/${projectA.id}/mcp`,baseURL).href);expect(entry.env.OURO_AGENT_TOKEN_FILE).toBe(keyFile);expect(JSON.stringify(cursor).includes(token)).toBe(false);expect(entry.env).not.toHaveProperty('OURO_AGENT_TOKEN');await expect(copy).toBeEnabled();
  const received=page.waitForEvent('download');await download.click();const file=await received;expect(file.suggestedFilename()).toBe('ouro-cursor-mcp.json');const data=await readFile((await file.path())!,'utf8');expect(JSON.parse(data)).toEqual(cursor);expect(data.includes(token)).toBe(false);
  await panel.getByRole('button',{name:'Ключ сохранён — скрыть',exact:true}).click();await expect(panel.getByLabel('Ключ агента',{exact:true})).toHaveCount(0);await expect(config).toHaveValue(JSON.stringify(cursor,null,2));
  await client.selectOption('claude-code');const code=await parsed();expect(code.mcpServers[serverName].type).toBe('stdio');await expect(panel.getByTestId('client-config-instructions')).toContainText('.mcp.json');
  const single=panel.getByRole('textbox',{name:'Server entry для Claude Code',exact:true});await panel.getByText('Одна server entry для Claude Code CLI',{exact:true}).click();expect(JSON.parse(await single.inputValue())).toEqual(code.mcpServers[serverName]);expect(JSON.parse(await single.inputValue())).not.toHaveProperty('mcpServers');
  await client.selectOption('claude-desktop');expect((await parsed()).mcpServers[serverName]).not.toHaveProperty('type');await expect(panel.getByTestId('client-config-instructions')).toContainText('claude_desktop_config.json');
  await client.selectOption('chatgpt');await expect(panel.getByTestId('client-config-instructions')).toContainText('Secure MCP Tunnel');await client.selectOption('cursor');
  await panel.getByLabel('Файл ключа агента',{exact:true}).fill('relative.key');await expect(copy).toBeDisabled();await expect(download).toBeDisabled();await expect(config).toHaveValue('');await expect(panel.getByRole('status',{name:'Проверка конфигурации'})).toContainText('абсолют');expect(registrations).toHaveLength(1);
  const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));expect(storage.includes(token)).toBe(false);
  await page.getByRole('navigation',{name:'Навигация проектов',exact:true}).getByRole('link',{name:'Проекты',exact:true}).click();await page.locator(`a[href="/projects/${projectB.id}"]`).first().click();await expect(page.getByRole('heading',{name:projectB.name,exact:true})).toBeVisible();
  await expect(config).toHaveValue('');await expect(panel.getByLabel('Файл ключа агента',{exact:true})).toHaveValue('');await client.selectOption('claude-desktop');await panel.getByLabel('Файл ключа агента',{exact:true}).fill(keyFile);
  const isolated=await parsed();expect(Object.keys(isolated.mcpServers)).toEqual([`ouro-${projectB.id}`]);expect(Object.values(isolated.mcpServers)[0].env.OURO_URL).toBe(new URL(`/api/projects/${projectB.id}/mcp`,baseURL).href);expect(JSON.stringify(isolated).includes(projectA.id)).toBe(false);await expect(panel.getByLabel('Ключ агента',{exact:true})).toHaveCount(0);
  const state=await(await page.request.get(`/api/projects/${projectA.id}`)).json();expect(state.state.executions).toHaveLength(0);expect(state.state.events.some((event:{type:string})=>event.type==='ExecutionStarted')).toBe(false);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);expect(pageErrors).toEqual([]);
 }finally{
  if(projectA&&agentId)await page.request.post(`/api/projects/${projectA.id}/agents/${agentId}/revoke`,{data:{},timeout:3000}).catch(()=>{});
  await rm(rootA,{recursive:true,force:true});await rm(rootB,{recursive:true,force:true});
 }
});

test('CO07 help explains Cursor, both Claude clients and the separate ChatGPT tunnel',async({page})=>{
 await page.goto('/projects/help');await expect(page.getByRole('heading',{name:'Подключить агента к Ouro',exact:true})).toBeVisible();
 for(const name of ['Cursor','Claude Code','Claude Desktop','ChatGPT'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Официальная инструкция Cursor',exact:true})).toHaveAttribute('href','https://cursor.com/docs/mcp');await expect(page.getByRole('link',{name:'Официальная инструкция Claude Code',exact:true})).toHaveAttribute('href','https://code.claude.com/docs/en/mcp');
 await expect(page.locator('#cursor')).toContainText('.cursor/mcp.json');await expect(page.locator('#claude-code')).toContainText('.mcp.json');await expect(page.locator('#claude-desktop')).toContainText('claude_desktop_config.json');await expect(page.locator('#chatgpt')).toContainText('Secure MCP Tunnel');
 await expect(page.locator('main')).toContainText('127.0.0.1');await expect(page.locator('main')).toContainText('ouro.get_context');await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
