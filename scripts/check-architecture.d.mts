/** Тип, описывающий точное историческое отклонение одного импорта. */
export interface ArchitectureBaselineEntry {
  source: string;
  specifier: string;
  kind: string;
  code: string;
  owner: string;
  reason: string;
}
/** Тип, описывающий нарушение границы с проверяемым местом источника. */
export interface ArchitectureViolation {
  source: string;
  specifier: string;
  kind: string;
  code: string;
  line: number;
  message: string;
}
/** Утилита, которая собирает нарушения переносимых границ зависимостей. */
export function inspectArchitecture(options: {
  root: string;
  entryFiles?: readonly string[];
  baseline?: readonly ArchitectureBaselineEntry[];
}): {
  violations: ArchitectureViolation[];
  baselineMatches: ArchitectureBaselineEntry[];
  filesChecked: number;
};
