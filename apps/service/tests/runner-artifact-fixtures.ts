import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ProjectState } from '../../../packages/core/src';
import type { CommandResult } from '../../../lib/store';
import { runnerContract, servicePackageRoot, type runnerFixture } from './runner-fixtures.js';

export const artifactPreload = fileURLToPath(
  new URL('../dist/resources/verification/playwright-preload.mjs', import.meta.url),
);
const ownedRequire = createRequire(import.meta.url),
  entry = fileURLToPath(new URL('../dist/main.mjs', import.meta.url));
const headers = {
  Authorization: 'Bearer runner-artifact-human',
  'Content-Type': 'application/json',
};

/** Запускает собранный обычный Node child из временного cwd с собственным ограниченным environment. */
export async function launchRunnerArtifact(directory: string) {
  const environment: NodeJS.ProcessEnv = {
    PORT: '0',
    OURO_DATA_DIR: 'memory://',
    OURO_LOCAL_DEMO: '1',
    OURO_HUMAN_TOKEN: 'runner-artifact-human',
    OURO_VERIFICATION_RUNTIME_DIR: path.join(directory, 'snapshots'),
    NODE_OPTIONS: '--no-warnings',
    NODE_PATH: path.join(directory, 'untrusted-modules'),
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
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
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

/** Закрывает только принадлежащий fixture сервис и требует подтверждённого graceful exit. */
export async function stopRunnerArtifact(child: ChildProcess, exited: Promise<number | null>) {
  if (child.exitCode !== null) return;
  child.send('ouro:shutdown');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    assert.equal(
      await Promise.race([
        exited,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Artifact shutdown deadline')), 10000);
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

/** Получает настоящие Playwright test IDs с тем же packaged preload, не исполняя тесты. */
export async function listRunnerTests(fixture: Awaited<ReturnType<typeof runnerFixture>>) {
  const preload = pathToFileURL(artifactPreload);
  preload.searchParams.set(
    'package',
    pathToFileURL(path.join(servicePackageRoot, 'package.json')).href,
  );
  const cli = ownedRequire.resolve('@playwright/test/cli');
  const child = spawn(
    process.execPath,
    [
      '--import',
      preload.href,
      cli,
      'test',
      '--config',
      path.join(fixture.workspace, fixture.observation.playwrightConfigPath),
      '--list',
      '--reporter=json',
    ],
    {
      cwd: fixture.parent,
      windowsHide: true,
      env: Object.fromEntries(
        [
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
        ].flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]!]])),
      ),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '',
    stderr = '';
  child.stdout!.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr!.on('data', (chunk) => {
    stderr += String(chunk);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const code = await Promise.race([
      new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          child.kill();
          reject(new Error('Playwright list deadline'));
        }, 10000);
      }),
    ]);
    assert.equal(code, 0, stderr);
  } finally {
    if (timer) clearTimeout(timer);
  }
  type Suite = { specs?: { id: string }[]; suites?: Suite[] };
  const report = JSON.parse(stdout) as { suites: Suite[] },
    pending = [...report.suites],
    ids: string[] = [];
  while (pending.length) {
    const suite = pending.pop()!;
    pending.push(...(suite.suites ?? []));
    ids.push(...(suite.specs ?? []).map((spec) => spec.id));
  }
  assert.equal(ids.length, 1);
  return ids;
}

/** Проходит существующие HTTP/MCP guards до реального наблюдения и запуска выделенной проверки. */
export async function runArtifactVerification(
  url: string,
  fixture: Awaited<ReturnType<typeof runnerFixture>>,
  testIds: string[],
) {
  const request = async <T>(resource: string, body?: unknown) => {
    const response = await fetch(url + resource, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    assert(response.ok, response.status + ': ' + text);
    return JSON.parse(text) as T;
  };
  const created = await request<{ project: { id: string } }>('/api/projects', {
      requestId: randomUUID(),
      name: 'Packaged runner fixture',
      rootPath: fixture.workspace,
    }),
    projectId = created.project.id,
    base = '/api/projects/' + projectId;
  const state = async () => (await request<{ state: ProjectState }>(base)).state;
  const send = async (body: Record<string, unknown>) =>
    request<CommandResult>(base + '/commands', {
      ...body,
      requestId: randomUUID(),
      expectedVersion: (await state()).version,
    });
  const content = {
    title: 'Synthetic arithmetic',
    goal: 'Qualify owned package resolution',
    dod: [{ id: 'sum', text: 'The sum and worker checks pass', required: true }],
    constraints: '',
    assumptions: '',
    risks: '',
    inputs: '',
    comment: '',
  };
  let result = await send({ type: 'createSpec', content });
  const product = result.state.specs.at(-1)!,
    productRevision = result.state.revisions.at(-1)!;
  await send({ type: 'activateRevision', specId: product.id, revisionId: productRevision.id });
  const verification = {
    ...runnerContract(testIds),
    targetSpecId: product.id,
    targetRevisionId: productRevision.id,
  };
  result = await send({
    type: 'createSpec',
    content: { ...content, title: 'Owned runner verification', verification },
  });
  const spec = result.state.specs.at(-1)!,
    revision = result.state.revisions.at(-1)!;
  await send({ type: 'activateRevision', specId: spec.id, revisionId: revision.id });
  const registration = await request<{ agent: { id: string }; token: string }>(base + '/agents', {
    name: 'Synthetic runner agent',
  });
  result = await send({
    type: 'startExecution',
    specId: spec.id,
    specRevisionId: revision.id,
    agentId: registration.agent.id,
  });
  const execution = result.state.executions.at(-1)!;
  const client = new Client({ name: 'runner-artifact-fixture', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url + base + '/mcp'), {
        requestInit: { headers: { Authorization: 'Bearer ' + registration.token } },
      }),
    );
    const ack = await client.callTool({
      name: 'ouro.confirm_started',
      arguments: {
        executionId: execution.id,
        requestId: randomUUID(),
        expectedVersion: (await state()).version,
      },
    });
    assert.notEqual(ack.isError, true, JSON.stringify(ack));
  } finally {
    await client.close();
  }
  await request<CommandResult>(base + '/verification/observe', {
    requestId: randomUUID(),
    expectedVersion: (await state()).version,
    verificationRevisionId: revision.id,
    config: fixture.observation,
    reason: 'Explicit synthetic fixture manifest',
  });
  const body = {
    requestId: randomUUID(),
    expectedVersion: (await state()).version,
    executionId: execution.id,
    scopeCaseIds: ['case-0'],
  };
  const first = await request<CommandResult>(base + '/verification/run', body),
    run = first.state.verificationRuns.at(-1)!;
  assert.equal(run.outcome, 'passed');
  assert.equal(run.source.kind, 'local_runner');
  if (run.source.kind !== 'local_runner') assert.fail();
  assert.equal(run.source.exitCode, 0);
  assert.equal(run.source.inputStability, 'unchanged');
  const witness = await readFile(fixture.witness, 'utf8'),
    replayed = await request<CommandResult>(base + '/verification/run', body);
  assert.equal(replayed.replayed, true);
  assert.deepEqual(replayed.events, first.events);
  assert.equal(
    await readFile(fixture.witness, 'utf8'),
    witness,
    'exact recovery never starts another worker',
  );
  assert.deepEqual(replayed.state.verificationRuns, [run]);
  await fixture.assertUnchanged();
  return {
    witness: JSON.parse(witness.trim()) as {
      pid: number;
      execArgv: string[];
      cwd: string;
      worker: string;
    },
    run,
  };
}
