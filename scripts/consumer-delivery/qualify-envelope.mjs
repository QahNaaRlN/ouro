import { validateNodeVersion } from '../runtime-node.mjs';
import { materializeConsumerEnvelope } from './materialize-envelope.mjs';
import { readCommittedConsumerSource } from './committed-source.mjs';
import { readBuiltGeneration } from './generation-state.mjs';
import { forceOwnedChild } from './consumer-owner.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, lstat, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/** Ограничивает qualification failure конечной фазой, без raw child/config/request payload. */
export class ConsumerEnvelopeQualificationError extends Error {
  constructor(phase) {
    super('Consumer envelope qualification failed.');
    this.name = 'ConsumerEnvelopeQualificationError';
    this.code = 'CONSUMER_ENVELOPE_QUALIFICATION_FAILED';
    this.phase = phase;
  }
}
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Сохраняет только tool capabilities; application authority задаётся собственной synthetic env fixture. */
function environment() {
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
    'SSL_CERT_FILE',
    'NODE_EXTRA_CA_CERTS',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'NODE_USE_ENV_PROXY',
    'PLAYWRIGHT_BROWSERS_PATH',
  ];
  const result = Object.fromEntries(
    keys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]),
  );
  result.PATH = path.dirname(process.execPath) + path.delimiter + (result.PATH ?? '');
  result.NODE_ENV = 'production';
  return result;
}

/** Получает свободный loopback port; последующая bind race должна отказать, а не принять чужой сервер. */
async function port() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const selected = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return selected;
}

/** Сохраняет raw target/HEAD и точные TCP bytes в отдельном HTML integrity gate. */
function raw(url, target, method = 'GET', accept = 'text/html') {
  return new Promise((resolve, reject) => {
    const origin = new URL(url),
      pending = request(
        {
          host: origin.hostname,
          port: origin.port,
          path: target,
          method,
          headers: { Accept: accept },
          agent: false,
        },
        (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.once('error', reject);
          response.once('end', () =>
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
    pending.setTimeout(10000, () => pending.destroy(Error('Owned request deadline')));
    pending.once('error', reject);
    pending.end();
  });
}

/** Реально запускает независимый envelope; не является переключением production release. */
export async function qualifyConsumerEnvelope(options) {
  validateNodeVersion(process.versions.node);
  const report = {
    schemaVersion: 1,
    scope: 'CONSUMER_GENERATION_QUALIFICATION',
    overall: 'FAILED',
    productionCutover: 'NOT_QUALIFIED',
    archive: 'NOT_IMPLEMENTED',
    node: process.versions.node,
    platform: process.platform,
    phases: {},
  };
  let phase = 'ADMISSION',
    allocated = false,
    root,
    envelope,
    foreign,
    active,
    streamAbort,
    streamPump;
  const env = environment(),
    children = new Set();
  const waitFor = async (predicate, milliseconds = 15000) => {
    const end = Date.now() + milliseconds;
    while (Date.now() < end) {
      const value = predicate();
      if (value) return value;
      await delay(25);
    }
    throw new ConsumerEnvelopeQualificationError(phase);
  };
  const start = (args, cwd, ipc = false) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ipc ? ['pipe', 'pipe', 'pipe', 'ipc'] : ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    let output = '',
      diagnostic = '';
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk) => (output = (output + String(chunk)).slice(-64000)));
    const owned = {
      child,
      output: () => output,
      closed: undefined,
      outcome: undefined,
      ipc,
      failurePhase: undefined,
      errorCode: undefined,
    };
    child.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + String(chunk)).slice(-4096);
      const match = diagnostic.match(/^OURO_CONSUMER_LAUNCH_FAILED ([A-Z_]{1,40})$/m);
      if (match) owned.failurePhase = match[1];
    });
    owned.closed = new Promise((resolve) => {
      child.once('error', (error) => {
        owned.errorCode =
          typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
            ? error.code
            : undefined;
        resolve({ code: 1, signal: null });
      });
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    void owned.closed.then((outcome) => {
      owned.outcome = outcome;
      children.delete(owned);
    });
    children.add(owned);
    return owned;
  };
  const run = async (args, cwd, milliseconds = 300000) => {
    const started = Date.now(),
      owned = start(args, cwd);
    try {
      await waitFor(() => owned.outcome, milliseconds);
      assert.deepEqual(owned.outcome, { code: 0, signal: null });
      return owned.output();
    } catch {
      const outcome = owned.outcome;
      report.toolFailure = {
        phase,
        exitCode: Number.isSafeInteger(outcome?.code) ? outcome.code : null,
        signal:
          typeof outcome?.signal === 'string' && /^SIG[A-Z0-9]{1,16}$/.test(outcome.signal)
            ? outcome.signal
            : null,
        errorCode: owned.errorCode ?? null,
        elapsedMs: Date.now() - started,
        deadlineMs: milliseconds,
      };
      throw new ConsumerEnvelopeQualificationError(phase);
    }
  };
  const stop = async () => {
    if (!active) return;
    const owned = active;
    if (!owned.outcome) {
      if (owned.ipc) {
        assert(owned.child.connected);
        owned.child.send('ouro:shutdown');
      } else
        owned.child.stdin.write('unknown\n' + 'x'.repeat(100) + '\nouro:shutdown\nouro:shutdown\n');
      await waitFor(() => owned.outcome, 20000);
    }
    active = undefined;
    assert.deepEqual(owned.outcome, { code: 0, signal: null });
  };
  const launch = async (args, ipc = false) => {
    const owned = start(
      ipc
        ? [path.join(envelope, 'scripts/consumer-launch.mjs'), ...args]
        : [options.npmCli, '--prefix', envelope, ...args],
      foreign,
      ipc,
    );
    active = owned;
    const match = await waitFor(
      () => owned.output().match(/^OURO_CONSUMER_READY (.+)$/m) || owned.outcome,
      300000,
    );
    assert(Array.isArray(match));
    const ready = JSON.parse(match[1]);
    assert.match(ready.generation, /^g-[a-f0-9-]{36}$/);
    assert.equal(
      (await fetch(ready.url + '/api/health', { signal: AbortSignal.timeout(10000) })).status,
      200,
    );
    return { ...ready, owned };
  };
  try {
    if (
      !options ||
      !['repository', 'workDirectory', 'npmCli'].every(
        (key) => typeof options[key] === 'string' && path.isAbsolute(options[key]),
      ) ||
      (options.installBrowser && (!options.browser || process.env.CI !== 'true'))
    )
      throw Error();
    root = path.resolve(options.workDirectory);
    await mkdir(path.dirname(root), { recursive: true });
    await mkdir(root);
    allocated = true;
    envelope = path.join(root, 'independent envelope');
    foreign = path.join(root, 'foreign cwd & данные');
    await mkdir(foreign);
    const source = readCommittedConsumerSource({
      repository: options.repository,
      ref: options.ref,
    });
    report.sourceCommit = source.commit;
    try {
      await lstat(path.join(options.repository, 'node_modules'));
      report.sourceRepositoryInstallAbsent = false;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      report.sourceRepositoryInstallAbsent = true;
    }
    phase = 'MATERIALIZATION';
    await materializeConsumerEnvelope({
      ...options,
      ref: source.commit,
      outputDirectory: envelope,
    });
    await mkdir(path.join(envelope, '.ouro'));
    await writeFile(path.join(envelope, '.ouro/sentinel'), 'OWN_EXISTING_DATA');
    const human = 'owned-envelope-' + randomUUID(),
      envBytes = 'OURO_HUMAN_TOKEN=' + human + '\n';
    await writeFile(path.join(envelope, '.env.local'), envBytes);
    env.npm_execpath = options.npmCli;
    report.phases.independentMaterialization = 'PASS';
    phase = 'NPM_LAUNCH';
    const first = await launch([
      'run',
      'launch',
      '--',
      '--control-stdin',
      '--port',
      String(await port()),
    ]);
    const firstBuilt = await readBuiltGeneration(envelope, first.generation);
    report.phases.actualNpmLaunchCiFreshBuildProductionEnv = 'PASS';
    assert.equal((await readdir(path.join(envelope, '.ouro-runtime/generations'))).length, 1);
    await assert.rejects(() => lstat(path.join(firstBuilt.directory, '.env.local')));
    assert.equal(await readFile(path.join(envelope, '.env.local'), 'utf8'), envBytes);
    assert.equal(
      await readFile(path.join(envelope, '.ouro/sentinel'), 'utf8'),
      'OWN_EXISTING_DATA',
    );
    const require = createRequire(path.join(firstBuilt.directory, 'package.json')),
      headers = { Authorization: 'Bearer ' + human, 'Content-Type': 'application/json' },
      json = async (target, method = 'GET', body) => {
        const response = await fetch(first.url + target, {
          method,
          body,
          headers,
          signal: AbortSignal.timeout(10000),
        });
        assert([200, 201].includes(response.status));
        return response.json();
      };
    phase = 'RUNTIME';
    const workspace = path.join(root, 'workspace');
    await mkdir(workspace);
    const created = await json(
        '/api/projects',
        'POST',
        JSON.stringify({
          requestId: randomUUID(),
          rootPath: workspace,
          name: 'Generation fixture',
        }),
      ),
      base = '/api/projects/' + created.project.id,
      before = await json(base);
    streamAbort = new AbortController();
    const response = await fetch(first.url + base + '/stream', {
      headers,
      signal: streamAbort.signal,
    });
    assert.equal(response.status, 200);
    let streamText = '';
    const reader = response.body.getReader();
    streamPump = (async () => {
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) return;
          streamText += Buffer.from(next.value).toString();
        }
      } catch (error) {
        if (!streamAbort.signal.aborted) throw error;
      }
    })();
    void streamPump.catch(() => {});
    await waitFor(() => streamText.includes('event: snapshot'));
    const command = {
        type: 'createSpec',
        requestId: randomUUID(),
        expectedVersion: before.cursor,
        content: {
          title: 'Generation persistence',
          goal: 'Stable profile',
          dod: [{ id: 'one', text: 'Receipt survives restart', required: true }],
          constraints: '',
          assumptions: '',
          risks: '',
          inputs: '',
          comment: '',
        },
      },
      body = ' ' + JSON.stringify(command) + '\n',
      receipt = await json(base + '/commands', 'POST', body);
    assert.equal(receipt.replayed, false);
    await waitFor(() => streamText.includes('id: ' + receipt.cursor + '\n'));
    report.phases.persistedCommandProgressiveSse = 'PASS';
    streamAbort.abort();
    await streamPump;
    const assetDirectory = path.join(firstBuilt.directory, 'apps/web/dist/assets'),
      assets = await readdir(assetDirectory);
    for (const extension of ['.js', '.css', '.woff2']) {
      const filename = assets.find((file) => file.endsWith(extension));
      assert(filename);
      const bytes = await readFile(path.join(assetDirectory, filename)),
        target = '/assets/' + encodeURIComponent(filename),
        get = await raw(first.url, target, 'GET', '*/*'),
        head = await raw(first.url, target, 'HEAD', '*/*');
      assert.equal(get.status, 200);
      assert.equal(head.status, 200);
      assert(get.body.equals(bytes));
      assert.equal(get.headers['content-length'], String(bytes.length));
      assert.equal(head.headers['content-length'], String(bytes.length));
      assert.equal(head.body.length, 0);
      assert.equal(get.headers['cache-control'], 'public, max-age=3600');
    }
    report.phases.exactJsCssFontBytes = 'PASS';
    for (const [target, method, accept, status] of [
      ['/assets/missing.json', 'GET', 'text/html', 404],
      ['/assets/missing.wasm', 'GET', 'text/html', 404],
      ['/assets/missing.mjs', 'HEAD', 'text/html', 404],
      ['/assets/missing.anything', 'GET', 'text/html', 404],
      ['/api/missing', 'GET', 'text/html', 404],
      ['/api/missing', 'HEAD', 'text/html', 404],
      ['/projects/help', 'GET', 'application/json', 404],
      ['/projects/help', 'GET', '*/*', 404],
      ['/projects/help', 'POST', 'text/html', 404],
      ['/assets/%2e%2e/forbidden', 'GET', 'text/html', 404],
    ])
      assert.equal((await raw(first.url, target, method, accept)).status, status);
    report.phases.staticNegativeAssetsApiHead = 'PASS';
    const expectedHtml = await readFile(
        path.join(firstBuilt.directory, 'apps/web/dist/index.html'),
      ),
      html = await raw(first.url, '/'),
      head = await raw(first.url, '/', 'HEAD');
    report.htmlIntegrity = {
      status:
        html.body.equals(expectedHtml) &&
        html.headers['content-length'] === String(expectedHtml.length) &&
        head.headers['content-length'] === String(expectedHtml.length) &&
        head.body.length === 0
          ? 'PASS'
          : 'FAIL',
      expectedBytes: expectedHtml.length,
      receivedBytes: html.body.length,
    };
    phase = 'CONCURRENT_BUILD';
    await run([options.npmCli, '--prefix', envelope, 'run', 'build'], foreign);
    const secondBuilt = await readBuiltGeneration(envelope);
    assert.notEqual(secondBuilt.id, first.generation);
    assert.equal((await json(base)).cursor, receipt.cursor);
    const registration = await json(
      base + '/agents',
      'POST',
      JSON.stringify({ name: 'Serving generationA' }),
    );
    assert.deepEqual(registration.connection.stdioArgs, [
      path.join(envelope, 'packages/mcp/bin/ouro-mcp.mjs'),
      '--generation',
      first.generation,
    ]);
    report.phases.buildBWhileServerA = 'PASS';
    phase = 'BOUND_MCP';
    const keyFile = 'agent key & данные.txt';
    await writeFile(path.join(foreign, keyFile), registration.token + '\n');
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js'),
      { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js'),
      client = new Client({ name: 'generation-envelope-qualification', version: '1' });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: registration.connection.stdioArgs,
          cwd: foreign,
          env: {
            ...env,
            OURO_URL: registration.connection.httpUrl,
            OURO_AGENT_TOKEN_FILE: keyFile,
          },
        }),
      );
      assert((await client.listTools()).tools.some((tool) => tool.name === 'ouro.get_context'));
      assert.notEqual(
        (await client.callTool({ name: 'ouro.get_context', arguments: {} })).isError,
        true,
      );
    } finally {
      await client.close();
    }
    report.phases.issuedMcpAWithLastBuiltBForeignCwdKeyFile = 'PASS';
    phase = 'RUNNER_BROWSER';
    const scratch = path.join(root, 'runner outside install');
    await mkdir(scratch);
    await writeFile(path.join(scratch, 'package.json'), JSON.stringify({ type: 'module' }));
    const specs = {
      'common.spec.cjs':
        "const{test,expect}=require('@playwright/test');test('common owned resolution',()=>expect(1).toBe(1));\n",
      'module.spec.mjs':
        "import{test,expect}from'@playwright/test';test('module owned resolution',()=>expect(2).toBe(2));\n",
      'typed.spec.ts':
        "import{test,expect}from'@playwright/test';test('typed owned resolution',()=>{const value:number=3;expect(value).toBe(3);});\n",
    };
    for (const [file, contents] of Object.entries(specs))
      await writeFile(path.join(scratch, file), contents);
    if (options.browser) {
      const navigation = source.qualificationFiles.find(
        (file) => file.path === 'apps/web/tests/navigation.spec.ts',
      );
      assert(navigation);
      await writeFile(path.join(scratch, 'navigation.spec.ts'), navigation.bytes);
    }
    await writeFile(
      path.join(scratch, 'playwright.config.mjs'),
      `export default {testDir:${JSON.stringify(scratch)},testMatch:'*.spec.*',workers:1,retries:0,reporter:'list',outputDir:${JSON.stringify(path.join(root, 'runner-output'))},use:{baseURL:${JSON.stringify(first.url)},headless:true,viewport:{width:1440,height:1000}}};`,
    );
    const preload = pathToFileURL(
      path.join(
        firstBuilt.directory,
        'apps/service/dist/resources/verification/playwright-preload.mjs',
      ),
    );
    preload.searchParams.set(
      'package',
      pathToFileURL(path.join(firstBuilt.directory, 'apps/service/package.json')).href,
    );
    if (options.installBrowser) {
      phase = 'BROWSER_INSTALL';
      await run(
        [require.resolve('@playwright/test/cli'), 'install', '--with-deps', 'chromium'],
        foreign,
      );
      report.phases.browserInstallation = 'PASS';
    }
    phase = 'RUNNER_BROWSER';
    const runner = await run(
      [
        '--import',
        preload.href,
        require.resolve('@playwright/test/cli'),
        'test',
        '--config',
        path.join(scratch, 'playwright.config.mjs'),
      ],
      foreign,
    );
    assert.match(runner, new RegExp((options.browser ? 9 : 3) + ' passed'));
    for (const [file, contents] of Object.entries(specs))
      assert.equal(await readFile(path.join(scratch, file), 'utf8'), contents);
    if (options.browser)
      assert(
        (await readFile(path.join(scratch, 'navigation.spec.ts'))).equals(
          source.qualificationFiles[0].bytes,
        ),
      );
    report.phases.runnerCjsEsmTs = 'PASS';
    report.phases.unchangedNavigationCookie6 = options.browser ? 'PASS' : 'NOT_RUN';
    phase = 'STDIN_DRAIN';
    await stop();
    report.phases.actualNpmStdinGracefulDrain = 'PASS';
    phase = 'START_RESTART';
    env.PORT = '0';
    const restarted = await launch(['start', '--', '--control-stdin']);
    assert.equal(restarted.generation, secondBuilt.id);
    assert.equal((await readdir(path.join(envelope, '.ouro-runtime/generations'))).length, 2);
    const replayResponse = await fetch(restarted.url + base + '/commands', {
      method: 'POST',
      body,
      headers,
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(replayResponse.status, 200);
    const replay = await replayResponse.json();
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.state, receipt.state);
    assert.deepEqual(replay.events, receipt.events);
    await stop();
    report.phases.startLastBuiltNoCiPersistedExactReceipt = 'PASS';
    phase = 'NO_CONTROL_STDIN_LAUNCH';
    delete env.PORT;
    const noControl = await launch(['launch', '--port', String(await port())], true);
    assert.notEqual(noControl.generation, secondBuilt.id);
    assert.equal((await readdir(path.join(envelope, '.ouro-runtime/generations'))).length, 3);
    assert.equal(
      (await fetch(noControl.url + base, { headers, signal: AbortSignal.timeout(10000) })).status,
      200,
    );
    await stop();
    report.phases.explicitPositivePortLaunchWithoutStdinControlIpcDrain = 'PASS';
    assert.equal(
      await readFile(path.join(envelope, '.ouro/sentinel'), 'utf8'),
      'OWN_EXISTING_DATA',
    );
    assert.equal(await readFile(path.join(envelope, '.env.local'), 'utf8'), envBytes);
    assert.equal((await readdir(foreign)).filter((file) => file !== keyFile).length, 0);
    report.phases.stableOuterProfileEnvAndLiteralCwd = 'PASS';
    report.overall =
      report.htmlIntegrity.status === 'PASS' ? 'PASS' : 'PARTIAL_HTML_INTEGRITY_FAILED';
    return report;
  } catch {
    report.error = {
      code: 'CONSUMER_ENVELOPE_QUALIFICATION_FAILED',
      phase,
      ...(active?.failurePhase ? { ownerPhase: active.failurePhase } : {}),
    };
    throw new ConsumerEnvelopeQualificationError(phase);
  } finally {
    streamAbort?.abort();
    await streamPump?.catch(() => {});
    if (active)
      try {
        await stop();
      } catch {
        report.phases.gracefulShutdown = 'FAILED';
      }
    for (const owned of children)
      if (owned.child.exitCode === null && owned.child.signalCode === null) {
        forceOwnedChild(owned.child);
        await Promise.race([owned.closed, delay(3000)]);
        report.overall = 'FAILED';
        report.phases.ownedChildFallback = owned.outcome ? 'USED_FAILURE' : 'INCOMPLETE';
      }
    if (allocated)
      await writeFile(
        path.join(root, 'qualification-report.json'),
        JSON.stringify(report, null, 2) + '\n',
      );
  }
}
