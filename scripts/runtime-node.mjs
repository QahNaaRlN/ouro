/** Единый диапазон application runtime; точная квалифицированная версия остаётся в .nvmrc. */
export const applicationNodeEngine = '>=24.19.0 <25';

/** Ошибка application runtime до установки зависимостей и открытия профиля. */
export class NodeRuntimeUnsupportedError extends Error {
  constructor() {
    super('Use stable Node.js 24 LTS, version 24.19.0 or newer within major 24.');
    this.name = 'NodeRuntimeUnsupportedError';
    this.code = 'NODE_RUNTIME_UNSUPPORTED';
  }
}

/**
 * Проверяет каноническую stable-версию Node для приложения; portable protocol имеет свой контракт.
 * @param version - Непроверенная строка process.versions.node.
 * @throws {NodeRuntimeUnsupportedError} Если версия не относится к stable24 с минимумом24.19.0.
 */
export function validateNodeVersion(version) {
  const match =
    typeof version === 'string' && version.length <= 64
      ? /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version)
      : null;
  const parts = match ? match.slice(1).map(Number) : [];
  if (parts.length !== 3 || !parts.every(Number.isSafeInteger) || parts[0] !== 24 || parts[1] < 19)
    throw new NodeRuntimeUnsupportedError();
}
