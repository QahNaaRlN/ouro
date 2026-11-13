import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createCommittedProjectFixture } from './fixtures/consumer-delivery/committed-project.mjs';
import { materializeConsumerEnvelope } from '../scripts/consumer-delivery/materialize-envelope.mjs';

test(
  'CGL09 envelope has one source graph, dependency-free outer commands and finite committed runtime entries',
  { timeout: 180000 },
  async () => {
    const fixture = await createCommittedProjectFixture(
      fileURLToPath(new URL('../', import.meta.url)),
    );
    let complete = false;
    try {
      const npmCli = process.env.npm_execpath;
      assert(npmCli);
      const output = path.join(fixture.directory, 'consumer envelope & данные'),
        result = await materializeConsumerEnvelope({
          repository: fixture.repository,
          ref: fixture.commit,
          outputDirectory: output,
          npmCli,
        });
      const outer = JSON.parse(await readFile(path.join(output, 'package.json'), 'utf8')),
        source = JSON.parse(await readFile(path.join(output, 'source/package.json'), 'utf8')),
        manifest = JSON.parse(await readFile(path.join(output, 'consumer-envelope.json'), 'utf8'));
      assert.equal(result.commit, fixture.commit);
      assert.equal(outer.dependencies, undefined);
      assert.equal(outer.scripts.launch, 'node scripts/consumer-launch.mjs launch');
      assert.equal(outer.scripts.start, 'node scripts/consumer-launch.mjs start');
      assert.equal(outer.scripts.build, 'node scripts/consumer-launch.mjs build');
      assert.equal(source.dependencies.next, undefined);
      assert.equal((await readdir(output)).includes('package-lock.json'), false);
      assert.equal((await readdir(output)).includes('.ouro'), false);
      assert.equal(
        (await readdir(output)).some((file) => file.startsWith('.ouro-protocol-stage-')),
        false,
        'Producer install tree must stay outside the entire consumer envelope',
      );
      assert.equal(
        (await readdir(path.dirname(output))).some((file) =>
          file.startsWith('.ouro-protocol-stage-'),
        ),
        true,
      );
      assert.equal(manifest.scope, 'CONSUMER_GENERATION_ENVELOPE');
      assert(
        manifest.sourceFiles.some((file: { path: string }) => file.path === 'package-lock.json'),
      );
      assert.equal(
        await readFile(path.join(output, 'scripts/runtime-node.mjs'), 'utf8'),
        await readFile(path.join(output, 'source/scripts/runtime-node.mjs'), 'utf8'),
      );
      complete = true;
    } finally {
      if (complete) await fixture.close();
      else process.stderr.write('Retained own envelope materialization fixture.\n');
    }
  },
);
