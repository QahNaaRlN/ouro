import {
  ClientError,
  getClientErrorSeverity,
  type AppError,
  type ClientErrorKind,
  type ClientErrorOccurrence,
  type ErrorReporterPort,
} from '../ports/client-error.types';

const kinds: readonly ClientErrorKind[] = [
  'access',
  'contract',
  'network',
  'cancelled',
  'rejected',
  'unexpected',
];
const codePattern = /^[A-Z][A-Z0-9_]{0,99}$/;
const identifier = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/;
const messages: Record<ClientErrorKind, string> = {
  access: 'Нет доступа к операции.',
  contract: 'Ответ не соответствует контракту.',
  network: 'Не удалось получить подтверждённый ответ.',
  cancelled: 'Ожидание отменено.',
  rejected: 'Операция отклонена.',
  unexpected: 'Не удалось показать или выполнить этот раздел.',
};
const scopedOperations = new Set([
  'read-project',
  'project-command',
  'project-stream',
  'read-identity-session',
  'list-workspace-projects',
  'list-account-projects',
]);
const uiOperations = new Set(['render-ui', 'async-operation', 'query', 'mutation']);
const seen = new WeakMap<ErrorReporterPort, Set<string>>();
const issued = new WeakMap<object, ClientErrorOccurrence>();
const observed = new WeakMap<object, ClientErrorOccurrence | null>();
const data = (value: object, key: string): unknown =>
  Object.getOwnPropertyDescriptor(value, key)?.value;
const isKind = (value: unknown): value is ClientErrorKind =>
  typeof value === 'string' && kinds.includes(value as ClientErrorKind);
const epoch = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Утилита, которая чисто классифицирует внешнюю ошибку без вывода или сетевого вызова. */
export function normalizeClientError(
  value: unknown,
  fallback: 'network' | 'unexpected' = 'network',
): ClientError {
  try {
    if (value instanceof ClientError)
      return codePattern.test(value.code) && isKind(value.kind)
        ? value
        : new ClientError(
            'CLIENT_ERROR',
            'Ответ операции не подтверждён.',
            isKind(value.kind) ? value.kind : fallback,
            value.status,
          );
    if (value instanceof Error && value.name === 'AbortError')
      return new ClientError('CANCELLED', messages.cancelled, 'cancelled');
    if (fallback === 'unexpected' && value && typeof value === 'object') {
      const code = data(value, 'code'),
        kind = data(value, 'kind'),
        status = data(value, 'status');
      if (typeof code === 'string' && codePattern.test(code) && isKind(kind))
        return new ClientError(
          code,
          messages[kind],
          kind,
          typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
            ? status
            : undefined,
        );
    }
  } catch {}
  return new ClientError(
    fallback === 'network' ? 'NETWORK_ERROR' : 'UNEXPECTED_ERROR',
    messages[fallback],
    fallback,
  );
}
/** Чистая нормализация общей ошибки; transport entry сохраняет прежний network fallback. */
export const normalizeAppError = (value: unknown): AppError =>
  normalizeClientError(value, 'unexpected');

/** Пересобирает только объявленную диагностику, не вызывая getters и сериализацию входа. */
function safeOccurrence(value: ClientErrorOccurrence): ClientErrorOccurrence | undefined {
  const id = data(value, 'occurrenceId'),
    operation = data(value, 'operation');
  if (
    typeof id !== 'string' ||
    !identifier.test(id) ||
    typeof operation !== 'string' ||
    (!scopedOperations.has(operation) && !uiOperations.has(operation))
  )
    return;
  const rawKind = data(value, 'kind'),
    kind = isKind(rawKind) ? rawKind : 'unexpected',
    rawCode = data(value, 'code'),
    source = data(value, 'sourceId');
  const base = {
    occurrenceId: id,
    code: typeof rawCode === 'string' && codePattern.test(rawCode) ? rawCode : 'CLIENT_ERROR',
    kind,
    sourceId: typeof source === 'string' && identifier.test(source) ? source : 'untrusted-source',
    severity: getClientErrorSeverity(kind),
  };
  const correlationId = data(value, 'correlationId'),
    requestId = data(value, 'requestId');
  const correlation = {
    ...(typeof correlationId === 'string' && identifier.test(correlationId)
      ? { correlationId }
      : {}),
    ...(typeof requestId === 'string' && identifier.test(requestId) ? { requestId } : {}),
  };
  if (uiOperations.has(operation))
    return {
      ...base,
      ...correlation,
      operation: operation as 'render-ui' | 'async-operation' | 'query' | 'mutation',
    };
  const accessEpoch = data(value, 'accessEpoch'),
    hostEpoch = data(value, 'hostEpoch');
  if (!epoch(accessEpoch)) return;
  return {
    ...base,
    ...correlation,
    operation: operation as
      | 'read-project'
      | 'project-command'
      | 'project-stream'
      | 'read-identity-session'
      | 'list-workspace-projects'
      | 'list-account-projects',
    accessEpoch,
    ...(epoch(hostEpoch) ? { hostEpoch } : {}),
  };
}
/** Утилита, которая изолирует синхронный и асинхронный отказ диагностического sink. */
export function reportClientError(
  reporter: ErrorReporterPort | undefined,
  occurrence: ClientErrorOccurrence,
): void {
  try {
    if (!reporter) return;
    const event = safeOccurrence(occurrence);
    if (!event) return;
    let ids = seen.get(reporter);
    if (!ids) {
      ids = new Set();
      seen.set(reporter, ids);
    }
    if (ids.has(event.occurrenceId)) return;
    ids.add(event.occurrenceId);
    if (ids.size > 256) ids.delete(ids.values().next().value!);
    void Promise.resolve(reporter.report(event)).catch(() => {});
  } catch {}
}

type CaptureOptions = {
  reporter?: ErrorReporterPort;
  occurrence: (error: AppError) => ClientErrorOccurrence;
  normalize?: (value: unknown) => AppError;
  reuseOccurrence?: boolean;
  reportCancelled?: boolean;
};
const reference = (value: unknown): object | undefined =>
  value !== null && (typeof value === 'object' || typeof value === 'function') ? value : undefined;

/** Raw input допускает propagation только пока он однозначен; выданные handles не перепривязываются. */
function observeFailure(value: unknown, event: ClientErrorOccurrence): void {
  const original = reference(value);
  if (!original || issued.has(original)) return;
  const previous = observed.get(original);
  if (previous === undefined) observed.set(original, event);
  else if (previous === null || previous.occurrenceId !== event.occurrenceId)
    observed.set(original, null);
}

/** Cache callback регистрирует metadata, не клонируя и не заменяя stored Query error. */
export function reportClientErrorFailure(
  value: unknown,
  options: Omit<CaptureOptions, 'reuseOccurrence' | 'reportCancelled'>,
): void {
  const error = (options.normalize ?? normalizeAppError)(value);
  try {
    const original = reference(value),
      event = (original && issued.get(original)) || safeOccurrence(options.occurrence(error));
    if (event) {
      observeFailure(value, event);
      reportClientError(options.reporter, event);
    }
  } catch {}
}

/** Новая операция получает уникальный error handle; propagation старого handle разрешается явно. */
export function captureClientError(value: unknown, options: CaptureOptions): AppError {
  const error = (options.normalize ?? normalizeAppError)(value);
  const fresh = new ClientError(error.code, error.message, error.kind, error.status);
  if (error.kind === 'cancelled' && options.reportCancelled === false) return fresh;
  try {
    const original = reference(value);
    const bound = (original && issued.get(original)) || issued.get(error),
      alias = original && observed.get(original);
    const previous =
      options.reuseOccurrence === true
        ? (bound ?? (alias?.operation !== 'render-ui' ? alias : undefined))
        : undefined;
    const event = previous ?? safeOccurrence(options.occurrence(error));
    if (event) {
      const handle =
        options.reuseOccurrence === true && issued.get(error) === event ? error : fresh;
      issued.set(handle, event);
      if (!previous) observeFailure(value, event);
      reportClientError(options.reporter, event);
      return handle;
    }
  } catch {}
  return fresh;
}
