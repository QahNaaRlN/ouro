export type AgentToolId='agent-config'|'agent-check'|'mcp-bridge';
export type AgentToolDescriptor={schemaVersion:1;sourceCommit:string;productVersion:string;protocolVersion:string;inputDigest:string;tools:{id:AgentToolId;path:string;sha256:string}[]};
export const AGENT_TOOL_PATHS:Readonly<Record<AgentToolId,string>>;
export const AGENT_TOOL_EXPORTS:Readonly<Record<AgentToolId,string>>;
export const AGENT_TOOL_GENERATION_PATHS:Readonly<Record<AgentToolId,string>>;
/** Безопасный отказ installed tool admission. */
export class ConsumerAgentToolError extends Error{readonly code:'CONSUMER_AGENT_TOOL_UNAVAILABLE';}
/** Проверяет все три fixed supplement hashes и source binding. */
export function readAgentToolSupplement(root:string):Promise<{root:string;descriptor:AgentToolDescriptor}>;
/** Принимает только finite leading generation selector. */
export function selectAgentToolArguments(argv:string[]):{generation?:string;argv:string[]};
