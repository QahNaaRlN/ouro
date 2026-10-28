import type { Command } from '../../core/src/types';
export const INBOX_TOOLS = ['ouro.report_action','ouro.report_question','ouro.report_fork','ouro.report_blocker'] as const;
const types = { 'ouro.report_action':'reportAction','ouro.report_question':'reportQuestion','ouro.report_fork':'reportFork','ouro.report_blocker':'reportBlocker' } as const;
/** Transport-neutral adapter. This is not an MCP transport/session implementation. */
export function toDomainCommand(tool: string, input: Record<string, unknown>): Command {
  if (!(INBOX_TOOLS as readonly string[]).includes(tool)) throw Object.assign(new Error('Неизвестный инструмент inbox.'), {code:'VALIDATION_ERROR'});
  return {...input,type:types[tool as keyof typeof types]} as Command;
}
