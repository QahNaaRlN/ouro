import type { ServiceBackgroundTask, ServiceDiagnostic, ServiceReporter } from './service-types.js';
import { ServiceTransportError } from './service-error.js';

/** Наблюдаемое резервирование задачи конкретного response. */
export type TaskReservation = { start(): void; cancel(): void };

/** Владеет ограниченным набором задач и безопасной диагностикой до завершения drain. */
export function createBackgroundTaskOwner(report: ServiceReporter | undefined, capacity: number) {
  if (!Number.isSafeInteger(capacity) || capacity < 1)
    throw new Error('Background capacity must be a positive safe integer');
  let accepting = true;
  const pending = new Set<Promise<void>>();
  const controllers = new Set<AbortController>();
  const emit = (event: ServiceDiagnostic) => {
    try {
      void Promise.resolve(report?.(event)).catch(() => undefined);
    } catch {}
  };
  return {
    report: emit,
    stopAdmission() {
      accepting = false;
    },
    abortTasks() {
      for (const controller of controllers) controller.abort();
    },
    reserve(task: ServiceBackgroundTask, operation: string): TaskReservation {
      if (!accepting)
        throw new ServiceTransportError('SERVICE_STOPPING', 503, 'Service is stopping.');
      if (pending.size >= capacity)
        throw new ServiceTransportError(
          'BACKGROUND_QUEUE_FULL',
          503,
          'Background task capacity is exhausted.',
        );
      let resolveDone: (() => void) | undefined,
        state: 'reserved' | 'running' | 'done' = 'reserved';
      const controller = new AbortController();
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });
      pending.add(done);
      controllers.add(controller);
      const finish = () => {
        if (state === 'done') return;
        state = 'done';
        pending.delete(done);
        controllers.delete(controller);
        resolveDone?.();
      };
      controller.signal.addEventListener(
        'abort',
        () => {
          if (state === 'reserved') finish();
        },
        { once: true },
      );
      return {
        start() {
          if (state !== 'reserved') return;
          state = 'running';
          void Promise.resolve()
            .then(() => task(controller.signal))
            .catch(() => emit({ code: 'BACKGROUND_TASK_FAILED', operation }))
            .finally(finish);
        },
        cancel() {
          controller.abort();
          if (state === 'reserved') finish();
        },
      };
    },
    async drain() {
      await Promise.all([...pending]);
    },
  };
}
