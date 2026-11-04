import {expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {FlowDefinition,ProjectState,Spec} from '../packages/core/src';

export type ProcessPresentationFixture=Record<'planned'|'chosen'|'applied'|'tracked',{id:string;title:string}>;
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
export async function processFixture(page:Page,baseURL:string|undefined):Promise<ProcessPresentationFixture>{
 const session=await page.request.get('/api/session');expect(session.ok()).toBe(true);
 const root=resolve(process.env.OURO_E2E_DATA_DIR!),manifest=join(root,'process-visual-fixture.json');
 try{return JSON.parse(await readFile(manifest,'utf8')) as ProcessPresentationFixture;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const snapshot=async():Promise<ProjectState>=>{const response=await page.request.get('/api/project');expect(response.ok(),await response.text()).toBe(true);return (await response.json()).state;};
 const human=async(body:Record<string,unknown>)=>{const response=await page.request.post('/api/commands',{data:{...body,requestId:crypto.randomUUID(),expectedVersion:(await snapshot()).version}});expect(response.ok(),await response.text()).toBe(true);return (await response.json()).state as ProjectState;};
 const issued=await page.request.post('/api/agents',{data:{name:'Process presentation fixture agent'}});expect(issued.ok()).toBe(true);const registration=await issued.json();
 const client=new Client({name:'tailwind-process-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${registration.token}`}}}));
 const result={} as ProcessPresentationFixture;
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

