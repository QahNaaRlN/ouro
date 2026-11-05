/** Ошибка, которая отличает недопустимое JSON-значение команды от ошибки сериализации. */
export class CommandJSONValueError extends TypeError {}

/** Канонизирует прежние JSON-значения команды для одинакового server/client business hash. */
export function canonicalCommandJSON(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalCommandJSON).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ':' +
            canonicalCommandJSON((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    );
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol')
    throw new CommandJSONValueError('Команда должна содержать только JSON-значения.');
  return JSON.stringify(value);
}
