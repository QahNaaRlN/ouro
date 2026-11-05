import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { access, mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateNodeVersion } from '../../../scripts/runtime-node.mjs';

export const serviceWebRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const serviceWebEntry = path.join(serviceWebRoot, 'apps/service/dist/main.mjs');
export const serviceWebStaticRoot = path.join(serviceWebRoot, 'apps/web/dist');
export const serviceWebHumanToken = 'owned-service-web-fixture-human';
type Exit = { code: number | null; signal: NodeJS.Signals | null };
/** Принадлежащий fixture ordinary Node child; shutdown успех означает подтверждённый graceful close. */
export type RunningServiceWeb = {
  url: string;
  child: ChildProcess;
  closed: Promise<Exit>;
  stop: () => Promise<void>;
};

/** Ограничивает ожидание, сохраняя завершение операции отдельным наблюдаемым фактом. */
async function bounded<T>(pending: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Завершает только известный child/group после неуспешного graceful deadline. */
async function forceOwned(child: ChildProcess, closed: Promise<Exit>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!child.pid) throw new Error('Owned fixture child identity is unavailable.');
  if (process.platform === 'win32') {
    const executable = path.join(
      process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows',
      'System32',
      'taskkill.exe',
    );
    await bounded(
      new Promise<void>((resolve) => {
        const killer = spawn(executable, ['/PID', String(child.pid), '/T', '/F'], {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.once('error', () => {
          child.kill('SIGKILL');
          resolve();
        });
        killer.once('close', () => resolve());
      }),
      5000,
      'Owned fixture termination deadline',
    );
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
  await bounded(closed, 5000, 'Owned fixture process did not close after termination');
}

/** Создаёт только собственные temp profile/cwd; dependencies остаются в source install. */
export async function createServiceWebFixture(port = 0) {
  validateNodeVersion(process.versions.node);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
    throw new Error('Invalid fixture port.');
  await Promise.all([
    access(serviceWebEntry),
    access(path.join(serviceWebStaticRoot, 'index.html')),
  ]);
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-service-web-')),
    foreign = path.join(directory, 'foreign cwd & данные'),
    workspace = path.join(directory, 'workspace'),
    profile = path.join(directory, 'postgres');
  await mkdir(foreign);
  await mkdir(workspace);
  let active: RunningServiceWeb | undefined;
  const start = async (): Promise<RunningServiceWeb> => {
    if (active) throw new Error('The fixture already owns a service.');
    const environment: NodeJS.ProcessEnv = {
      PORT: String(port),
      OURO_SERVICE_HOST: '127.0.0.1',
      OURO_STATIC_ROOT: serviceWebStaticRoot,
      OURO_DATA_DIR: profile,
      OURO_VERIFICATION_RUNTIME_DIR: path.join(directory, 'verification'),
      OURO_LOCAL_DEMO: '1',
      OURO_HUMAN_TOKEN: serviceWebHumanToken,
      OURO_SHUTDOWN_TIMEOUT_MS: '10000',
    };
    for (const name of [
      'PATH',
      'SystemRoot',
      'WINDIR',
      'COMSPEC',
      'PATHEXT',
      'TEMP',
      'TMP',
      'USERPROFILE',
      'HOME',
      'LOCALAPPDATA',
      'APPDATA',
    ])
      if (process.env[name]) environment[name] = process.env[name];
    const child = spawn(process.execPath, [serviceWebEntry], {
      cwd: foreign,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    const closed = new Promise<Exit>((resolve) =>
      child.once('close', (code, signal) => resolve({ code, signal })),
    );
    let stderr = '',
      stdout = '',
      stopping: Promise<void> | undefined;
    child.stderr!.on('data', (chunk) => {
      stderr = (stderr + String(chunk)).slice(-32000);
    });
    const stop = () =>
      (stopping ??= (async () => {
        if (child.connected && child.send) child.send('ouro:shutdown', () => {});
        let exit: Exit;
        try {
          exit = await bounded(closed, 15000, 'Graceful service web shutdown deadline');
        } catch (error) {
          await forceOwned(child, closed);
          throw error;
        }
        if (exit.code !== 0 || exit.signal !== null)
          throw new Error('Service web child did not confirm graceful shutdown.');
      })());
    const readiness = new Promise<string>((resolve, reject) => {
      child.once('error', () => reject(new Error('Service web artifact could not start.')));
      child.stdout!.on('data', (chunk) => {
        stdout = (stdout + String(chunk)).slice(-32000);
        const match = stdout.match(/^OURO_SERVICE_READY (\{[^\r\n]+\})\r?$/m);
        if (!match) return;
        try {
          const data: unknown = JSON.parse(match[1]);
          if (!data || typeof data !== 'object' || !('url' in data) || typeof data.url !== 'string')
            throw new Error();
          const url = new URL(data.url);
          if (
            url.protocol !== 'http:' ||
            url.hostname !== '127.0.0.1' ||
            url.username ||
            url.password ||
            url.pathname !== '/' ||
            url.search ||
            url.hash ||
            (port && Number(url.port) !== port)
          )
            throw new Error();
          resolve(url.origin);
        } catch {
          reject(new Error('Invalid owned service readiness.'));
        }
      });
      void closed.then((exit) =>
        reject(
          new Error(
            'Service web artifact exited before readiness: ' + String(exit.code) + ' ' + stderr,
          ),
        ),
      );
    });
    active = { url: '', child, closed, stop };
    try {
      const url = await bounded(readiness, 20000, 'Service web artifact readiness deadline');
      const health = await fetch(url + '/api/health', { signal: AbortSignal.timeout(5000) });
      assert.equal(health.status, 200);
      assert.equal(((await health.json()) as { status: string }).status, 'ok');
      const ui = await fetch(url + '/projects', {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(ui.status, 200);
      assert.match(ui.headers.get('content-type') ?? '', /^text\/html/);
      assert((await ui.text()).includes('<div id="root"></div>'));
      const running = active;
      running.url = url;
      return running;
    } catch (error) {
      try {
        if (child.exitCode === null && child.signalCode === null) await stop();
      } finally {
        if (child.exitCode !== null || child.signalCode !== null) active = undefined;
      }
      throw error;
    }
  };
  return {
    directory,
    foreign,
    workspace,
    profile,
    start,
    async stop() {
      const running = active;
      if (!running) return;
      try {
        await running.stop();
      } finally {
        if (running.child.exitCode !== null || running.child.signalCode !== null)
          active = undefined;
      }
    },
    async close() {
      const running = active;
      try {
        await running?.stop();
      } finally {
        if (running && running.child.exitCode === null && running.child.signalCode === null)
          throw new Error('Refused cleanup while the owned child is alive.');
        if (
          path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
          !path.basename(directory).startsWith('ouro-service-web-')
        )
          throw new Error('Refused cleanup outside owned temporary fixture.');
        active = undefined;
        await rm(path.resolve(directory), { recursive: true, force: true });
      }
    },
  };
}
