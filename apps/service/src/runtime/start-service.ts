import * as storeSource from '../../../../lib/store';
import * as mailerSource from '../../../../lib/mailer';
import * as workerSource from '../../../../lib/github/worker';
import * as clientSource from '../../../../lib/github/verification';
import { startHttpServer } from '../bootstrap/start-http-server.js';
import { createBackendRoutes } from '../backend/create-backend.js';
import { createOwnedGitHubWorker } from './owned-github-worker.js';
import { createStaticHandler } from './static-handler.js';
import { throwAfterStartupCleanup } from './cleanup-startup.js';
import { access } from 'node:fs/promises';
import type { RuntimeConfiguration } from './configuration.js';
import type { ServiceReporter } from '../http/service-types.js';
import type { PreboundHttpListener } from '../bootstrap/prebound-listener.types.js';
import { validateNodeVersion } from '../../../../scripts/runtime-node.mjs';

/** Согласует прежний CommonJS application source и ESM composition root. */
function interop<T>(source: T): T {
  return (source as T & { default?: T }).default ?? source;
}

/** Владеет startup, storage, workers и порядком shutdown одного backend runtime. */
export async function startService(
  configuration: RuntimeConfiguration,
  options: { report?: ServiceReporter; listener?: PreboundHttpListener } = {},
) {
  validateNodeVersion(process.versions.node);
  const stores = interop(storeSource),
    mailers = interop(mailerSource),
    workers = interop(workerSource),
    clients = interop(clientSource);
  let store: Awaited<ReturnType<typeof stores.createStore>> | undefined,
    http: Awaited<ReturnType<typeof startHttpServer>> | undefined,
    worker: ReturnType<typeof createOwnedGitHubWorker> | undefined,
    ready = false;
  try {
    if (
      options.listener &&
      (options.listener.state !== 'PREBOUND' ||
        !options.listener.server.listening ||
        options.listener.address.port !== configuration.port ||
        options.listener.address.address !== configuration.host)
    )
      throw new Error('Prebound listener does not match the configured runtime');
    await access(configuration.playwrightPreloadPath);
    const fallback = configuration.staticRoot
      ? await createStaticHandler(configuration.staticRoot)
      : undefined;
    store = await stores.createStore({
      dataDir: configuration.dataDir,
      databaseUrl: configuration.databaseUrl,
      migrationsDir: configuration.migrationsDir,
      verificationRuntimeDir: configuration.verificationRuntimeDir,
      playwrightPackageRoot: configuration.packageRoot,
      playwrightPreloadPath: configuration.playwrightPreloadPath,
      deploymentMode: configuration.environment.OURO_DEPLOYMENT_MODE ?? 'local',
      startObservers: false,
      mailer: mailers.createSmtpMailerFromEnv(configuration.environment),
    });
    const owner = store,
      domainWorker = workers.createGitHubWorker({
        getStore: async () => owner,
        client: clients.createGitHubClient({ token: configuration.environment.OURO_GITHUB_TOKEN }),
      });
    worker = createOwnedGitHubWorker({
      enabled: !!configuration.environment.OURO_GITHUB_WEBHOOK_SECRET,
      run: (signal) => domainWorker.run(signal),
    });
    const routes = createBackendRoutes({
      store: owner,
      environment: configuration.environment,
      resourceRoot: configuration.resourceRoot,
      mcpPath: configuration.mcpPath,
      mcpArgs: configuration.mcpArgs,
      storage: configuration.databaseUrl ? 'postgres' : 'embedded-postgres',
      ready: () => ready,
      kickWorker: worker.kick,
    });
    http = await startHttpServer({
      routes,
      fallback,
      host: configuration.host,
      port: configuration.port,
      shutdownTimeoutMs: configuration.shutdownTimeoutMs,
      report: options.report,
      listener: options.listener,
      deferAdmission: !!options.listener,
    });
    owner.startBackgroundWork();
    worker.start();
    ready = true;
    http.activate();
  } catch (error) {
    const failedWorker = worker,
      failedHttp = http,
      failedStore = store;
    return throwAfterStartupCleanup(error, {
      stopWorker: failedWorker ? () => failedWorker.stop() : undefined,
      stopHttp: failedHttp
        ? () => failedHttp.stop()
        : options.listener
          ? async () => {
              await options.listener!.closeIfUnadopted();
            }
          : undefined,
      stopBackground: failedStore ? () => failedStore.stopBackgroundWork() : undefined,
      closeStore: failedStore ? () => failedStore.close() : undefined,
    });
  }
  const server = http,
    owner = store,
    ownedWorker = worker;
  let stopping: Promise<void> | undefined;
  return {
    url: server.url,
    isReady: () => ready,
    stop() {
      if (!stopping) {
        ready = false;
        stopping = (async () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const cleanup = async () => {
            const drained = await Promise.allSettled([
              server.stop(),
              ownedWorker.stop(),
              owner.stopBackgroundWork(),
            ]);
            const failed = drained.find((result) => result.status === 'rejected');
            if (failed?.status === 'rejected') throw failed.reason;
            await owner.close();
          };
          try {
            await Promise.race([
              cleanup(),
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                  () =>
                    reject(
                      new Error(
                        'Service shutdown deadline exceeded; resources are not confirmed closed.',
                      ),
                    ),
                  configuration.shutdownTimeoutMs,
                );
              }),
            ]);
          } finally {
            if (timer) clearTimeout(timer);
          }
        })();
      }
      return stopping;
    },
  };
}
