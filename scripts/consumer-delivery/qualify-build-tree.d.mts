export type ConsumerQualificationOptions={repository:string;ref:string;workDirectory:string;npmCli:string;browser?:boolean;installBrowser?:boolean};
export type ConsumerQualificationReport={scope:'SOURCE_BUILD_QUALIFICATION';overall:'PASS'|'FAILED'|'PARTIAL_HTML_INTEGRITY_FAILED';endUserRelease:'NOT_QUALIFIED';phases:Record<string,string>;htmlIntegrity?:{status:'PASS'|'FAIL';expectedBytes:number;receivedBytes:number};[key:string]:unknown};
export class ConsumerQualificationError extends Error {readonly code:'CONSUMER_QUALIFICATION_FAILED';readonly phase:string;constructor(phase:string);}
export function qualifyConsumerSource(options:ConsumerQualificationOptions):Promise<ConsumerQualificationReport>;
