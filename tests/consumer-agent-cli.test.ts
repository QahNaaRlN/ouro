import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, lstat, readdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { materializeConsumerEnvelope } from '../scripts/consumer-delivery/materialize-envelope.mjs';
import { prepareLegacyAgentCli } from './fixtures/consumer-delivery/legacy-agent-cli.mjs';
import { validateNodeVersion } from '../scripts/runtime-node.mjs';

const source = fileURLToPath(new URL('../', import.meta.url)),
  project = '11111111-1111-4111-8111-111111111111',
  secret = 'OWN_CLI_CREDENTIAL_SENTINEL',
  key = 'agent key & данные.txt';
const keys = [
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'TEMP',
  'TMP',
  'PATH',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
];
const environment: NodeJS.ProcessEnv = {
  ...Object.fromEntries(
    keys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]),
  ),
  NODE_ENV: 'production',
};
let directory: string, foreign: string, envelope: string, url: string, legacy: string;
const activeServers = new Set<Server>(),
  calls: string[] = [];
let http: ReturnType<typeof createServer>;

/** Проверяет только отсутствие app build/profile; protocol dist является отдельным dependency input. */
async function noApplicationBuild(root: string) {
  for (const relative of ['.next', 'apps/web/dist', 'apps/service/dist', '.ouro'])
    await assert.rejects(
      () => lstat(path.join(root, relative)),
      (error) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT',
    );
}

/** Запускает literal argv без shell; HTTP fixture остаётся в event loop родителя. */
async function command(entry: string, args: string[], env: NodeJS.ProcessEnv, loader?: string) {
  const child = spawn(process.execPath, [...(loader ? ['--import', loader] : []), entry, ...args], {
    cwd: foreign,
    env,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (chunk) => (stdout += String(chunk)));
  child.stderr.on('data', (chunk) => (stderr += String(chunk)));
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        child.kill('SIGKILL');
      }, 15000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        if (expired)
          reject(Error('Owned CLI child deadline ' + (stdout ? 'AFTER_STDOUT' : 'BEFORE_STDOUT')));
        else resolve({ code, signal });
      });
    },
  );
  return { ...result, stdout, stderr };
}

/** Использует настоящий SDK transport и synthetic project credential без store/frontend. */
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'ouro-agent-cli-'));
  foreign = path.join(directory, 'foreign cwd & данные');
  envelope = path.join(directory, 'consumer envelope');
  await mkdir(foreign);
  await writeFile(path.join(foreign, key), secret + '\n');
  http = createServer(async (req, res) => {
    if (
      req.url !== '/api/projects/' + project + '/mcp' ||
      req.headers.authorization !== 'Bearer ' + secret
    ) {
      res.writeHead(403).end();
      return;
    }
    const server = new Server(
      { name: 'owned-cli-remote', version: '1' },
      { capabilities: { tools: {}, resources: {} } },
    );
    activeServers.add(server);
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'ouro.get_context',
          description: 'Synthetic read-only context',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      calls.push(request.params.name);
      return {
        content: [{ type: 'text', text: 'owned fixture' }],
        structuredContent: {
          agent: { id: 'own-agent', name: 'Owned CLI fixture' },
          work: [{ id: 'own-work' }],
          cursor: 7,
        },
      };
    });
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [{ uri: 'ouro://protocol/manifest', name: 'owned manifest' }],
    }));
    server.setRequestHandler(ReadResourceRequestSchema, async () => ({
      contents: [{ uri: 'ouro://protocol/manifest', text: '{"fixture":true}' }],
    }));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.once('close', () => {
      void server.close().finally(() => activeServers.delete(server));
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  assert(address && typeof address !== 'string');
  url = 'http://127.0.0.1:' + address.port + '/api/projects/' + project + '/mcp';
  const npmCli = process.env.npm_execpath;
  assert(npmCli);
  legacy = path.join(directory, 'legacy oracle');
  await prepareLegacyAgentCli({ repository: source, directory: legacy, npmCli });
  const candidateCommit = execFileSync(
    'git',
    ['--no-replace-objects', '-C', source, 'rev-parse', 'HEAD'],
    { encoding: 'utf8', windowsHide: true, shell: false },
  ).trim();
  await materializeConsumerEnvelope({
    repository: source,
    ref: candidateCommit,
    outputDirectory: envelope,
    npmCli,
  });
  await noApplicationBuild(legacy);
  await noApplicationBuild(envelope);
  await noApplicationBuild(path.join(envelope, 'source'));
  await assert.rejects(
    () => lstat(path.join(envelope, '.ouro-runtime')),
    (error) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT',
  );
  process.stderr.write('CLI candidate committed input: ' + candidateCommit + '\n');
});

after(async () => {
  for (const server of activeServers) await server.close();
  http?.closeAllConnections();
  if (http) await new Promise<void>((resolve) => http.close(() => resolve()));
  process.stderr.write('Retained own CLI characterization fixture: ' + directory + '\n');
});

test('CCA01 original config CLI works before app build and preserves exact JSON/flags/privacy', async () => {
  const common = [
    '--project-id',
    project,
    '--url',
    url,
    '--key-file',
    'C:/private/ключ & agent.txt',
  ];
  for (const client of ['cursor', 'claude-code', 'claude-desktop', 'chatgpt']) {
    const result = await command(
      path.join(legacy, 'scripts/agent-config.ts'),
      ['--client', client, ...common],
      { ...environment, OURO_AGENT_TOKEN: secret },
      pathToFileURL(path.join(legacy, 'node_modules/tsx/dist/loader.mjs')).href,
    );
    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(result.stdout, JSON.stringify(parsed, null, 2) + '\n');
    assert.equal(parsed.mcpServers['ouro-' + project].env.OURO_AGENT_TOKEN_FILE, common.at(-1));
    assert.deepEqual(parsed.mcpServers['ouro-' + project].args, [
      path.join(legacy, 'packages/mcp/bin/ouro-mcp.mjs'),
    ]);
    assert(!result.stdout.includes(secret));
  }
  const entry = await command(
    path.join(legacy, 'scripts/agent-config.ts'),
    ['--client', 'claude-code', ...common, '--entry'],
    environment,
    pathToFileURL(path.join(legacy, 'node_modules/tsx/dist/loader.mjs')).href,
  );
  assert.equal(entry.code, 0, entry.stderr);
  assert.equal(JSON.parse(entry.stdout).type, 'stdio');
  assert(!entry.stdout.includes('mcpServers'));
  await noApplicationBuild(legacy);
  assert.deepEqual(await readdir(foreign), [key]);
});

test('CCA02 original checker reaches independent SDK server with caller-relative key before app build', async () => {
  const result = await command(path.join(legacy, 'scripts/check-agent.mjs'), [], {
    ...environment,
    OURO_URL: url,
    OURO_AGENT_TOKEN_FILE: key,
  });
  assert.deepEqual(
    { code: result.code, signal: result.signal },
    { code: 0, signal: null },
    result.stderr,
  );
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed, {
    connected: true,
    server: 'ouro',
    tools: ['ouro.get_context'],
    agent: { id: 'own-agent', name: 'Owned CLI fixture' },
    assignments: 1,
    cursor: 7,
  });
  assert.equal(result.stdout, JSON.stringify(parsed, null, 2) + '\n');
  assert(!result.stdout.includes(secret));
  assert(!result.stderr.includes(secret));
  assert(calls.includes('ouro.get_context'));
  await noApplicationBuild(legacy);
});

/** Проверяет настоящий stdio protocol, а не только успешный child exit. */
async function bridge(entry: string, args: string[] = []) {
  const client = new Client({ name: 'owned-cli-consumer', version: '1' }),
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry, ...args],
      cwd: foreign,
      env: {
        ...Object.fromEntries(
          Object.entries(environment).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
        OURO_URL: url,
        OURO_AGENT_TOKEN_FILE: key,
      },
      stderr: 'pipe',
    });
  let diagnostic = '';
  transport.stderr?.on('data', (chunk) => (diagnostic += String(chunk)));
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools[0].name, 'ouro.get_context');
    assert.equal((await client.listResources()).resources[0].uri, 'ouro://protocol/manifest');
    assert.notEqual(
      (await client.callTool({ name: 'ouro.get_context', arguments: {} })).isError,
      true,
    );
  } finally {
    await client.close();
    assert(!diagnostic.includes(secret));
    assert(
      !diagnostic.includes('ERR_MODULE_NOT_FOUND'),
      'A dependency failure is not contract RED',
    );
  }
}

test('CCA03 original manual MCP works before local frontend/service build', async () => {
  await bridge(path.join(legacy, 'packages/mcp/bin/ouro-mcp.mjs'));
  await noApplicationBuild(legacy);
});

test('CCA04 existing credential ambiguity and invalid selector stay fail-closed without leaking values', async () => {
  const denied = await command(path.join(legacy, 'scripts/check-agent.mjs'), [], {
    ...environment,
    OURO_URL: url,
    OURO_AGENT_TOKEN: secret,
    OURO_AGENT_TOKEN_FILE: key,
  });
  assert.equal(denied.code, 1);
  assert.equal(denied.stdout, '');
  assert(!denied.stderr.includes(secret));
  const invalid = await command(
    path.join(envelope, 'packages/mcp/bin/ouro-mcp.mjs'),
    ['--generation', 'invalid-private-selector'],
    { ...environment, OURO_URL: url, OURO_AGENT_TOKEN_FILE: key },
  );
  assert.equal(invalid.code, 1);
  assert(!invalid.stderr.includes('invalid-private-selector'));
  assert(!invalid.stderr.includes(secret));
  await noApplicationBuild(envelope);
});

test('CCA05 consumer manual MCP retains the same valid before-build connection', async () => {
  await bridge(path.join(envelope, 'packages/mcp/bin/ouro-mcp.mjs'));
  await noApplicationBuild(envelope);
});

test('CCA06 consumer exposes config without frontend build or credential file reads', () => {
  const result = spawnSync(
    process.execPath,
    [
      process.env.npm_execpath!,
      '--prefix',
      envelope,
      'run',
      '--silent',
      'agent:config',
      '--',
      '--client',
      'cursor',
      '--project-id',
      project,
      '--url',
      url,
      '--key-file',
      'C:/private/nonexistent.key',
    ],
    {
      cwd: foreign,
      env: environment,
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      timeout: 15000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    JSON.parse(result.stdout).mcpServers['ouro-' + project].env.OURO_AGENT_TOKEN_FILE,
    'C:/private/nonexistent.key',
  );
});

test('CCA07 consumer exposes checker before frontend build', async () => {
  const result = await command(
    process.env.npm_execpath!,
    ['--prefix', envelope, 'run', '--silent', 'agent:check'],
    { ...environment, OURO_URL: url, OURO_AGENT_TOKEN_FILE: path.join(foreign, key) },
  );
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).connected, true);
  assert(!result.stdout.includes(secret));
});

test('CCA08 direct installed checker retains caller-relative credential file and safe ambiguity failure', async () => {
  const entry = path.join(envelope, 'scripts/check-agent.mjs'),
    result = await command(entry, [], {
      ...environment,
      OURO_URL: url,
      OURO_AGENT_TOKEN_FILE: key,
    });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).connected, true);
  assert(!result.stdout.includes(secret));
  const denied = await command(entry, [], {
    ...environment,
    OURO_URL: url,
    OURO_AGENT_TOKEN_FILE: key,
    OURO_AGENT_TOKEN: secret,
  });
  assert.equal(denied.code, 1);
  assert.equal(denied.stdout, '');
  assert(!denied.stderr.includes(secret));
  await noApplicationBuild(envelope);
});

test('CCA09 explicit valid-missing or tampered selection never falls back to valid manual supplement', async () => {
  const id = 'g-00000000-0000-0000-0000-000000000001',
    entry = path.join(envelope, 'packages/mcp/bin/ouro-mcp.mjs');
  const before = calls.length;
  const missing = await command(entry, ['--generation', id, '--help'], {
    ...environment,
    OURO_URL: url,
    OURO_AGENT_TOKEN_FILE: key,
  });
  assert.equal(missing.code, 1);
  assert.equal(missing.stdout, '');
  await mkdir(path.join(envelope, '.ouro-runtime/generations', id), { recursive: true });
  await mkdir(path.join(envelope, '.ouro-runtime/records'));
  await writeFile(
    path.join(envelope, '.ouro-runtime/records', id + '.json'),
    '{"stage":"TAMPERED"}',
  );
  await writeFile(
    path.join(envelope, '.ouro-runtime/last-built.json'),
    '{"generation":"UNTRUSTED"}',
  );
  const tampered = await command(entry, ['--generation', id, '--help'], {
    ...environment,
    OURO_URL: url,
    OURO_AGENT_TOKEN_FILE: key,
  });
  assert.equal(tampered.code, 1);
  assert.equal(tampered.stdout, '');
  assert.equal(calls.length, before);
  assert(!tampered.stderr.includes(secret));
  await bridge(entry);
});

test('CCA10 every supplement bundle and exact descriptor set is admitted before any manual import', async () => {
  const manifestPath = path.join(envelope, 'consumer-envelope.json'),
    original = await readFile(manifestPath),
    manifest = JSON.parse(original.toString('utf8')),
    entry = path.join(envelope, 'scripts/agent-config.mjs');
  try {
    for (const tool of manifest.agentTools.tools as { path: string }[]) {
      const filename = path.join(envelope, tool.path),
        bytes = await readFile(filename);
      try {
        await writeFile(
          filename,
          Buffer.concat([bytes, Buffer.from('\n/* изменённый fixture */')]),
        );
        const result = await command(entry, ['--help'], environment);
        assert.equal(result.code, 1);
        assert.equal(result.stdout, '');
      } finally {
        await writeFile(filename, bytes);
      }
    }
    const duplicate = {
      ...manifest,
      agentTools: {
        ...manifest.agentTools,
        tools: [
          manifest.agentTools.tools[0],
          manifest.agentTools.tools[0],
          manifest.agentTools.tools[0],
        ],
      },
    };
    await writeFile(manifestPath, JSON.stringify(duplicate));
    const denied = await command(entry, ['--help'], environment);
    assert.equal(denied.code, 1);
    assert.equal(denied.stdout, '');
  } finally {
    await writeFile(manifestPath, original);
  }
});

test('CCA11 authority source files are immutable rather than editable UI inputs', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(envelope, 'consumer-envelope.json'), 'utf8'),
  );
  for (const relative of [
    'scripts/agent-config.ts',
    'scripts/check-agent.mjs',
    'packages/mcp/bin/ouro-mcp.mjs',
    'lib/agent-client-config.ts',
    'packages/core/src/unicode.ts',
    'packages/core/src/project-identity/index.ts',
    'packages/core/src/project-identity/project-id.ts',
    'apps/service/scripts/build.mjs',
  ])
    assert.equal(
      manifest.sourceFiles.find((file: { path: string }) => file.path === relative)?.editable,
      false,
      relative,
    );
});

test('CCA12 available actual unsupported Node refuses all three tools before missing descriptor reads', async (context) => {
  const older =
    process.platform === 'win32'
      ? 'C:/Program Files/nodejs/node.exe'
      : process.env.OURO_TEST_OLDER_NODE;
  if (!older) {
    context.skip('No separate unsupported Node fixture is installed');
    return;
  }
  const version = spawnSync(older, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 3000,
  });
  let supported = false;
  if (version.status === 0)
    try {
      validateNodeVersion(version.stdout.trim().replace(/^v/, ''));
      supported = true;
    } catch {}
  if (version.status !== 0 || supported) {
    context.skip('No separate unsupported Node fixture is available');
    return;
  }
  const descriptor = path.join(envelope, 'consumer-envelope.json'),
    held = descriptor + '.held';
  await rename(descriptor, held);
  try {
    for (const relative of [
      'scripts/agent-config.mjs',
      'scripts/check-agent.mjs',
      'packages/mcp/bin/ouro-mcp.mjs',
    ]) {
      const result: SpawnSyncReturns<string> = spawnSync(
        older,
        [path.join(envelope, relative), '--help'],
        {
          cwd: foreign,
          env: environment,
          encoding: 'utf8',
          windowsHide: true,
          shell: false,
          timeout: 10000,
        },
      );
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /NODE_RUNTIME_UNSUPPORTED/);
    }
  } finally {
    await rename(held, descriptor);
  }
});
