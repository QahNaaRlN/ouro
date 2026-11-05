import { Hono } from 'hono';
import { createBackgroundTaskOwner, type TaskReservation } from './background-task-owner.js';
import { withBoundedBody } from './read-bounded-body.js';
import { serviceError, ServiceTransportError } from './service-error.js';
import type {
  ServiceApplication,
  ServiceMethod,
  ServiceNodeBindings,
  ServiceOptions,
} from './service-types.js';

/** Собирает явные Web handlers, совместимые с методами Next и lifecycle отдельного сервиса. */
export function createServiceApp(options: ServiceOptions): ServiceApplication {
  const app = new Hono<{ Bindings: ServiceNodeBindings }>();
  const tasks = createBackgroundTaskOwner(options.report, options.maxBackgroundTasks ?? 64);
  const active = new Set<AbortController>(),
    paths = new Set<string>();
  const handlers = new Set<Promise<void>>();
  const bodyCleanup = new Set<Promise<void>>();
  let accepting = true;
  app.notFound((context) =>
    accepting
      ? (options.fallback?.(context.req.raw) ?? new Response(null, { status: 404 }))
      : serviceError('SERVICE_STOPPING', 503, 'Service is stopping.'),
  );
  app.onError(() => serviceError());
  for (const route of options.routes) {
    if (!route.path.startsWith('/') || paths.has(route.path))
      throw new Error('Route paths must be explicit and unique');
    paths.add(route.path);
    if (
      route.maxBodyBytes !== undefined &&
      (!Number.isSafeInteger(route.maxBodyBytes) || route.maxBodyBytes < 1)
    )
      throw new Error('Body limit must be a positive safe integer');
    const implemented = new Set(
      Object.entries(route.methods)
        .filter(([, handler]) => typeof handler === 'function')
        .map(([method]) => method),
    );
    if (route.methods.GET) implemented.add('HEAD');
    implemented.add('OPTIONS');
    app.all(route.path, async (context) => {
      if (!accepting) return serviceError('SERVICE_STOPPING', 503, 'Service is stopping.');
      const method = context.req.raw.method as ServiceMethod;
      if (method === 'OPTIONS' && !route.methods.OPTIONS)
        return new Response(null, {
          status: 204,
          headers: { Allow: [...implemented].sort().join(', ') },
        });
      const handler = route.methods[method] ?? (method === 'HEAD' ? route.methods.GET : undefined);
      if (!handler) return new Response(null, { status: 405 });
      const original = context.req.raw,
        controller = new AbortController();
      let settled: () => void = () => undefined;
      const handlerDone = new Promise<void>((resolve) => {
        settled = resolve;
      });
      handlers.add(handlerDone);
      const reservations: TaskReservation[] = [],
        outgoing = context.env.outgoing;
      let requestBody: ReadableStream<Uint8Array> | null = null;
      let bodyCleanupStarted = false;
      const operation = `${method} ${route.path}`;
      const onAbort = () => controller.abort();
      const release = () => {
        active.delete(controller);
        original.signal.removeEventListener('abort', onAbort);
        outgoing.off('finish', finished);
        outgoing.off('close', closed);
      };
      const finished = () => {
        drainBody();
        for (const task of reservations) task.start();
        release();
      };
      const drainBody = () => {
        if (bodyCleanupStarted) return;
        bodyCleanupStarted = true;
        if (!requestBody || requestBody.locked) return;
        const reader = requestBody.getReader();
        let timer: ReturnType<typeof setTimeout> | undefined,
          bytes = 0;
        const cleanup = (async () => {
          try {
            while (bytes <= 2 * 1024 * 1024) {
              const chunk = await reader.read();
              if (chunk.done) return;
              bytes += chunk.value.byteLength;
            }
            void reader.cancel().catch(() => undefined);
          } catch {
          } finally {
            reader.releaseLock();
          }
        })();
        const bounded = (async () => {
          try {
            await Promise.race([
              cleanup,
              new Promise<void>((resolve) => {
                timer = setTimeout(() => {
                  void reader.cancel().catch(() => undefined);
                  resolve();
                }, 500);
              }),
            ]);
          } finally {
            if (timer) clearTimeout(timer);
          }
        })();
        bodyCleanup.add(bounded);
        void bounded.finally(() => bodyCleanup.delete(bounded)).catch(() => undefined);
      };
      const closed = () => {
        if (!outgoing.writableFinished) {
          controller.abort();
          for (const task of reservations) task.cancel();
        }
        drainBody();
        release();
      };
      active.add(controller);
      original.signal.addEventListener('abort', onAbort, { once: true });
      if (original.signal.aborted) controller.abort();
      outgoing.once('finish', finished);
      outgoing.once('close', closed);
      try {
        const init: RequestInit & { duplex: 'half' } = {
          method: original.method,
          headers: original.headers,
          signal: controller.signal,
          duplex: 'half',
        };
        const incomingBody = context.env.body ? context.env.body() : original.body;
        if (incomingBody !== null) init.body = incomingBody;
        const scoped = new Request(original.url, init);
        requestBody = scoped.body;
        const request = await withBoundedBody(scoped, route.maxBodyBytes);
        const response = await handler(request, {
          params: Object.freeze({ ...context.req.param() }),
          afterResponse(task) {
            reservations.push(tasks.reserve(task, operation));
          },
        });
        if (method !== 'HEAD') return response;
        await response.body?.cancel();
        return new Response(null, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        for (const task of reservations) task.cancel();
        if (error instanceof ServiceTransportError)
          return serviceError(error.code, error.status, error.message);
        if (!controller.signal.aborted) tasks.report({ code: 'HANDLER_FAILED', operation });
        return serviceError();
      } finally {
        settled();
        handlers.delete(handlerDone);
      }
    });
  }
  return {
    fetch: async (request, bindings) => app.fetch(request, bindings),
    stopAdmission() {
      accepting = false;
      tasks.stopAdmission();
    },
    abortRequests() {
      for (const controller of active) controller.abort();
    },
    abortTasks: tasks.abortTasks,
    async drain() {
      while (handlers.size) await Promise.all([...handlers]);
      await tasks.drain();
      while (bodyCleanup.size) await Promise.all([...bodyCleanup]);
    },
    report: tasks.report,
  };
}
