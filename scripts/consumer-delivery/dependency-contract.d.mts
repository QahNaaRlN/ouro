/** Задаёт замороженные шаблоны графа, их происхождение и метаданные выпуска с артефактом протокола. */
export type ConsumerDependencyOptions = {
  blueprint: string;
  template: string;
  provenance: string;
  productVersion: string;
  protocol: { manifest: string; filename: string; bytes: Buffer };
};
/** Содержит согласованные manifest и npm lock автономного consumer после заполнения разрешённых метаданных. */
export type ConsumerDependencyResult = {
  manifest: {
    name: string;
    version: string;
    private: true;
    type: 'module';
    engines: { node: string };
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  lockfile: Record<string, unknown>;
};
/** Сообщает безопасный отказ проверки зафиксированного контракта зависимостей consumer. */
export class ConsumerDependencyError extends Error {
  readonly code: 'CONSUMER_DEPENDENCY_INVALID';
  constructor();
}
/** Проверяет замороженный граф consumer и заполняет только разрешённые метаданные выпуска и протокола. */
export function materializeConsumerDependencies(
  options: ConsumerDependencyOptions,
): ConsumerDependencyResult;
