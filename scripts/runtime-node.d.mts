/** Задаёт допустимый Node runtime приложения; точная квалифицированная версия хранится в .nvmrc. */
export const applicationNodeEngine: '>=24.19.0 <25';
/** Сообщает отказ неподдерживаемого Node до установки зависимостей и открытия профиля. */
export class NodeRuntimeUnsupportedError extends Error {
  readonly code: 'NODE_RUNTIME_UNSUPPORTED';
  constructor();
}
/** Проверяет каноническую стабильную версию Node приложения по минимальной версии и допустимому major. */
export function validateNodeVersion(version: unknown): void;
