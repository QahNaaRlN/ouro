/** Задаёт Git-источник, новый каталог вывода и npm CLI для независимой подготовки consumer. */
export type ConsumerBuildTreeOptions = {
  repository: string;
  ref: string;
  outputDirectory: string;
  npmCli: string;
  /** Явный producer-only root вне output; по умолчанию используется прежний parent output. */
  producerScratchRoot?: string;
};
/** Фиксирует каталог, версии и происхождение подготовленных consumer-исходников. */
export type ConsumerBuildTree = {
  directory: string;
  commit: string;
  productVersion: string;
  protocolVersion: string;
  manifest: Record<string, unknown>;
};
/** Передаёт безопасный код отказа подготовки, занятого каталога вывода или сборки протокола. */
export class ConsumerMaterializationError extends Error {
  readonly code:
    'CONSUMER_MATERIALIZATION_FAILED' | 'CONSUMER_OUTPUT_EXISTS' | 'CONSUMER_PROTOCOL_BUILD_FAILED';
  constructor(
    code?:
      | 'CONSUMER_MATERIALIZATION_FAILED'
      | 'CONSUMER_OUTPUT_EXISTS'
      | 'CONSUMER_PROTOCOL_BUILD_FAILED',
  );
}
/** Готовит consumer-дерево из одного commit и собирает его протокол в отдельном producer-каталоге. */
export function materializeConsumerBuildTree(
  options: ConsumerBuildTreeOptions,
): Promise<ConsumerBuildTree>;
