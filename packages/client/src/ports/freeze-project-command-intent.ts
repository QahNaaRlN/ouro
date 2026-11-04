import type { FrozenProjectCommandIntent } from './project.types';
import { isWellFormedUnicode } from '@ouro/protocol';

/** Ошибка, которая отклоняет несогласованную исходную идентичность команды. */
export class InvalidProjectCommandIntentError extends Error {
  readonly code = 'CLIENT_INTENT_INVALID';
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown, minimum = 1): value is string => typeof value === 'string' && value.length >= minimum && value.length <= 200 && isWellFormedUnicode(value) && !/[\u0000-\u001f\u007f]/.test(value);
const version = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const invalid = (): never => { throw new InvalidProjectCommandIntentError('Исходное намерение не соответствует проекту, автору, requestId или версии.'); };

/**
 * Утилита, которая сохраняет исходные байты команды до её первой отправки.
 * @param input - Исходная операция, контекст и сериализованное тело.
 * @returns Неизменяемое намерение без повторной сериализации тела.
 * @throws {InvalidProjectCommandIntentError} При несогласованных идентификаторах или версии.
 * @example
 * freezeProjectCommandIntent(input)
 */
export function freezeProjectCommandIntent(input: FrozenProjectCommandIntent): FrozenProjectCommandIntent {
  if (!record(input) || !record(input.scope) || Object.keys(input).some(key => !['operation', 'scope', 'requestId', 'expectedVersion', 'body'].includes(key)) || Object.keys(input.scope).some(key => !['projectId', 'actorId', 'accessEpoch', 'hostEpoch'].includes(key))) invalid();
  if (!identifier(input.scope.projectId) || !identifier(input.scope.actorId) || !version(input.scope.accessEpoch) || (input.scope.hostEpoch !== undefined && !version(input.scope.hostEpoch)) || !identifier(input.requestId, 8) || !version(input.expectedVersion)) invalid();
  if (typeof input.body !== 'string' || !isWellFormedUnicode(input.body)) invalid();
  let body: unknown;
  try { body = JSON.parse(input.body); } catch { invalid(); }
  if (!record(body)) return invalid();
  if (body.requestId !== input.requestId || body.expectedVersion !== input.expectedVersion) return invalid();
  if (input.operation === 'execute-command') {
    if (!identifier(body.type)) invalid();
  } else if (input.operation === 'start-project-work') {
    if ('type' in body || !identifier(body.agentId) || !record(body.content)) invalid();
  } else invalid();
  const scope = Object.freeze({ projectId: input.scope.projectId, actorId: input.scope.actorId, accessEpoch: input.scope.accessEpoch, ...(input.scope.hostEpoch === undefined ? {} : { hostEpoch: input.scope.hostEpoch }) });
  return Object.freeze({ operation: input.operation, scope, requestId: input.requestId, expectedVersion: input.expectedVersion, body: input.body });
}
