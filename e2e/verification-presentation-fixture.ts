import {expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {ProjectState,VerificationContract,VerificationSlice} from '../packages/core/src';

export type VerificationVisualFixture={projectId:string;state:ProjectState;workId:string;workRevisionId:string;verificationId:string;verificationRevisionId:string;executionId:string;rawReport:string;slice:VerificationSlice;statusSpecs:Record<string,string>};

/** Собственный bound folder и настоящие API/MCP receipts сохраняются один раз, без production overrides. */
export async function verificationPresentationFixture(page:Page,baseURL:string):Promise<VerificationVisualFixture>{
 const manifest=join(resolve(process.env.OURO_E2E_DATA_DIR!),'verification-presentation-fixture.json');
 try{return JSON.parse(await readFile(manifest,'utf8')) as VerificationVisualFixture;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const folder=resolve('.operations/verification-source');await mkdir(folder,{recursive:true});
 await writeFile(join(folder,'product.cjs'),'module.exports={add:(a,b)=>a+b};\n');
 await writeFile(join(folder,'data.json'),'[{"left":2,"right":3,"sum":5}]\n');
 await writeFile(join(folder,'playwright.config.cjs'),"module.exports={testDir:'.',testMatch:'behavior.spec.cjs',workers:1,retries:0,reporter:'json',captureGitInfo:{commit:false,diff:false}};\n");
 await writeFile(join(folder,'behavior.spec.cjs'),`const {test,expect}=require(${JSON.stringify(resolve('node_modules/@playwright/test'))});const {add}=require('./product.cjs');test('owned addition observation',()=>expect(add(2,3)).toBe(5));\n`);
 const report=spawnSync(process.execPath,[resolve('node_modules/@playwright/test/cli.js'),'test','--config',join(folder,'playwright.config.cjs'),'--reporter=json'],{cwd:folder,encoding:'utf8',timeout:30000});expect(report.status,report.stderr).toBe(0);const rawReport=report.stdout,queue=[...JSON.parse(rawReport).suites],entries:Array<{id:string}>=[];while(queue.length){const suite=queue.pop();queue.push(...suite.suites??[]);entries.push(...suite.specs??[]);}expect(entries).toHaveLength(1);
 const created=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),name:'Tailwind verification presentation',rootPath:folder}});expect(created.ok(),await created.text()).toBe(true);const project=(await created.json()).project,scope=`/api/projects/${project.id}`;
 const state=async():Promise<ProjectState>=>{const response=await page.request.get(scope);expect(response.ok(),await response.text()).toBe(true);return(await response.json()).state;};
 const command=async(body:Record<string,unknown>)=>{
  const payload={...body,requestId:crypto.randomUUID(),expectedVersion:(await state()).version},utf8Bytes=Buffer.byteLength(JSON.stringify(payload),'utf8');
  const response=await page.request.post(`${scope}/commands`,{data:payload});
  expect(response.ok(),JSON.stringify({command:typeof body.type==='string'?body.type.slice(0,80):'unknown',utf8Bytes,httpStatus:response.status()})).toBe(true);
  return(await response.json()).state as ProjectState;
 };
 const content=(title:string)=>({title,goal:'Сохранить проверяемое ожидание и независимое происхождение результата.',dod:[{id:'automated',text:'Сложение наблюдается настоящим тестом.',required:true},{id:'manual',text:'Человек отдельно проверил результат.',required:true}],constraints:'Только собственный presentation fixture.',assumptions:'',risks:'Успех прогона не означает приёмку DoD.',inputs:'data.json',comment:''});
 let snapshot=await command({type:'createSpec',content:content('Work with fixed verification contract')});const work=snapshot.specs.at(-1)!,workRevision=snapshot.revisions.at(-1)!;await command({type:'activateRevision',specId:work.id,revisionId:workRevision.id});
 const common={given:'Изолированные известные входы.',action:'Сложить2 и3.',expected:'Наблюдается результат5.',data:'data.json',prerequisites:'Локальный Node и рассмотренная конфигурация Playwright.',level:'e2e' as const,purpose:'acceptance' as const,required:true};
 const contract:VerificationContract={version:1,targetSpecId:work.id,targetRevisionId:workRevision.id,criterionIds:['automated','manual'],workflow:'tdd',cases:[
  {...common,id:'automated-case',criterionIds:['automated'],procedure:{kind:'playwright',testId:entries[0].id}},
  {...common,id:'manual-case',criterionIds:['manual'],expected:'Человек отдельно наблюдает5.',procedure:{kind:'manual',instructions:'Проверить изолированную процедуру и записать наблюдаемый результат.'},quality:{mutation:{required:true,minimumScore:80}}},
  {...common,id:'unlinked-case',criterionIds:['automated'],required:false,expected:'Дополнительный случай ещё не связан с исполняемой процедурой.',procedure:{kind:'unlinked'}},
 ]};
 snapshot=await command({type:'createSpec',content:{...content('Verification with fixed saved case IDs'),verification:contract}});const verification=snapshot.specs.at(-1)!,revision=snapshot.revisions.at(-1)!;await command({type:'activateRevision',specId:verification.id,revisionId:revision.id});
 const issued=await page.request.post(`${scope}/agents`,{data:{name:'Verification presentation agent'}});expect(issued.ok(),await issued.text()).toBe(true);const registration=await issued.json(),client=new Client({name:'verification-presentation-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(`${scope}/mcp`,baseURL),{requestInit:{headers:{Authorization:`Bearer ${registration.token}`}}}));
 const call=async(executionId:string,name:string,body:Record<string,unknown>={})=>{const result=await client.callTool({name,arguments:{executionId,requestId:crypto.randomUUID(),expectedVersion:(await state()).version,...body}});expect(result.isError,JSON.stringify(result)).not.toBe(true);};
 let executionId='';const statusSpecs:Record<string,string>={};
 try{
  for(const spec of [work,verification]){snapshot=await command({type:'startExecution',specId:spec.id,specRevisionId:spec.activeRevisionId??spec.revisionIds.at(-1),agentId:registration.agent.id});const execution=snapshot.executions.at(-1)!;await call(execution.id,'ouro.confirm_started');if(spec.id===verification.id)executionId=execution.id;
   await call(execution.id,'ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:`Owned source for ${spec.humanId}`,context:'Изолированный неизменный источник для links обеих граней.',evidence:'test://tailwind-verification/pair-source'});snapshot=await state();const source=snapshot.events.at(-1)!;
   await call(execution.id,'ouro.submit_proposal',{sourceCursor:snapshot.version,content:{kind:'reality_summary',title:`Proposal for ${spec.humanId}`,findings:[{text:'У грани свой сохранённый источник.',sourceEventIds:[source.id]}],interpretation:'Рассмотрение человеком отдельно.',limitations:'Только presentation fixture.'}});
   if(spec.id===work.id)await call(execution.id,'ouro.report_question',{title:'Question for work face',context:'Точное ожидание грани требует решения человека.',question:'Какое основание использовать?',blockingScope:'execution'});
  }
  for(const kind of ['neutral','blue','red','green']){
   snapshot=await command({type:'createSpec',content:content(`Canonical status ${kind}`)});const spec=snapshot.specs.at(-1)!,target=snapshot.revisions.at(-1)!;statusSpecs[kind]=spec.id;if(kind==='neutral')continue;await command({type:'activateRevision',specId:spec.id,revisionId:target.id});snapshot=await command({type:'startExecution',specId:spec.id,specRevisionId:target.id,agentId:registration.agent.id});const execution=snapshot.executions.at(-1)!;await call(execution.id,'ouro.confirm_started');if(kind==='blue')continue;await call(execution.id,'ouro.complete_execution',{result:kind==='red'?'failed':'succeeded',evidence:`test://tailwind-verification/status/${kind}`});if(kind==='green')await command({type:'acceptSpec',specId:spec.id,specRevisionId:target.id,evidence:{automated:'Синтетический критерий fixtures проверен.',manual:'Отдельное test-only подтверждение fixture.'}});
  }
 }finally{await client.close();}
 const observe=await page.request.post(`${scope}/verification/observe`,{data:{requestId:crypto.randomUUID(),expectedVersion:(await state()).version,verificationRevisionId:revision.id,config:{files:[{role:'product',path:'product.cjs'},{role:'test',path:'behavior.spec.cjs'},{role:'fixture',path:'data.json'},{role:'config',path:'playwright.config.cjs'}],playwrightConfigPath:'playwright.config.cjs'},reason:'Наблюдать только явно перечисленные собственные файлы.'}});expect(observe.ok(),await observe.text()).toBe(true);
 const run=await page.request.post(`${scope}/verification/run`,{data:{requestId:crypto.randomUUID(),expectedVersion:(await state()).version,executionId,scopeCaseIds:['automated-case']}});expect(run.ok(),await run.text()).toBe(true);snapshot=await state();const slice=snapshot.verificationObservations.at(-1)!.observation.slice;
 const review=async(runId:string,assessment:string)=>command({type:'reviewVerificationRun',runId,assessment,reason:'Рассмотрен собственный fixture и его ограниченный результат.',prerequisitesEvidence:'Известные файлы, доступная процедура, test-only наблюдение.'});await review(snapshot.verificationRuns.at(-1)!.id,'usable');
 await command({type:'setVerificationSlice',verificationRevisionId:revision.id,slice,reason:'Точный наблюдённый срез собственного fixture.'});
 snapshot=await command({type:'reportVerificationRun',executionId,report:{slice,scopeCaseIds:['automated-case'],rawReport,artifactRef:'artifact://tailwind-verification/import.json',startedAt:'2026-11-03T10:00:00.000Z',finishedAt:'2026-11-03T10:01:00.000Z'}});await review(snapshot.verificationRuns.at(-1)!.id,'usable');
 for(const outcome of ['failed','passed']){snapshot=await command({type:'reportManualVerificationRun',executionId,slice,results:[{caseId:'manual-case',outcome,actual:outcome==='failed'?'Исходное test-only наблюдение отличалось от ожидания.':'В собственной процедуре наблюдается5.\nПриёмка DoD остаётся отдельной.'}],startedAt:'2026-11-03T10:00:00.000Z',finishedAt:'2026-11-03T10:01:00.000Z',evidence:'Явное ручное свидетельство только для собственного presentation fixture.',quality:{mutation:[{caseId:'manual-case',killed:9,survived:1,noCoverage:0,timedOut:0,total:10}]}});const recorded=snapshot.verificationRuns.at(-1)!;await review(recorded.id,outcome==='failed'?'expected_red':'usable');if(outcome==='failed')await command({type:'beginVerificationCycle',verificationRevisionId:revision.id,scopeCaseIds:['manual-case'],baselineRunIds:[recorded.id],reason:'Ограниченный собственный TDD цикл с сохранённым RED.'});}
 await command({type:'recordVerificationPhase',verificationRevisionId:revision.id,phase:'verification',scopeCaseIds:['automated-case','manual-case'],evidence:'Явно записанный этап собственного fixture, без приёмки DoD.'});
 const result={projectId:project.id,state:await state(),workId:work.id,workRevisionId:workRevision.id,verificationId:verification.id,verificationRevisionId:revision.id,executionId,rawReport,slice,statusSpecs};await writeFile(manifest,JSON.stringify(result,null,2));return result;
}
