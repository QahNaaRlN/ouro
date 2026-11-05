/** Задаёт bootstrap-фазу загрузки окружения перед импортом приложения. */
export type RuntimeEnvironmentPhase = 'production' | 'development';
/** Фиксирует безопасный код сбоя и имя env-файла без содержимого конфигурации. */
export type RuntimeEnvironmentDiagnostic = {
  code: 'ENVIRONMENT_FILE_READ_FAILED' | 'ENVIRONMENT_FILE_EXPANSION_FAILED';
  file: string;
};
/** Описывает эффективный режим, прочитанные env-файлы и накопленные диагностические коды. */
export type RuntimeEnvironmentResult = {
  mode: 'production' | 'development' | 'test';
  loadedFiles: string[];
  diagnostics: RuntimeEnvironmentDiagnostic[];
};
/** Сообщает безопасный отказ bootstrap-опций или доступности парсеров окружения. */
export class RuntimeEnvironmentError extends Error {
  readonly code: 'RUNTIME_ENVIRONMENT_INVALID' | 'RUNTIME_ENVIRONMENT_PARSER_UNAVAILABLE';
  constructor(code: 'RUNTIME_ENVIRONMENT_INVALID' | 'RUNTIME_ENVIRONMENT_PARSER_UNAVAILABLE');
}
/** Загружает окружение явного root с принятой очередностью env-файлов и унаследованных значений. */
export function loadRuntimeEnvironment(options: {
  root: string;
  phase: RuntimeEnvironmentPhase;
}): Promise<RuntimeEnvironmentResult>;
