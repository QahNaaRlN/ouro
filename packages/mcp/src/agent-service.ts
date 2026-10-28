import { applyCommand, DomainError, PROJECT_ID, type Actor, type Command, type DomainEvent, type ProjectState, type Execution, type DecisionRequest } from '../../core/src';
import { AGENT_TOOLS } from './tools';

export type AgentStore = {
  getProject(): Promise<ProjectState>;
  getEvents(after?: number): Promise<{ events: DomainEvent[]; cursor: number }>;
  executeCommand(command: unknown, actor: Actor): Promise<{ state: ProjectState; events: DomainEvent[]; cursor: number; replayed: boolean }>;
};
export type AgentToolResult = {
  content: Array<{type:'text';text:string}>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
};

function result(body:Record<string,unknown>,isError=false):AgentToolResult {
  const clean=JSON.parse(JSON.stringify(body)) as Record<string,unknown>;
  return {content:[{type:'text',text:JSON.stringify(clean)}],structuredContent:clean,...(isError?{isError:true}:{})};
}
const fail=(code:string,message:string):never=>{throw new DomainError(code,message);};
const terminal=new Set(['succeeded','failed','cancelled','skipped']);

/** Read/write facade for an already authenticated identity. It grants no human capabilities. */
export function createAgentService({ store, actor }: {store:AgentStore; actor:Actor}) {
  const assertActor=()=>{
    if(actor.kind!=='agent'||!actor.id||!actor.projectIds.includes(PROJECT_ID))fail('FORBIDDEN','Требуется назначенная агентская идентичность этого проекта.');
  };
  const assigned=(state:ProjectState,executionId:string):Execution=>{
    const execution=state.executions.find(e=>e.id===executionId&&e.agentId===actor.id);
    return execution??fail('FORBIDDEN','Исполнение недоступно этому агенту.');
  };
  const requestsFor=(state:ProjectState,execution:Execution)=>state.requests.filter(r=>r.executionId===execution.id||r.id===execution.remediatesBlockerId);
  const permissions=(state:ProjectState,execution:Execution)=>{
    // Reuse pure domain guards instead of maintaining a second transition machine.
    const can=(data:Record<string,unknown>)=>{
      try{applyCommand(state,{...data,requestId:'permission-probe',expectedVersion:state.version} as Command,actor);return true;}
      catch{return false;}
    };
    const resume=can({type:'confirmResumed',executionId:execution.id});
    return {
      canAcknowledgeStart:execution.state==='queued'&&resume,
      canAcknowledgeResume:execution.state!=='queued'&&resume,
      canAcknowledgeStop:can({type:'confirmStopped',executionId:execution.id}),
      canStartAction:can({type:'reportAction',executionId:execution.id,specId:execution.specId,specRevisionId:execution.specRevisionId,actionId:'permission-probe-action',title:'Permission probe',context:'Read-only domain guard probe.',phase:'started'}),
      canCompleteSuccessfully:can({type:'completeExecution',executionId:execution.id,result:'succeeded',evidence:'Read-only domain guard probe.'}),
      stopRequested:execution.stopRequested===true,
      resumeAuthorized:execution.resumeAuthorized===true,
      terminal:terminal.has(execution.state),
    };
  };
  const workItem=(state:ProjectState,execution:Execution)=>{
    const spec=state.specs.find(s=>s.id===execution.specId)!;
    return {
      execution,
      spec:{id:spec.id,humanId:spec.humanId,title:spec.title,state:spec.state,activeRevisionId:spec.activeRevisionId},
      revision:state.revisions.find(r=>r.id===execution.specRevisionId),
      requests:requestsFor(state,execution),
      permissions:permissions(state,execution),
    };
  };
  const permittedEvent=(event:DomainEvent,state:ProjectState)=>{
    const own=state.executions.filter(e=>e.agentId===actor.id);
    const ids=new Set(own.map(e=>e.id));
    const specIds=new Set(own.map(e=>e.specId));
    const revisions=new Set(own.map(e=>e.specRevisionId));
    const delegated=new Set(own.map(e=>e.remediatesBlockerId).filter((x):x is string=>!!x));
    const requestId=typeof event.payload.decisionRequestId==='string'?event.payload.decisionRequestId:(event.payload.request as {id?:string}|undefined)?.id;
    if(requestId&&delegated.has(requestId))return true;
    if(event.executionId)return ids.has(event.executionId);
    if(event.type==='RoadmapStateChanged')return true;
    if(!event.specId||!specIds.has(event.specId))return false;
    return ['SpecCreated','RevisionActivated','SpecInvalidated'].includes(event.type)||!!event.specRevisionId&&revisions.has(event.specRevisionId);
  };
  const requestFor=(state:ProjectState,execution:Execution,requestId:string,remediation=false):DecisionRequest=>{
    const request=state.requests.find(r=>r.id===requestId);
    if(!request||(!remediation&&request.executionId!==execution.id)||(remediation&&execution.remediatesBlockerId!==request.id))fail('FORBIDDEN','Запрос решения не относится к разрешённому контексту исполнения.');
    return request!;
  };
  return {
    listTools:()=>AGENT_TOOLS,
    async callTool(name:string,args:unknown):Promise<AgentToolResult>{
      try{
        assertActor();
        const tool=AGENT_TOOLS.find(t=>t.name===name)??fail('UNKNOWN_TOOL','Инструмент не опубликован для агента.');
        const parsed=tool.inputSchema.safeParse(args??{});
        if(!parsed.success)throw new DomainError('VALIDATION_ERROR','Аргументы не соответствуют опубликованной схеме инструмента.',{issues:parsed.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});
        const input=parsed.data as Record<string,unknown>;
        const state=await store.getProject();
        if(state.projectId!==PROJECT_ID)fail('FORBIDDEN','Недоступный проект.');
        if(name==='ouro.get_context'){
          const work=input.executionId?[assigned(state,String(input.executionId))]:state.executions.filter(e=>e.agentId===actor.id);
          return result({ok:true,project:{id:state.projectId,title:state.roadmap.title,roadmapState:state.roadmap.state},agent:{id:actor.id,name:actor.name},version:state.version,cursor:state.version,work:work.map(e=>workItem(state,e)),instructions:[
            'Работайте только в назначенной попытке и по её immutable revision. Отсутствие назначения не разрешает самостоятельный запуск.',
            'ACK разрешённого запуска/продолжения отправляется отдельно от решения человека. При stopRequested остановите затронутую работу и подтвердите фактическую остановку.',
            'Question/Fork/Blocker требуют человека. Пока ожидаете, читайте get_updates/get_context; отсутствие ответа и confidence не означают согласие.',
            'Уточнение человека — отдельный запрос дополнительных фактов. Отвечайте через submit_decision_clarification с настоящим clarificationEventId; это не закрывает исходный запрос решения и не разрешает продолжение.',
            'Свой pending-запрос можно отозвать с причиной через withdraw_decision. Отзыв не является решением человека, разрешением продолжить или доказательством устранения Blocker.',
            'Сохраняйте requestId при сетевом повторе. При VERSION_CONFLICT прочитайте контекст и осмысленно сформируйте новую команду; не подменяйте версию автоматически.',
            'Успех исполнения не является human-приёмкой DoD. Предъявляйте проверяемое evidence, не выдавайте симуляцию за реальную работу.',
          ]});
        }
        if(name==='ouro.get_updates'){
          const updates=await store.getEvents(input.afterCursor as number);
          // Authorization uses current committed assignments. A new assignment can
          // appear between the snapshot read and cursor read, so refresh its scope.
          const scope=updates.cursor>state.version?await store.getProject():state;
          return result({ok:true,events:updates.events.filter(e=>permittedEvent(e,scope)),cursor:updates.cursor});
        }
        const execution=assigned(state,String(input.executionId));
        const base={requestId:input.requestId as string,expectedVersion:input.expectedVersion as number,executionId:execution.id};
        const context={...base,specId:execution.specId,specRevisionId:execution.specRevisionId};
        let command:Command|undefined;
        switch(name){
          case 'ouro.report_action':command={...input,...context,type:'reportAction'} as Command;break;
          case 'ouro.report_question':command={...input,...context,type:'reportQuestion'} as Command;break;
          case 'ouro.report_fork':command={...input,...context,type:'reportFork'} as Command;break;
          case 'ouro.report_blocker':command={...input,...context,type:'reportBlocker'} as Command;break;
          case 'ouro.withdraw_decision':{
            const request=requestFor(state,execution,String(input.decisionRequestId));
            command={...base,type:'withdrawDecision',decisionRequestId:request.id,reason:input.reason as string} as Command;break;
          }
          case 'ouro.submit_decision_clarification':{
            const request=requestFor(state,execution,String(input.decisionRequestId));
            command={...base,type:'submitDecisionClarification',decisionRequestId:request.id,clarificationEventId:input.clarificationEventId as string,response:input.response as string} as Command;break;
          }
          case 'ouro.confirm_started':case 'ouro.confirm_resumed':command={...base,type:'confirmResumed',ackPhase:name==='ouro.confirm_started'?'start':'resume'};break;
          case 'ouro.confirm_stopped':command={...base,type:'confirmStopped'};break;
          case 'ouro.confirm_decision_applied':{
            const request=requestFor(state,execution,String(input.decisionRequestId));
            command={...base,type:'confirmDecisionApplied',decisionRequestId:request.id,evidence:input.evidence as string};break;
          }
          case 'ouro.complete_execution':command={...base,type:'completeExecution',result:input.result as 'succeeded'|'failed',evidence:input.evidence as string};break;
          case 'ouro.clear_blocker':{
            const request=requestFor(state,execution,String(input.decisionRequestId),true);
            command={requestId:base.requestId,expectedVersion:base.expectedVersion,type:'clearBlocker',decisionRequestId:request.id,remediationExecutionId:execution.id,evidence:input.evidence as string};break;
          }
          default:fail('UNKNOWN_TOOL','Инструмент не опубликован для агента.');
        }
        const committed=await store.executeCommand(command??fail('UNKNOWN_TOOL','Инструмент не опубликован для агента.'),actor);
        const savedExecution=assigned(committed.state,execution.id);
        return result({ok:true,execution:savedExecution,requests:requestsFor(committed.state,savedExecution),events:committed.events.filter(e=>permittedEvent(e,committed.state)),cursor:committed.cursor,replayed:committed.replayed});
      }catch(error){
        const e=error as {code?:string;message?:string;details?:Record<string,unknown>};
        const known=typeof e.code==='string'&&/^[A-Z_]+$/.test(e.code);
        const code=known?e.code!:'INTERNAL_ERROR';
        return result({ok:false,error:{code,message:known?e.message:'Не удалось выполнить инструмент. Прочитайте контекст перед повтором.',...(known&&e.details?{details:e.details}:{}),retryable:false,refreshRequired:['VERSION_CONFLICT','REVISION_CONFLICT'].includes(code)}},true);
      }
    },
  };
}
