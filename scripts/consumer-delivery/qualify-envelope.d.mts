export type ConsumerEnvelopeQualificationOptions={repository:string;ref:string;workDirectory:string;npmCli:string;browser?:boolean;installBrowser?:boolean};
export type ConsumerEnvelopeQualificationReport={scope:'CONSUMER_GENERATION_QUALIFICATION';overall:'PASS'|'FAILED'|'PARTIAL_HTML_INTEGRITY_FAILED';phases:Record<string,string>;[key:string]:unknown};
/** Возвращает только безопасный phase code. */
export class ConsumerEnvelopeQualificationError extends Error{readonly code:'CONSUMER_ENVELOPE_QUALIFICATION_FAILED';readonly phase:string;constructor(phase:string);}
/** Квалифицирует реальный independent envelope, не заменяя production release. */
export function qualifyConsumerEnvelope(options:ConsumerEnvelopeQualificationOptions):Promise<ConsumerEnvelopeQualificationReport>;
