import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authenticatedParticipant, assertHuman, readCommandBody, AccessError, isLocalDemo } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { executeCommand, getProject } from '@/lib/store';
import { PROJECT_ID, AGENT_ID, replay } from '@/packages/core/src';
import type { Command, Actor } from '@/packages/core/src/types';
export const runtime = 'nodejs';
const input = z.object({
  scenario:z.enum(['action','question','fork','blocker','complete','apply','clear','stop','flow_start','flow_complete','flow_fail']),
  specId:z.string().uuid(),expectedVersion:z.number().int().nonnegative(),requestId:z.string().min(1).max(200),
  executionId:z.string().min(1).max(200).optional(),runId:z.string().min(1).max(200).optional(),edgeId:z.string().min(1).max(200).optional(),
}).strict().superRefine((value,context)=>{
  if(value.scenario.startsWith('flow_')&&(!value.executionId||!value.runId))context.addIssue({code:'custom',message:'Для прохода нужны точные executionId и runId.'});
  if(value.edgeId&&value.scenario!=='flow_complete')context.addIssue({code:'custom',message:'Ребро выбирается только при завершении прохода.'});
});
export async function POST(request: Request) {
  try {
    // The simulator is a local teaching tool; it is never an external agent credential.
    if (!isLocalDemo(request)) throw new AccessError('FORBIDDEN', 'Симулятор доступен только в локальном демо.');
    const operator=await authenticatedParticipant(request, PROJECT_ID, AGENT_ID);assertHuman(operator);
    if(!['local-human','human-token'].includes(operator.id))throw new AccessError('FORBIDDEN','Учебным симулятором управляет доверенный локальный оператор.');
    const parsed = input.safeParse(await readCommandBody(request));
    if (!parsed.success) throw new AccessError('VALIDATION_ERROR', 'Нужны scenario, specId, expectedVersion, requestId.', 422);
    const {scenario,specId,expectedVersion,requestId} = parsed.data;
    const current = await getProject();
    // Reconstruct the originally observed version so retries produce the same command.
    const state = expectedVersion < current.version ? replay(current.events.filter(e=>e.version<=expectedVersion), PROJECT_ID) : current;
    const stableId = (label: string) => {
      const hash=createHash('sha256').update(`${requestId}:${label}`).digest('hex');
      return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
    };
    const flowScenario=scenario.startsWith('flow_');
    const execution = flowScenario
      ? state.executions.find(x=>x.id===parsed.data.executionId&&x.specId===specId)
      : state.executions.filter(x=>x.specId===specId && !['cancelled','skipped','failed','succeeded'].includes(x.state)).at(-1);
    if (!execution) throw new AccessError('INVALID_TRANSITION', 'Сначала человек должен разрешить запуск попытки для активной ревизии.', 422);
    if(execution.agentId!==AGENT_ID)throw new AccessError('FORBIDDEN','Учебный симулятор не подтверждает работу другого агента.');
    const run=execution.flowRuntime?.runs.find(run=>run.id===execution.flowRuntime?.currentRunId);
    const definition=state.revisions.find(revision=>revision.id===execution.specRevisionId)?.flow;
    const base = {requestId,expectedVersion,specId,specRevisionId:execution.specRevisionId,executionId:execution.id};
    const reportBase={...base,...(run?{flowStepRunId:run.id}:{})};
    const requestBase=(kind:string)=>({...reportBase,...(run&&definition?.nodes.find(node=>node.id===run.nodeId)?.kind===kind?{flowNodeId:run.nodeId}:{})});
    let command: Command;
    switch(scenario) {
      case 'flow_start':case 'flow_complete':case 'flow_fail':{
        const phase=scenario==='flow_start'?'start':scenario==='flow_complete'?'complete':'fail';
        command={...base,type:'reportFlowStep',runId:parsed.data.runId!,phase,
          ...(phase==='start'?{}:{evidence:`simulation://ouro/flow/${parsed.data.runId}/${phase} — синтетическое подтверждение учебного прохода, не работа внешнего агента`}),
          ...(parsed.data.edgeId?{edgeId:parsed.data.edgeId}:{})};break;
      }
      case 'stop': command={...base,type:'confirmStopped'};break;
      case 'action': command={...reportBase,...(run?{flowNodeId:run.nodeId}:{}),type:'reportAction',actionId:stableId('action'),phase:'completed',title:'Симулятор прочитал контракт и проверил границы',context:'Демонстрационный факт. Внешний агент и реальные файлы не изменялись.',evidence:'simulation://ouro/contract-review — синтетический результат чтения'}; break;
      case 'question': command={...requestBase('question'),type:'reportQuestion',title:'Какой критерий считать обязательным?',question:'Подтвердите ожидаемое поведение при отсутствии входных данных.',context:'Симулятор обнаружил неоднозначность ожидания. Ответ может дать только человек.',blockingScope:'execution'}; break;
      case 'fork': {
        const outcomes=run&&definition?.nodes.find(node=>node.id===run.nodeId)?.kind==='fork'?definition.edges.filter(edge=>edge.source===run.nodeId):undefined;
        const options=outcomes?.length?outcomes.map(edge=>({id:edge.optionId!,title:edge.label,description:'Учебный вариант из назначенной схемы; решение принимает человек.'})):[{id:stableId('option-a'),title:'Граф и таблица',description:'Граф для связей, доступная таблица для последовательной навигации.'},{id:stableId('option-b'),title:'Только таблица',description:'Начать со списка зависимостей и добавить холст в следующей версии.'}];
        command={...requestBase('fork'),type:'reportFork',title:'Выберите способ представления зависимостей',context:'Два допустимых пути для текущего ожидания. Это симуляция, реализация ещё не выполнялась.',reason:'Для продолжения нужно выбрать способ представления, потому что варианты по-разному влияют на читаемость и плотность интерфейса.',options,recommendationOptionId:options[0].id};break;
      }
      case 'blocker': command={...requestBase('blocker'),type:'reportBlocker',title:'Источник проверки недоступен',context:'Синтетический блокер: демонстрационный стенд не получил входной контракт.',reason:'Исполнение не может подтвердить критерий без проверяемого источника данных, поэтому зависимая работа должна ожидать решения человека.',expected:'Доступный версионированный источник проверки',actual:'Источник не отвечает в демонстрационном сценарии',impact:'Критерий нельзя проверить; основная попытка остаётся остановленной.',options:[{id:stableId('plan'),title:'Подготовить локальный проверяемый источник',description:'Разрешить отдельную ограниченную попытку устранения и предъявить evidence.'}]};break;
      case 'complete': command={...base,type:'completeExecution',result:'succeeded',evidence:'simulation://ouro/execution-check — синтетическая проверка попытки; не человеческая приёмка DoD'};break;
      case 'apply': {
        if (execution.resumeAuthorized) command={...base,type:'confirmResumed'};
        else {
          const decision=state.requests.find(x=>x.executionId===execution.id && x.state==='resolved' && x.decision && !x.decision.appliedAt && x.decision.outcome.kind!=='reject');
          if (!decision) throw new AccessError('INVALID_TRANSITION', 'Нет принятого решения, ожидающего подтверждения применения.', 422);
          command={...base,type:'confirmDecisionApplied',decisionRequestId:decision.id,evidence:'simulation://ouro/decision-applied — симулятор подтвердил получение решения'};
        }break;
      }
      case 'clear': {
        const blocker=state.requests.find(x=>x.specId===specId && x.kind==='Blocker' && x.state==='resolved' && !x.clearedEvidence && x.decision?.outcome.kind==='approve');
        const remediation=state.executions.findLast(x=>x.remediatesBlockerId===blocker?.id);
        if (!blocker || !remediation) throw new AccessError('INVALID_TRANSITION', 'Человек должен выбрать план и разрешить отдельную попытку устранения.', 422);
        command={...base,type:'clearBlocker',decisionRequestId:blocker.id,remediationExecutionId:remediation.id,evidence:'simulation://ouro/blocker-cleared — синтетическое evidence устранения'};break;
      }
    }
    const agent: Actor = {id:AGENT_ID,kind:'agent',name:'Симулятор · не внешний агент',projectIds:[PROJECT_ID]};
    return Response.json(await executeCommand(command,agent), {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return apiError(e); }
}
