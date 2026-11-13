/** Перечисляет текущие шаблоны поставки, которые собственная fixture копирует из рабочего дерева. */
export const ownedDeliveryFiles: string[];
/** Перечисляет owner-файлы, которые fixture берёт из рабочего дерева поверх канонических Git blobs. */
export const ownedEnvelopeFiles: string[];
/** Создаёт собственную Git-fixture из canonical blobs и текущих owner-файлов с ограниченной temp-очисткой. */
export function createCommittedProjectFixture(origin: string): Promise<{
  directory: string;
  repository: string;
  commit: string;
  originCommit: string;
  close: () => Promise<void>;
}>;
