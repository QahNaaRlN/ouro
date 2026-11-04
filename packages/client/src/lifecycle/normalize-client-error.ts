import {ClientError,type ClientErrorOccurrence,type ErrorReporterPort} from '../ports/client-error.types';

/** Утилита, которая чисто классифицирует внешнюю ошибку без вывода или сетевого вызова. */
export function normalizeClientError(value:unknown):ClientError{
 if(value instanceof ClientError)return /^[A-Z][A-Z0-9_]{0,99}$/.test(value.code)?value:new ClientError('CLIENT_ERROR','Ответ операции не подтверждён.',value.kind,value.status);
 if(value instanceof Error&&value.name==='AbortError')return new ClientError('CANCELLED','Ожидание отменено.','cancelled');
 return new ClientError('NETWORK_ERROR','Не удалось получить подтверждённый ответ.','network');
}
/** Утилита, которая изолирует синхронный и асинхронный отказ диагностического sink. */
export function reportClientError(reporter:ErrorReporterPort|undefined,occurrence:ClientErrorOccurrence):void{
 try{void Promise.resolve(reporter?.report(occurrence)).catch(()=>{});}catch{}
}
