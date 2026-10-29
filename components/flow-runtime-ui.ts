import type {Execution,FlowStepRun,FlowRuntimeView} from '@/packages/core/src';

export const runStateNames:Record<FlowStepRun['state'],string>={ready:'Готов к началу',running:'Выполняется',waiting:'Ожидает',succeeded:'Завершён',failed:'Ошибка',skipped:'Пропущен',cancelled:'Отменён'};
export const runtimeStateNames:Record<NonNullable<Execution['flowRuntime']>['state'],string>={active:'Учёт активен',completed:'Процесс завершён',failed:'Процесс остановлен с ошибкой',cancelled:'Процесс отменён'};
export const edgeStateNames:Record<FlowRuntimeView['edges'][number]['state'],string>={possible:'Возможный путь',available:'Доступен',blocked:'Недоступен',taken:'Переход зафиксирован',not_selected:'Не выбран в этом проходе'};
export type FlowCommandOutcome={ok:boolean;status?:number;code?:string};
export type FlowRuntimeCommand=(payload:Record<string,unknown>,expectedVersion:number)=>Promise<FlowCommandOutcome>;
export type RuntimeAction='start'|'complete'|'fail'|'retry'|'skip';
export type RuntimeIntent={actorId:string;projectId:string;executionId:string;runId:string;action:RuntimeAction;source:'human'|'simulation';body:Record<string,unknown>;expectedVersion:number;reason:string;evidence:string;edgeId:string};
export type RuntimeIntentRegistry=Map<string,RuntimeIntent>;
export const runtimeIntentKey=(projectId:string,actorId:string,executionId:string,runId:string)=>`${projectId}:${actorId}:${executionId}:${runId}`;
export const runtimeEventNames:Record<string,string>={FlowStepStarted:'Проход шага начат',FlowStepCompleted:'Проход шага завершён',FlowStepFailed:'Ошибка прохода шага',FlowStepSkipped:'Проход шага пропущен человеком',FlowStepRetried:'Разрешён повтор шага',FlowEdgeTraversed:'Переход процесса зафиксирован'};
