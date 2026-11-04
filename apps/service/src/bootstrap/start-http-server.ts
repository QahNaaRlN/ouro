import { getRequestListener } from '@hono/node-server';
import { createServer } from 'node:http';
import {Readable} from 'node:stream';
import type { Socket } from 'node:net';
import { createServiceApp } from '../http/create-service-app.js';
import { serviceError } from '../http/service-error.js';
import type { ServiceOptions } from '../http/service-types.js';

/** Запускает loopback HTTP/1 listener с явным bounded shutdown и владением соединениями. */
export async function startHttpServer(options: ServiceOptions & { port?: number;host?:string; shutdownTimeoutMs?: number }) {
  const app = createServiceApp(options);
  const deadlineMs = options.shutdownTimeoutMs ?? 1000;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1) throw new Error('Shutdown timeout must be a positive safe integer');
  const listener = getRequestListener((request, bindings) => app.fetch(request, { outgoing: bindings.outgoing,body:()=>['GET','HEAD'].includes(request.method)?null:Readable.toWeb(bindings.incoming) as ReadableStream<Uint8Array> }), { overrideGlobalObjects: false, autoCleanupIncoming: true, errorHandler: () => serviceError() });
  const server = createServer(listener), sockets = new Set<Socket>();
  const requests=new Map<Socket,number>();
  let closing=false;
  server.on('request',(incoming,outgoing)=>{
    const socket=incoming.socket;requests.set(socket,(requests.get(socket)??0)+1);let released=false;
    const release=()=>{if(released)return;released=true;const remaining=(requests.get(socket)??1)-1;if(remaining)requests.set(socket,remaining);else{requests.delete(socket);if(closing)socket.destroy();}};
    outgoing.once('finish',release);outgoing.once('close',release);
  });
  server.on('connection', socket => { sockets.add(socket);if(closing)socket.destroy();socket.once('close', () => {sockets.delete(socket);requests.delete(socket);}); });
  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => { server.off('listening', ready); reject(error); };
    const ready = () => { server.off('error', failed); resolve(); };
    server.once('listening', ready); server.once('error', failed);
    server.listen(options.port ?? 0, options.host??'127.0.0.1');
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  let stopping: Promise<void> | undefined;
  return {
    url: `http://${address.address.includes(':')?'['+address.address+']':address.address}:${address.port}`,
    stop(): Promise<void> {
      if (!stopping) stopping = (async () => {
        closing=true;app.stopAdmission(); app.abortRequests(); app.abortTasks();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        server.closeIdleConnections();
        for(const socket of sockets)if(!requests.has(socket))socket.destroy();
        try {
          await Promise.race([
            app.drain().then(async()=>{server.closeIdleConnections();await closed;await app.drain();}),
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
