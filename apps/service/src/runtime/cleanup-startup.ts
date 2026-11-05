/** Ресурсы startup, которые существуют к моменту отказа. */
export type StartupCleanupResources = {
  stopWorker?: () => Promise<void>;
  stopHttp?: () => Promise<void>;
  stopBackground?: () => Promise<void>;
  closeStore?: () => Promise<void>;
};

/** Наблюдаемый итог cleanup без исходных исключений и чувствительного содержимого. */
export type StartupCleanupStatus = {
  resource: 'worker' | 'http' | 'store-background' | 'store';
  status: 'fulfilled' | 'rejected' | 'skipped-undrained';
};

/** Сохраняет причину startup failure и явно сообщает неподтверждённое завершение ресурсов. */
export class StartupCleanupIncompleteError extends Error {
  readonly code = 'STARTUP_CLEANUP_INCOMPLETE';
  readonly cleanup: readonly StartupCleanupStatus[];
  constructor(cause: unknown, cleanup: readonly StartupCleanupStatus[]) {
    super('Startup failed and resource cleanup is incomplete.', { cause });
    this.name = 'StartupCleanupIncompleteError';
    this.cleanup = Object.freeze(cleanup.map((value) => Object.freeze({ ...value })));
  }
}

/** Независимо останавливает владельцев; закрывает DB только после подтверждённого drain каждого. */
export async function throwAfterStartupCleanup(
  cause: unknown,
  resources: StartupCleanupResources,
): Promise<never> {
  const drains: { resource: StartupCleanupStatus['resource']; run: () => Promise<void> }[] = [];
  if (resources.stopWorker) drains.push({ resource: 'worker', run: resources.stopWorker });
  if (resources.stopHttp) drains.push({ resource: 'http', run: resources.stopHttp });
  if (resources.stopBackground)
    drains.push({ resource: 'store-background', run: resources.stopBackground });
  const settled = await Promise.allSettled(
    drains.map((value) => Promise.resolve().then(value.run)),
  );
  const cleanup: StartupCleanupStatus[] = settled.map((value, index) => ({
    resource: drains[index].resource,
    status: value.status,
  }));
  if (settled.some((value) => value.status === 'rejected')) {
    if (resources.closeStore) cleanup.push({ resource: 'store', status: 'skipped-undrained' });
    throw new StartupCleanupIncompleteError(cause, cleanup);
  }
  if (resources.closeStore) {
    const [closed] = await Promise.allSettled([Promise.resolve().then(resources.closeStore)]);
    cleanup.push({ resource: 'store', status: closed.status });
    if (closed.status === 'rejected') throw new StartupCleanupIncompleteError(cause, cleanup);
  }
  throw cause;
}
