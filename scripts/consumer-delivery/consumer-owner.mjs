import { validateNodeVersion } from '../runtime-node.mjs';
import {
  admitConsumerEnvelope,
  allocateGeneration,
  snapshotGeneration,
  publishBuiltGeneration,
  readBuiltGeneration,
} from './generation-state.mjs';
import { parseStartPort, selectConsumerPort } from './consumer-port.mjs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

/** Возвращает фиксированный phase failure, не печатая raw child/config/HTTP payload. */
export class ConsumerLaunchError extends Error {
  constructor(phase) {
    super('Consumer launch failed.');
    this.name = 'ConsumerLaunchError';
    this.code = 'CONSUMER_LAUNCH_FAILED';
    this.phase = phase;
  }
}
const signalCode = (signal) =>
  signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : signal === 'shutdown' ? 0 : 1;

/** Снимает deadline timer после любого исхода, чтобы graceful shutdown не удерживал процесс. */
async function within(work, milliseconds, expired) {
  let timer;
  try {
    return await Promise.race([
      work,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          try {
            resolve(expired());
          } catch (error) {
            reject(error);
          }
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Проверяет конечный CLI; неизвестные аргументы не передаются shell и не исчезают молча. */
export function parseConsumerArguments(argv) {
  if (!Array.isArray(argv) || !['launch', 'build', 'start'].includes(argv[0]))
    throw new ConsumerLaunchError('ARGUMENTS');
  const mode = argv[0];
  if (argv.length === 2 && argv[1] === '--help') return { mode, help: true, controlStdin: false };
  let port,
    controlStdin = false;
  for (let index = 1; index < argv.length; index++) {
    if (argv[index] === '--control-stdin' && mode !== 'build' && !controlStdin) {
      controlStdin = true;
      continue;
    }
    if (
      (argv[index] !== '--port' && !(mode === 'start' && argv[index] === '-p')) ||
      mode === 'build' ||
      port !== undefined ||
      argv[index + 1] === undefined
    )
      throw new ConsumerLaunchError('ARGUMENTS');
    const value = argv[++index];
    if (mode === 'start') {
      try {
        port = parseStartPort(value);
      } catch {
        throw new ConsumerLaunchError('ARGUMENTS');
      }
    } else {
      if (!/^\d+$/.test(value)) throw new ConsumerLaunchError('ARGUMENTS');
      port = Number(value);
      if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
        throw new ConsumerLaunchError('ARGUMENTS');
    }
  }
  return { mode, help: false, port: port ?? (mode === 'launch' ? 3000 : undefined), controlStdin };
}

/** Принимает единственную bounded stop line из явного owned non-TTY pipe, без echo/EOF shutdown. */
export function attachStdinControl(stream, shutdown) {
  let pending = '',
    discard = false,
    finished = false;
  const close = () => {
    if (finished) return;
    finished = true;
    stream.removeListener('data', data);
    stream.removeListener('end', close);
    stream.pause();
    if (typeof stream.unref === 'function') stream.unref();
  };
  const data = (chunk) => {
    for (const character of String(chunk)) {
      if (character === '\n') {
        const line = pending;
        pending = '';
        const invalid = discard;
        discard = false;
        if (!invalid && (line === 'ouro:shutdown' || line === 'ouro:shutdown\r')) {
          close();
          shutdown();
          return;
        }
      } else if (!discard) {
        if (pending.length >= 64) {
          pending = '';
          discard = true;
        } else pending += character;
      }
    }
  };
  stream.on('data', data);
  stream.once('end', close);
  return close;
}

/** Исключает пользовательские Node resolution hooks; обычная конфигурация приложения остаётся в runtime child. */
function childEnvironment(environment) {
  const result = { ...environment };
  delete result.NODE_OPTIONS;
  delete result.NODE_PATH;
  result.PATH = path.dirname(process.execPath) + path.delimiter + (result.PATH ?? '');
  return result;
}

/** Ограничивает fallback текущим ещё живым собственным child; orphan generations не удаляются. */
export function forceOwnedChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows';
    const stopped = spawnSync(
      path.join(systemRoot, 'System32/taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true, shell: false, stdio: 'ignore', timeout: 3000 },
    );
    if (stopped.error && child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }
}

/** Владеет одной preparation и одним runtime, не превращая last-built в active-server authority. */
export async function runConsumer({ root, argv, environment = process.env }) {
  validateNodeVersion(process.versions.node);
  const options = parseConsumerArguments(argv);
  if (options.help) {
    process.stdout.write(
      'Ouro: npm run launch [-- --port 3001] [--control-stdin]\nUse Node.js 24, minimum24.19.0. Every launch creates a new install generation, runs npm ci --include=dev and a fresh build. Existing .ouro data is preserved. npm start selects the last completed build. Optional non-TTY --control-stdin accepts only ouro:shutdown followed by a newline; EOF does not stop the server.\n',
    );
    return 0;
  }
  if (typeof root !== 'string' || !path.isAbsolute(root))
    throw new ConsumerLaunchError('ADMISSION');
  if (options.controlStdin && process.stdin.isTTY) throw new ConsumerLaunchError('ARGUMENTS');
  let startupPort;
  try {
    if (options.mode !== 'build')
      startupPort = selectConsumerPort(options.mode, options.port, environment.PORT);
  } catch {
    throw new ConsumerLaunchError('PORT_ADMISSION');
  }
  let phase = 'ADMISSION',
    current,
    interrupted,
    stopping,
    failure,
    detachControl = () => {};
  const env = childEnvironment(environment);
  const stopCurrent = () =>
    (stopping ??= (async () => {
      if (!current) return;
      const owned = current;
      if (owned.kind === 'service' && owned.child.connected)
        owned.child.send('ouro:shutdown', () => {});
      else if (owned.child.exitCode === null && owned.child.signalCode === null)
        owned.child.kill('SIGTERM');
      const deadline = owned.kind === 'service' ? 15000 : 1500;
      const result = await within(owned.closed, deadline, () => undefined);
      if (result === undefined) {
        forceOwnedChild(owned.child);
        await within(owned.closed, 5000, () => {
          throw new ConsumerLaunchError('STOP_INCOMPLETE');
        });
        if (owned.kind === 'service') throw new ConsumerLaunchError('DRAIN_INCOMPLETE');
      } else if (owned.kind === 'service' && (result.code !== 0 || result.signal !== null))
        throw new ConsumerLaunchError('DRAIN_INCOMPLETE');
    })());
  const cancel = (signal) => {
    if (interrupted) return;
    interrupted = signal;
    void stopCurrent().catch(() => {});
  };
  const interrupt = () => cancel('SIGINT'),
    terminate = () => cancel('SIGTERM'),
    message = (value) => {
      if (value === 'ouro:shutdown') cancel('shutdown');
    },
    disconnect = () => cancel('disconnect');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  if (process.send) {
    process.on('message', message);
    process.once('disconnect', disconnect);
  }
  const startChild = (kind, args, cwd) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: kind === 'install' ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe', 'ipc'],
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    let ready, resolveReady;
    const announced = new Promise((resolve) => (resolveReady = resolve));
    const closed = new Promise((resolve) => {
      child.once('error', () => resolve({ code: 1, signal: null }));
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
    child.on('message', (value) => {
      if (value && typeof value === 'object') {
        if (value.type === 'ready' && !ready) {
          ready = value;
          resolveReady(value);
        } else if (
          value.type === 'diagnostic' &&
          ['HANDLER_FAILED', 'BACKGROUND_TASK_FAILED', 'SHUTDOWN_TIMED_OUT'].includes(value.code)
        )
          process.stderr.write('OURO_SERVICE_DIAGNOSTIC ' + value.code + '\n');
      }
    });
    current = { child, closed, kind, announced };
    stopping = undefined;
    return current;
  };
  try {
    if (options.controlStdin)
      detachControl = attachStdinControl(process.stdin, () => cancel('shutdown'));
    root = await admitConsumerEnvelope(root);
    let generation;
    if (options.mode !== 'start') {
      const npm = environment.npm_execpath;
      if (typeof npm !== 'string' || !path.isAbsolute(npm) || /[\u0000-\u001f\u007f]/.test(npm))
        throw new ConsumerLaunchError('NPM_ADMISSION');
      phase = 'SNAPSHOT';
      generation = await allocateGeneration(root);
      const snapshot = await snapshotGeneration(root, generation);
      if (interrupted) return signalCode(interrupted);
      process.stdout.write('Ouro: installing and building a fresh isolated generation.\n');
      phase = 'INSTALL';
      let owned = startChild('install', [npm, 'ci', '--include=dev'], generation.directory),
        outcome = await owned.closed;
      current = undefined;
      if (interrupted) {
        await stopping;
        return signalCode(interrupted);
      }
      if (outcome.code !== 0 || outcome.signal !== null) throw new ConsumerLaunchError(phase);
      phase = 'BUILD';
      owned = startChild(
        'build',
        [path.join(root, 'scripts/consumer-worker.mjs'), 'build', generation.id],
        root,
      );
      outcome = await owned.closed;
      current = undefined;
      if (interrupted) {
        await stopping;
        return signalCode(interrupted);
      }
      if (outcome.code !== 0 || outcome.signal !== null) throw new ConsumerLaunchError(phase);
      phase = 'PUBLICATION';
      await publishBuiltGeneration(root, generation, snapshot);
      if (options.mode === 'build') {
        process.stdout.write('Ouro: fresh build completed.\n');
        return 0;
      }
    } else {
      phase = 'BUILT_ADMISSION';
      generation = await readBuiltGeneration(root);
    }
    if (interrupted) return signalCode(interrupted);
    phase = 'START';
    const args = [
      path.join(root, 'scripts/consumer-worker.mjs'),
      'service',
      generation.id,
      String(startupPort),
    ];
    const owned = startChild('service', args, root);
    const announced = await within(
      Promise.race([
        owned.announced,
        owned.closed.then(() => {
          throw new ConsumerLaunchError('START');
        }),
      ]),
      30000,
      () => {
        throw new ConsumerLaunchError('READINESS');
      },
    );
    const url = new URL(announced.url);
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.protocol !== 'http:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new ConsumerLaunchError('READINESS');
    phase = 'READINESS';
    const health = await fetch(new URL('/api/health', url), { signal: AbortSignal.timeout(10000) }),
      ui = await fetch(new URL('/projects', url), {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      });
    if (
      health.status !== 200 ||
      ui.status !== 200 ||
      !(await ui.text()).includes('<div id="root"></div>')
    )
      throw new ConsumerLaunchError(phase);
    if (!interrupted) {
      process.stdout.write(
        'OURO_CONSUMER_READY ' +
          JSON.stringify({ url: url.origin, generation: generation.id }) +
          '\nOpen ' +
          url.origin +
          '/projects on this computer. Keep this terminal open; Ctrl+C stops Ouro.\n',
      );
      if (process.send) process.send({ type: 'ready', url: url.origin, generation: generation.id });
    }
    const outcome = await owned.closed;
    current = undefined;
    if (interrupted) {
      await stopping;
      return signalCode(interrupted);
    }
    if (outcome.code !== 0 || outcome.signal !== null) throw new ConsumerLaunchError('RUNTIME');
    return 0;
  } catch (error) {
    failure = error instanceof ConsumerLaunchError ? error : new ConsumerLaunchError(phase);
    throw failure;
  } finally {
    let cleanupFailure;
    try {
      detachControl();
    } catch {
      cleanupFailure = new ConsumerLaunchError('STOP_INCOMPLETE');
    }
    try {
      if (current) await stopCurrent();
    } catch (error) {
      cleanupFailure =
        error instanceof ConsumerLaunchError ? error : new ConsumerLaunchError('STOP_INCOMPLETE');
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
      process.removeListener('message', message);
      process.removeListener('disconnect', disconnect);
      if (process.connected) process.disconnect();
    }
    if (cleanupFailure) {
      if (failure) failure.cleanupIncomplete = true;
      else throw cleanupFailure;
    }
  }
}
