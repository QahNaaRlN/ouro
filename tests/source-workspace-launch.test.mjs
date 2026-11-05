import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Собственный source fixture: npm witness наблюдает argv/cwd, не устанавливает зависимости. */
test('PWS01 source launch prepares the frozen workspace without a development npm lock', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ouro-workspace-launch-данные & ' ")),
    repository = path.join(directory, 'source app'),
    foreign = path.join(directory, 'foreign cwd');
  try {
    await mkdir(path.join(repository, 'scripts'), { recursive: true });
    await mkdir(foreign);
    await mkdir(path.join(repository, '.ouro'));
    await writeFile(
      path.join(repository, 'package.json'),
      JSON.stringify({
        name: 'ouro',
        version: '0.1.0-beta.4',
        private: true,
        packageManager: 'pnpm@10.34.9',
      }),
    );
    await writeFile(
      path.join(repository, 'pnpm-workspace.yaml'),
      'packages:\n  - apps/web\n  - apps/service\n  - packages/protocol\n',
    );
    await writeFile(
      path.join(repository, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/web: {}\n  apps/service: {}\n  packages/protocol: {}\n",
    );
    for (const name of ['apps/web', 'apps/service', 'packages/protocol']) {
      await mkdir(path.join(repository, name), { recursive: true });
      await writeFile(
        path.join(repository, name, 'package.json'),
        JSON.stringify({ name: '@ouro/' + path.basename(name), version: '0.1.0', private: true }),
      );
    }
    await writeFile(path.join(repository, '.ouro/sentinel'), 'PRESERVE_EXISTING_DATA');
    for (const name of ['launch.mjs', 'runtime-node.mjs'])
      await copyFile(path.resolve('scripts', name), path.join(repository, 'scripts', name));
    const capture = path.join(directory, 'capture.jsonl'),
      npm = path.join(directory, "npm CLI & ' .mjs"),
      dataDir = path.join(repository, '.ouro', 'данные & $(literal)');
    await writeFile(
      npm,
      "import{appendFileSync}from'node:fs';appendFileSync(process.env.PWS_CAPTURE,JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),data:process.env.OURO_DATA_DIR,nodeEnv:process.env.NODE_ENV})+'\\n');",
    );
    assert(!(await readdir(repository)).includes('package-lock.json'));
    const result = spawnSync(
      process.execPath,
      [path.join(repository, 'scripts/launch.mjs'), '--port', '4319'],
      {
        cwd: foreign,
        env: {
          ...process.env,
          npm_execpath: npm,
          PWS_CAPTURE: capture,
          OURO_DATA_DIR: dataDir,
          NODE_ENV: 'production',
        },
        windowsHide: true,
        shell: false,
        encoding: 'utf8',
        timeout: 15000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const phases = (await readFile(capture, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(phases, [
      {
        args: [
          'exec',
          '--yes',
          '--package=pnpm@10.34.9',
          '--',
          'pnpm',
          'install',
          '--frozen-lockfile',
          '--prod=false',
        ],
        cwd: repository,
        data: dataDir,
        nodeEnv: 'production',
      },
      { args: ['run', 'build'], cwd: repository, data: dataDir, nodeEnv: 'production' },
      {
        args: ['start', '--', '--port', '4319'],
        cwd: repository,
        data: dataDir,
        nodeEnv: 'production',
      },
    ]);
    assert.equal(
      await readFile(path.join(repository, '.ouro/sentinel'), 'utf8'),
      'PRESERVE_EXISTING_DATA',
    );
    assert.deepEqual(await readdir(foreign), []);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert(path.basename(directory).startsWith('ouro-workspace-launch-'));
    await rm(directory, { recursive: true, force: true });
  }
});
