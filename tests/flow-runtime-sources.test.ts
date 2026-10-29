import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,emptyState,AGENT_ID,PROJECT_ID,type Actor,type Command} from '../packages/core/src';

test('FR10 an agent can cite its committed step result as Reality without gaining another execution source',()=>{
 const human:Actor={id:'runtime-source-human',kind:'human',projectIds:[PROJECT_ID]},agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
 let state=emptyState();
 const send=(body:Record<string,unknown>,actor=human)=>{
  const result=applyCommand(state,{...body,requestId:crypto.randomUUID(),expectedVersion:state.version} as Command,actor);state=result.state;return result;
 };
 const content={title:'Первичные факты проходов',goal:'Сослаться на реальный результат шага.',dod:[{id:'source',text:'Человек проверил evidence.',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:'',flow:{entryNodeId:'work',nodes:[{id:'work',kind:'action',title:'Выполнить проверку',description:'',owner:'agent'},{id:'result',kind:'result',title:'Предъявить',description:'',owner:'agent'}],edges:[{id:'next',source:'work',target:'result',label:'Проверено'}]}};
 send({type:'createSpec',content});const spec=state.specs[0],revision=state.revisions[0];
 send({type:'activateRevision',specId:spec.id,revisionId:revision.id});
 send({type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.id,flowTracking:'enforced'});const execution=state.executions[0];
 send({type:'confirmResumed',executionId:execution.id},agent);
 const runId=state.executions[0].flowRuntime!.currentRunId;
 send({type:'reportFlowStep',executionId:execution.id,runId,phase:'start'},agent);
 const completed=send({type:'reportFlowStep',executionId:execution.id,runId,phase:'complete',evidence:'test://flow-runtime/source-result'},agent);
 const source=completed.events.find(event=>event.type==='FlowStepCompleted');assert(source,'A real committed step result is required');
 const proposal={kind:'reality_summary',title:'Проверка одного шага',findings:[{text:'Шаг предъявил проверяемый результат.',sourceEventIds:[source.id]}],interpretation:'Это результат прохода, а не приёмка спеки.',limitations:'Остальной процесс ещё не завершён.'};
 send({type:'submitAgentProposal',executionId:execution.id,sourceCursor:state.version,content:proposal},agent);
 assert.deepEqual(state.agentProposalRevisions.at(-1)!.sourceEventIds,[source.id]);
 send({type:'createSpec',content:{...content,title:'Другой контекст'}});const otherSpec=state.specs.at(-1)!,otherRevision=state.revisions.at(-1)!;
 send({type:'activateRevision',specId:otherSpec.id,revisionId:otherRevision.id});
 send({type:'startExecution',specId:otherSpec.id,specRevisionId:otherRevision.id,agentId:agent.id,flowTracking:'enforced'});const other=state.executions.at(-1)!;
 const before=state;
 assert.throws(()=>send({type:'submitAgentProposal',executionId:other.id,sourceCursor:state.version,content:proposal},agent),(error:unknown)=>(error as {code?:string}).code==='VALIDATION_ERROR');
 assert.equal(state,before);
});
