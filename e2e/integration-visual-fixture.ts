import {expect,type Page} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {AGENT_ID,GITHUB_SERVICE_ID,applyCommand,emptyState,type Actor,type Command,type ProjectState,type RevisionContent} from '../packages/core/src';
import {parseMeridianScope} from '../packages/meridian/src/context';
import {mapMeridianExpectation} from '../packages/core/src/meridian-import';

type Project={id:string;name:string;rootPath:string|null};
type Workspace={state:ProjectState;cursor:number;agents:Array<{id:string;name:string}>};
type Delivery={id:string;deliveryId:string;repositoryId:number;repositoryFullName:string;ref:string;status:'retryable'|'needs_review'|'processed';attempts:number;reason:string|null;lastError:string|null;receivedAt:string;updatedAt:string;commitCount?:number};
export type IntegrationVisualFixture={profile:string;actor:Actor;canManageParticipants:boolean;github:ProjectState;meridian:ProjectState;meridianSpecId:string;workspace:Project;info:{bindings:ProjectState['githubBindings'];deliveries:Delivery[];setup:{webhookSecretConfigured:boolean;apiTokenConfigured:boolean;webhookUrl:string;verification:'github-api-sha'}}};
const content=(title:string):RevisionContent=>({title,goal:'Сохранить проверяемое оформление и прежнее поведение.',dod:[{id:'visual',text:'Человек сверил представление на отдельном fixture.',required:true}],constraints:'Synthetic visual fixture.',assumptions:'',risks:'',inputs:'',comment:''});

/** Создаёт тестовые данные один раз и сохраняет те же IDs/даты для исходного и итогового UI. */
export async function integrationVisualFixture(page:Page,baseURL:string):Promise<IntegrationVisualFixture>{
  const filename=resolve('.operations/integration-visual-fixture.json'),profile=resolve(process.env.OURO_E2E_DATA_DIR??join(tmpdir(),'ouro-e2e-postgres'));
  const session=await(await page.request.get('/api/session')).json() as {actor:Actor|null;canManageParticipants:boolean};
  if(!session.actor||session.actor.kind!=='human')throw new Error('Visual fixture требует отдельную локальную human session.');
  try{
    const saved=JSON.parse(await readFile(filename,'utf8')) as IntegrationVisualFixture;
    expect(saved.profile).toBe(profile);expect(saved.actor.id).toBe(session.actor.id);
    const workspace=await page.request.get('/api/projects/'+saved.workspace.id);expect(workspace.ok()).toBe(true);
    return saved;
  }catch(error){if(!(error instanceof Error)||!('code' in error)||error.code!=='ENOENT')throw error;}
  await mkdir(resolve('.operations'),{recursive:true});
  const actor=session.actor,raw=await readFile('tests/fixtures/meridian/scope.json','utf8');
  let meridian=(await(await page.request.get('/api/project')).json()).state as ProjectState;
  const title='Источник Meridian для проверки оформления';
  let imported=meridian.specs.find(spec=>spec.title===title&&spec.origin?.kind==='meridian_import');
  if(!imported){
    const response=await page.request.post('/api/meridian/import',{data:{requestId:randomUUID(),expectedVersion:meridian.version,rawDocument:raw,content:{...mapMeridianExpectation(parseMeridianScope(raw)),title}}});
    expect(response.ok(),await response.text()).toBe(true);meridian=(await response.json()).state as ProjectState;
    imported=meridian.specs.find(spec=>spec.title===title&&spec.origin?.kind==='meridian_import');
  }
  if(!imported)throw new Error('Fixture source import отсутствует.');
  const rootPath=resolve('.operations/integration-onboarding-root');await mkdir(rootPath,{recursive:true});
  const catalog=await(await page.request.get('/api/projects')).json() as {projects:Project[]};
  let workspace=catalog.projects.find(project=>project.rootPath===rootPath);
  if(!workspace){const response=await page.request.post('/api/projects',{data:{requestId:randomUUID(),rootPath,name:'Обучение интеграций'}});expect(response.ok()).toBe(true);workspace=(await response.json()).project as Project;}
  const url='/api/projects/'+workspace.id;
  let current=await(await page.request.get(url)).json() as Workspace;
  let agent=current.agents.find(item=>item.name==='Агент оформления интеграций');
  if(!agent){const response=await page.request.post(url+'/agents',{data:{name:'Агент оформления интеграций'}});expect(response.ok()).toBe(true);agent=(await response.json()).agent as {id:string;name:string};}
  if(!current.state.specs.length){current=await(await page.request.get(url)).json() as Workspace;const response=await page.request.post(url+'/tasks',{data:{requestId:randomUUID(),expectedVersion:current.cursor,agentId:agent.id,content:content('Проверить обучение')}});expect(response.ok()).toBe(true);}
  let github=emptyState(meridian.projectId);
  const run=(command:Command,by:Actor=actor)=>{github=applyCommand(github,command,by).state;};
  run({type:'createSpec',requestId:randomUUID(),expectedVersion:github.version,content:content('Контекст GitHub r1')});
  const spec=github.specs[0],revision=github.revisions[0];
  run({type:'activateRevision',requestId:randomUUID(),expectedVersion:github.version,specId:spec.id,revisionId:revision.id});
  run({type:'startExecution',requestId:randomUUID(),expectedVersion:github.version,specId:spec.id,specRevisionId:revision.id,agentId:AGENT_ID});
  const execution=github.executions[0];
  run({type:'createGitHubBinding',requestId:randomUUID(),expectedVersion:github.version,executionId:execution.id,repositoryId:42,repositoryFullName:'review/ouro',ref:'refs/heads/work'});
  const sha='a'.repeat(40);
  run({type:'recordGitHubCommit',requestId:randomUUID(),expectedVersion:github.version,bindingId:github.githubBindings[0].id,deliveryId:'visual-verified-delivery',payloadDigest:'f'.repeat(64),commit:{repositoryId:42,repositoryFullName:'review/ouro',fullSha:sha,url:`https://github.com/review/ouro/commit/${sha}`,title:'Проверенный объект коммита',verifiedAt:'2026-10-28T12:00:00.000Z',verificationMethod:'github-api-sha'}},{id:GITHUB_SERVICE_ID,kind:'service',projectIds:[github.projectId]});
  run({type:'createGitHubBinding',requestId:randomUUID(),expectedVersion:github.version,executionId:execution.id,repositoryId:43,repositoryFullName:'review/archived',ref:'refs/heads/archive'});
  run({type:'revokeGitHubBinding',requestId:randomUUID(),expectedVersion:github.version,bindingId:github.githubBindings.at(-1)!.id});
  const delivery=(id:string,status:Delivery['status'],reason:string|null,lastError:string|null):Delivery=>({id,deliveryId:id,repositoryId:42,repositoryFullName:'review/ouro',ref:'refs/heads/work',status,reason,lastError,attempts:1,receivedAt:'2026-10-28T12:00:00.000Z',updatedAt:'2026-10-28T12:00:00.000Z',commitCount:1});
  const fixture:IntegrationVisualFixture={profile,actor,canManageParticipants:session.canManageParticipants,github,meridian,meridianSpecId:imported.id,workspace,info:{bindings:github.githubBindings,deliveries:[delivery('visual-retry','retryable',null,'GITHUB_UNAVAILABLE'),delivery('visual-review','needs_review','INCOMPLETE_PUSH',null),delivery('visual-processed','processed',null,null)],setup:{webhookSecretConfigured:true,apiTokenConfigured:false,webhookUrl:new URL('/api/github/webhook',baseURL).href,verification:'github-api-sha'}}};
  await writeFile(filename,JSON.stringify(fixture,null,2));return fixture;
}
