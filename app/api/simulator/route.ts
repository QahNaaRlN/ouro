import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authenticatedActor, assertHuman, readCommandBody, AccessError, isLocalDemo } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { executeCommand, getProject } from '@/lib/store';
import { PROJECT_ID, AGENT_ID, replay } from '@/packages/core/src';
import type { Command, Actor } from '@/packages/core/src/types';
export const runtime = 'nodejs';
const input = z.object({scenario:z.enum(['action','question','fork','blocker','complete','apply','clear','stop']),specId:z.string().uuid(),expectedVersion:z.number().int().nonnegative(),requestId:z.string().min(1).max(200)}).strict();
export async function POST(request: Request) {
  try {
    // The simulator is a local teaching tool; it is never an external agent credential.
    if (!isLocalDemo(request)) throw new AccessError('FORBIDDEN', 'Симулятор доступен только в локальном демо.');
    assertHuman(authenticatedActor(request, PROJECT_ID, AGENT_ID));
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
    const execution = state.executions.filter(x=>x.specId===specId && !['cancelled','skipped','failed','succeeded'].includes(x.state)).at(-1);
    if (!execution) throw new AccessError('INVALID_TRANSITION', 'Сначала человек должен разрешить запуск попытки для активной ревизии.', 422);
    const base = {requestId,expectedVersion,specId,specRevisionId:execution.specRevisionId,executionId:execution.id};
    let command: Command;
    switch(scenario) {
      case 'stop': command={...base,type:'confirmStopped'};break;
      case 'action': command={...base,type:'reportAction',actionId:stableId('action'),phase:'completed',title:'Симулятор прочитал контракт и проверил границы',context:'Демонстрационный факт. Внешний агент и реальные файлы не изменялись.',evidence:'simulation://ouro/contract-review — синтетический результат чтения'}; break;
      case 'question': command={...base,type:'reportQuestion',title:'Какой критерий считать обязательным?',question:'Подтвердите ожидаемое поведение при отсутствии входных данных.',context:'Симулятор обнаружил неоднозначность ожидания. Ответ может дать только человек.',blockingScope:'execution'}; break;
      case 'fork': {
        const a=stableId('option-a'),b=stableId('option-b');
        command={...base,type:'reportFork',title:'Выберите способ представления зависимостей',context:'Два допустимых пути для текущего ожидания. Это симуляция, реализация ещё не выполнялась.',reason:'Для продолжения нужно выбрать способ представления, потому что варианты по-разному влияют на читаемость и плотность интерфейса.',options:[{id:a,title:'Граф и таблица',description:'Граф для связей, доступная таблица для последовательной навигации.'},{id:b,title:'Только таблица',description:'Начать со списка зависимостей и добавить холст в следующей версии.'}],recommendationOptionId:a};break;
      }
      case 'blocker': command={...base,type:'reportBlocker',title:'Источник проверки недоступен',context:'Синтетический блокер: демонстрационный стенд не получил входной контракт.',reason:'Исполнение не может подтвердить критерий без проверяемого источника данных, поэтому зависимая работа должна ожидать решения человека.',expected:'Доступный версионированный источник проверки',actual:'Источник не отвечает в демонстрационном сценарии',impact:'Критерий нельзя проверить; основная попытка остаётся остановленной.',options:[{id:stableId('plan'),title:'Подготовить локальный проверяемый источник',description:'Разрешить отдельную ограниченную попытку устранения и предъявить evidence.'}]};break;
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
