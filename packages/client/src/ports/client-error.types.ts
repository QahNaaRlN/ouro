/** Тип, описывающий безопасную классификацию клиентской ошибки. */
export type ClientErrorKind='access'|'contract'|'network'|'cancelled'|'rejected';
/** Ошибка, которая отделяет безопасное сообщение от внешнего ответа и диагностики. */
export class ClientError extends Error{
 constructor(readonly code:string,message:string,readonly kind:ClientErrorKind,readonly status?:number){super(message);this.name='ClientError';}
}
/** Тип, описывающий очищенное событие диагностики без тела запроса и credential. */
export type ClientErrorOccurrence=Readonly<{occurrenceId:string;code:string;kind:ClientErrorKind;operation:'read-project'|'project-command'|'project-stream'|'read-identity-session'|'list-workspace-projects'|'list-account-projects';sourceId:string;accessEpoch:number;hostEpoch?:number}>;
/** Порт, который принимает очищенную диагностику независимо от пользовательской операции. */
export interface ErrorReporterPort{report(occurrence:ClientErrorOccurrence):void|Promise<void>}
