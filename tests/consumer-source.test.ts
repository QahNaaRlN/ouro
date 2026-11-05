import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readCommittedConsumerSource } from '../scripts/consumer-delivery/committed-source.mjs';

/** Каждый case владеет отдельной synthetic Git history без рабочего профиля и user env. */
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-consumer-source-')),
    repository = path.join(directory, 'source & данные');
  await mkdir(repository);
  const git = (args: string[], input?: string) =>
    execFileSync('git', ['-C', repository, ...args], {
      encoding: 'utf8',
      input,
      windowsHide: true,
      shell: false,
    });
  git(['init', '-q']);
  git(['config', 'user.name', 'Qualification Fixture']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  git(['config', 'core.autocrlf', 'false']);
  const put = async (file: string, body: string) => {
    await mkdir(path.dirname(path.join(repository, file)), { recursive: true });
    await writeFile(path.join(repository, file), body);
  };
  await put('package.json', JSON.stringify({ name: 'ouro', version: '0.1.0-beta.4' }));
  await put(
    'packages/protocol/package.json',
    JSON.stringify({ name: '@ouro/protocol', version: '0.3.0' }),
  );
  await put('packages/protocol/package-lock.json', '{}');
  await put('packages/protocol/src/index.ts', 'export const protocol = 1;\n');
  await put('apps/web/src/entry.tsx', 'export const web = 1;\n');
  await put('apps/service/src/main.ts', 'export const service = 1;\n');
  await put('components/Project.tsx', 'export const Project = () => null;\n');
  await put('app/page.tsx', 'export default function Page(){return null;}\n');
  await put('app/human-view/shell-presentation.ts', 'export const shell = {};\n');
  await put('packages/mcp/src/server.ts', 'export const server = {};\n');
  await put('packages/meridian/src/theme.ts', 'export const theme = {};\n');
  await put(
    'app/api/fixture/route.ts',
    'export function GET(){return Response.json({legacy:true});}\n',
  );
  await put('docs/fixture.md', 'NOT_CONSUMER_INPUT');
  await put('scripts/runtime-node.mjs', 'export const engine = 24;\n');
  await put('release/protocol-producer/package-lock.json', 'READER_ONLY_LOCK');
  await put('release/protocol-producer/metadata.json', 'READER_ONLY_METADATA');
  await put('release/protocol-producer/not-an-input.txt', 'NOT_PRODUCER_INPUT');
  const commit = () => {
    git(['add', '--all']);
    git(['commit', '-qm', 'test: seed immutable source fixture']);
    return git(['rev-parse', 'HEAD']).trim();
  };
  const first = commit();
  return {
    directory,
    repository,
    git,
    put,
    commit,
    first,
    close: async () => {
      if (
        path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
        !path.basename(directory).startsWith('ouro-consumer-source-')
      )
        throw Error('Refused foreign fixture cleanup');
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('CSD01 reads immutable source bytes, scopes inventories and ignores dirty/untracked checkout', async () => {
  const f = await fixture();
  try {
    await f.put('apps/web/src/entry.tsx', 'DIRTY_CHECKOUT_NOT_FOR_DELIVERY');
    await f.put('.env.local', 'UNTRACKED_PRIVATE');
    await f.put('components/Untracked.tsx', 'UNTRACKED_SOURCE');
    const result = readCommittedConsumerSource({ repository: f.repository, ref: f.first });
    assert.equal(result.commit, f.first);
    assert.equal(result.productVersion, '0.1.0-beta.4');
    assert.equal(result.protocolVersion, '0.3.0');
    const web = result.consumerFiles.find((file) => file.path === 'apps/web/src/entry.tsx');
    assert(web);
    assert.equal(web.bytes.toString(), 'export const web = 1;\n');
    assert.equal(web.sha256, createHash('sha256').update(web.bytes).digest('hex'));
    assert.match(web.blob, /^[a-f0-9]{40}$/);
    assert.equal(web.mode, '100644');
    assert(result.consumerFiles.some((file) => file.path === 'components/Project.tsx'));
    assert(
      !result.consumerFiles.some(
        (file) =>
          file.path.includes('app/api/') ||
          file.path.startsWith('docs/') ||
          file.path.includes('Untracked') ||
          file.path.startsWith('packages/protocol/'),
      ),
    );
    assert(result.protocolFiles.some((file) => file.path === 'packages/protocol/src/index.ts'));
    assert(result.protocolFiles.every((file) => file.path.startsWith('packages/protocol/')));
    assert(
      !result.protocolFiles.some((file) => file.path === 'packages/protocol/package-lock.json'),
      'Development lock is audited but is not a producer input',
    );
    assert.deepEqual(
      result.protocolProducerFiles.map((file) => file.path),
      ['release/protocol-producer/metadata.json', 'release/protocol-producer/package-lock.json'],
    );
    for (const file of result.protocolProducerFiles) {
      assert.equal(file.sha256, createHash('sha256').update(file.bytes).digest('hex'));
      assert.equal(file.blob, f.git(['rev-parse', f.first + ':' + file.path]).trim());
      assert.equal(file.mode, '100644');
    }
    for (const file of [
      'app/human-view/shell-presentation.ts',
      'packages/mcp/src/server.ts',
      'packages/meridian/src/theme.ts',
    ])
      assert(
        result.consumerFiles.some((entry) => entry.path === file),
        `Existing actual build dependency must be present: ${file}`,
      );
  } finally {
    await f.close();
  }
});

test('CSD02 a private committed file outside source closure fails the complete tree audit', async () => {
  for (const file of [
    '.env.local',
    '.operations/runtime/private.txt',
    '.ouro/postgres/data',
    'node_modules/package.json',
    'docs/credentials.json',
    'keys/private.key',
    '.ouro-runtime/generations/old/state',
  ]) {
    const f = await fixture();
    try {
      await f.put(file, 'SYNTHETIC_PRIVATE');
      const commit = f.commit();
      assert.throws(() => readCommittedConsumerSource({ repository: f.repository, ref: commit }), {
        code: 'CONSUMER_SOURCE_UNSAFE_TREE',
      });
    } finally {
      await f.close();
    }
  }
});

test('CSD03 committed symlink mode is rejected before source extraction', async () => {
  const f = await fixture();
  try {
    const blob = f.git(['hash-object', '-w', '--stdin'], '../SYNTHETIC_PRIVATE\n').trim();
    f.git(['update-index', '--add', '--cacheinfo', `120000,${blob},linked-source`]);
    f.git(['commit', '-qm', 'test: include forbidden linked source']);
    const commit = f.git(['rev-parse', 'HEAD']).trim();
    assert.throws(() => readCommittedConsumerSource({ repository: f.repository, ref: commit }), {
      code: 'CONSUMER_SOURCE_UNSAFE_TREE',
    });
  } finally {
    await f.close();
  }
});

test('CSD04 unsafe revision/options and failed Git operations never echo raw input', async () => {
  const f = await fixture();
  try {
    for (const ref of ['--help', 'HEAD\nSYNTHETIC_PRIVATE', 'missing-SYNTHETIC_PRIVATE'])
      assert.throws(
        () => readCommittedConsumerSource({ repository: f.repository, ref }),
        (error) =>
          error instanceof Error &&
          !error.message.includes('SYNTHETIC_PRIVATE') &&
          'code' in error &&
          error.code === 'CONSUMER_SOURCE_INVALID',
      );
  } finally {
    await f.close();
  }
});

test('CSD05 metadata comes from the selected commit, not the current branch', async () => {
  const f = await fixture();
  try {
    await f.put('package.json', JSON.stringify({ name: 'ouro', version: '0.2.0' }));
    f.commit();
    assert.equal(
      readCommittedConsumerSource({ repository: f.repository, ref: f.first }).productVersion,
      '0.1.0-beta.4',
    );
    assert.equal(
      readCommittedConsumerSource({ repository: f.repository, ref: 'HEAD' }).productVersion,
      '0.2.0',
    );
  } finally {
    await f.close();
  }
});

test('CSD06 invalid release metadata is rejected without echoing its contents', async () => {
  const f = await fixture();
  try {
    await f.put(
      'package.json',
      JSON.stringify({ name: 'ouro', version: '0.1.0-01', secret: 'SYNTHETIC_PRIVATE' }),
    );
    const commit = f.commit();
    assert.throws(
      () => readCommittedConsumerSource({ repository: f.repository, ref: commit }),
      (error) =>
        error instanceof Error &&
        !error.message.includes('SYNTHETIC_PRIVATE') &&
        'code' in error &&
        error.code === 'CONSUMER_SOURCE_INVALID',
    );
  } finally {
    await f.close();
  }
});

for (const kind of ['commit', 'blob'] as const)
  test(`CSD07 ${kind} replacement refs cannot change bytes attributed to the requested commit`, async () => {
    const f = await fixture();
    try {
      if (kind === 'commit') {
        await f.put('apps/web/src/entry.tsx', 'REPLACEMENT_COMMIT_BYTES');
        const replacement = f.commit();
        f.git(['replace', f.first, replacement]);
      } else {
        const original = f.git(['rev-parse', `${f.first}:apps/web/src/entry.tsx`]).trim(),
          replacement = f.git(['hash-object', '-w', '--stdin'], 'REPLACEMENT_BLOB_BYTES').trim();
        f.git(['replace', original, replacement]);
      }
      const source = readCommittedConsumerSource({ repository: f.repository, ref: f.first });
      assert.equal(source.commit, f.first);
      assert.equal(
        source.consumerFiles
          .find((file) => file.path === 'apps/web/src/entry.tsx')
          ?.bytes.toString(),
        'export const web = 1;\n',
      );
    } finally {
      await f.close();
    }
  });

for (const [label, files] of [
  ['directory spelling', ['A/first.ts', 'a/second.ts']],
  ['file-directory identity', ['X', 'x/child.ts']],
] as const)
  test(`CSD08 rejects ${label} aliases through a synthetic Git index without checkout`, async () => {
    const f = await fixture();
    try {
      const blob = f.git(['hash-object', '-w', '--stdin'], 'export const fixture = true;\n').trim();
      for (const file of files)
        f.git([
          '-c',
          'core.ignorecase=false',
          'update-index',
          '--add',
          '--cacheinfo',
          `100644,${blob},${file}`,
        ]);
      f.git(['commit', '-qm', 'test: include cross-platform path aliases']);
      const commit = f.git(['rev-parse', 'HEAD']).trim();
      assert.throws(() => readCommittedConsumerSource({ repository: f.repository, ref: commit }), {
        code: 'CONSUMER_SOURCE_UNSAFE_TREE',
      });
    } finally {
      await f.close();
    }
  });

test('CSD09 preserves ordinary Unicode source paths instead of rejecting their alphabet', async () => {
  const f = await fixture();
  try {
    await f.put('app/human-view/Данные.ts', 'export const данные = true;\n');
    const commit = f.commit();
    assert(
      readCommittedConsumerSource({ repository: f.repository, ref: commit }).consumerFiles.some(
        (file) => file.path === 'app/human-view/Данные.ts',
      ),
    );
  } finally {
    await f.close();
  }
});

test('CSD10 requires both committed producer inputs despite a development lock and dirty replacement', async () => {
  for (const omitted of [
    'release/protocol-producer/package-lock.json',
    'release/protocol-producer/metadata.json',
  ]) {
    const f = await fixture();
    try {
      f.git(['rm', '--cached', '--', omitted]);
      f.git(['commit', '-qm', 'test: omit one committed protocol producer input']);
      const commit = f.git(['rev-parse', 'HEAD']).trim();
      assert.equal(f.git(['show', commit + ':packages/protocol/package-lock.json']).trim(), '{}');
      await f.put(omitted, 'DIRTY_REPLACEMENT_NOT_AN_INPUT');
      assert.throws(() => readCommittedConsumerSource({ repository: f.repository, ref: commit }), {
        code: 'CONSUMER_SOURCE_INVALID',
      });
    } finally {
      await f.close();
    }
  }
});
