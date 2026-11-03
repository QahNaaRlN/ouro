import {test,expect} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Execution,ProjectState,RevisionContent} from '../packages/core/src';

test('paired work and verification retain exact request/proposal navigation and last-event timestamps from beta.3',async({page,baseURL})=>{
 test.setTimeout(120000);
 const rootPath=await mkdtemp(join(tmpdir(),'ouro-verification-review-integration-'));
 let client:Client|undefined;
 try{
  await page.request.get('/api/session');
  const created=await page.request.post('/api/projects',{data:{requestId:crypto.randomUUID(),name:'Verification review integration',rootPath}});
  expect(created.ok(),await created.text()).toBe(true);
  const project=(await created.json()).project,scope=`/api/projects/${project.id}`;
  const state=async():Promise<ProjectState>=>{const response=await page.request.get(scope);expect(response.ok()).toBe(true);return (await response.json()).state;};
  const command=async(body:Record<string,unknown>)=>{
   const response=await page.request.post(`${scope}/commands`,{data:{...body,requestId:crypto.randomUUID(),expectedVersion:(await state()).version}});
   expect(response.ok(),await response.text()).toBe(true);return (await response.json()).state as ProjectState;
  };
  const content:RevisionContent={title:'Paired work with pending review',goal:'Keep exact review scope on both card faces.',dod:[{id:'first',text:'Both faces preserve their review links.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''};
  let current=await command({type:'createSpec',content});
  const work=current.specs[0],workRevision=current.revisions[0];
  await command({type:'activateRevision',specId:work.id,revisionId:workRevision.id});
  current=await command({type:'createSpec',content:{...content,title:'Paired verification with pending review',verification:{version:1,targetSpecId:work.id,targetRevisionId:workRevision.id,criterionIds:['first'],workflow:'tdd',cases:[{id:'case-first',criterionIds:['first'],given:'A paired card',action:'Open review links',expected:'The selected face retains exact scope.',data:'Isolated browser fixture',prerequisites:'Both assigned agents report facts.',level:'e2e',purpose:'acceptance',required:true,procedure:{kind:'manual',instructions:'Inspect exact navigation and stored source.'}}]}}});
  const verification=current.specs[1],verificationRevision=current.revisions[1];
  await command({type:'activateRevision',specId:verification.id,revisionId:verificationRevision.id});
  const issued=await page.request.post(`${scope}/agents`,{data:{name:'Review integration agent'}});
  expect(issued.ok()).toBe(true);const registration=await issued.json();
  client=new Client({name:'verification-review-integration',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(`${scope}/mcp`,baseURL),{requestInit:{headers:{Authorization:`Bearer ${registration.token}`}}}));
  const call=async(execution:Execution,name:string,args:Record<string,unknown>={})=>{
   const result=await client!.callTool({name,arguments:{executionId:execution.id,requestId:crypto.randomUUID(),expectedVersion:(await state()).version,...args}});
   expect(result.isError,JSON.stringify(result)).not.toBe(true);
  };
  const faces=[{spec:work,revision:workRevision,side:'Работа'},{spec:verification,revision:verificationRevision,side:'Проверка'}];
  for(const face of faces){
   current=await command({type:'startExecution',specId:face.spec.id,specRevisionId:face.revision.id,agentId:registration.agent.id});const execution=current.executions.at(-1)!;
   await call(execution,'ouro.confirm_started');
   await call(execution,'ouro.report_action',{actionId:crypto.randomUUID(),phase:'completed',title:`Source for ${face.side}`,context:'Assigned execution records an immutable source for exact review navigation.',evidence:'test://verification-review-integration'});
   current=await state();const source=current.events.at(-1)!;
   await call(execution,'ouro.submit_proposal',{sourceCursor:current.version,content:{kind:'reality_summary',title:`Proposal for ${face.side}`,findings:[{text:'This face has its own source.',sourceEventIds:[source.id]}],interpretation:'Human review remains required.',limitations:'Isolated navigation fixture only.'}});
   await call(execution,'ouro.report_question',{title:`Question for ${face.side}`,context:'The paired-card review links must stay scoped to this exact assigned revision.',question:'Which evidence should this exact assigned revision use?',blockingScope:'execution'});
  }
  current=await command({type:'createSpec',content:{...content,title:'Independent second work pair'}});
  const secondWork=current.specs.at(-1)!,secondRevision=current.revisions.at(-1)!;
  await command({type:'createSpec',content:{...content,title:'Independent second verification pair',verification:{...verificationRevision.verification!,targetSpecId:secondWork.id,targetRevisionId:secondRevision.id}}});
  const before=await state();
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const face of faces){
   const other=faces.find(candidate=>candidate!==face)!;
   for(const kind of ['proposals','questions'] as const){
    await page.goto(`/projects/${project.id}`);
    const card=page.locator(`.react-flow__node .verification-pair[data-pair-id="${work.id}"]`);
    await expect(page.locator('.react-flow__node .verification-pair')).toHaveCount(2);
    // The React Flow box must contain its actual card, and adjacent pairs must
    // leave space for both faces instead of using the old fixed 280px height.
    await expect.poll(async()=>page.locator('.react-flow__node').evaluateAll(nodes=>{
     const boxes=nodes.map(node=>{const box=node.getBoundingClientRect(),card=node.querySelector('.verification-pair')!.getBoundingClientRect();return {x:box.x,y:box.y,right:box.right,bottom:box.bottom,contains:card.bottom<=box.bottom+1};});
     return boxes.every(box=>box.contains)&&boxes.every((box,index)=>boxes.slice(index+1).every(other=>box.right<=other.x||other.right<=box.x||box.bottom<=other.y||other.bottom<=box.y));
    })).toBe(true);
    // The initial native fit can change screen zoom while this test is running.
    // Flip geometry is the intrinsic layout size, independent of that viewport.
    const intrinsicSize=()=>card.evaluate(node=>({height:(node as HTMLElement).offsetHeight,width:(node as HTMLElement).offsetWidth}));
    const sizeBefore=await intrinsicSize();
    await card.getByRole('button',{name:face.side,exact:true}).click();
    const visibleFace=card.locator(`[data-spec-id="${face.spec.id}"][aria-hidden="false"]`);
    await expect(visibleFace).toHaveAttribute('data-revision-id',face.revision.id);
    await expect(card.locator(`[data-spec-id="${other.spec.id}"]`)).toHaveAttribute('inert','');
    expect(await intrinsicSize()).toEqual(sizeBefore);
    await expect(visibleFace.getByRole('button',{name:`Вопросы спеки ${face.spec.humanId}`,exact:true})).toHaveText('1 запросов · открыто 1');
    await expect(visibleFace.getByRole('button',{name:`Предложения спеки ${face.spec.humanId}`,exact:true})).toHaveText('Предложения · 1');
    await expect(visibleFace.locator('time')).toHaveAttribute('datetime',before.events.findLast(event=>event.specId===face.spec.id)!.occurredAt);
    await visibleFace.getByRole('button',{name:`${kind==='proposals'?'Предложения':'Вопросы'} спеки ${face.spec.humanId}`,exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`spec=${face.spec.id}`));await expect(page).toHaveURL(new RegExp(`revision=${face.revision.id}`));await expect(page).toHaveURL(new RegExp(`tab=${kind}`));await expect(page).toHaveURL(/execution=all/);
    const selected=page.getByRole('region',{name:'Выбранная задача',exact:true});
    const panel=kind==='proposals'?selected.getByRole('region',{name:'Предложения выбранной ревизии и попытки',exact:true}):selected.getByRole('region',{name:'Вопросы и решения',exact:true});
    await expect(panel.getByRole('button',{name:`${kind==='proposals'?'Proposal':'Question'} for ${face.side}`,exact:true})).toBeVisible();
    await expect(panel.getByRole('button',{name:`${kind==='proposals'?'Proposal':'Question'} for ${other.side}`,exact:true})).toHaveCount(0);
   }
  }
  const after=await state();expect(after.version).toBe(before.version);expect(after.events).toEqual(before.events);
 }finally{
  await client?.close().catch(()=>{});
  await rm(rootPath,{recursive:true,force:true});
 }
});
