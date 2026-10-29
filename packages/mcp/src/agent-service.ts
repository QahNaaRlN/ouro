import { applyCommand, buildFlowRuntimeView, DomainError, PROJECT_ID, type Actor, type Command, type DomainEvent, type ProjectState, type Execution, type DecisionRequest } from '../../core/src';
import { AGENT_TOOLS } from './tools';
import {isExecutionProposalSource,hasRealityProposalSource} from '../../core/src/agent-proposals';
import {agentErrorSchema,validateToolBody,type AgentResultBody,type WorkspaceMetadata,type WorkspaceFileList,type WorkspaceFile} from '@ouro/protocol';

export type AgentStore = {
  getProject(): Promise<ProjectState>;
  getEvents(after?: number): Promise<{ events: DomainEvent[]; cursor: number }>;
  executeCommand(command: unknown, actor: Actor): Promise<{ state: ProjectState; events: DomainEvent[]; cursor: number; replayed: boolean }>;
};
export type AgentToolResult = {
  content: Array<{type:'text';text:string}>;
  structuredContent: AgentResultBody & Record<string,unknown>;
  isError?: boolean;
};
export type AgentWorkspace={
  getMetadata():Promise<WorkspaceMetadata|null>;
  listFiles(path?:string,cursor?:number):Promise<WorkspaceFileList>;
  readFile(path:string):Promise<WorkspaceFile>;
};
export type AgentServiceDependencies={store:AgentStore;actor:Actor;projectId?:string;workspace?:AgentWorkspace};

// Validate the constant when the module loads, before a store can commit work.
const outputFailure=agentErrorSchema.parse({ok:false,error:{
  code:'OUTPUT_CONTRACT_ERROR',
  message:'Не удалось подтвердить результат ответа. Если выполнялась команда, сохраните тот же requestId и неизменное тело; повтор должен получить исходную квитанцию.',
  details:{outcomeUnknown:true},retryable:false,refreshRequired:false,
}});
function result(name:string,body:Record<string,unknown>,isError=false):AgentToolResult {
  try{
    const clean=JSON.parse(JSON.stringify(body)) as AgentResultBody & Record<string,unknown>;
    validateToolBody(name,clean,isError);
    // Keep the original JSON, including allowed extension fields. A validator
    // must never silently strip a committed receipt's evidence or metadata.
    return {content:[{type:'text',text:JSON.stringify(clean)}],structuredContent:clean,...(isError?{isError:true}:{})};
  }catch{
    // A successful SQL commit can precede serialization/output validation.
    // This does not prove absence and must not invite a new request ID. Do not
    // return Zod issues or raw values from a potentially sensitive projection.
    const clean=JSON.parse(JSON.stringify(outputFailure)) as AgentResultBody & Record<string,unknown>;
    return {content:[{type:'text',text:JSON.stringify(clean)}],structuredContent:clean,isError:true};
  }
}
const fail=(code:string,message:string):never=>{throw new DomainError(code,message);};
const terminal=new Set(['succeeded','failed','cancelled','skipped']);

/** Read/write facade for an already authenticated identity. It grants no human capabilities. */
export function createAgentService({ store, actor,projectId=PROJECT_ID,workspace }: AgentServiceDependencies) {
  const assertActor=()=>{
    if(actor.kind!=='agent'||!actor.id||!actor.projectIds.includes(projectId))fail('FORBIDDEN','Требуется назначенная агентская идентичность этого проекта.');
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
    const run=execution.flowRuntime?.runs.find(item=>item.id===execution.flowRuntime?.currentRunId);
    const flowBinding=run?{flowStepRunId:run.id,flowNodeId:run.nodeId}:{};
    return {
      canAcknowledgeStart:execution.state==='queued'&&resume,
      canAcknowledgeResume:execution.state!=='queued'&&resume,
      canAcknowledgeStop:can({type:'confirmStopped',executionId:execution.id}),
      canStartAction:can({type:'reportAction',executionId:execution.id,specId:execution.specId,specRevisionId:execution.specRevisionId,...flowBinding,actionId:'permission-probe-action',title:'Permission probe',context:'Read-only domain guard probe.',phase:'started'}),
      canCompleteSuccessfully:can({type:'completeExecution',executionId:execution.id,result:'succeeded',evidence:'Read-only domain guard probe.'}),
      stopRequested:execution.stopRequested===true,
      resumeAuthorized:execution.resumeAuthorized===true,
      terminal:terminal.has(execution.state),
    };
  };
  const workItem=(state:ProjectState,execution:Execution)=>{
    const spec=state.specs.find(s=>s.id===execution.specId)!;
    const requests=requestsFor(state,execution),requestIds=new Set(requests.map(request=>request.id));
    const clarifications=state.events.filter(event=>event.type==='DecisionClarificationRequested'&&requestIds.has(String(event.payload.decisionRequestId))).map(event=>{
      const response=state.events.find(candidate=>candidate.type==='DecisionClarificationSubmitted'&&candidate.payload.clarificationEventId===event.id);
      return {eventId:event.id,decisionRequestId:event.payload.decisionRequestId,question:event.payload.question,actorId:event.actor.id,at:event.occurredAt,...(response?{response:{eventId:response.id,text:response.payload.response,actorId:response.actor.id,at:response.occurredAt}}:{})};
    });
    const proposalSources=state.events.filter(event=>isExecutionProposalSource(event,execution,state.projectId));
    const proposals=state.agentProposals.filter(proposal=>proposal.executionId===execution.id);
    return {
      execution,
      flowProgress:buildFlowRuntimeView(state,execution.id),
      spec:{id:spec.id,humanId:spec.humanId,title:spec.title,state:spec.state,activeRevisionId:spec.activeRevisionId},
      revision:state.revisions.find(r=>r.id===execution.specRevisionId),
      requests,clarifications,
      proposals,
      proposalRevisions:state.agentProposalRevisions.filter(revision=>proposals.some(proposal=>proposal.id===revision.proposalId)),
      proposalSourceIds:proposalSources.map(event=>({id:event.id,version:event.version,type:event.type})),
      permissions:{...permissions(state,execution),canSubmitProposal:hasRealityProposalSource(proposalSources)},
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
      let committedWrite=false;
      try{
        assertActor();
        const tool=AGENT_TOOLS.find(t=>t.name===name)??fail('UNKNOWN_TOOL','Инструмент не опубликован для агента.');
        const parsed=tool.inputSchema.safeParse(args??{});
        if(!parsed.success)throw new DomainError('VALIDATION_ERROR','Аргументы не соответствуют опубликованной схеме инструмента.',{issues:parsed.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});
        const input=parsed.data as Record<string,unknown>;
        const state=await store.getProject();
        if(state.projectId!==projectId)fail('FORBIDDEN','Недоступный проект.');
        if(name==='ouro.get_context'){
          const work=input.executionId?[assigned(state,String(input.executionId))]:state.executions.filter(e=>e.agentId===actor.id);
          const metadata=work.length&&workspace?await workspace.getMetadata():null;
          return result(name,{ok:true,project:{id:state.projectId,title:state.roadmap.title,roadmapState:state.roadmap.state},agent:{id:actor.id,name:actor.name},version:state.version,cursor:state.version,work:work.map(e=>workItem(state,e)),...(metadata?{workspace:metadata}:{}),instructions:[
            'Работайте только в назначенной попытке и по её immutable revision. Отсутствие назначения не разрешает самостоятельный запуск.',
            'ACK разрешённого запуска/продолжения отправляется отдельно от решения человека. При stopRequested остановите затронутую работу и подтвердите фактическую остановку.',
            'Question/Fork/Blocker требуют человека. Пока ожидаете, читайте get_updates/get_context; отсутствие ответа и confidence не означают согласие.',
            'Уточнение человека — отдельный запрос дополнительных фактов. Отвечайте через submit_decision_clarification с настоящим clarificationEventId; это не закрывает исходный запрос решения и не разрешает продолжение.',
            'Свой pending-запрос можно отозвать с причиной через withdraw_decision. Отзыв не является решением человека, разрешением продолжить или доказательством устранения Blocker.',
            'Сохраняйте requestId при сетевом повторе. При VERSION_CONFLICT прочитайте контекст и осмысленно сформируйте новую команду; не подменяйте версию автоматически.',
            'Успех исполнения не является human-приёмкой DoD. Предъявляйте проверяемое evidence, не выдавайте симуляцию за реальную работу.',
            'Файлы папки доступны только для чтения в назначенном execution через list_workspace_files/read_workspace_file. Это текущее содержимое с hash, а не immutable файл ревизии; запись файлов и запуск команд не предоставляются.',
          ]});
        }
        if(name==='ouro.get_updates'){
          const updates=await store.getEvents(input.afterCursor as number);
          // Authorization uses current committed assignments. A new assignment can
          // appear between the snapshot read and cursor read, so refresh its scope.
          const scope=updates.cursor>state.version?await store.getProject():state;
          return result(name,{ok:true,events:updates.events.filter(e=>permittedEvent(e,scope)),cursor:updates.cursor});
        }
        const execution=assigned(state,String(input.executionId));
        if(name==='ouro.list_workspace_files'||name==='ouro.read_workspace_file'){
          const files=workspace??fail('NOT_AVAILABLE','У назначенного проекта нет доступной папки для чтения файлов.');
          const metadata=await files.getMetadata()??fail('NOT_AVAILABLE','У назначенного проекта нет доступной папки для чтения файлов.');
          const body=name==='ouro.list_workspace_files'?await files.listFiles(input.path as string|undefined,input.cursor as number|undefined):await files.readFile(input.path as string);
          return result(name,{ok:true,projectId,executionId:execution.id,bindingId:metadata.bindingId,...body});
        }
        const base={requestId:input.requestId as string,expectedVersion:input.expectedVersion as number,executionId:execution.id};
        const context={...base,specId:execution.specId,specRevisionId:execution.specRevisionId};
        let command:Command|undefined;
        switch(name){
          case 'ouro.report_flow_step':command={...base,type:'reportFlowStep',runId:input.runId as string,phase:input.phase as 'start'|'complete'|'fail',...(input.evidence!==undefined?{evidence:input.evidence as string}:{}),...(input.edgeId!==undefined?{edgeId:input.edgeId as string}:{})};break;
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
          case 'ouro.submit_proposal':command={...input,...context,type:'submitAgentProposal'} as Command;break;
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
        committedWrite=true;
        const savedExecution=assigned(committed.state,execution.id);
        // Immutable receipts from older releases lack fields added later. Only
        // the new tool needs proposal arrays; never rewrite old SQL receipts.
        let proposalResult:Record<string,unknown>={};
        if(name==='ouro.submit_proposal'){
          const proposals=(committed.state.agentProposals??[]).filter(proposal=>proposal.executionId===execution.id),ids=new Set(proposals.map(proposal=>proposal.id));
          proposalResult={proposals,proposalRevisions:(committed.state.agentProposalRevisions??[]).filter(revision=>ids.has(revision.proposalId))};
        }
        return result(name,{ok:true,execution:savedExecution,requests:requestsFor(committed.state,savedExecution),...proposalResult,events:committed.events.filter(e=>permittedEvent(e,committed.state)),cursor:committed.cursor,replayed:committed.replayed});
      }catch(error){
        if(committedWrite)return result(name,outputFailure,true);
        const e=error as {code?:string;message?:string;details?:Record<string,unknown>};
        const known=typeof e.code==='string'&&/^[A-Z_]+$/.test(e.code);
        const code=known?e.code!:'INTERNAL_ERROR';
        const message=known&&typeof e.message==='string'?e.message:'Результат не подтверждён. При повторе команды сохраните тот же requestId и тело; прочитайте контекст перед повтором.';
        return result(name,{ok:false,error:{code,message,...(known&&e.details?{details:e.details}:!known?{details:{outcomeUnknown:true}}:{}),retryable:false,refreshRequired:['VERSION_CONFLICT','REVISION_CONFLICT'].includes(code)}},true);
      }
    },
  };
}
