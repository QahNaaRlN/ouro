import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,emptyState,replay,PROJECT_ID,type Actor,type Command} from '../packages/core/src';

const projectId='53f98abe-d149-4cb8-8bb6-7e06ee952210';
const human:Actor={id:'workspace-human',kind:'human',projectIds:[projectId]},agent:Actor={id:'workspace-agent',kind:'agent',projectIds:[projectId]};
const content={title:'Изучить выбранный проект',goal:'Прочитать README и предъявить проверяемый результат.',dod:[{id:'observed',text:'Предъявлен результат с основаниями проверки.',required:true}],constraints:'Работа по выбранной папке.',assumptions:'',risks:'',inputs:'',comment:''};
const command=(data:Record<string,unknown>,version:number)=>({...data,requestId:crypto.randomUUID(),expectedVersion:version}) as Command;

test('PW02 project initialization has its own replayed roadmap identity without changing legacy empty state',()=>{
 const before=emptyState(projectId),legacy=emptyState();
 const result=applyCommand(before,command({type:'initializeProject',name:'Локальная папка проекта'},0),human);
 assert.equal(result.events.length,1);assert.equal(result.events[0].type,'ProjectInitialized');
 assert.equal(result.state.projectId,projectId);assert.equal(result.state.roadmap.title,'Локальная папка проекта');assert.notEqual(result.state.roadmap.id,legacy.roadmap.id);
 assert.deepEqual(replay(result.events,projectId),result.state);assert.equal(emptyState().projectId,PROJECT_ID);assert.deepEqual(emptyState(),legacy);
 assert.throws(()=>applyCommand(result.state,command({type:'initializeProject',name:'Переписать начало'},1),human),error=>(error as {code?:string}).code==='INVALID_TRANSITION');
 assert.throws(()=>applyCommand(before,command({type:'initializeProject',name:'Самовольное начало'},0),agent),error=>(error as {code?:string}).code==='FORBIDDEN');
});

test('PW03 one human work request creates a specification, active revision and queued assignment; only agent ACK starts it',()=>{
 const before=emptyState(projectId);
 const result=applyCommand(before,command({type:'startProjectWork',agentId:agent.id,content},0),human);
 assert.deepEqual(result.events.map(event=>event.type),['SpecCreated','RevisionActivated','ExecutionCreated']);
 assert.equal(result.state.specs.length,1);assert.equal(result.state.revisions.length,1);assert.equal(result.state.executions.length,1);
 const spec=result.state.specs[0],revision=result.state.revisions[0],execution=result.state.executions[0];
 assert.equal(spec.activeRevisionId,revision.id);assert.equal(execution.specRevisionId,revision.id);assert.equal(execution.agentId,agent.id);assert.equal(execution.state,'queued');assert.equal(spec.state,'specified');
 assert.equal(revision.goal,content.goal);assert.deepEqual(revision.dod,content.dod);assert.deepEqual(replay(result.events,projectId),result.state);assert.equal(before.version,0);
 assert.throws(()=>applyCommand(before,command({type:'startProjectWork',agentId:agent.id,content},0),agent),error=>(error as {code?:string}).code==='FORBIDDEN');
 const running=applyCommand(result.state,command({type:'confirmResumed',executionId:execution.id,ackPhase:'start'},result.state.version),agent);
 assert.equal(running.state.executions[0].state,'running');assert.equal(running.state.specs[0].state,'in_progress');assert.equal(running.state.specs[0].acceptance,undefined);
});

test('PW03 invalid expectations or a frozen roadmap reject the whole work request without partial entities',()=>{
 const before=emptyState(projectId);const frozen={...before,roadmap:{...before.roadmap,state:'frozen' as const}};
 for(const [state,payload] of [[before,{...content,dod:[]}],[frozen,content]] as const){
  assert.throws(()=>applyCommand(state,command({type:'startProjectWork',agentId:agent.id,content:payload},state.version),human));
  assert.equal(state.specs.length,0);assert.equal(state.events.length,0);
 }
});
