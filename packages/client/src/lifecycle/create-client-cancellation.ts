import type { ClientCancellationSignal } from '../ports';
/** Утилита, которая отменяет ожидание через переносимый сигнал без DOM-зависимости. */
export function createClientCancellation() {
  let aborted = false;
  const listeners = new Set<() => void>();
  const signal: ClientCancellationSignal = {
    get aborted() {
      return aborted;
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
  };
  return {
    signal,
    abort: () => {
      if (aborted) return;
      aborted = true;
      listeners.forEach((listener) => listener());
      listeners.clear();
    },
  };
}
