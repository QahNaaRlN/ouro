import { test, expect, type Page } from '@playwright/test';
import {
  AGENT_ID, GITHUB_SERVICE_ID, PROJECT_ID, applyCommand, emptyState,
  type Actor, type Command, type ProjectState,
} from '../packages/core/src';

// Browser contract fixtures: the UI and snapshot adopter are real; GitHub HTTP
// and queue responses are controlled. These tests do not claim an external push.
const human:Actor={id:'github-browser-human',kind:'human',projectIds:[PROJECT_ID]};
const service:Actor={id:GITHUB_SERVICE_ID,kind:'service',projectIds:[PROJECT_ID]};
const content=(title:string)=>({title,goal:'Привязать проверенный источник к точной попытке.',dod:[{id:'source',text:'Проверить источник и контекст',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});
const sha='a'.repeat(40);
type Delivery={id:string;deliveryId:string;repositoryId:number;repositoryFullName:string;ref:string;status:'retryable'|'pending';attempts:number;reason:null;lastError:string|null;receivedAt:string;updatedAt:string};

async function fixture(page:Page,{replayedCreate=false}={}){
  let state=emptyState(),projectReads=0;
  const creates:Record<string,unknown>[]=[],revokes:Record<string,unknown>[]=[],retries:unknown[]=[];
  const deliveries:Delivery[]=[];
  const run=(data:Record<string,unknown>,actor=human)=>{
    const result=applyCommand(state,{...data,requestId:crypto.randomUUID(),expectedVersion:state.version} as Command,actor);
    state=result.state;return result;
  };
  run({type:'createSpec',content:content('Контекст GitHub r1')});
  const spec=state.specs[0],revision=state.revisions[0];
  run({type:'activateRevision',specId:spec.id,revisionId:revision.id});
  run({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:AGENT_ID});
  const execution=state.executions[0];
  const info=()=>({bindings:state.githubBindings,deliveries,setup:{webhookSecretConfigured:true,apiTokenConfigured:false,webhookUrl:'https://ouro.example.com/api/github/webhook',verification:'github-api-sha'}});
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/api/session')return json({ok:true});
    if(path==='/api/agents')return json({agents:[]});
    // Real EventSource consumes only this controlled snapshot, never the SQL fixture.
    if(path==='/api/stream')return route.fulfill({status:200,contentType:'text/event-stream',body:`event: snapshot\nid: ${state.version}\ndata: ${JSON.stringify({state,cursor:state.version,storage:'embedded-postgres'})}\n\n`});
    if(path==='/api/project'){projectReads++;return json({state,cursor:state.version,storage:'embedded-postgres'});}
    if(path==='/api/github')return json(info());
    if(path==='/api/github/bindings'&&request.method()==='POST'){
      const body=request.postDataJSON() as Record<string,unknown>;creates.push(body);
      try{
        const applied=applyCommand(state,{...body,type:'createGitHubBinding',repositoryId:42} as Command,human);
        state=applied.state;
        const receipt={...applied,cursor:state.version,replayed:replayedCreate};
        // An old replayed receipt must lead to a fresh GET, not a projection or
        // cursor downgrade when another committed event already exists.
        if(replayedCreate)run({type:'createSpec',content:content('Позже сохранённое ожидание')});
        return json(receipt,201);
      }catch(error){return json({error:{code:(error as {code:string}).code,message:'Базовая версия устарела; проверьте новые события.'}},409);}
    }
    const revoke=path.match(/^\/api\/github\/bindings\/([^/]+)\/revoke$/);
    if(revoke){
      const body=request.postDataJSON() as Record<string,unknown>;revokes.push(body);
      const applied=applyCommand(state,{...body,type:'revokeGitHubBinding',bindingId:decodeURIComponent(revoke[1])} as Command,human);
      state=applied.state;return json({...applied,cursor:state.version,replayed:false});
    }
    if(path==='/api/github/deliveries/browser-delivery/retry'){
      retries.push(request.postDataJSON());deliveries[0].status='pending';deliveries[0].lastError=null;return json({delivery:deliveries[0]});
    }
    return route.continue();
  });
  return {run,spec,revision,execution,creates,revokes,retries,deliveries,get state():ProjectState{return state;},get projectReads(){return projectReads;}};
}

async function open(page:Page){
  await page.goto('/');await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  await page.getByRole('button',{name:'Интеграции',exact:true}).click();
  await expect(page.getByRole('heading',{name:'GitHub',exact:true})).toBeVisible();
}
async function fillBinding(page:Page,executionId:string){
  const form=page.getByRole('region',{name:'Привязать репозиторий к попытке'});
  await form.getByRole('combobox',{name:'Попытка исполнения',exact:true}).selectOption(executionId);
  await form.getByRole('textbox',{name:'Репозиторий',exact:true}).fill('review/ouro');
  await form.getByRole('textbox',{name:'Ветка GitHub',exact:true}).fill('refs/heads/work');
  return form;
}

test('G09 controlled browser creates and revokes a binding while retaining its original revision',async({page})=>{
  const f=await fixture(page);await open(page);const base=f.state.version;
  const form=await fillBinding(page,f.execution.id);
  await expect(form.getByRole('region',{name:'Контекст привязки'})).toContainText(f.execution.id);
  await form.getByRole('button',{name:'Создать привязку',exact:true}).click();
  const bindings=page.getByRole('region',{name:'Привязки GitHub'});
  await expect(bindings).toContainText('Действует');
  expect(f.creates).toHaveLength(1);
  expect(f.creates[0]).toMatchObject({executionId:f.execution.id,repositoryFullName:'review/ouro',ref:'refs/heads/work',expectedVersion:base});
  expect(f.state.githubBindings[0]).toMatchObject({specRevisionId:f.revision.id,executionId:f.execution.id});
  f.run({type:'proposeRevision',specId:f.spec.id,content:content('Контекст GitHub r2')});
  f.run({type:'activateRevision',specId:f.spec.id,revisionId:f.state.revisions.at(-1)!.id});
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(page.locator('footer')).toContainText(`cursor ${f.state.version}`);
  await expect(bindings).toContainText('r1 · Контекст GitHub r1');
  await bindings.getByRole('button',{name:'Отозвать привязку',exact:true}).click();
  await expect(bindings).toContainText('Привязка отозвана');
  await expect(bindings.getByRole('button',{name:'Отозвать привязку',exact:true})).toHaveCount(0);
  expect(f.revokes).toHaveLength(1);expect(f.state.githubBindings[0].revokedAt).toBeTruthy();
  expect(f.state.events.filter(event=>event.type==='GitHubBindingCreated')).toHaveLength(1);
  expect(f.state.events.filter(event=>event.type==='GitHubBindingRevoked')).toHaveLength(1);
});

test('G09 controlled browser renders verified commit provenance and retries queue work without creating facts',async({page})=>{
  const f=await fixture(page);
  f.run({type:'createGitHubBinding',executionId:f.execution.id,repositoryId:42,repositoryFullName:'review/ouro',ref:'refs/heads/work'});
  f.run({type:'recordGitHubCommit',bindingId:f.state.githubBindings[0].id,deliveryId:'verified-browser-delivery',payloadDigest:'f'.repeat(64),commit:{repositoryId:42,repositoryFullName:'review/ouro',fullSha:sha,url:`https://github.com/review/ouro/commit/${sha}`,title:'Проверенный объект коммита',verifiedAt:'2026-10-28T12:00:00.000Z',verificationMethod:'github-api-sha'}},service);
  f.deliveries.push({id:'browser-delivery',deliveryId:'retry-browser-delivery',repositoryId:42,repositoryFullName:'review/ouro',ref:'refs/heads/work',status:'retryable',attempts:1,reason:null,lastError:'GITHUB_UNAVAILABLE',receivedAt:'2026-10-28T12:00:00.000Z',updatedAt:'2026-10-28T12:00:00.000Z'});
  const before=f.state.version;await open(page);
  const sources=page.getByRole('region',{name:'Проверенные коммиты'});
  await expect(sources.getByRole('link',{name:sha.slice(0,12),exact:true})).toHaveAttribute('href',`https://github.com/review/ouro/commit/${sha}`);
  await expect(sources).toContainText(f.execution.id);await expect(sources).toContainText('r1');
  await expect(sources).toContainText('github-api-sha');await expect(sources).toContainText('Проверен через API');
  const queue=page.getByRole('region',{name:'Доставки GitHub'});
  await expect(queue).toContainText('Можно повторить');await expect(queue).toContainText('GITHUB_UNAVAILABLE');
  await queue.getByRole('button',{name:'Повторить проверку',exact:true}).click();
  await expect(queue).toContainText('В очереди');await expect(queue.getByRole('button',{name:'Повторить проверку',exact:true})).toHaveCount(0);
  expect(f.retries).toEqual([{}]);expect(f.state.version).toBe(before);
  expect(f.state.events.filter(event=>event.type==='ActionReported')).toHaveLength(1);
  expect(f.state.executions[0].state).toBe('queued');expect(f.state.specs[0].acceptance).toBeUndefined();
});

test('G09 controlled browser pins the form version and refreshes a replayed mutation receipt',async({page})=>{
  const f=await fixture(page,{replayedCreate:true});await open(page);
  const base=f.state.version,form=await fillBinding(page,f.execution.id);
  f.run({type:'createSpec',content:content('Независимое ожидание во время ввода')});
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(form).toContainText('Появились новые события');
  await form.getByRole('button',{name:'Создать привязку',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Базовая версия устарела'})).toContainText('Базовая версия устарела');
  expect(f.creates[0].expectedVersion).toBe(base);expect(f.state.githubBindings).toHaveLength(0);
  await expect(form.getByRole('textbox',{name:'Репозиторий',exact:true})).toHaveValue('review/ouro');
  await form.getByRole('button',{name:'Обновить базу после проверки',exact:true}).click();
  const confirmedBase=f.state.version;
  await form.getByRole('button',{name:'Создать привязку',exact:true}).click();
  await expect(page.getByRole('region',{name:'Привязки GitHub'})).toContainText('Действует');
  expect(f.creates[1].expectedVersion).toBe(confirmedBase);
  await expect(page.locator('footer')).toContainText(`cursor ${f.state.version}`);
  expect(f.projectReads).toBeGreaterThanOrEqual(3);
  expect(f.state.githubBindings).toHaveLength(1);
});
