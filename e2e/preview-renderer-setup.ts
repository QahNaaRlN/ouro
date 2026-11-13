import { spawn, type ChildProcess } from 'node:child_process';
import type { FullConfig } from '@playwright/test';
import { resolve, join, dirname } from 'node:path';

/** Владеет двумя прямыми Node children; Windows teardown не зависит от shell/taskkill обёртки. */
export default async function previewRendererSetup(config: FullConfig) {
  if (!config.configFile) throw new Error('Owned preview configuration path is required.');
  const root = dirname(config.configFile),
    functional = config.metadata.previewFunctional === true,
    profile = resolve(
      root,
      '.operations',
      functional ? 'preview-functional-profile' : 'preview-profile',
    );
  const keys = [
    'PATH',
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'HOME',
    'LOCALAPPDATA',
    'APPDATA',
  ];
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    ...Object.fromEntries(
      keys.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]!]])),
    ),
  };
  const owned: { child: ChildProcess; closed: Promise<void>; failure?: Error }[] = [];
  const start = (args: string[], cwd: string, env: Readonly<Record<string, string>>) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...environment, ...env },
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    const state: { child: ChildProcess; closed: Promise<void>; failure?: Error } = {
      child,
      closed: new Promise((done) => child.once('close', () => done())),
    };
    child.once(
      'error',
      () => (state.failure = new Error('Owned renderer process could not start.')),
    );
    child.stderr?.resume();
    owned.push(state);
    return state;
  };
  const ready = async (url: string, state: (typeof owned)[number]) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (state.failure || state.child.exitCode !== null || state.child.signalCode !== null)
        throw new Error('Owned renderer stopped before readiness.');
      try {
        if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return;
      } catch {}
      await new Promise((done) => setTimeout(done, 30));
    }
    throw new Error('Owned renderer readiness deadline.');
  };
  const waitClosed = async (closed: Promise<void>, milliseconds: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        closed,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Owned renderer shutdown deadline.')),
            milliseconds,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const stop = async () => {
    let failed = false;
    for (const { child, closed } of owned.toReversed()) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      try {
        await waitClosed(closed, 10000);
      } catch {
        failed = true;
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        try {
          await waitClosed(closed, 5000);
        } catch {}
      }
    }
    if (failed) throw new Error('Owned renderer required forced shutdown.');
  };
  try {
    const api = start([join(root, 'scripts/local-next.mjs'), 'start', '--port', '3452'], root, {
      NODE_ENV: 'production',
      OURO_DATA_DIR: profile,
      OURO_LOCAL_DEMO: '1',
    });
    await ready('http://127.0.0.1:3452/api/health', api);
    if (!functional) {
      const web = start(
        [
          join(root, 'apps/web/node_modules/vite/bin/vite.js'),
          '--host',
          '127.0.0.1',
          '--port',
          '3453',
          '--strictPort',
        ],
        join(root, 'apps/web'),
        { NODE_ENV: 'development', OURO_WEB_API_ORIGIN: 'http://127.0.0.1:3452' },
      );
      await ready('http://127.0.0.1:3453/tests/fixtures/preview-presentation.html', web);
    }
    return stop;
  } catch (error) {
    await stop();
    throw error;
  }
}
