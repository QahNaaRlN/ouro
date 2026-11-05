import { validateNodeVersion } from './runtime-node.mjs';
import { readBuiltGeneration } from './consumer-delivery/generation-state.mjs';
import { parseStartPort } from './consumer-delivery/consumer-port.mjs';
import { bindOwnedHttpListener } from './consumer-delivery/owned-http-listener.mjs';
import { mkdir, lstat, realpath, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

let prebound,
  service,
  stopping = false,
  disconnected = false,
  earlyClosing,
  serviceClosing;

/** Запоминает stop до env/import awaits; SQL owner закрывается только своим штатным drain. */
function stop() {
  stopping = true;
  if (service) {
    if (!serviceClosing)
      serviceClosing = service
        .stop()
        .catch(() => {
          process.stderr.write('OURO_CONSUMER_DRAIN_INCOMPLETE\n');
          process.exitCode = 1;
        })
        .finally(() => {
          if (process.connected) process.disconnect();
        });
  } else if (prebound && !earlyClosing) {
    earlyClosing = prebound.closeIfUnadopted();
    void earlyClosing.catch(() => {});
  }
}

/** Завершает только pre-application cancellation, не изображая SQL cancellation arbitrary Promise. */
async function stoppedBeforeApplication() {
  if (!stopping) return false;
  if (prebound) await (earlyClosing ??= prebound.closeIfUnadopted());
  if (process.connected) process.disconnect();
  return true;
}

/** Внутренний IPC worker загружает dependencies только выбранного generation после Node admission. */
async function run() {
  const [mode, id, port] = process.argv.slice(2);
  if (
    !process.send ||
    !process.connected ||
    !['build', 'service'].includes(mode) ||
    !/^g-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id ?? '') ||
    process.argv.length < 4 ||
    process.argv.length > (mode === 'build' ? 4 : 5) ||
    (port !== undefined && !/^\d+$/.test(port))
  )
    throw Error();
  process.once('disconnect', () => {
    disconnected = true;
    if (mode === 'service') stop();
  });
  if (mode === 'service') {
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    process.on('message', (message) => {
      if (message === 'ouro:shutdown') stop();
    });
  }
  const root = await realpath(fileURLToPath(new URL('../', import.meta.url))),
    generation = path.join(root, '.ouro-runtime', 'generations', id);
  if ((await realpath(generation)) !== generation || (await lstat(generation)).isSymbolicLink())
    throw Error();
  if (mode === 'build') {
    try {
      await lstat(path.join(root, '.ouro-runtime', 'records', id + '.json'));
      throw Error();
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const claims = path.join(root, '.ouro-runtime', 'build-claims');
    try {
      await mkdir(claims);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    if ((await lstat(claims)).isSymbolicLink() || !(await lstat(claims)).isDirectory())
      throw Error();
    await writeFile(path.join(claims, id), id, { flag: 'wx', mode: 0o600 });
    await (
      await import(pathToFileURL(path.join(generation, 'scripts/build-consumer.mjs')).href)
    ).buildConsumer({ sourceRoot: generation, environmentRoot: root });
    if (disconnected || !process.connected) throw Error();
    process.disconnect();
    return;
  }
  await readBuiltGeneration(root, id);
  if (await stoppedBeforeApplication()) return;
  const selected = parseStartPort(port ?? process.env.PORT ?? '3000');
  prebound = await bindOwnedHttpListener({ port: selected, host: '127.0.0.1' });
  if (await stoppedBeforeApplication()) return;
  process.env.PORT = String(prebound.address.port);
  process.env.OURO_SERVICE_HOST = '127.0.0.1';
  process.env.OURO_LOCAL_DEMO = '1';
  const runtimeEnvironment = await import(
    pathToFileURL(path.join(generation, 'scripts/runtime-environment.mjs')).href
  );
  if (await stoppedBeforeApplication()) return;
  await runtimeEnvironment.loadRuntimeEnvironment({ root, phase: 'production' });
  if (await stoppedBeforeApplication()) return;
  if (process.env.OURO_DATA_DIR !== undefined) {
    if (!process.env.OURO_DATA_DIR) throw Error();
    if (process.env.OURO_DATA_DIR !== 'memory://')
      process.env.OURO_DATA_DIR = path.resolve(root, process.env.OURO_DATA_DIR);
  } else if (!process.env.DATABASE_URL)
    process.env.OURO_DATA_DIR = path.join(root, '.ouro', 'postgres');
  process.env.OURO_STATIC_ROOT = path.join(generation, 'apps/web/dist');
  if (process.env.OURO_VERIFICATION_RUNTIME_DIR)
    process.env.OURO_VERIFICATION_RUNTIME_DIR = path.resolve(
      root,
      process.env.OURO_VERIFICATION_RUNTIME_DIR,
    );
  const serviceRoot = path.join(generation, 'apps/service/dist'),
    application = await import(pathToFileURL(path.join(serviceRoot, 'index.mjs')).href);
  if (await stoppedBeforeApplication()) return;
  const configuration = application.runtimeConfiguration(process.env, {
    resourceRoot: root,
    migrationsDir: path.join(serviceRoot, 'resources/migrations'),
    mcpPath: path.join(root, 'packages/mcp/bin/ouro-mcp.mjs'),
    mcpArgs: ['--generation', id],
    playwrightPreloadPath: path.join(serviceRoot, 'resources/verification/playwright-preload.mjs'),
    packageRoot: path.join(generation, 'apps/service'),
  });
  service = await application.startService(configuration, {
    listener: prebound,
    report: (event) => {
      if (process.connected) process.send({ type: 'diagnostic', code: event.code }, () => {});
    },
  });
  if (stopping || disconnected) stop();
  else process.send({ type: 'ready', url: service.url });
}

try {
  validateNodeVersion(process.versions.node);
  await run();
} catch (error) {
  let cleanupIncomplete = false;
  try {
    if (prebound) await prebound.closeIfUnadopted();
  } catch {
    cleanupIncomplete = true;
  }
  if (stopping && error?.code === 'BOOTSTRAP_LISTENER_CLOSED' && !cleanupIncomplete)
    process.exitCode = 0;
  else {
    process.stderr.write(
      error?.code === 'NODE_RUNTIME_UNSUPPORTED'
        ? 'NODE_RUNTIME_UNSUPPORTED: ' + error.message + '\n'
        : error?.code === 'STARTUP_CLEANUP_INCOMPLETE' || cleanupIncomplete
          ? 'OURO_CONSUMER_STARTUP_CLEANUP_INCOMPLETE\n'
          : 'OURO_CONSUMER_WORKER_FAILED\n',
    );
    process.exitCode = 1;
  }
  if (process.connected) process.disconnect();
}
