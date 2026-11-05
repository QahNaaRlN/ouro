import type {Readable} from 'node:stream';
import type {ChildProcess} from 'node:child_process';
export type ConsumerArguments={mode:'launch'|'build'|'start';help:boolean;port?:number;controlStdin:boolean};
/** Безопасный отказ consumer lifecycle с конечной фазой. */
export class ConsumerLaunchError extends Error{readonly code:'CONSUMER_LAUNCH_FAILED';readonly phase:string;readonly cleanupIncomplete?:boolean;constructor(phase:string);}
/** Проверяет конечные public npm command arguments. */
export function parseConsumerArguments(argv:string[]):ConsumerArguments;
/** Подключает явный bounded non-TTY owned control pipe. */
export function attachStdinControl(stream:Readable,shutdown:()=>void):()=>void;
/** Ограничивает failure fallback текущим ещё живым собственным child/tree. */
export function forceOwnedChild(child:ChildProcess):void;
/** Выполняет isolated preparation и owned service lifecycle. */
export function runConsumer(options:{root:string;argv:string[];environment?:Record<string,string|undefined>}):Promise<number>;
