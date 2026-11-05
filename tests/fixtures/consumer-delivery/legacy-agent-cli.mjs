import { validateNodeVersion } from '../../../scripts/runtime-node.mjs';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

export const LEGACY_AGENT_CLI_COMMIT = '29989b459387836e40bae454869dede998a7ebc8';

/** Читает только исходный конечный oracle closure, независимо от новых producer inputs. */
function legacyFiles(repository) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  const git = (args, input) =>
    execFileSync('git', ['--no-replace-objects', '-C', repository, ...args], {
      input,
      env: environment,
      windowsHide: true,
      shell: false,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  if (
    git(['rev-parse', '--verify', '--end-of-options', LEGACY_AGENT_CLI_COMMIT + '^{commit}'])
      .toString('ascii')
      .trim() !== LEGACY_AGENT_CLI_COMMIT
  )
    throw Error('Legacy CLI source unavailable');
  const exact = [
      'package.json',
      'package-lock.json',
      'lib/agent-client-config.ts',
      'scripts/agent-config.ts',
      'scripts/check-agent.mjs',
      'packages/mcp/bin/ouro-mcp.mjs',
      'packages/meridian/src/context.ts',
      'packages/meridian/src/theme.ts',
    ],
    prefixes = ['packages/protocol/', 'packages/core/src/'];
  const rows = new TextDecoder('utf-8', { fatal: true })
      .decode(
        git([
          'ls-tree',
          '-r',
          '-z',
          '--full-tree',
          LEGACY_AGENT_CLI_COMMIT,
          '--',
          ...exact,
          ...prefixes,
        ]),
      )
      .split('\0')
      .filter(Boolean),
    identities = new Set();
  const entries = rows.map((row) => {
    const match = /^(100644|100755) blob ([a-f0-9]{40,64})\t(.+)$/.exec(row);
    if (!match) throw Error('Legacy CLI source unavailable');
    const file = match[3],
      parts = file.split('/');
    if (
      (!exact.includes(file) && !prefixes.some((prefix) => file.startsWith(prefix))) ||
      file.includes('\\') ||
      /[\u0000-\u001f\u007f:]/.test(file) ||
      parts.some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[. ]$/.test(part) ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      ) ||
      identities.has(file.toLowerCase())
    )
      throw Error('Legacy CLI source unavailable');
    identities.add(file.toLowerCase());
    return { path: file, mode: match[1], blob: match[2] };
  });
  if (
    [
      ...exact,
      'packages/protocol/package.json',
      'packages/protocol/package-lock.json',
      'packages/protocol/scripts/build.mjs',
    ].some((file) => !entries.some((entry) => entry.path === file))
  )
    throw Error('Legacy CLI source unavailable');
  const batch = git(['cat-file', '--batch'], entries.map((entry) => entry.blob).join('\n') + '\n');
  let offset = 0;
  const files = entries.map((entry) => {
    const newline = batch.indexOf(10, offset),
      header =
        newline < 0
          ? null
          : /^([a-f0-9]{40,64}) blob (0|[1-9]\d*)$/.exec(
              batch.subarray(offset, newline).toString('ascii'),
            );
    const size = header ? Number(header[2]) : -1,
      start = newline + 1,
      end = start + size;
    if (
      !header ||
      header[1] !== entry.blob ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > 32 * 1024 * 1024 ||
      end >= batch.length ||
      batch[end] !== 10
    )
      throw Error('Legacy CLI source unavailable');
    offset = end + 1;
    return { ...entry, bytes: Buffer.from(batch.subarray(start, end)) };
  });
  if (offset !== batch.length) throw Error('Legacy CLI source unavailable');
  return files;
}

/** Копирует canonical oracle и его точный SDK install; app/dist и developer checkout не используются. */
export async function prepareLegacyAgentCli({ repository, directory, npmCli }) {
  validateNodeVersion(process.versions.node);
  const files = legacyFiles(repository);
  await mkdir(directory);
  for (const file of files) {
    const target = path.join(directory, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.bytes, { flag: 'wx' });
    await chmod(target, file.mode === '100755' ? 0o755 : 0o644);
  }
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
    ],
    env = Object.fromEntries(
      keys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]),
    );
  env.PATH = path.dirname(process.execPath) + path.delimiter + (env.PATH ?? '');
  env.npm_execpath = npmCli;
  env.NODE_ENV = 'production';
  for (const [phase, args] of [
    ['SDK_INSTALL', [npmCli, 'ci', '--include=dev', '--no-audit', '--no-fund']],
    ['PROTOCOL_INPUT', [path.join(directory, 'packages/protocol/scripts/build.mjs')]],
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: directory,
      env,
      windowsHide: true,
      shell: false,
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw Error('Legacy CLI setup failed: ' + phase);
  }
  return { directory, commit: LEGACY_AGENT_CLI_COMMIT };
}
