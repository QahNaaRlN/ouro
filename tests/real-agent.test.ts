import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../lib/store';
import { PROJECT_ID } from '../packages/core/src';

test('AC06 real registered agent result is not labeled as simulation',async()=>{
  const store=await createStore({dataDir:'memory://'});
  const human={id:'real-agent-test-human',kind:'human' as const,projectIds:[PROJECT_ID]};
  try{
    const {agent,token}=await store.createAgent('Независимый MCP client',human);
    const actor=(await store.authenticateAgentToken(token))!;
    const run=async(payload:Record<string,unknown>,principal=human as typeof actor)=>{
      const state=await store.getProject();return store.executeCommand({...payload,requestId:crypto.randomUUID(),expectedVersion:state.version},principal);
    };
    let result=await run({type:'createSpec',content:{title:'Проверить реальный отчёт',goal:'Сохранить источник исполнения.',dod:[{id:'real',text:'Нет метки симуляции',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
    const spec=result.state.specs.at(-1)!,revision=spec.revisionIds[0];
    await run({type:'activateRevision',specId:spec.id,revisionId:revision});
    result=await run({type:'startExecution',specId:spec.id,specRevisionId:revision,agentId:agent.id});
    const execution=result.state.executions.at(-1)!;
    await run({type:'confirmResumed',executionId:execution.id},actor);
    result=await run({type:'completeExecution',executionId:execution.id,result:'succeeded',evidence:'test://real-client'},actor);
    assert.equal(result.events[0].payload.simulation,false);
  }finally{await store.close();}
});
