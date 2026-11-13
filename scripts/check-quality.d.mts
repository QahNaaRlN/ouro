/** Точное нарушение одного из двух владельцев semantic quality rules. */
export type QualityFinding = Readonly<{
  tool: 'source' | 'eslint';
  code: string;
  line: number;
  column: number;
  message: string;
}>;
/** Полный текущий либо исходный source и его actual tool results. */
export type QualityFileReport = Readonly<{
  file: string;
  text: string;
  findings: readonly QualityFinding[];
  formatted: boolean;
  blob?: string;
}>;
/** Вычисляет канонический LF fingerprint исходника, не изменяя checkout. */
export function qualitySourceHash(text: string): string;
/** Сверяет конечный reviewed ledger с текущими и доказанными исходными diagnostics. */
export function auditQualityLedger(
  reports: readonly QualityFileReport[],
  ledger: unknown,
  legacyReports: readonly QualityFileReport[],
): readonly string[];
/** Снимает actual AST, ESLint и formatter результаты без исполнения проверяемых модулей. */
export function collectQualityReports(
  root: string,
  sources?: readonly Readonly<{ file: string; text: string; blob?: string }>[],
): Promise<readonly QualityFileReport[]>;
/** Читает только фиксированные исходные Git blobs; quality gate не подключается к launch/build. */
export function collectLegacyQualityReports(
  root: string,
  ledger: unknown,
): Promise<readonly QualityFileReport[]>;
