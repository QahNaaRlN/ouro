import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { inspectArchitecture } from '../scripts/check-architecture.mjs';

const casesSchema = z.array(z.object({ name: z.string(), entries: z.array(z.string()), files: z.record(z.string(), z.string()), codes: z.array(z.string()) }));

test('architecture fixtures enforce resolved boundaries and semantic client ports', async context => {
  const cases = casesSchema.parse(JSON.parse(await readFile(new URL('./fixtures/architecture/cases.json', import.meta.url), 'utf8')));
  for (const fixture of cases) await context.test(fixture.name, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ouro-architecture-'));
    try {
      const files = { 'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, baseUrl: '.', paths: { '@/*': ['./*'] } } }), ...fixture.files };
      for (const [relative, source] of Object.entries(files)) {
        const destination = path.resolve(directory, relative);
        assert(destination.startsWith(path.resolve(directory) + path.sep));
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, source);
      }
      const result = inspectArchitecture({ root: directory, entryFiles: fixture.entries });
      assert.deepEqual(result.violations.map(violation => violation.code).sort(), [...fixture.codes].sort(), JSON.stringify(result.violations, null, 2));
    } finally {
      assert(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
      assert(path.basename(directory).startsWith('ouro-architecture-'));
      await rm(directory, { recursive: true, force: true });
    }
  });
});

test('legacy baseline admits one exact edge and rejects wildcard, stale or additional imports', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-architecture-'));
  const source = 'components/legacy-panel.tsx';
  const baseline = [{ source, specifier: '@/lib/store', kind: 'type', code: 'server-boundary', owner: 'fixture-migration', reason: 'One historical edge only.' }];
  try {
    await mkdir(path.join(directory, 'components'), { recursive: true });
    await mkdir(path.join(directory, 'lib'));
    await writeFile(path.join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', baseUrl: '.', paths: { '@/*': ['./*'] } } }));
    await writeFile(path.join(directory, 'lib/store.ts'), 'export type Store={id:string}');
    await writeFile(path.join(directory, source), "import type {Store} from '@/lib/store'; export type Model=Store;");
    const exact = inspectArchitecture({ root: directory, entryFiles: [source], baseline });
    assert.deepEqual(exact.violations, []);
    assert.equal(exact.baselineMatches.length, 1);
    await writeFile(path.join(directory, source), "import type {Store} from '@/lib/store'; import fs from 'node:fs'; export type Model=Store; export const unsafe=fs;");
    assert.deepEqual(inspectArchitecture({ root: directory, entryFiles: [source], baseline }).violations.map(value => value.code), ['node-boundary']);
    assert(inspectArchitecture({ root: directory, entryFiles: [source], baseline: [{ ...baseline[0], source: 'packages/client/**' }] }).violations.some(value => value.code === 'invalid-baseline'));
    assert(inspectArchitecture({ root: directory, entryFiles: [source], baseline: [{ ...baseline[0], source: 'packages/client/src/ports/project.port.ts' }] }).violations.some(value => value.code === 'invalid-baseline'), 'new portable modules cannot receive legacy exceptions');
    await writeFile(path.join(directory, source), 'export type Model={id:string}');
    assert.deepEqual(inspectArchitecture({ root: directory, entryFiles: [source], baseline }).violations.map(value => value.code), ['stale-baseline']);
  } finally {
    assert(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    assert(path.basename(directory).startsWith('ouro-architecture-'));
    await rm(directory, { recursive: true, force: true });
  }
});
