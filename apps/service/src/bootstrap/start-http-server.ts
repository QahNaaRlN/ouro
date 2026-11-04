import { getRequestListener } from '@hono/node-server';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { createServiceApp } from '../http/create-service-app.js';
import { serviceError } from '../http/service-error.js';
import type { ServiceOptions } from '../http/service-types.js';

/** Запускает loopback HTTP/1 listener с явным bounded shutdown и владением соединениями. */
export async function startHttpServer(options: ServiceOptions & { port?: number; shutdownTimeoutMs?: number }) {
  const app = createServiceApp(options);
  const deadlineMs = options.shutdownTimeoutMs ?? 1000;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1) throw new Error('Shutdown timeout must be a positive safe integer');
  const listener = getRequestListener((request, bindings) => app.fetch(request, { outgoing: bindings.outgoing }), { overrideGlobalObjects: false, autoCleanupIncoming: true, errorHandler: () => serviceError() });
  const server = createServer(listener), sockets = new Set<Socket>();
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => { server.off('listening', ready); reject(error); };
    const ready = () => { server.off('error', failed); resolve(); };
    server.once('listening', ready); server.once('error', failed);
    server.listen(options.port ?? 0, '127.0.0.1');
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  let stopping: Promise<void> | undefined;
  return {
    url: `http://127.0.0.1:${address.port}`,
    stop(): Promise<void> {
      if (!stopping) stopping = (async () => {
        app.stopAdmission(); app.abortRequests(); app.abortTasks();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        try {
          await Promise.race([
            Promise.all([closed, app.drain()]),
            new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { app.report({ code: 'SHUTDOWN_TIMED_OUT', operation: 'service.stop' }); reject(new Error('Service shutdown deadline exceeded')); }, deadlineMs); }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
          server.closeAllConnections();
          for (const socket of sockets) socket.destroy();
        }
      })();
      return stopping;
    },
  };
}
