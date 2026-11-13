import type { CatalogReadPort, ErrorReporterPort } from '../../../../client/src/ports';

/** Зависимости ограниченного reader без HTTP default и без полномочий остальных services. */
export type CatalogReadEnvironment = Readonly<{
  sourceId: string;
  hostEpoch?: number;
  reads: CatalogReadPort;
  reporter?: ErrorReporterPort;
}>;
