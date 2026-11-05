import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { inspectSourceConventions } from '../scripts/check-source-conventions.mjs';
import { inspectArchitecture } from '../scripts/check-architecture.mjs';

const treeCase = z.object({
  name: z.string(),
  files: z.record(z.string(), z.string()),
  codes: z.array(z.string()),
});
const casesSchema = z.object({
  source: z.array(treeCase),
  eslint: z.array(z.object({
    name: z.string(), filename: z.string(), code: z.string(), ruleIds: z.array(z.string()),
  })),
  architecture: z.array(treeCase),
});

/** Читает конечные fixtures до исполнения config; raw parser/setup errors не скрываются. */
async function readCases() {
  return casesSchema.parse(JSON.parse(await readFile(
    new URL('./fixtures/source-quality/cases.json', import.meta.url), 'utf8',
  )));
}

/** Создает собственный source tree и удаляет только проверенный temporary root. */
async function withSourceTree<T>(files: Record<string, string>, inspect: (root: string) => T) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-source-quality-'));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const filename = path.resolve(directory, relative);
      assert(filename.startsWith(path.resolve(directory) + path.sep));
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, content);
    }
    return inspect(directory);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert(path.basename(directory).startsWith('ouro-source-quality-'));
    await rm(directory, { recursive: true, force: true });
  }
}

test('quality source scope and naming use the same real AST reader', async context => {
  const cases = await readCases();
  const positive = cases.source[0];
  const report = await withSourceTree(positive.files, root => inspectSourceConventions({ root }));
  assert.equal(report.filesChecked, Object.keys(positive.files).length);
  assert.deepEqual(report.violations, []);
  for (const fixture of cases.source) await context.test(fixture.name, async () => {
    const result = await withSourceTree(fixture.files, root => inspectSourceConventions({ root }));
    assert.deepEqual(result.files, Object.keys(fixture.files).sort());
    assert.deepEqual(result.violations.map(value => value.code).sort(), [...fixture.codes].sort());
  });
});

test('quality config loads its actual parser and plugins before negative rule cases', async context => {
  const { ESLint } = await import('eslint');
  const eslint = new ESLint({ overrideConfigFile: path.resolve('eslint.config.mjs') });
  const filename = 'packages/frontend/src/shared/ui/TaskCard.tsx';
  const config = await eslint.calculateConfigForFile(filename);
  assert(config, 'The TSX fixture must be selected by the actual config');
  const plugins = config.plugins;
  assert(plugins, 'Actual parser/plugin config must be present');
  for (const name of ['js', '@typescript-eslint', 'react-hooks', 'jsdoc']) {
    assert(Object.hasOwn(plugins, name), `Actual plugin must load: ${name}`);
  }
  const positive = await eslint.lintText(
    "import {useState} from 'react';\n/** Показывает задачу. */\nexport function TaskCard(){const [value]=useState(0);return <p>{value}</p>;}",
    { filePath: filename },
  );
  assert.equal(positive.length, 1);
  assert.deepEqual(positive[0].messages, [], 'Parser/plugin setup must pass before any expected RED');
  const cases = await readCases();
  for (const fixture of cases.eslint) await context.test(fixture.name, async () => {
    const results = await eslint.lintText(fixture.code, { filePath: fixture.filename });
    assert.equal(results.length, 1);
    assert.equal(results[0].fatalErrorCount, 0, 'A parser failure is setup failure, not rule RED');
    const rules = [...new Set(results[0].messages.map(message => message.ruleId))].sort();
    assert.deepEqual(rules, [...fixture.ruleIds].sort());
  });
});

test('quality public API fixtures retain the existing architecture resolver', async context => {
  const cases = await readCases();
  for (const fixture of cases.architecture) await context.test(fixture.name, async () => {
    const result = await withSourceTree(fixture.files, root => inspectArchitecture({
      root, entryFiles: [Object.keys(fixture.files)[0]], baseline: [],
    }));
    assert.deepEqual(result.violations.map(value => value.code).sort(), [...fixture.codes].sort());
  });
});

test('quality formatter rejects unformatted source after its positive setup', async () => {
  const prettier = await import('prettier');
  const options = await prettier.resolveConfig(path.resolve('tests/source-quality.test.ts'));
  assert(options, 'The actual formatter config must load');
  const settings = { ...options, filepath: 'tests/typechecks/source-quality.ts' };
  assert.equal(await prettier.check('const value = 1;\n', settings), true);
  assert.equal(await prettier.check('const value=1', settings), false);
});

test('agent adapters reference only local accepted requirements and preserve the Next block', async () => {
  const agents = await readFile('AGENTS.md', 'utf8');
  const cursor = await readFile('.cursor/rules/ouro.mdc', 'utf8');
  assert(agents.includes('<!-- BEGIN:nextjs-agent-rules -->'));
  assert(agents.includes('<!-- END:nextjs-agent-rules -->'));
  for (const text of [agents, cursor]) {
    for (const file of ['decisions.md', 'react-stack.md', 'target-architecture.md', 'rules-portability.md']) {
      assert(text.includes(file), `Adapter must reference the local canonical contract: ${file}`);
    }
    assert(!text.includes('C:/Work/') && !text.includes('C:\\Work\\'));
  }
});
