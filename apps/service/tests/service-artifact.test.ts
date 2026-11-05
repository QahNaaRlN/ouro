import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tcpRequest } from './http-fixtures.js';
const entry = fileURLToPath(new URL('../dist/main.mjs', import.meta.url));

/** Ожидает реальную readiness ordinary Node child без tsx/Next и без унаследованных credentials. */
async function launch(directory: string) {
  const environment: NodeJS.ProcessEnv = {
    PORT: '0',
    OURO_DATA_DIR: path.join(directory, 'postgres'),
    OURO_LOCAL_DEMO: '1',
    OURO_HUMAN_TOKEN: 'artifact-fixture-human',
  };
  for (const name of [
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
  ])
    if (process.env[name]) environment[name] = process.env[name];
  const child = spawn(process.execPath, [entry], {
    cwd: directory,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr!.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  const ready = new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
      () => reject(new Error('Artifact readiness deadline: ' + stderr)),
      10000,
    );
    child.stdout!.on('data', (chunk) => {
      output += String(chunk);
      const match = output.match(/OURO_SERVICE_READY (\{[^\n]+\})/);
      if (match) {
        clearTimeout(timer);
        resolve((JSON.parse(match[1]) as { url: string }).url);
      }
    });
    void exited.then((code) => {
      clearTimeout(timer);
      reject(new Error('Artifact exited ' + code + ': ' + stderr));
    }, reject);
  });
  try {
    return { child, url: await ready, exited };
  } catch (error) {
    child.kill();
    await exited;
    throw error;
  }
}

/** Просит принадлежащий тесту процесс штатно завершиться через bounded IPC lifecycle. */
async function stop(child: ChildProcess, exited: Promise<number | null>) {
  if (child.exitCode !== null) return;
  child.send('ouro:shutdown');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    assert.equal(
      await Promise.race([
        exited,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Artifact graceful shutdown deadline exceeded')),
            10000,
          );
        }),
      ]),
      0,
    );
  } finally {
    if (timer) clearTimeout(timer);
    if (child.exitCode === null) {
      child.kill();
      await exited;
    }
  }
}

test('built ordinary Node artifact starts outside source cwd and preserves file SQL receipts on restart', async () => {
  await access(entry);
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-service-artifact-'));
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    running = await launch(directory);
    const headers = {
      Authorization: 'Bearer artifact-fixture-human',
      'Content-Type': 'application/json',
    };
    assert.equal((await tcpRequest(running.url + '/api/health')).status, 200);
    const connections = JSON.parse(
      (await tcpRequest(running.url + '/api/agents', 'GET', [], headers)).body.toString(),
    ) as { connection: { stdioArgs: string[] } };
    await access(connections.connection.stdioArgs[0]);
    assert(connections.connection.stdioArgs[0].includes(path.join('dist', 'resources', 'mcp')));
    const registered = await tcpRequest(
      running.url + '/api/agents',
      'POST',
      [Buffer.from(JSON.stringify({ name: 'Built bridge fixture' }))],
      headers,
    );
    assert.equal(registered.status, 201);
    const token = (JSON.parse(registered.body.toString()) as { token: string }).token,
      client = new Client({ name: 'built-stdio-fixture', version: '1' });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: connections.connection.stdioArgs,
          cwd: directory,
          env: {
            OURO_URL: running.url + '/api/mcp',
            OURO_AGENT_TOKEN: token,
            ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
          },
        }),
      );
      assert((await client.listTools()).tools.length > 0);
    } finally {
      await client.close();
    }
    const current = JSON.parse(
      (await tcpRequest(running.url + '/api/project', 'GET', [], headers)).body.toString(),
    ) as { state: { version: number } };
    const command = {
      type: 'createSpec',
      requestId: randomUUID(),
      expectedVersion: current.state.version,
      content: {
        title: 'Artifact restart fixture',
        goal: 'Keep exact SQL receipts',
        dod: [{ id: 'one', text: 'Restored', required: true }],
        constraints: '',
        assumptions: '',
        risks: '',
        inputs: '',
        comment: '',
      },
    };
    const first = await tcpRequest(
      running.url + '/api/commands',
      'POST',
      [Buffer.from(JSON.stringify(command))],
      headers,
    );
    assert.equal(first.status, 200, first.body.toString());
    await stop(running.child, running.exited);
    running = undefined;
    await access(path.join(directory, 'postgres.ouro-profile-mutex.sqlite'));
    running = await launch(directory);
    const replay = await tcpRequest(
      running.url + '/api/commands',
      'POST',
      [Buffer.from(JSON.stringify(command))],
      headers,
    );
    assert.equal(replay.status, 200);
    assert.equal((JSON.parse(replay.body.toString()) as { replayed: boolean }).replayed, true);
    assert.deepEqual(
      (JSON.parse(replay.body.toString()) as { events: unknown[] }).events,
      (JSON.parse(first.body.toString()) as { events: unknown[] }).events,
    );
    const manifest = JSON.parse(
      await readFile(new URL('../dist/build-manifest.json', import.meta.url), 'utf8'),
    ) as { inputs: string[] };
    assert.equal(
      manifest.inputs.some(
        (file) => file.includes('node_modules/next/') || file.includes('app/api/'),
      ),
      false,
    );
  } finally {
    if (running) await stop(running.child, running.exited);
    await rm(directory, { recursive: true, force: true });
  }
});

test('OS ownership excludes a second process and releases after unclean child termination', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-service-crash-'));
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    running = await launch(directory);
    await assert.rejects(launch(directory), /Artifact exited/);
    running.child.kill();
    await running.exited;
    running = undefined;
    running = await launch(directory);
    assert.equal((await tcpRequest(running.url + '/api/health')).status, 200);
  } finally {
    if (running) await stop(running.child, running.exited);
    await rm(directory, { recursive: true, force: true });
  }
});
