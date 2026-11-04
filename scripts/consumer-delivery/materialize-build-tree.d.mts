export type ConsumerBuildTreeOptions={repository:string;ref:string;outputDirectory:string;npmCli:string};
export type ConsumerBuildTree={directory:string;commit:string;productVersion:string;protocolVersion:string;manifest:Record<string,unknown>};
export class ConsumerMaterializationError extends Error {readonly code:'CONSUMER_MATERIALIZATION_FAILED'|'CONSUMER_OUTPUT_EXISTS'|'CONSUMER_PROTOCOL_BUILD_FAILED';constructor(code?:'CONSUMER_MATERIALIZATION_FAILED'|'CONSUMER_OUTPUT_EXISTS'|'CONSUMER_PROTOCOL_BUILD_FAILED');}
export function materializeConsumerBuildTree(options:ConsumerBuildTreeOptions):Promise<ConsumerBuildTree>;
