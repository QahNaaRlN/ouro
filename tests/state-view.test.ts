import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, emptyState, PROJECT_ID, AGENT_ID, type Actor, type Command, type ProjectState } from '../packages/core/src';
import { buildStateView } from '../packages/core/src/state-view';
const human:Actor={id:'state-human',kind:'human',projectIds:[PROJECT_ID]};
const agent:Actor={id:AGENT_ID,kind:'agent',projectIds:[PROJECT_ID]};
function run(state:ProjectState,payload:Record<string,unknown>,actor=human){return applyCommand(state,{...payload,requestId:crypto.randomUUID(),expectedVersion:state.version} as Command,actor).state;}
function fixture(){
 let state=run(emptyState(),{type:'createSpec',content:{title:'Подтвердить переходы',goal:'Проверяемые переходы автомата.',dod:[{id:'proof',text:'Человек проверил результат',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
 const spec=state.specs[0],revision=state.revisions[0];
 state=run(state,{type:'activateRevision',specId:spec.id,revisionId:revision.id});
 state=run(state,{type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.id});
 return {state,spec,revision,execution:state.executions[0]};
}

test('state view records only real execution transitions; human permission and decision do not counterfeit an ACK',()=>{
 let {state,spec,revision,execution}=fixture();
 const view=()=>buildStateView(state,{axis:'execution',executionId:execution.id});
 assert.equal(view().current,'queued');
 assert(view().notices.some((n:any)=>n.code==='awaiting_start_ack'));
 state=run(state,{type:'confirmResumed',executionId:execution.id},agent);
 assert.equal(view().current,'running');
 state=run(state,{type:'reportQuestion',executionId:execution.id,specId:spec.id,specRevisionId:revision.id,title:'Вопрос',context:'Выбор ожидает человека.',question:'Какой формат?',blockingScope:'execution'},agent);
 const request=state.requests[0];
 assert.equal(view().current,'waiting_for_human');
 const before=view().history.length;
 state=run(state,{type:'resolveDecision',decisionRequestId:request.id,specRevisionId:revision.id,outcome:{kind:'answer',answer:'JSON с проверенной схемой.'}});
 assert.equal(view().current,'waiting_for_human');assert.equal(view().history.length,before);
 state=run(state,{type:'resumeExecution',executionId:execution.id});
 assert.equal(view().current,'waiting_for_human');assert.equal(view().history.length,before);
 assert(view().notices.some((n:any)=>n.code==='awaiting_resume_ack'));
 state=run(state,{type:'confirmResumed',executionId:execution.id},agent);
 const actual=view().history.filter((h:any)=>h.from!==null).map((h:any)=>[h.from,h.to,h.eventType]);
 assert.deepEqual(actual,[['queued','running','ExecutionStarted'],['running','waiting_for_human','DecisionRequested'],['waiting_for_human','running','ExecutionResumed']]);
 assert.equal(buildStateView(state,{axis:'request',requestId:request.id}).current,'resolved');
});

test('state view keeps successful attempt separate from human acceptance and resolves indirect spec changes from replay',()=>{
 let {state,spec,revision,execution}=fixture();
 state=run(state,{type:'confirmResumed',executionId:execution.id},agent);
 state=run(state,{type:'completeExecution',executionId:execution.id,result:'succeeded',evidence:'Проверка выполнена.'},agent);
 assert.equal(buildStateView(state,{axis:'execution',executionId:execution.id}).current,'succeeded');
 const before=buildStateView(state,{axis:'spec',specId:spec.id});
 assert.equal(before.current,'in_progress');assert(!before.history.some((h:any)=>h.to==='done'));
 state=run(state,{type:'acceptSpec',specId:spec.id,specRevisionId:revision.id,evidence:{proof:'Человек отдельно проверил.'}});
 const after=buildStateView(state,{axis:'spec',specId:spec.id});
 assert.equal(after.current,'done');assert.equal(after.history.at(-1)?.eventType,'SpecAccepted');
 assert.equal(after.history.at(-1)?.eventId,state.events.at(-1)?.id);
});

test('stop remains a request until ACK, and only the selected execution history is highlighted',()=>{
 let {state,execution}=fixture();
 state=run(state,{type:'confirmResumed',executionId:execution.id},agent);
 state=run(state,{type:'requestStop',executionId:execution.id,reason:'Проверка реальной остановки.'});
 let view=buildStateView(state,{axis:'execution',executionId:execution.id});
 assert.equal(view.current,'running');assert(view.notices.some((n:any)=>n.code==='awaiting_stop_ack'));
 assert(!view.history.some((h:any)=>h.to==='paused'));
 state=run(state,{type:'confirmStopped',executionId:execution.id},agent);
 view=buildStateView(state,{axis:'execution',executionId:execution.id});
 assert.equal(view.current,'paused');assert.equal(view.history.at(-1)?.eventType,'ExecutionPaused');
 assert.equal(buildStateView(state,{axis:'execution',executionId:'missing'}).current,null);
 assert.equal(buildStateView(state,{axis:'execution',executionId:'missing'}).history.length,0);
});

test('diagram metadata represents implemented roadmap and request transitions without inventing withdrawal',()=>{
 let {state}=fixture();
 const request=buildStateView(state,{axis:'request'});
 assert(request.states.some((s:any)=>s.id==='withdrawn'&&s.reserved));
 assert(!request.transitions.some((t:any)=>t.to==='withdrawn'));
 state=run(state,{type:'changeRoadmapState',state:'frozen'});
 const map=buildStateView(state,{axis:'roadmap'});
 assert.equal(map.current,'frozen');
 assert.deepEqual(map.history.map((h:any)=>[h.from,h.to]),[['active','frozen']]);
 assert(map.transitions.some((t:any)=>t.from==='frozen'&&t.to==='active'));
});

test('indirect prerequisite revision changes appear on the affected spec with the actual causing event',()=>{
 let {state,spec:prerequisite,revision,execution}=fixture();
 state=run(state,{type:'confirmResumed',executionId:execution.id},agent);
 state=run(state,{type:'completeExecution',executionId:execution.id,result:'succeeded',evidence:'Предпосылка проверена.'},agent);
 state=run(state,{type:'acceptSpec',specId:prerequisite.id,specRevisionId:revision.id,evidence:{proof:'Приёмка предпосылки.'}});
 state=run(state,{type:'createSpec',content:{title:'Зависимая работа',goal:'Требует принятую предпосылку.',dod:[{id:'dependent',text:'Проверено',required:true}],constraints:'',assumptions:'',risks:'',inputs:'',comment:''}});
 const dependent=state.specs.at(-1)!,dependentRevision=state.revisions.at(-1)!;
 state=run(state,{type:'addDependency',from:prerequisite.id,to:dependent.id});
 state=run(state,{type:'activateRevision',specId:dependent.id,revisionId:dependentRevision.id});
 state=run(state,{type:'startExecution',specId:dependent.id,specRevisionId:dependentRevision.id,agentId:agent.id});
 const dependentExecution=state.executions.at(-1)!;
 state=run(state,{type:'confirmResumed',executionId:dependentExecution.id},agent);
 assert.equal(buildStateView(state,{axis:'spec',specId:dependent.id}).current,'in_progress');
 state=run(state,{type:'proposeRevision',specId:prerequisite.id,content:{...revision,title:'Изменённая предпосылка'}});
 state=run(state,{type:'activateRevision',specId:prerequisite.id,revisionId:state.revisions.at(-1)!.id});
 const view=buildStateView(state,{axis:'spec',specId:dependent.id});
 assert.equal(view.current,'blocked');
 assert.deepEqual([view.history.at(-1)?.from,view.history.at(-1)?.to,view.history.at(-1)?.eventType],['in_progress','blocked','RevisionActivated']);
 assert.equal(view.history.at(-1)?.eventId,state.events.at(-1)?.id);
 assert.notEqual(state.events.at(-1)?.specId,dependent.id,'The causal event belongs to the prerequisite, not the affected spec.');
});
