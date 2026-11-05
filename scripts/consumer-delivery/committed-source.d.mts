/** Сохраняет содержимое и проверяемое происхождение файла выбранного Git commit. */
export type CommittedSourceFile = {
  path: string;
  blob: string;
  mode: '100644' | '100755';
  sha256: string;
  bytes: Buffer;
};
/** Группирует исходники и контракты одного commit по назначению для сборки, оболочки и квалификации. */
export type CommittedConsumerSource = {
  commit: string;
  productVersion: string;
  protocolVersion: string;
  consumerFiles: CommittedSourceFile[];
  protocolFiles: CommittedSourceFile[];
  protocolProducerFiles: CommittedSourceFile[];
  deliveryFiles: CommittedSourceFile[];
  qualificationFiles: CommittedSourceFile[];
  envelopeFiles: CommittedSourceFile[];
  agentToolFiles: CommittedSourceFile[];
};
/** Передаёт безопасный код отказа чтения или допуска зафиксированного Git-дерева. */
export class ConsumerSourceError extends Error {
  readonly code: 'CONSUMER_SOURCE_INVALID' | 'CONSUMER_SOURCE_UNSAFE_TREE';
  constructor(code: 'CONSUMER_SOURCE_INVALID' | 'CONSUMER_SOURCE_UNSAFE_TREE');
}
/** Разрешает ref до одного commit, проверяет дерево и читает только его blob-содержимое. */
export function readCommittedConsumerSource(options: {
  repository: string;
  ref: string;
}): CommittedConsumerSource;
