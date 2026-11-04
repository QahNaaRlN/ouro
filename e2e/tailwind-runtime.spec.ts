import {test,expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {AGENT_ID,type ProjectState,type FlowDefinition} from '../packages/core/src';
import type {RuntimeIntent} from '../components/flow-runtime-ui';
import type {RuntimePresentationInput} from '../apps/web/tests/fixtures/RuntimePresentation';

type Fixture={state:ProjectState;executions:Record<string,string>;receipt:RuntimeIntent};
const flow:FlowDefinition={entryNodeId:'work',nodes:[{id:'work',kind:'action',title:'Проверить основание',description:'Решение подтверждает человек.',owner:'human'},{id:'result',kind:'result',title:'Предъявить результат',description:'Приёмка отдельно.',owner:'agent'}],edges:[{id:'next',source:'work',target:'result',label:'Основание подтверждено'}]};

/** Создаёт конечный собственный canonical fixture один раз; повторные render runs ничего не записывают. */
async function runtimeFixture(page:Page,baseURL:string):Promise<Fixture>{
 const manifest=join(resolve(process.env.OURO_E2E_DATA_DIR!),'runtime-presentation-fixture.json');
 try{return JSON.parse(await readFile(manifest,'utf8')) as Fixture;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const snapshot=async():Promise<ProjectState>=>{const response=await page.request.get('/api/project');expect(response.ok(),await response.text()).toBe(true);return (await response.json()).state;};
 const human=async(body:Record<string,unknown>)=>{const response=await page.request.post('/api/commands',{data:{...body,requestId:crypto.randomUUID(),expectedVersion:(await snapshot()).version}});expect(response.ok(),await response.text()).toBe(true);return (await response.json()).state as ProjectState;};
 const issued=await page.request.post('/api/agents',{data:{name:'Runtime presentation fixture agent'}});expect(issued.ok(),await issued.text()).toBe(true);const registration=await issued.json();
 const client=new Client({name:'tailwind-runtime-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${registration.token}`}}}));
 const executions:Record<string,string>={};let receipt:RuntimeIntent|undefined;
 try{for(const kind of ['legacy','ready','running','failed','succeeded','receipt','simulation']){
  const definition=kind==='simulation'?{...flow,nodes:flow.nodes.map(node=>node.id==='work'?{...node,owner:'agent' as const}:node)}:flow;
  const created=await human({type:'createSpec',content:{title:`Runtime presentation ${kind}`,goal:'Проверить оформление учёта без изменения его поведения.',dod:[{id:'view',text:'Вид проверен человеком.',required:true}],constraints:'Только собственный профиль.',assumptions:'',risks:'',inputs:'',comment:'',flow:definition}});
  const spec=created.specs.at(-1)!,revisionId=spec.revisionIds.at(-1)!;await human({type:'activateRevision',specId:spec.id,revisionId});
  const assigned=await human({type:'startExecution',specId:spec.id,specRevisionId:revisionId,agentId:kind==='simulation'?AGENT_ID:registration.agent.id,...(kind==='legacy'?{}:{flowTracking:'enforced'})}),execution=assigned.executions.at(-1)!;executions[kind]=execution.id;
  if(kind==='simulation'){const response=await page.request.post('/api/simulator',{data:{scenario:'apply',specId:spec.id,requestId:crypto.randomUUID(),expectedVersion:(await snapshot()).version}});expect(response.ok(),await response.text()).toBe(true);continue;}
  const ack=await client.callTool({name:'ouro.confirm_started',arguments:{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:(await snapshot()).version}});expect(ack.isError,JSON.stringify(ack)).not.toBe(true);
  const runId=execution.flowRuntime?.currentRunId;if(!runId||kind==='ready')continue;
  if(kind==='receipt'){
   const state=await snapshot(),body={type:'skipFlowStep',executionId:execution.id,runId,requestId:crypto.randomUUID(),reason:'Явно исключён человеком.',evidence:'test://tailwind-runtime/committed-receipt'};
   receipt={actorId:'local-human',projectId:state.projectId,executionId:execution.id,runId,action:'skip',source:'human',body,expectedVersion:state.version,reason:body.reason,evidence:body.evidence,edgeId:''};
   const response=await page.request.post('/api/commands',{data:{...body,expectedVersion:state.version}});expect(response.ok(),await response.text()).toBe(true);continue;
  }
  await human({type:'reportFlowStep',executionId:execution.id,runId,phase:'start',evidence:'test://tailwind-runtime/started'});
  if(kind==='failed'||kind==='succeeded')await human({type:'reportFlowStep',executionId:execution.id,runId,phase:kind==='failed'?'fail':'complete',evidence:'test://tailwind-runtime/observed\nПодтверждённое основание шага.',...(kind==='succeeded'?{edgeId:'next'}:{})});
 }}finally{await client.close();}
 expect(receipt).toBeTruthy();const result={state:await snapshot(),executions,receipt:receipt!};await writeFile(manifest,JSON.stringify(result,null,2));return result;
}

test('TWR01 runtime presentation uses real snapshots and exact committed receipt',async({page,baseURL})=>{
 test.setTimeout(240000);const login=await page.request.get('/api/session');expect(login.ok(),await login.text()).toBe(true);const fixture=await runtimeFixture(page,baseURL!),output=resolve(process.env.OURO_RUNTIME_VISUAL_DIR??'.operations/runtime-original');await mkdir(output,{recursive:true});
 const current=(await(await page.request.get('/api/project')).json()).state as ProjectState;expect(current.version).toBe(fixture.state.version);const metrics:Record<string,unknown>={};
 for(const theme of ['dark','light'] as const)for(const width of [1440,390])for(const workspace of [false,true]){
  await page.setViewportSize({width,height:width===1440?1000:844});await page.goto('/tests/fixtures/runtime-presentation.html');await page.evaluate(value=>document.documentElement.setAttribute('data-theme',value),theme);
  await page.waitForFunction(()=>!!window.runtimePresentation);await page.evaluate(()=>document.fonts.ready);
  const configure=async(kind:string,extra:Partial<RuntimePresentationInput>={})=>{const input:RuntimePresentationInput={state:fixture.state,executionId:fixture.executions[kind],receipt:fixture.receipt,workspace,...extra};await page.evaluate(value=>window.runtimePresentation.configure(value),input);};
  const capture=async(name:string)=>{
   await page.mouse.move(0,0);await page.evaluate(()=>{window.scrollTo(0,0);return new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});const key=`${theme}-${width}-${workspace?'workspace':'legacy'}-${name}`;
   metrics[key]=await page.locator('main').evaluateAll(roots=>roots.flatMap(root=>[root,...root.querySelectorAll('*')].map(element=>{const s=getComputedStyle(element),b=element.getBoundingClientRect();return {tag:element.tagName,x:b.x,y:b.y,width:b.width,height:b.height,display:s.display,padding:s.padding,margin:s.margin,gap:s.gap,color:s.color,background:s.backgroundColor,font:s.font,border:s.border,borderRadius:s.borderRadius,whiteSpace:s.whiteSpace,overflowWrap:s.overflowWrap,flexDirection:s.flexDirection,alignItems:s.alignItems};})));
   await page.screenshot({path:join(output,`${key}.png`),fullPage:true,animations:'disabled'});
  };
  for(const kind of ['legacy','ready','running','failed','succeeded','simulation']){const execution=fixture.state.executions.find(item=>item.id===fixture.executions[kind])!;await configure(kind,{runId:execution.flowRuntime?.runs[0]?.id,tracking:kind==='legacy'?'unavailable':kind==='ready'?'off':'on',simulation:kind==='simulation'});if(kind==='simulation')await expect(page.getByRole('form',{name:'Действие человека на шаге',exact:true})).toContainText('Evidence будет явно синтетическим');await capture(kind);}
  await configure('receipt',{held:fixture.receipt});await capture('another-pending');
  await configure('receipt',{runId:fixture.receipt.runId,held:fixture.receipt});await capture('pending');
  await page.getByRole('button',{name:'Исходная запись',exact:true}).first().click();await capture('history-record');await page.getByRole('button',{name:'Исходная запись',exact:true}).first().click();
  const form=page.getByRole('form',{name:'Действие человека на шаге',exact:true});let release:()=>void=()=>undefined;const gate=new Promise<void>(resolve=>{release=resolve;});let received:()=>void=()=>undefined;const receiptRead=new Promise<void>(resolve=>{received=resolve;});
  await page.route('**/api/commands',async route=>{const response=await route.fetch();expect(response.ok(),await response.text()).toBe(true);expect((await response.json()).replayed).toBe(true);received();await gate;await route.abort('failed');});
  await form.getByRole('button',{name:'Повторить то же действие',exact:true}).click();await receiptRead;await capture('posting');release();await expect(form.getByRole('alert')).toContainText('Результат не подтверждён');await capture('unknown');await page.unroute('**/api/commands');
  await form.getByRole('button',{name:'Повторить то же действие',exact:true}).click();await expect(form.getByRole('status')).toContainText('Действие записано');await capture('success');
 }
 const after=(await(await page.request.get('/api/project')).json()).state as ProjectState;expect(after).toEqual(fixture.state);await writeFile(join(output,'presentation.json'),JSON.stringify(metrics,null,2));
});
