import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  parseConsumerArguments,
  attachStdinControl,
} from '../scripts/consumer-delivery/consumer-owner.mjs';

test('CGL11 public arguments preserve launch port precedence and reject unrecognized input', () => {
  assert.deepEqual(parseConsumerArguments(['launch']), {
    mode: 'launch',
    help: false,
    port: 3000,
    controlStdin: false,
  });
  assert.equal(parseConsumerArguments(['start']).port, undefined);
  assert.deepEqual(parseConsumerArguments(['launch', '--control-stdin', '--port', '4319']), {
    mode: 'launch',
    help: false,
    port: 4319,
    controlStdin: true,
  });
  for (const argv of [
    ['launch', '--port', '0'],
    ['launch', '--port', '65536'],
    ['start', '--port', 'PRIVATE3000'],
    ['launch', '--port', '3000;PRIVATE'],
    ['launch', '--port'],
    ['launch', '--port', '3000', '--port', '3001'],
    ['launch', '--control-stdin', '--control-stdin'],
    ['build', '--control-stdin'],
    ['build', '--port', '3000'],
    ['start', 'PRIVATE'],
    ['unknown'],
  ])
    assert.throws(
      () => parseConsumerArguments(argv),
      (error) => error instanceof Error && !error.message.includes('PRIVATE'),
    );
});

test('CGL12 explicit stdin control ignores unknown/oversize lines, admits exact split line once and detaches', () => {
  const stream = new PassThrough();
  let stopped = 0;
  const close = attachStdinControl(stream, () => stopped++);
  stream.write('unknown\n');
  stream.write('x'.repeat(10000) + 'ouro:shutdown\n');
  assert.equal(stopped, 0);
  stream.write('ouro:shut');
  stream.write('down\r\n');
  assert.equal(stopped, 1);
  stream.write('ouro:shutdown\n');
  assert.equal(stopped, 1);
  assert.equal(stream.listenerCount('data'), 0);
  close();
  stream.destroy();
});

test('CGL13 stdin EOF or an unfinished line never implies shutdown', async () => {
  for (const input of ['', 'ouro:shutdown', 'unknown\n']) {
    const stream = new PassThrough();
    let stopped = 0;
    const close = attachStdinControl(stream, () => stopped++);
    stream.end(input);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stopped, 0);
    assert.equal(stream.listenerCount('data'), 0);
    close();
    stream.destroy();
  }
});

test('CGL14 actual unsupported Node rejects outer entry before missing envelope/config/npm reads', (context) => {
  const executable =
    process.env.OURO_TEST_UNSUPPORTED_NODE ??
    (process.platform === 'win32'
      ? path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs/node.exe')
      : undefined);
  if (!executable) {
    context.skip(
      'Separate unsupported executable unavailable; runtime range remains covered by existing matrix.',
    );
    return;
  }
  const version = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 10000,
  });
  if (version.error && 'code' in version.error && version.error.code === 'ENOENT') {
    context.skip('Separate unsupported executable unavailable.');
    return;
  }
  assert.equal(version.status, 0);
  if (!version.stdout.startsWith('v23.')) {
    context.skip('Separate executable is no longer the characterized Node23 witness.');
    return;
  }
  const entry = fileURLToPath(new URL('../scripts/consumer-launch.mjs', import.meta.url)),
    result = spawnSync(executable, [entry, 'launch'], {
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      timeout: 10000,
      env: { ...process.env, npm_execpath: undefined },
    });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /NODE_RUNTIME_UNSUPPORTED/);
  assert.equal(result.stderr.includes('CONSUMER_LAUNCH_FAILED'), false);
  assert.equal(result.stdout, '');
});

test(
  'CGL16 actual owned control pipe releases the process after shutdown without requiring parent EOF',
  { timeout: 7000 },
  async () => {
    const helper = pathToFileURL(
        fileURLToPath(new URL('../scripts/consumer-delivery/consumer-owner.mjs', import.meta.url)),
      ).href,
      source = `const{attachStdinControl}=await import(${JSON.stringify(helper)});attachStdinControl(process.stdin,()=>process.stdout.write('STOPPED\\n'));process.stdout.write('READY\\n');`,
      child = spawn(process.execPath, ['--input-type=module', '-e', source], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
    let output = '',
      exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', () => {});
    const closed = new Promise<void>((resolve) =>
      child.once('close', (code, signal) => {
        exit = { code, signal };
        resolve();
      }),
    );
    try {
      const ready = Date.now() + 2000;
      while (!output.includes('READY') && Date.now() < ready)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert(output.includes('READY'));
      child.stdin.write('ouro:shutdown\n');
      const end = Date.now() + 2500;
      while (!exit && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 10));
      assert(output.includes('STOPPED'));
      assert.deepEqual(exit, { code: 0, signal: null });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await closed;
    }
  },
);
