/** Настройки области source checker, не исполняющего прочитанные модули. */
export type SourceConventionsOptions = Readonly<{
  root: string;
  entryFiles?: readonly string[];
}>;

/** Одно нарушение исходного контракта с точным расположением. */
export type SourceConventionViolation = Readonly<{
  file: string;
  line: number;
  code: string;
  message: string;
}>;

/** Фактическая область и результаты включенных source checks. */
export type SourceConventionsReport = Readonly<{
  files: readonly string[];
  filesChecked: number;
  violations: readonly SourceConventionViolation[];
}>;

/** Собирает actual source scope/AST; naming/comment rules bootstrap пока не включены. */
export function inspectSourceConventions(options: SourceConventionsOptions): SourceConventionsReport;
