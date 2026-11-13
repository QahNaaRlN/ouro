import { createServer } from 'node:http';
import { assertBrowserPort } from './consumer-port.mjs';

/** Обозначает bootstrap failure без исходных endpoint/configuration values. */
export class BootstrapListenerError extends Error {
  constructor(code = 'BOOTSTRAP_LISTENER_INVALID') {
    super('Owned bootstrap listener failed.');
    this.name = 'BootstrapListenerError';
    this.code = code;
  }
}

/** Держит тот же stdlib Server до env/app imports и передаёт raw requests обычному transport. */
export async function bindOwnedHttpListener(options) {
  const port = options?.port,
    host = options?.host ?? '127.0.0.1',
    maxPending = options?.maxPendingRequests ?? 32,
    maxConnections = options?.maxConnections ?? 64,
    timeout = options?.startupTimeoutMs ?? 30000;
  if (
    !Number.isSafeInteger(port) ||
    port < 0 ||
    port > 65535 ||
    !['127.0.0.1', '::1'].includes(host) ||
    ![maxPending, maxConnections, timeout].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    )
  )
    throw new BootstrapListenerError();
  assertBrowserPort(port);
  let state = 'PREBOUND',
    adopted = false,
    handler,
    closing,
    timer;
  const sockets = new Set(),
    pending = new Map();
  const invoke = (incoming, outgoing) => {
    if (outgoing.destroyed || incoming.socket.destroyed) return;
    try {
      void Promise.resolve(handler(incoming, outgoing)).catch(() => outgoing.destroy());
    } catch {
      outgoing.destroy();
    }
  };
  const server = createServer((incoming, outgoing) => {
    if (state === 'ADOPTED') {
      invoke(incoming, outgoing);
      return;
    }
    if (state !== 'PREBOUND' || pending.size >= maxPending) {
      incoming.socket.destroy();
      return;
    }
    const release = () => {
        pending.delete(outgoing);
        incoming.off('error', failed);
        outgoing.off('close', release);
      },
      failed = () => {
        release();
        outgoing.destroy();
      };
    pending.set(outgoing, { incoming, outgoing, release });
    incoming.once('error', failed);
    outgoing.once('close', release);
  });
  const track = (socket) => {
    if (state !== 'PREBOUND' || sockets.size >= maxConnections) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  };
  server.on('connection', track);
  /** Закрывает только ещё не переданное владение; после adoption HTTP owner отвечает за drain. */
  const closeIfUnadopted = async () => {
    if (adopted) return false;
    if (!closing) {
      state = 'CLOSED';
      if (timer) clearTimeout(timer);
      for (const entry of pending.values()) {
        entry.release();
        entry.outgoing.destroy();
      }
      pending.clear();
      closing = new Promise((resolve, reject) =>
        server.close((error) =>
          error && error.code !== 'ERR_SERVER_NOT_RUNNING'
            ? reject(new BootstrapListenerError('BOOTSTRAP_LISTENER_CLOSE_FAILED'))
            : resolve(),
        ),
      );
      server.closeAllConnections();
      for (const socket of sockets) socket.destroy();
    }
    await closing;
    return true;
  };
  server.once('close', () => {
    state = 'CLOSED';
    if (timer) clearTimeout(timer);
  });
  try {
    await new Promise((resolve, reject) => {
      const failed = () => {
          server.off('listening', ready);
          reject(new BootstrapListenerError('BOOTSTRAP_LISTENER_BIND_FAILED'));
        },
        ready = () => {
          server.off('error', failed);
          resolve();
        };
      server.once('error', failed);
      server.once('listening', ready);
      server.listen(port, host);
    });
  } catch (error) {
    await closeIfUnadopted().catch(() => {});
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeIfUnadopted();
    throw new BootstrapListenerError();
  }
  const failed = () => {
    void closeIfUnadopted().catch(() => {});
  };
  server.on('error', failed);
  timer = setTimeout(failed, timeout);
  return Object.freeze({
    server,
    address: Object.freeze(address),
    url: `http://${address.address.includes(':') ? '[' + address.address + ']' : address.address}:${address.port}`,
    get state() {
      return state;
    },
    currentSockets: () => [...sockets],
    closeIfUnadopted,
    adopt(listener) {
      if (state !== 'PREBOUND' || !server.listening)
        throw new BootstrapListenerError('BOOTSTRAP_LISTENER_CLOSED');
      if (typeof listener !== 'function') throw new BootstrapListenerError();
      handler = listener;
      adopted = true;
      state = 'ADOPTED';
      clearTimeout(timer);
      server.off('error', failed);
      server.off('connection', track);
      sockets.clear();
      const queued = [...pending.values()];
      for (const entry of queued) {
        entry.release();
        invoke(entry.incoming, entry.outgoing);
      }
    },
  });
}
