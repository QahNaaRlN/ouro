/** Поддерживаемые методы HTTP-контракта Ouro. */
export type ServiceMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

/** Очищенное диагностическое событие транспортной границы. */
export type ServiceDiagnostic = {
  code: 'HANDLER_FAILED' | 'BACKGROUND_TASK_FAILED' | 'SHUTDOWN_TIMED_OUT';
  operation: string;
};

/** Получатель безопасной диагностики; его отказ не изменяет исход операции. */
export type ServiceReporter = (event: ServiceDiagnostic) => void | Promise<void>;

/** Кооперативная фоновая задача: при abort освобождает свои таймеры, сеть и другие ресурсы. */
export type ServiceBackgroundTask = (signal: AbortSignal) => Promise<void>;

/** Зависимости конкретного запроса без типов HTTP framework. */
export type ServiceRequestContext = {
  params: Readonly<Record<string, string>>;
  afterResponse(task: ServiceBackgroundTask): void;
};

/** Стандартный Web handler отдельного сервиса. */
export type ServiceHandler = (
  request: Request,
  context: ServiceRequestContext,
) => Response | Promise<Response>;

/** Серверная запись маршрута с явным ограничением body. */
export type ServiceRoute = {
  path: string;
  methods: Partial<Record<ServiceMethod, ServiceHandler>>;
  maxBodyBytes?: number;
};

/** Явные зависимости серверного composition root. */
export type ServiceOptions = {
  routes: readonly ServiceRoute[];
  report?: ServiceReporter;
  maxBackgroundTasks?: number;
  fallback?: (request: Request) => Response | Promise<Response>;
};

/** Минимальный Node response lifecycle, не раскрывающий application handlers типы Hono. */
export type ServiceResponseLifecycle = {
  readonly writableFinished: boolean;
  once(event: 'finish' | 'close', callback: () => void): unknown;
  off(event: 'finish' | 'close', callback: () => void): unknown;
};

/** Привязка HTTP adapter к управляемому Node response. */
export type ServiceNodeBindings = {
  outgoing: ServiceResponseLifecycle;
  body?: () => ReadableStream<Uint8Array> | null;
};

/** Управляемый Web adapter отдельного Node-сервиса. */
export type ServiceApplication = {
  fetch(request: Request, bindings: ServiceNodeBindings): Promise<Response>;
  stopAdmission(): void;
  abortRequests(): void;
  abortTasks(): void;
  drain(): Promise<void>;
  report(event: ServiceDiagnostic): void;
};
