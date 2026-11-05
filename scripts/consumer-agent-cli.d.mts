import type {AgentToolId} from './consumer-delivery/agent-tool-contract.mjs';
/** Вызывает fixed tool с explicit generation либо immutable manual supplement. */
export function runConsumerAgentTool(options:{root:string;tool:AgentToolId;argv?:string[]}):Promise<number>;
