/** Ограничивает набор поддерживаемых инструментов конфигурацией, проверкой и MCP-мостом. */
export type AgentToolId = 'agent-config' | 'agent-check' | 'mcp-bridge';
/** Описывает привязку трёх агентских CLI к исходному commit, версиям и отпечаткам входов. */
export type AgentToolDescriptor = {
  schemaVersion: 1;
  sourceCommit: string;
  productVersion: string;
  protocolVersion: string;
  inputDigest: string;
  tools: { id: AgentToolId; path: string; sha256: string }[];
};
/** Задаёт фиксированные пути автономных инструментов внутри установленной оболочки. */
export const AGENT_TOOL_PATHS: Readonly<Record<AgentToolId, string>>;
/** Сопоставляет каждому инструменту имя его канонической экспортируемой точки входа. */
export const AGENT_TOOL_EXPORTS: Readonly<Record<AgentToolId, string>>;
/** Задаёт фиксированные пути инструментов в артефактах собранного поколения. */
export const AGENT_TOOL_GENERATION_PATHS: Readonly<Record<AgentToolId, string>>;
/** Безопасный отказ installed tool admission. */
export class ConsumerAgentToolError extends Error {
  readonly code: 'CONSUMER_AGENT_TOOL_UNAVAILABLE';
}
/** Проверяет все три fixed supplement hashes и source binding. */
export function readAgentToolSupplement(
  root: string,
): Promise<{ root: string; descriptor: AgentToolDescriptor }>;
/** Принимает только finite leading generation selector. */
export function selectAgentToolArguments(argv: string[]): { generation?: string; argv: string[] };
