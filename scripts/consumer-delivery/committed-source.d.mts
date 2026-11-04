export type CommittedSourceFile={path:string;blob:string;mode:'100644'|'100755';sha256:string;bytes:Buffer};
export type CommittedConsumerSource={commit:string;productVersion:string;protocolVersion:string;consumerFiles:CommittedSourceFile[];protocolFiles:CommittedSourceFile[];deliveryFiles:CommittedSourceFile[];qualificationFiles:CommittedSourceFile[]};
export class ConsumerSourceError extends Error {readonly code:'CONSUMER_SOURCE_INVALID'|'CONSUMER_SOURCE_UNSAFE_TREE';constructor(code:'CONSUMER_SOURCE_INVALID'|'CONSUMER_SOURCE_UNSAFE_TREE');}
export function readCommittedConsumerSource(options:{repository:string;ref:string}):CommittedConsumerSource;
