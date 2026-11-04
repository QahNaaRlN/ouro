import {test,expect,type Page,type Locator} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {AgentRegistration} from '../components/agents-panel';

type Connection={httpUrl:string;stdioCommand:string;stdioArgs:string[];projectId:string};
type Listing={agents:AgentRegistration[];connection:Connection};
type Issued={agent:AgentRegistration;token:string;connection:Connection};
type Fixture={profile:string;origin:string;projectId:string;empty:Listing;listing:Listing;issued:Issued};

/** Один раз создаёт настоящие подключения; секрет принадлежит только disposable fixture и не логируется. */
async function fixture(page:Page,origin:string):Promise<Fixture>{
 const profile=resolve(process.env.OURO_E2E_DATA_DIR!),file=join(profile,'agents-presentation-fixture.json');
 await page.request.get('/api/session');
 try{const saved=JSON.parse(await readFile(file,'utf8')) as Fixture;expect(saved.profile).toBe(profile);expect(saved.origin).toBe(origin);return saved;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const folder=join(profile,'agent-workspace');await mkdir(folder,{recursive:true});
 const created=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),name:'Оформление подключений агентов',rootPath:folder}});expect(created.status()).toBe(201);const {project}=await created.json() as {project:{id:string}};
 const endpoint='/api/agents?projectId='+encodeURIComponent(project.id);
 const empty=await(await page.request.get(endpoint)).json() as Listing;expect(empty.agents).toHaveLength(0);
 const issue=async(name:string):Promise<Issued>=>{const response=await page.request.post(endpoint,{data:{name}});expect(response.status()).toBe(201);return response.json();};
 const revoked=await issue('Прежнее подключение · ключ отозван');
 const deny=await page.request.post('/api/agents/'+encodeURIComponent(revoked.agent.id)+'/revoke?projectId='+encodeURIComponent(project.id),{data:{}});expect(deny.status()).toBe(200);
 const seen=await issue('Подключение с подтверждённым обращением');
 const client=new Client({name:'owned-agent-presentation',version:'1'});
 try{await client.connect(new StreamableHTTPClientTransport(new URL(seen.connection.httpUrl),{requestInit:{headers:{Authorization:'Bearer '+seen.token}}}));await client.listTools();}finally{await client.close();}
 const issued=await issue('Одноразовая конфигурация тестового подключения'),listing=await(await page.request.get(endpoint)).json() as Listing;
 expect(listing.agents.find(agent=>agent.id===revoked.agent.id)?.revokedAt).toBeTruthy();expect(listing.agents.find(agent=>agent.id===seen.agent.id)?.lastSeenAt).toBeTruthy();
 const saved={profile,origin,projectId:project.id,empty,listing,issued};await writeFile(file,JSON.stringify(saved),{mode:0o600});return saved;
}

/** Читает наблюдаемые размеры и оформление; текст включает только стабильные fixture факты. */
async function metrics(target:Locator){return target.evaluate(root=>[root,...root.querySelectorAll('h1,h2,p,button,label,input,textarea,ol,li,article,section,code,strong,span,a')].filter(node=>node.getClientRects().length).map(node=>{const box=node.getBoundingClientRect(),css=getComputedStyle(node);return{tag:node.tagName,width:box.width,height:box.height,padding:css.padding,margin:css.margin,gap:css.gap,border:css.border,borderRadius:css.borderRadius,color:css.color,background:css.backgroundColor,font:css.font,display:css.display,whiteSpace:css.whiteSpace,overflow:css.overflow,outline:css.outline,outlineOffset:css.outlineOffset};}));}

test('TAC01 recorded real responses preserve agent presentation, formats and focus without writing new facts',async({page,browser,baseURL},testInfo)=>{
 test.setTimeout(360000);expect(baseURL).toBeTruthy();const data=await fixture(page,baseURL!),output=resolve(process.env.OURO_AGENTS_VISUAL_DIR??testInfo.outputPath('visual'));await mkdir(output,{recursive:true});
 const read=async()=>{const response=await page.request.get('/api/projects/'+data.projectId);expect(response.status()).toBe(200);return response.json();},before=await read(),measured:Record<string,unknown>={};
 const scenes=['empty','loading','list','read-error','stdio','cursor-http','claude-http','copy-error','create-error'] as const;
 for(const theme of ['dark','light'] as const)for(const width of [1440,390])for(const scene of scenes){
  const context=await browser.newContext({baseURL,viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'});await context.addCookies([{name:'ouro_project',value:data.projectId,url:baseURL!}]);const view=await context.newPage();
  let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  try{
   if(scene==='copy-error')await view.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Fixture clipboard unavailable');}},configurable:true});});
   await view.goto('/');await expect(view.getByRole('heading',{name:'Дорожная карта 0',exact:true})).toBeVisible();
   if(await view.locator('html').getAttribute('data-theme')!==theme)await view.getByRole('button',{name:theme==='light'?'Включить светлую тему':'Включить тёмную тему',exact:true}).click();
   await view.route('**/api/agents**',async route=>{
    if(new URL(route.request().url()).pathname!=='/api/agents'){await route.fallback();return;}
    if(route.request().method()==='GET'){
     if(scene==='loading')await gate;
     if(scene==='read-error')await route.fulfill({status:503,json:{error:{message:'Чтение недоступно в изолированном снимке.'}}}).catch(()=>{});
     else await route.fulfill({status:200,json:scene==='empty'?data.empty:data.listing}).catch(()=>{});
    }else if(route.request().method()==='POST'){
     if(scene==='create-error')await route.fulfill({status:503,json:{error:{message:'Создание не подтверждено в изолированном снимке.'}}});
     else{expect(route.request().postDataJSON()).toEqual({name:data.issued.agent.name});await route.fulfill({status:201,json:data.issued});}
    }else await route.fallback();
   });
   const menu=view.getByRole('button',{name:'Открыть меню',exact:true});if(await menu.isVisible())await menu.click();await view.getByRole('navigation',{name:'Основная навигация',exact:true}).getByRole('button',{name:'Агенты',exact:true}).click();
   await expect(view.getByRole('heading',{name:'Подключить агента',exact:true})).toBeVisible();
   if(scene==='loading')await expect(view.getByText('Читаем регистрации…',{exact:true})).toBeVisible();
   else if(scene==='read-error')await expect(view.getByRole('main').getByRole('alert')).toHaveText('Чтение недоступно в изолированном снимке.');
   else if(scene==='empty')await expect(view.getByText('Регистраций пока нет.',{exact:false})).toBeVisible();
   else await expect(view.getByTestId('agent-'+data.issued.agent.id)).toBeVisible();
   const input=view.getByRole('textbox',{name:'Имя агента',exact:true});
   if(['stdio','cursor-http','claude-http','copy-error','create-error'].includes(scene)){
    await input.fill(data.issued.agent.name);await view.getByRole('button',{name:'Создать ключ подключения',exact:true}).click();
    if(scene==='create-error')await expect(view.getByRole('main').getByRole('alert')).toHaveText('Создание не подтверждено в изолированном снимке.');
    else{
     const config=view.getByRole('textbox',{name:'Конфигурация MCP',exact:true});await expect(config).toBeVisible();
     if(scene==='cursor-http'||scene==='claude-http')await view.getByRole('button',{name:scene==='cursor-http'?'Cursor · HTTP':'Claude · HTTP',exact:true}).click();
     const value=JSON.parse(await config.inputValue()) as {mcpServers:{ouro:{command?:string;type?:string;url?:string;env?:{OURO_PROJECT_ID:string;OURO_AGENT_TOKEN:string};headers?:Record<string,string>}}};
     if(scene==='stdio'||scene==='copy-error'){expect(value.mcpServers.ouro.env?.OURO_PROJECT_ID).toBe(data.projectId);expect(value.mcpServers.ouro.env?.OURO_AGENT_TOKEN===data.issued.token).toBe(true);}else{expect(value.mcpServers.ouro.headers?.Authorization==='Bearer '+data.issued.token).toBe(true);expect(value.mcpServers.ouro.url).toBe(data.issued.connection.httpUrl);}
     if(scene==='claude-http')expect(value.mcpServers.ouro.type).toBe('http');
     if(scene==='copy-error'){await view.getByRole('button',{name:'Скопировать конфигурацию',exact:true}).click();await expect(view.getByRole('main').getByRole('alert')).toHaveText('Буфер обмена недоступен. Выделите и скопируйте конфигурацию из поля.');}
     await config.focus();await expect(config).toBeFocused();
    }
   }else{await input.focus();await expect(input).toBeFocused();}
   const target=view.getByRole('main'),name=theme+'-'+width+'-'+scene;await view.evaluate(()=>document.fonts.ready);await target.scrollIntoViewIfNeeded();await view.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   measured[name]=await metrics(target);await target.screenshot({path:join(output,name+'.png'),animations:'disabled',caret:'hide'});expect(await metrics(target)).toEqual(measured[name]);
   expect(await view.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }finally{release();await context.close();}
 }
 expect(await read()).toEqual(before);await writeFile(join(output,'presentation.json'),JSON.stringify(measured,null,2));
});
