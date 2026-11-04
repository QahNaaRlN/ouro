import {expect,type Page} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {AgentProposalContent,FlowDefinition,ProjectState,RevisionContent} from '../packages/core/src';
import type {CollaborativeDraft} from '../packages/collaboration/src/types';

type Proposal={id:string;title:string;revisionId:string;previousRevisionId?:string};
export type ProposalsCollaborationFixture={profile:string;projectId:string;emptyProjectId:string;specId:string;activeDraftId:string;publishedDraftId:string;proposals:{spec:Proposal;summary:Proposal;reviewed:Proposal;dismissed:Proposal;adopted:Proposal}};
const flow:FlowDefinition={entryNodeId:'observe',nodes:[{id:'observe',kind:'action',title:'Проверить источник',description:'Сопоставить сохранённый факт с ожиданием.',owner:'agent'},{id:'review',kind:'result',title:'Предъявить результат',description:'Приёмку выполняет человек.',owner:'human'}],edges:[{id:'observe-review',source:'observe',target:'review',label:'Факт проверен'}]};
const content=(title:string):RevisionContent=>({title,goal:'Сохранить явное ожидание и проверяемые источники.',dod:[{id:'evidence',text:'Человек проверил источник и результат.',required:true}],constraints:'Только изолированный визуальный fixture.',assumptions:'Состояние не изменяется во время снимков.',risks:'Снимок не доказывает запуск модели.',inputs:'Сохранённые факты Ouro.',comment:'Публикация и активация — отдельные действия.',flow});
const scoped=(url:string,projectId:string)=>url+'?projectId='+encodeURIComponent(projectId);

/** Один раз создаёт реальные сохранённые состояния; до/после используют те же ID, даты и историю. */
export async function proposalsCollaborationFixture(page:Page,baseURL:string):Promise<ProposalsCollaborationFixture>{
 const profile=process.env.OURO_E2E_DATA_DIR;if(!profile)throw new Error('Нужен собственный OURO_E2E_DATA_DIR.');
 const filename=resolve('.operations/proposals-collaboration-fixture.json');
 await page.request.get('/api/session');
 try{
  const saved=JSON.parse(await readFile(filename,'utf8')) as ProposalsCollaborationFixture;expect(saved.profile).toBe(resolve(profile));
  const response=await page.request.get(scoped('/api/drafts/'+saved.activeDraftId,saved.projectId));expect(response.ok(),await response.text()).toBe(true);
  return saved;
 }catch(error){if(!(error instanceof Error)||!('code'in error)||error.code!=='ENOENT')throw error;}
 const root=(await(await page.request.get('/api/project')).json()).state as ProjectState,projectId=root.projectId;
 const current=async()=>(await(await page.request.get(scoped('/api/project',projectId))).json()).state as ProjectState;
 const post=async<T>(url:string,body:unknown):Promise<T>=>{const response=await page.request.post(scoped(url,projectId),{data:body});expect(response.ok(),await response.text()).toBe(true);return await response.json() as T;};
 const human=async(body:Record<string,unknown>)=>post<{state:ProjectState}>('/api/commands',{...body,requestId:randomUUID(),expectedVersion:(await current()).version});
 const suffix=randomUUID().slice(0,6),registration=await post<{agent:{id:string};token:string}>('/api/agents',{name:'Агент визуальной проверки '+suffix});
 await human({type:'createSpec',content:content('Исходное ожидание '+suffix)});let state=await current();const spec=state.specs.at(-1)!,revision=state.revisions.at(-1)!;
 await human({type:'activateRevision',specId:spec.id,revisionId:revision.id});await human({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:registration.agent.id});state=await current();const execution=state.executions.at(-1)!;
 const client=new Client({name:'ouro-presentation-fixture',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL(scoped('/api/mcp',projectId),baseURL),{requestInit:{headers:{Authorization:'Bearer '+registration.token}}}));
 const invoke=async(name:string,extra:Record<string,unknown>={})=>{const result=await client.callTool({name,arguments:{executionId:execution.id,requestId:randomUUID(),expectedVersion:(await current()).version,...extra}});expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);};
 let proposals:ProposalsCollaborationFixture['proposals'];
 try{
  await invoke('ouro.confirm_started');await invoke('ouro.report_action',{actionId:randomUUID(),phase:'completed',title:'Сохранённый первичный источник',context:'Реальный SDK fixture без вызова модели.',evidence:'fixture://presentation/observed-source'});
  const source=(await current()).events.findLast(event=>event.type==='ActionReported'&&event.executionId===execution.id)!;
  const submit=async(title:string,kind:'spec_proposal'|'reality_summary'):Promise<Proposal>=>{
   const common={title,findings:[{text:'Источник существует в сохранённой истории исполнения.',sourceEventIds:[source.id]}],interpretation:'Следующее ожидание можно проверить отдельно.',limitations:'Вывод и готовность оценивает человек.'};
   const body:AgentProposalContent=kind==='spec_proposal'?{...common,kind,draft:content('Предложенное ожидание '+suffix)}:{...common,kind};
   await invoke('ouro.submit_proposal',{sourceCursor:(await current()).version,content:body});const proposal=(await current()).agentProposals.at(-1)!;
   return {id:proposal.id,title,revisionId:proposal.latestRevisionId};
  };
  const pending=await submit('Новая проверяемая спека '+suffix,'spec_proposal'),summary=await submit('Сводка первичных фактов '+suffix,'reality_summary'),reviewed=await submit('Рассмотренная сводка '+suffix,'reality_summary'),dismissed=await submit('Отклонённое предложение '+suffix,'spec_proposal'),adopted=await submit('Принятое как черновик '+suffix,'spec_proposal');
  await human({type:'reviewAgentProposal',proposalId:reviewed.id,proposalRevisionId:reviewed.revisionId,outcome:'reviewed',comment:'Источники прочитаны человеком.'});
  await human({type:'reviewAgentProposal',proposalId:dismissed.id,proposalRevisionId:dismissed.revisionId,outcome:'dismissed',comment:'Текущее ожидание не меняем.'});
  await human({type:'adoptAgentSpecProposal',proposalId:adopted.id,proposalRevisionId:adopted.revisionId,content:content('Черновик после рассмотрения '+suffix),comment:'Сохранён отдельный черновик без активации.'});
  const previousRevisionId=pending.revisionId,latestContent=(await current()).agentProposalRevisions.find(item=>item.id===previousRevisionId)!.content;
  await invoke('ouro.submit_proposal',{proposalId:pending.id,baseProposalRevisionId:previousRevisionId,sourceCursor:(await current()).version,content:{...latestContent,interpretation:'Агент уточнил интерпретацию во второй версии.'}});
  pending.previousRevisionId=previousRevisionId;pending.revisionId=(await current()).agentProposals.find(item=>item.id===pending.id)!.latestRevisionId;
  proposals={spec:pending,summary,reviewed,dismissed,adopted};
 }finally{await client.close();}
 const draft=await post<{draft:CollaborativeDraft}>('/api/drafts',{specId:spec.id,baseRevisionId:revision.id,requestId:randomUUID(),expectedVersion:(await current()).version});
 const published=await post<{draft:CollaborativeDraft}>('/api/drafts',{specId:spec.id,baseRevisionId:revision.id,requestId:randomUUID(),expectedVersion:(await current()).version});
 await post('/api/drafts/'+published.draft.id+'/publish',{requestId:randomUUID(),expectedVersion:(await current()).version,draftVersion:published.draft.version,contentHash:published.draft.contentHash,baseLatestRevisionId:revision.id});
 // Последняя ревизия после публикации нужна для активного, не устаревшего черновика.
 const latest=(await current()).specs.find(item=>item.id===spec.id)!.revisionIds.at(-1)!;
 const active=await post<{draft:CollaborativeDraft}>('/api/drafts',{specId:spec.id,baseRevisionId:latest,requestId:randomUUID(),expectedVersion:(await current()).version});
 expect(draft.draft.id).not.toBe(active.draft.id);
 const emptyRoot=resolve('.operations/proposal-collaboration-empty-root');await mkdir(emptyRoot,{recursive:true});
 const emptyResponse=await page.request.post('/api/projects',{data:{name:'Пустое место проверки '+suffix,rootPath:emptyRoot,requestId:randomUUID()}});expect(emptyResponse.ok(),await emptyResponse.text()).toBe(true);const empty=(await emptyResponse.json()).project as {id:string};
 const fixture:ProposalsCollaborationFixture={profile:resolve(profile),projectId,emptyProjectId:empty.id,specId:spec.id,activeDraftId:active.draft.id,publishedDraftId:published.draft.id,proposals};
 await mkdir(resolve('.operations'),{recursive:true});await writeFile(filename,JSON.stringify(fixture,null,2));return fixture;
}
