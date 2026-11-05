import { QueryCache, MutationCache } from '@tanstack/react-query';
import type { AppError, ErrorReporterPort } from '../../../../client/src/ports';
import {
  reportClientErrorFailure,
  normalizeAppError,
} from '../../../../client/src/lifecycle/client-error-reporting';

/** Единственный основной путь отображения конкретной ошибки. */
export type ErrorUiPath = 'field' | 'inline' | 'boundary' | 'toast' | 'silent';
/** Явное владение UI и диагностикой; throwOnError остаётся самостоятельной Query option. */
export interface ClientErrorMeta extends Record<string, unknown> {
  errorUi?: ErrorUiPath;
  suppressToast?: boolean;
  errorReportOwner?: 'operation' | 'cache' | 'boundary';
  throwOnError?: never;
}
/** Внедрённые безопасные эффекты; production notification UI здесь отсутствует. */
export type QueryErrorPolicyOptions = {
  reporter?: ErrorReporterPort;
  notify?: (error: AppError) => void | Promise<void>;
  sourceId?: string;
};
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: ClientErrorMeta;
    mutationMeta: ClientErrorMeta;
  }
}

let nextPolicy = 0;
/** Создаёт cache callbacks, не меняя retry, сохранённую ошибку, результат команды или throwOnError. */
export function createQueryErrorPolicy(options: QueryErrorPolicyOptions = {}) {
  const owner = ++nextPolicy;
  let occurrence = 0;
  const handle = (
    value: unknown,
    operation: 'query' | 'mutation',
    meta: ClientErrorMeta | undefined,
    throwOnError: unknown,
  ) => {
    const error = normalizeAppError(value),
      boundary =
        meta?.errorUi === 'boundary' || throwOnError === true || typeof throwOnError === 'function';
    const reporterOwner =
      meta?.errorReportOwner ?? (meta?.errorUi === 'boundary' ? 'boundary' : 'cache');
    if (reporterOwner === 'cache')
      reportClientErrorFailure(value, {
        reporter: options.reporter,
        occurrence: () => ({
          occurrenceId: operation + ':' + owner + ':' + String(++occurrence),
          code: error.code,
          kind: error.kind,
          operation,
          sourceId: options.sourceId ?? 'ouro:browser',
        }),
      });
    if (
      meta?.errorUi === 'toast' &&
      !meta.suppressToast &&
      !boundary &&
      error.kind !== 'cancelled'
    ) {
      try {
        void Promise.resolve(options.notify?.(error)).catch(() => {});
      } catch {}
    }
  };
  return {
    queryCache: new QueryCache({
      onError: (error, query) =>
        handle(
          error,
          'query',
          query.meta,
          (query.options as { throwOnError?: unknown }).throwOnError,
        ),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        handle(
          error,
          'mutation',
          mutation.meta,
          (mutation.options as { throwOnError?: unknown }).throwOnError,
        ),
    }),
  };
}
