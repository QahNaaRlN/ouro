import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { POST as inbox } from '../app/api/inbox/route';
import { POST as mcp } from '../app/api/mcp/route';
import { createAgent,executeCommand,getProject,createStore } from '../lib/store';
import { AGENT_ID,PROJECT_ID,type Actor } from '../packages/core/src';
import { createAgentService } from '../packages/mcp/src/agent-service';

const human:Actor={id:'independent-review-human',kind:'human',projectIds:[PROJECT_ID]};
const content=(title:string)=>({title,goal:'Проверить изоляцию зарегистрированных агентов.',dod:[{id:'isolation',text:'Чужой контекст не раскрыт',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''});

test('AC05 registered agent HTTP inbox result must not reveal another agent project state',async()=>{
  process.env.OURO_DATA_DIR='memory://';
  const a=await createAgent('Scoped reporter',human);
  const b=await createAgent('Private other agent',human);
  const command=async(payload:Record<string,unknown>,actor=human)=>executeCommand({...payload,requestId:randomUUID(),expectedVersion:(await getProject()).version},actor);
  const assign=async(agentId:string,title:string)=>{
    let result=await command({type:'createSpec',content:content(title)});
    const spec=result.state.specs.at(-1)!,revision=spec.revisionIds[0];
    await command({type:'activateRevision',specId:spec.id,revisionId:revision});
    result=await command({type:'startExecution',specId:spec.id,specRevisionId:revision,agentId});
    return result.state.executions.at(-1)!;
  };
  try{
    const own=await assign(a.agent.id,'Own permitted work');
    await assign(b.agent.id,'PRIVATE-FOR-OTHER-AGENT-ONLY');
    await command({type:'confirmResumed',executionId:own.id},{id:a.agent.id,kind:'agent',projectIds:[PROJECT_ID]});
    const response=await inbox(new Request('http://127.0.0.1:3000/api/inbox',{method:'POST',headers:{authorization:`Bearer ${a.token}`,'content-type':'application/json'},body:JSON.stringify({tool:'ouro.report_action',arguments:{executionId:own.id,specId:own.specId,specRevisionId:own.specRevisionId,requestId:randomUUID(),expectedVersion:(await getProject()).version,actionId:randomUUID(),title:'Законный факт',context:'Собственная назначенная попытка.',phase:'completed',evidence:'test://scoped-action'}})}));
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(JSON.stringify(body).includes('PRIVATE-FOR-OTHER-AGENT-ONLY'),false,'registered inbox returned foreign project data');
    assert.equal('state' in body,false,'registered inbox must not return full project snapshot');
  }finally{
    const global=globalThis as typeof globalThis & {__ouroStore?:Promise<{close():Promise<void>}>};
    await(await global.__ouroStore)?.close();delete global.__ouroStore;
  }
});

test('published confirm_started tool cannot be used to acknowledge a continuation',async()=>{
  const store=await createStore({dataDir:'memory://'});
  const actor:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
  const command=async(payload:Record<string,unknown>)=>store.executeCommand({...payload,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},human);
  try{
    const initial=await store.getProject(),fork=initial.requests.find(r=>r.kind==='Fork')!;
    await command({type:'resolveDecision',decisionRequestId:fork.id,specRevisionId:fork.specRevisionId,outcome:{kind:'approve',chosenOptionId:fork.options[0].id}});
    await command({type:'resumeExecution',executionId:fork.executionId});
    const service=createAgentService({store,actor});
    const result=await service.callTool('ouro.confirm_started',{executionId:fork.executionId,requestId:randomUUID(),expectedVersion:(await store.getProject()).version});
    assert.equal(result.isError,true,'started ACK is documented for queued execution only');
    assert.equal((result.structuredContent.error as {code:string}).code,'INVALID_TRANSITION');
  }finally{await store.close();}
});

test('published confirm_resumed tool cannot be used as the first start acknowledgment',async()=>{
  const store=await createStore({dataDir:'memory://'});
  const actor:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
  try{
    const initial=await store.getProject(),spec=initial.specs.find(s=>s.humanId==='OURO-S-000005')!;
    const result=await store.executeCommand({type:'startExecution',specId:spec.id,specRevisionId:spec.activeRevisionId,agentId:AGENT_ID,requestId:randomUUID(),expectedVersion:initial.version},human);
    const execution=result.state.executions.at(-1)!;
    const service=createAgentService({store,actor});
    const ack=await service.callTool('ouro.confirm_resumed',{executionId:execution.id,requestId:randomUUID(),expectedVersion:result.cursor});
    assert.equal(ack.isError,true,'resumed ACK must not start a queued execution');
    assert.equal((ack.structuredContent.error as {code:string}).code,'INVALID_TRANSITION');
  }finally{await store.close();}
});

test('AC11 MCP endpoint rejects malformed, oversized and cross-origin requests without changing history',async()=>{
  process.env.OURO_DATA_DIR='memory://';
  const registration=await createAgent('HTTP boundary review',human);
  const before=(await getProject()).version;
  const request=(body:string,overrides:Record<string,string>={})=>new Request('http://127.0.0.1:3000/api/mcp',{method:'POST',headers:{authorization:`Bearer ${registration.token}`,'content-type':'application/json',accept:'application/json, text/event-stream',...overrides},body});
  try{
    const initial=JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'boundary-review',version:'1.0'}}});
    assert.equal((await mcp(request(initial))).status,200);
    assert.equal((await mcp(request(initial,{authorization:'Bearer wrong-key'}))).status,401);
    assert.equal((await mcp(request(initial,{origin:'https://foreign.example'}))).status,403);
    assert.equal((await mcp(request(initial,{host:'foreign.example'}))).status,403);
    assert.equal((await mcp(request('{'))).status,400);
    assert.equal((await mcp(request(JSON.stringify({padding:'x'.repeat(270_000)})))).status,413);
    assert.equal((await mcp(request(initial,{'content-type':'text/plain'}))).status,415);
    assert.equal((await getProject()).version,before);
  }finally{
    const global=globalThis as typeof globalThis & {__ouroStore?:Promise<{close():Promise<void>}>};
    await(await global.__ouroStore)?.close();delete global.__ouroStore;
  }
});

test('AC05/07 new requests cannot target a superseded execution revision while late Action facts remain reportable',async()=>{
  const store=await createStore({dataDir:'memory://'});
  const actor:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
  const humanCommand=async(payload:Record<string,unknown>)=>store.executeCommand({...payload,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},human);
  try{
    const initial=await store.getProject(),spec=initial.specs.find(s=>s.humanId==='OURO-S-000005')!;
    let result=await humanCommand({type:'startExecution',specId:spec.id,specRevisionId:spec.activeRevisionId,agentId:AGENT_ID});
    const execution=result.state.executions.at(-1)!;
    await store.executeCommand({type:'confirmResumed',executionId:execution.id,requestId:randomUUID(),expectedVersion:result.cursor},actor);
    const oldRevision=initial.revisions.find(r=>r.id===spec.activeRevisionId)!;
    result=await humanCommand({type:'proposeRevision',specId:spec.id,content:{...oldRevision,title:'Новое ожидание после остановки'}});
    await humanCommand({type:'activateRevision',specId:spec.id,revisionId:result.state.revisions.at(-1)!.id});
    const service=createAgentService({store,actor});
    const invoke=(name:string,payload:Record<string,unknown>)=>store.getProject().then(state=>service.callTool(name,{executionId:execution.id,requestId:randomUUID(),expectedVersion:state.version,...payload}));
    const before=(await store.getProject()).version;
    const request=await invoke('ouro.report_question',{title:'Вопрос к старой редакции',context:'Эта попытка уже получила stopRequested после смены ожидания.',question:'Продолжать старый контракт?',blockingScope:'execution'});
    assert.equal(request.isError,true,'new pending request on an inactive revision is not answerable by the human');
    assert.equal((request.structuredContent.error as {code:string}).code,'REVISION_CONFLICT');
    assert.equal((await store.getProject()).version,before);
    const late=await invoke('ouro.report_action',{actionId:randomUUID(),phase:'completed',title:'Поздний факт старой попытки',context:'Событие действительно относится к старому исполнению.',evidence:'test://historical-action'});
    assert.notEqual(late.isError,true);
    const event=(late.structuredContent.events as Array<{specRevisionId:string;payload:{historicalContext:boolean}}>)[0];
    assert.equal(event.specRevisionId,execution.specRevisionId);assert.equal(event.payload.historicalContext,true);
  }finally{await store.close();}
});
