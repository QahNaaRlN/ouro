import type { ProjectState } from '../packages/core/src';
import { AGENT_ID, PROJECT_ID } from '../packages/core/src';
import { AccessError, assertHuman, authenticatedActor } from './auth';
import { requestOrigin } from './connection-config';
import { apiError } from './http';

export type ProjectStreamStore = {
  getProject(): Promise<ProjectState>;
  getEvents(after: number): Promise<{ cursor: number; events: unknown[] }>;
};
export type ProjectStreamClock = {
  now(): number;
  schedule(callback: () => void, milliseconds: number): () => void;
};
export type ProjectStreamOptions = {
  store: ProjectStreamStore;
  storage?: string;
  clock?: ProjectStreamClock;
  pollIntervalMs?: number;
  heartbeatMs?: number;
  lifetimeMs?: number;
};

const clock: ProjectStreamClock = {
  now: Date.now,
  schedule: (callback, milliseconds) => {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  },
};
const encoder = new TextEncoder();

function cursorFrom(request: Request) {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(key => key !== 'after')) {
    throw new AccessError('VALIDATION_ERROR', 'Поток принимает только параметр after; ключ доступа передаётся вне URL.', 422);
  }
  const value = request.headers.get('last-event-id') ?? query.get('after') ?? '0';
  const after = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(after) || after < 0) {
    throw new AccessError('VALIDATION_ERROR', 'Курсор должен быть неотрицательным безопасным целым.', 422);
  }
  return after;
}

function authorize(request: Request) {
  let origin: string;
  try { origin = requestOrigin(request); }
  catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError('FORBIDDEN', 'Host не разрешён для потока проекта.');
  }
  const suppliedOrigin = request.headers.get('origin');
  if (suppliedOrigin && suppliedOrigin !== origin) throw new AccessError('FORBIDDEN', 'Origin не разрешён для потока проекта.');
  assertHuman(authenticatedActor(request, PROJECT_ID, AGENT_ID));
}

/** SQL remains authoritative; a demand-driven subscription holds at most one frame. */
export function createProjectStreamHandler(options: ProjectStreamOptions) {
  const timing = options.clock ?? clock;
  const pollInterval = Math.max(1, options.pollIntervalMs ?? 500);
  const heartbeat = Math.max(1, options.heartbeatMs ?? 15_000);
  const lifetime = Math.max(1, Math.min(55_000, options.lifetimeMs ?? 55_000));
  const encodeSnapshot = (state: ProjectState) => encoder.encode(`id: ${state.version}\nevent: snapshot\ndata: ${JSON.stringify({ state, cursor: state.version, storage: options.storage ?? 'embedded-postgres' })}\n\n`);

  return async (request: Request): Promise<Response> => {
    try {
      authorize(request);
      const after = cursorFrom(request);
      const initial = await options.store.getProject();
      if (after > initial.version) throw new AccessError('CURSOR_AHEAD', 'Курсор клиента опережает историю проекта. Перезагрузите снимок.', 409);

      let closed = false;
      let lastVersion = initial.version;
      let lastFrameAt = timing.now();
      let controller: ReadableStreamDefaultController<Uint8Array>;
      let cancelLifetime: (() => void) | undefined;
      let wake: (() => void) | undefined;

      const finish = (cancelled = false, failure?: unknown) => {
        if (closed) return;
        closed = true;
        cancelLifetime?.();
        request.signal.removeEventListener('abort', onAbort);
        wake?.();
        if (!cancelled) {
          if (failure) controller.error(new Error('Подписка недоступна. Требуется повторное подключение.'));
          else controller.close();
        }
      };
      const onAbort = () => finish();
      const pause = (milliseconds: number) => new Promise<void>(resolve => {
        let completed = false;
        const resume = () => {
          if (completed) return;
          completed = true;
          cancel();
          if (wake === resume) wake = undefined;
          resolve();
        };
        const cancel = timing.schedule(resume, milliseconds);
        wake = resume;
      });

      const stream = new ReadableStream<Uint8Array>({
        start(target) {
          controller = target;
          cancelLifetime = timing.schedule(() => finish(), lifetime);
          request.signal.addEventListener('abort', onAbort, { once: true });
          if (request.signal.aborted) finish();
          else controller.enqueue(encodeSnapshot(initial));
        },
        async pull() {
          try {
            while (!closed) {
              await pause(Math.min(pollInterval, Math.max(1, heartbeat - (timing.now() - lastFrameAt))));
              if (closed) return;
              const committed = await options.store.getEvents(lastVersion);
              if (closed) return;
              if (committed.cursor > lastVersion) {
                const state = await options.store.getProject();
                if (closed) return;
                if (state.version < committed.cursor) throw new Error('Snapshot does not include its committed cursor');
                // The snapshot can include commits newer than the change check.
                // Its own version is the only correct ID for this complete frame.
                lastVersion = state.version;
                lastFrameAt = timing.now();
                controller.enqueue(encodeSnapshot(state));
                return;
              }
              if (timing.now() - lastFrameAt >= heartbeat) {
                lastFrameAt = timing.now();
                controller.enqueue(encoder.encode(': heartbeat\n\n'));
                return;
              }
            }
          } catch (error) { if (!closed) finish(false, error); }
        },
        cancel() { finish(true); },
      }, { highWaterMark: 0 });

      return new Response(stream, { headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      } });
    } catch (error) { return apiError(error); }
  };
}
