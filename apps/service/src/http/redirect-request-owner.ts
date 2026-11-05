import type { IncomingMessage, ServerResponse } from 'node:http';

/** Владеет ограниченным discard-body после раннего redirect и отменяет его при shutdown. */
export function createRedirectRequestOwner() {
  const pending = new Set<() => void>();
  return {
    reply(incoming: IncomingMessage, outgoing: ServerResponse, location: string) {
      let timer: ReturnType<typeof setTimeout> | undefined,
        bytes = 0,
        started = false,
        released = false;
      const release = () => {
        if (released) return;
        released = true;
        pending.delete(stop);
        if (timer) clearTimeout(timer);
        incoming.off('end', release);
        incoming.off('close', release);
        incoming.off('aborted', release);
        incoming.off('error', release);
        incoming.off('data', data);
        outgoing.off('finish', discard);
        outgoing.off('close', closed);
      };
      const stop = () => {
        release();
        incoming.destroy();
      };
      const data = (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > 2 * 1024 * 1024) stop();
      };
      const discard = () => {
        if (started || released) return;
        started = true;
        if (incoming.readableEnded || incoming.destroyed) {
          release();
          return;
        }
        timer = setTimeout(stop, 500);
        incoming.on('data', data);
        incoming.resume();
      };
      const closed = () => {
        if (!outgoing.writableFinished) stop();
        else discard();
      };
      pending.add(stop);
      incoming.once('end', release);
      incoming.once('close', release);
      incoming.once('aborted', release);
      incoming.once('error', release);
      outgoing.once('finish', discard);
      outgoing.once('close', closed);
      outgoing.statusCode = 308;
      outgoing.setHeader('Location', location);
      outgoing.setHeader('Refresh', '0;url=' + location);
      outgoing.end(location);
    },
    stop() {
      for (const cancel of [...pending]) cancel();
    },
  };
}
