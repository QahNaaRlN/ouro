/** Настройки области source checker, не исполняющего прочитанные модули. */
export type SourceConventionsOptions = Readonly<{
  root: string;
  entryFiles?: readonly string[];
}>;

/** Одно нарушение исходного контракта с точным расположением. */
export type SourceConventionViolation = Readonly<{
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}>;

/** Фактическая область и результаты включенных source checks. */
export type SourceConventionsReport = Readonly<{
  files: readonly string[];
  filesChecked: number;
  violations: readonly SourceConventionViolation[];
}>;

/** Проверяет actual owned source scope и конечные naming/comment contracts по AST. */
export function inspectSourceConventions(
  options: SourceConventionsOptions,
): SourceConventionsReport;

/** Проверяет immutable текст тем же AST reader для доказательства происхождения старого нарушения. */
export function inspectSourceConventionText(
  file: string,
  text: string,
): readonly SourceConventionViolation[];
