/** Задаёт исходный ref, собственный рабочий каталог и режим независимой квалификации с явным npm CLI. */
export type ConsumerQualificationOptions = {
  repository: string;
  ref: string;
  workDirectory: string;
  npmCli: string;
  browser?: boolean;
  installBrowser?: boolean;
};
/** Фиксирует результаты фаз и HTML integrity, сохраняя отдельный статус выпуска NOT_QUALIFIED. */
export type ConsumerQualificationReport = {
  scope: 'SOURCE_BUILD_QUALIFICATION';
  overall: 'PASS' | 'FAILED' | 'PARTIAL_HTML_INTEGRITY_FAILED';
  endUserRelease: 'NOT_QUALIFIED';
  phases: Record<string, string>;
  htmlIntegrity?: { status: 'PASS' | 'FAIL'; expectedBytes: number; receivedBytes: number };
  [key: string]: unknown;
};
/** Сообщает безопасную фазу отказа независимой квалификации consumer-исходников. */
export class ConsumerQualificationError extends Error {
  readonly code: 'CONSUMER_QUALIFICATION_FAILED';
  readonly phase: string;
  constructor(phase: string);
}
/** Проверяет независимые установку, сборку, протокол и runtime одного commit с отчётом по фазам. */
export function qualifyConsumerSource(
  options: ConsumerQualificationOptions,
): Promise<ConsumerQualificationReport>;
