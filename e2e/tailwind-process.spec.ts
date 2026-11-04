import {test,expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {FlowDefinition,ProjectState,Spec} from '../packages/core/src';
import {chooseSelectOption,selectPopup} from './select-helpers';

type Fixture=Record<'planned'|'chosen'|'applied'|'tracked',{id:string;title:string}>;
const definition:FlowDefinition={entryNodeId:'choice',nodes:[
 {id:'choice',kind:'fork',title:'Выбрать направление проверки',description:'Явный выбор принадлежит человеку.',owner:'human'},
 {id:'action',kind:'action',title:'Изучить исходные факты',description:'Проверяемое действие агента.',owner:'agent'},
 {id:'condition',kind:'condition',title:'Проверить условие продолжения',description:'Выбор перехода требует основания.',owner:'system'},
 {id:'question',kind:'question',title:'Уточнить вход у человека',description:'Запрос не заменяет разрешение продолжить.',owner:'human'},
 {id:'blocker',kind:'blocker',title:'Устранить известный блокер',description:'Препятствие отделено от состояния задачи.',owner:'agent'},
 {id:'wait',kind:'wait',title:'Дождаться проверяемого условия',description:'Ожидание не является результатом.',owner:'system'},
 {id:'result',kind:'result',title:'Предъявить evidence человеку',description:'Definition of Done принимает человек.',owner:'agent'},
],edges:[
 {id:'choose-a',source:'choice',target:'action',label:'Изучить факты',optionId:'a'},
 {id:'choose-b',source:'choice',target:'condition',label:'Проверить условия',optionId:'b'},
 {id:'action-question',source:'action',target:'question',label:'Уточнить обнаруженное'},
 {id:'condition-blocker',source:'condition',target:'blocker',label:'Устранить препятствие'},
 {id:'condition-result',source:'condition',target:'result',label:'Условие уже подтверждено'},
 {id:'question-wait',source:'question',target:'wait',label:'Вход согласован'},
 {id:'blocker-wait',source:'blocker',target:'wait',label:'Препятствие устранено'},
 {id:'wait-result',source:'wait',target:'result',label:'Условие подтверждено'},
]};

/** Fixture создаёт только собственные факты и затем переиспользует их без последующих записей. */
async function processFixture(page:Page,baseURL:string|undefined):Promise<Fixture>{
 const root=resolve(process.env.OURO_E2E_DATA_DIR!),manifest=join(root,'process-visual-fixture.json');
 try{return JSON.parse(await readFile(manifest,'utf8')) as Fixture;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const snapshot=async():Promise<ProjectState>=>{const response=await page.request.get('/api/project');expect(response.ok(),await response.text()).toBe(true);return (await response.json()).state;};
 const human=async(body:Record<string,unknown>)=>{const response=await page.request.post('/api/commands',{data:{...body,requestId:crypto.randomUUID(),expectedVersion:(await snapshot()).version}});expect(response.ok(),await response.text()).toBe(true);return (await response.json()).state as ProjectState;};
 const issued=await page.request.post('/api/agents',{data:{name:'Process presentation fixture agent'}});expect(issued.ok()).toBe(true);const registration=await issued.json();
 const client=new Client({name:'tailwind-process-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${registration.token}`}}}));
 const result={} as Fixture;
 try{for(const kind of ['planned','chosen','applied','tracked'] as const){
  const title=`Tailwind process ${kind}`;
  const created=await human({type:'createSpec',content:{title,goal:'Сохранить граф, формы и точные состояния процесса при переносе оформления.',dod:[{id:'presentation',text:'Геометрия и доступность проверены человеком.',required:true}],constraints:'Только собственный browser fixture.',assumptions:'',risks:'',inputs:'',comment:'',flow:definition}});
  const spec=created.specs.find(item=>item.title===title)! as Spec,revisionId=spec.revisionIds.at(-1)!;result[kind]={id:spec.id,title};
  await human({type:'activateRevision',specId:spec.id,revisionId});if(kind==='planned')continue;
  const assigned=await human({type:'startExecution',specId:spec.id,specRevisionId:revisionId,agentId:registration.agent.id,...(kind==='tracked'?{flowTracking:'enforced'}:{})});const execution=assigned.executions.at(-1)!;
  const call=async(name:string,args:Record<string,unknown>={})=>{const response=await client.callTool({name,arguments:{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:(await snapshot()).version,...args}});expect(response.isError,JSON.stringify(response)).not.toBe(true);};
  await call('ouro.confirm_started');
  const runId=kind==='tracked'?execution.flowRuntime!.currentRunId!:undefined;
  if(runId)await call('ouro.report_flow_step',{runId,phase:'start'});
  else await call('ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:'Факт без привязки к узлу',context:'Проверка отдельного unbound списка.',evidence:'test://tailwind-process/unbound'});
  await call('ouro.report_fork',{...(runId?{flowStepRunId:runId}:{flowNodeId:'choice'}),title:'Как проверить исходные данные?',context:'Проверены две допустимые возможности.',reason:'Человек выбирает основание продолжения, поскольку варианты приводят к разным проверяемым действиям.',options:[{id:'a',title:'Изучить факты',description:'Первый проверяемый путь.'},{id:'b',title:'Проверить условия',description:'Альтернативный проверяемый путь.'}]});
  const request=(await snapshot()).requests.findLast(item=>item.executionId===execution.id)!;
  await human({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:revisionId,outcome:{kind:'approve',chosenOptionId:'a'}});
  if(kind==='chosen')continue;
  await call('ouro.confirm_decision_applied',{decisionRequestId:request.id,evidence:'test://tailwind-process/applied'});
  await human({type:'resumeExecution',executionId:execution.id});await call('ouro.confirm_resumed');
  if(runId){await call('ouro.report_flow_step',{runId,phase:'complete',edgeId:'choose-a',evidence:'test://tailwind-process/traversal'});const current=(await snapshot()).executions.find(item=>item.id===execution.id)!.flowRuntime!.currentRunId!;await call('ouro.report_flow_step',{runId:current,phase:'start'});}
  else await call('ouro.report_action',{flowNodeId:'action',actionId:crypto.randomUUID(),phase:'completed',title:'Факт выбранного пути',context:'Явная связь с узлом схемы.',evidence:'test://tailwind-process/action'});
 }}finally{await client.close();}
 await writeFile(manifest,JSON.stringify(result));return result;
}

async function navigate(page:Page,name:string){const item=page.locator('.sidebar').getByRole('button',{name,exact:true});if(await item.evaluate(element=>element.getBoundingClientRect().right<=0))await page.getByRole('button',{name:'Открыть меню',exact:true}).click();await item.click();}

test('TWP01 process and state presentation preserves every node kind, draft forms, finite paints and four axes',async({page,baseURL},testInfo)=>{
 test.setTimeout(300000);await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 const fixture=await processFixture(page,baseURL),output=resolve(process.env.OURO_PROCESS_VISUAL_DIR??testInfo.outputPath('visual'));await mkdir(output,{recursive:true});const metrics:Record<string,unknown>={};
 for(const theme of ['dark','light'])for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  const open=async(kind:keyof Fixture)=>{
   await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();await expect(page.locator('footer')).toContainText('Живые обновления подключены');
   if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:theme==='dark'?'Включить тёмную тему':'Включить светлую тему',exact:true}).click();
   await navigate(page,'Спецификации');const trigger=page.getByLabel('Выбрать спецификацию',{exact:true});await selectPopup(trigger);await page.getByRole('combobox',{name:'Поиск вариантов: Выбрать спецификацию',exact:true}).fill(fixture[kind].title);await chooseSelectOption(trigger,fixture[kind].id);await page.getByRole('button',{name:'Процесс',exact:true}).click();await page.evaluate(()=>document.fonts.ready);const flow=page.getByRole('region',{name:'Процесс спецификации',exact:true});await expect(flow.locator('.process-node')).toHaveCount(7);return flow;
  };
  const capture=async(view:string)=>{
   await page.mouse.move(0,0);await page.evaluate(()=>{window.scrollTo(0,0);return new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});const key=`${theme}-${width}-${view}`;
   metrics[key]=await page.locator('.spec-flow,.state-transitions').evaluateAll(roots=>roots.flatMap(root=>[root,...root.querySelectorAll('div,section,form,label,input,textarea,button,h3,h4,p,strong,small,table,thead,tbody,tr,th,td,.react-flow__edge-path,.react-flow__edge-text,.react-flow__edge-textbg')].map(element=>{const s=getComputedStyle(element),b=element.getBoundingClientRect();return {tag:element.tagName,hook:element.classList[0],x:b.x,y:b.y,width:b.width,height:b.height,display:s.display,padding:s.padding,margin:s.margin,gap:s.gap,color:s.color,background:s.backgroundColor,font:s.font,border:s.border,borderRadius:s.borderRadius,fill:s.fill,stroke:s.stroke,strokeWidth:s.strokeWidth,strokeDasharray:s.strokeDasharray,opacity:s.opacity};})));
   await page.screenshot({path:join(output,`${key}.png`),fullPage:true,animations:'disabled'});
  };
  if(process.env.OURO_PROCESS_VISUAL_SCOPE==='states-table'){
   testInfo.annotations.push({type:'scope',description:'Четыре состояния таблицы после локальной правки нулевой нижней границы.'});
   await open('tracked');await page.getByRole('button',{name:'Состояния',exact:true}).click();const states=page.getByRole('region',{name:'Визуальные переходы состояний',exact:true});await states.locator('.state-axis-tabs').getByRole('button',{name:'Дорожная карта',exact:true}).click();await states.getByRole('button',{name:'Список',exact:true}).click();await capture('states-table');continue;
  }
  let flow=await open('planned');await capture('planned');await flow.locator('.react-flow__node[data-id="choice"]').click();await expect(flow.getByRole('region',{name:'Выбранный узел',exact:true})).toBeVisible();await capture('node-inspector');await flow.getByRole('button',{name:'Таблица',exact:true}).click();await capture('tables');
  await flow.getByRole('button',{name:'Предложить изменение схемы',exact:true}).click();await capture('draft');await flow.getByRole('button',{name:'Изменить узел Изучить исходные факты',exact:true}).click();await capture('draft-node');await flow.getByRole('table',{name:'Связи процесса',exact:true}).getByRole('button',{name:'Изменить связь',exact:true}).first().click();await capture('draft-edge');await flow.getByRole('button',{name:'Отменить изменения',exact:true}).click();
  for(const kind of ['chosen','applied','tracked'] as const){flow=await open(kind);await capture(kind);await flow.locator('.react-flow__node[data-id="choice"]').click();await capture(`${kind}-node`);}
  await page.getByRole('button',{name:'Состояния',exact:true}).click();const states=page.getByRole('region',{name:'Визуальные переходы состояний',exact:true});await expect(states).toBeVisible();
  for(const [axis,label] of [['execution','Исполнение'],['spec','Спецификация'],['request','Запрос решения'],['roadmap','Дорожная карта']] as const){await states.locator('.state-axis-tabs').getByRole('button',{name:label,exact:true}).click();await capture(`states-${axis}`);await states.getByRole('button',{name:'Все возможные переходы',exact:true}).click();await capture(`states-${axis}-all`);await states.getByRole('button',{name:'Все возможные переходы',exact:true}).click();}
  await states.getByRole('button',{name:'Список',exact:true}).click();await capture('states-table');
  const state=(await(await page.request.get('/api/project')).json()).state as ProjectState;
  for(const kind of ['planned','chosen','applied','tracked'] as const){
   await page.goto(`/projects/${state.projectId}?view=spec&spec=${fixture[kind].id}`);
   const detail=page.getByRole('region',{name:'Выбранная задача',exact:true});await expect(detail).toBeVisible();await page.evaluate(value=>document.documentElement.setAttribute('data-theme',value),theme);
   await detail.getByRole('navigation',{name:'Разделы спецификации',exact:true}).getByRole('button',{name:'Процесс',exact:true}).click();await detail.getByRole('button',{name:'План',exact:true}).click();await expect(detail.locator('.process-node')).toHaveCount(7);await page.evaluate(()=>document.fonts.ready);await capture(`workspace-${kind}`);
  }
 }
 await writeFile(join(output,'presentation.json'),JSON.stringify(metrics,null,2));
});
