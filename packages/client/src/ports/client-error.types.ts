/** Тип, описывающий безопасную классификацию клиентской ошибки. */
export type ClientErrorKind='access'|'contract'|'network'|'cancelled'|'rejected'|'unexpected';
/** Детерминированная серьёзность безопасной классификации. */
export type ClientErrorSeverity='info'|'warning'|'error';
/** Серьёзность определяется категорией, без чтения текста исключения. */
export const getClientErrorSeverity=(kind:ClientErrorKind):ClientErrorSeverity=>kind==='cancelled'?'info':kind==='access'||kind==='rejected'?'warning':'error';
/** Ошибка, которая отделяет безопасное сообщение от внешнего ответа и диагностики. */
export class ClientError extends Error{
 constructor(readonly code:string,message:string,readonly kind:ClientErrorKind,readonly status?:number){super(message);this.name='ClientError';}
 get severity():ClientErrorSeverity{return getClientErrorSeverity(this.kind);}
}
/** Общее имя того же клиентского контракта, без второго runtime класса. */
export type AppError=ClientError;
type DiagnosticBase=Readonly<{occurrenceId:string;code:string;kind:ClientErrorKind;sourceId:string;severity?:ClientErrorSeverity;correlationId?:string;requestId?:string}>;
/** Тип, описывающий очищенное событие диагностики без тела запроса и credential. */
export type ClientErrorOccurrence=DiagnosticBase&(Readonly<{operation:'read-project'|'project-command'|'project-stream'|'read-identity-session'|'list-workspace-projects'|'list-account-projects';accessEpoch:number;hostEpoch?:number}>|Readonly<{operation:'render-ui'|'async-operation'|'query'|'mutation';accessEpoch?:never;hostEpoch?:never}>);
/** Порт, который принимает очищенную диагностику независимо от пользовательской операции. */
export interface ErrorReporterPort{report(occurrence:ClientErrorOccurrence):void|Promise<void>}
