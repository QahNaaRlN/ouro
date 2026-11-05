import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { inspectSourceConventions } from '../scripts/check-source-conventions.mjs';
import { inspectArchitecture } from '../scripts/check-architecture.mjs';
import {
  auditQualityLedger,
  qualitySourceHash,
  collectQualityReports,
  collectLegacyQualityReports,
  type QualityFileReport,
} from '../scripts/check-quality.mjs';

const treeCase = z.object({
  name: z.string(),
  files: z.record(z.string(), z.string()),
  codes: z.array(z.string()),
});
const casesSchema = z.object({
  source: z.array(treeCase),
  eslint: z.array(
    z.object({
      name: z.string(),
      filename: z.string(),
      code: z.string(),
      ruleIds: z.array(z.string()),
    }),
  ),
  architecture: z.array(treeCase),
});

/** Читает конечные fixtures до исполнения config; raw parser/setup errors не скрываются. */
async function readCases() {
  return casesSchema.parse(
    JSON.parse(
      await readFile(new URL('./fixtures/source-quality/cases.json', import.meta.url), 'utf8'),
    ),
  );
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
    return await inspect(directory);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert(path.basename(directory).startsWith('ouro-source-quality-'));
    await rm(directory, { recursive: true, force: true });
  }
}

test('quality source scope and naming use the same real AST reader', async (context) => {
  const cases = await readCases();
  const positive = cases.source.find(
    (fixture) => fixture.name === 'named frontend component keeps its file and export',
  );
  assert(positive, 'The explicit valid source fixture must remain in the same finite fixture set');
  const report = await withSourceTree(positive.files, (root) => inspectSourceConventions({ root }));
  assert.equal(report.filesChecked, Object.keys(positive.files).length);
  assert.deepEqual(report.violations, []);
  for (const fixture of cases.source)
    await context.test(fixture.name, async () => {
      const result = await withSourceTree(fixture.files, (root) =>
        inspectSourceConventions({ root }),
      );
      assert.deepEqual(result.files, Object.keys(fixture.files).sort());
      assert.deepEqual(
        result.violations.map((value) => value.code).sort(),
        [...fixture.codes].sort(),
      );
    });
});

/** Допускает настоящие parser/plugins на положительном TSX перед проверкой отдельных правил. */
async function admittedESLint() {
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
  assert.deepEqual(
    positive[0].messages,
    [],
    'Parser/plugin setup must pass before any expected RED',
  );
  return eslint;
}

test('quality actual parser/plugin setup is positive', async () => {
  await admittedESLint();
});

test('quality config rejects the focused negative rule cases', async (context) => {
  const eslint = await admittedESLint();
  const cases = await readCases();
  for (const fixture of cases.eslint)
    await context.test(fixture.name, async () => {
      const results = await eslint.lintText(fixture.code, { filePath: fixture.filename });
      assert.equal(results.length, 1);
      assert.equal(
        results[0].fatalErrorCount,
        0,
        'A parser failure is setup failure, not rule RED',
      );
      const rules = [...new Set(results[0].messages.map((message) => message.ruleId))].sort();
      assert.deepEqual(rules, [...fixture.ruleIds].sort());
    });
  for (const directive of [
    '/* eslint-disable */',
    '/* eslint @typescript-eslint/no-explicit-any: off */',
  ]) {
    await context.test('inline suppression cannot hide no-explicit-any: ' + directive, async () => {
      const results = await eslint.lintText(
        directive +
          '\n/** Передает значение. */\nexport function readValue(value:any){return value;}',
        { filePath: 'packages/core/src/source-quality.ts' },
      );
      assert.equal(results[0].fatalErrorCount, 0);
      assert(
        results[0].messages.some(
          (message) => message.ruleId === '@typescript-eslint/no-explicit-any',
        ),
      );
    });
  }
});

test('quality public API fixtures retain the existing architecture resolver', async (context) => {
  const cases = await readCases();
  for (const fixture of cases.architecture)
    await context.test(fixture.name, async () => {
      const result = await withSourceTree(fixture.files, (root) =>
        inspectArchitecture({
          root,
          entryFiles: [Object.keys(fixture.files)[0]],
          baseline: [],
        }),
      );
      assert.deepEqual(
        result.violations.map((value) => value.code).sort(),
        [...fixture.codes].sort(),
      );
    });
});

test('quality declaration contracts cover the installed JSDoc export gaps', async (context) => {
  const eslint = await admittedESLint();
  const cases = [
    {
      name: 'local Props positive',
      file: 'packages/frontend/src/shared/ui/TaskCard.tsx',
      code: '/** Входные свойства задачи. */\ninterface TaskCardProps{ready:boolean}\n/** Показывает задачу. */\nexport function TaskCard(props:TaskCardProps){return <p>{String(props.ready)}</p>;}',
      rejected: false,
    },
    {
      name: 'local Props negative',
      file: 'packages/frontend/src/shared/ui/TaskCard.tsx',
      code: 'interface TaskCardProps{ready:boolean}\n/** Показывает задачу. */\nexport function TaskCard(props:TaskCardProps){return <p>{String(props.ready)}</p>;}',
      rejected: true,
    },
    {
      name: 'ambient positive',
      file: 'scripts/source-contract.d.mts',
      code: '/** Читает значение. */\nexport function readValue():string;',
      rejected: false,
    },
    {
      name: 'ambient negative',
      file: 'scripts/source-contract.d.mts',
      code: 'export function readValue():string;',
      rejected: true,
    },
    {
      name: 'public class positive',
      file: 'packages/core/src/value.ts',
      code: '/** Представляет значение. */\nexport class Value{}',
      rejected: false,
    },
    {
      name: 'public class negative',
      file: 'packages/core/src/value.ts',
      code: 'export class Value{}',
      rejected: true,
    },
    {
      name: 'overload positive',
      file: 'packages/frontend/src/shared/lib/read-value.ts',
      code: '/** Читает строку. */\nexport function readValue(value:string):string;\n/** Читает значение. */\nexport function readValue(value:unknown){return String(value);}',
      rejected: false,
    },
    {
      name: 'overload negative',
      file: 'packages/frontend/src/shared/lib/read-value.ts',
      code: 'export function readValue(value:string):string;\n/** Читает значение. */\nexport function readValue(value:unknown){return String(value);}',
      rejected: true,
    },
    {
      name: 'forwardRef positive',
      file: 'packages/frontend/src/shared/ui/TaskCard.tsx',
      code: "import {forwardRef} from 'react';\n/** Показывает задачу. */\nexport const TaskCard=forwardRef<HTMLDivElement>((props,ref)=><div ref={ref}/>);",
      rejected: false,
    },
    {
      name: 'forwardRef negative',
      file: 'packages/frontend/src/shared/ui/TaskCard.tsx',
      code: "import {forwardRef} from 'react';\nexport const TaskCard=forwardRef<HTMLDivElement>((props,ref)=><div ref={ref}/>);",
      rejected: true,
    },
    {
      name: 'memo positive',
      file: 'packages/frontend/src/shared/ui/TaskCard.tsx',
      code: "import {memo} from 'react';\n/** Показывает задачу. */\nexport const TaskCard=memo(()=> <div/>);",
      rejected: false,
    },
    {
      name: 'memo negative',
      file: 'packages/frontend/src/shared/ui/TaskCard.tsx',
      code: "import {memo} from 'react';\nexport const TaskCard=memo(()=> <div/>);",
      rejected: true,
    },
    {
      name: 'wrapper RU summary negative',
      file: 'packages/frontend/src/shared/ui/TaskCard.tsx',
      code: "import {memo} from 'react';\n/** Shows the task. */\nexport const TaskCard=memo(()=> <div/>);",
      rejected: true,
    },
    {
      name: 'local Props RU summary negative',
      file: 'packages/frontend/src/shared/ui/TaskCard.tsx',
      code: '/** Task input. */\ninterface TaskCardProps{ready:boolean}\n/** Показывает задачу. */\nexport function TaskCard(props:TaskCardProps){return <p>{String(props.ready)}</p>;}',
      rejected: true,
    },
    {
      name: 'later export positive',
      file: 'packages/frontend/src/shared/lib/read-value.ts',
      code: '/** Читает значение. */\nfunction readValue(){return 1;}\nexport {readValue};',
      rejected: false,
    },
    {
      name: 'later export negative',
      file: 'packages/frontend/src/shared/lib/read-value.ts',
      code: 'function readValue(){return 1;}\nexport {readValue};',
      rejected: true,
    },
    {
      name: 'barrel marker positive',
      file: 'packages/frontend/src/shared/lib/index.ts',
      code: "/** api */\nexport {readValue} from './read-value';",
      rejected: false,
    },
    {
      name: 'function marker negative',
      file: 'packages/frontend/src/shared/lib/read-value.ts',
      code: '/** api */\nexport function readValue(){return 1;}',
      rejected: true,
    },
    {
      name: 'JS typed tags positive',
      file: 'scripts/source-contract.mjs',
      code: '/** Читает значение.\n * @param {string} value - Исходное значение.\n * @returns {string} Исходное значение.\n */\nexport function readValue(value){return value;}',
      rejected: false,
    },
    {
      name: 'TS typed tags negative',
      file: 'scripts/source-contract.mts',
      code: '/** Читает значение.\n * @param {string} value - Исходное значение.\n */\nexport function readValue(value:string){return value;}',
      rejected: true,
    },
    {
      name: 'throws positive',
      file: 'scripts/source-contract.mts',
      code: '/** Читает значение.\n * @throws {TypeError} Если значение недоступно.\n */\nexport function readValue(){throw new TypeError();}',
      rejected: false,
    },
    {
      name: 'throws class negative',
      file: 'scripts/source-contract.mts',
      code: '/** Читает значение.\n * @throws Если значение недоступно.\n */\nexport function readValue(){throw new TypeError();}',
      rejected: true,
    },
    {
      name: 'throws RU condition negative',
      file: 'scripts/source-contract.mts',
      code: '/** Читает значение.\n * @throws {TypeError} If the value is unavailable.\n */\nexport function readValue(){throw new TypeError();}',
      rejected: true,
    },
  ];
  for (const fixture of cases)
    await context.test(fixture.name, async () => {
      const results = await eslint.lintText(fixture.code, { filePath: fixture.file });
      assert.equal(results[0].fatalErrorCount, 0, 'A parser failure is not contract enforcement');
      const source = await withSourceTree({ [fixture.file]: fixture.code }, (root) =>
        inspectSourceConventions({ root }),
      );
      const errors = [
        ...results[0].messages.filter((message) => message.severity === 2),
        ...source.violations,
      ];
      assert.equal(errors.length > 0, fixture.rejected, JSON.stringify(errors));
    });
});

test('quality formatter rejects unformatted source after its positive setup', async () => {
  const prettier = await import('prettier');
  const options = await prettier.resolveConfig(path.resolve('tests/source-quality.test.ts'));
  assert(options, 'The actual formatter config must load');
  const settings = { ...options, filepath: 'tests/typechecks/source-quality.ts' };
  assert.equal(await prettier.check('const value = 1;\n', settings), true);
  assert.equal(await prettier.check('const value=1', settings), false);
  assert.equal(await prettier.check('const value = 1;\r\n', settings), true);
  assert.equal(await prettier.check('const value=1\r\n', settings), false);
});

test('quality collector rejects ignored owned source after actual covered parser setup', async () => {
  const text = '/** Читает значение. */\nexport function readValue() {\n  return 1;\n}\n';
  const config = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};\nexport default [{files:['**/*.ts'],languageOptions:{parser:tseslint.parser}}];\n`;
  const files = {
    'scripts/owned.ts': text,
    'eslint.config.mjs': config,
    '.prettierrc.json': '{"singleQuote":true,"endOfLine":"auto"}',
  };
  await withSourceTree(files, async (root) => {
    const reports = await collectQualityReports(root, [{ file: 'scripts/owned.ts', text }]);
    assert.equal(reports.length, 1);
    assert.deepEqual(reports[0].findings, []);
  });
  await withSourceTree(
    {
      ...files,
      'eslint.config.mjs': config.replace(
        'export default [',
        "export default [{ignores:['scripts/owned.ts']},",
      ),
    },
    async (root) => {
      await assert.rejects(
        collectQualityReports(root, [{ file: 'scripts/owned.ts', text }]),
        /Owned quality source is ignored or unconfigured/,
      );
    },
  );
});

test('quality original Git blob ignores replacement refs in an owned temporary repository', async () => {
  const sourceRoot = process.cwd(),
    ref = '3f8c986a8a5ddf272afc2ec8c08bc042b369d683',
    file = 'lib/client-project.ts';
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')),
  );
  const git = (directory: string, args: readonly string[], input?: string) =>
    execFileSync('git', ['--no-replace-objects', '-C', directory, ...args], {
      env: environment,
      input,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30000,
    });
  const blob = git(sourceRoot, ['rev-parse', ref + ':' + file]).trim(),
    text = git(sourceRoot, ['cat-file', 'blob', blob]);
  const common = git(sourceRoot, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]).trim();
  const config = `export {default} from ${JSON.stringify(new URL('../eslint.config.mjs', import.meta.url).href)};\n`;
  await withSourceTree(
    {
      [file]: text,
      'eslint.config.mjs': config,
      '.prettierrc.json': await readFile('.prettierrc.json', 'utf8'),
    },
    async (root) => {
      git(root, ['init', '--quiet']);
      await mkdir(path.join(root, '.git', 'objects', 'info'), { recursive: true });
      await writeFile(
        path.join(root, '.git', 'objects', 'info', 'alternates'),
        path.join(common, 'objects').replaceAll('\\', '/') + '\n',
      );
      const ledger = {
        version: 1,
        legacyRef: ref,
        entries: [
          {
            kind: 'legacy',
            file,
            contentHash: qualitySourceHash(text),
            owner: 'core-maintainers',
            reason: 'Проверка чтения фиксированного исходного blob.',
            disposition: 'retained-history',
            reviewCondition: 'Изменение источника требует явного review.',
            formatDebt: true,
            origin: { file, blob },
            findings: [],
          },
        ],
      };
      const positive = await collectLegacyQualityReports(root, ledger);
      assert.equal(positive[0].text, text);
      const fake = git(
        root,
        ['hash-object', '-w', '--stdin'],
        '/** Подмена источника. */\nexport const poison = 1;\n',
      ).trim();
      git(root, ['replace', blob, fake]);
      const replaced = execFileSync('git', ['-C', root, 'cat-file', 'blob', blob], {
        env: environment,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30000,
      });
      assert.notEqual(replaced, text, 'The owned fixture must actually exercise a Git replacement');
      const reports = await collectLegacyQualityReports(root, ledger);
      assert.equal(
        reports[0].text,
        text,
        'Quality provenance must read the original immutable object',
      );
    },
  );
});

test('quality filename diagnostics retain the surviving declaration when a companion is prepended', async () => {
  const file = 'components/task-card.tsx',
    main = '/** Показывает задачу. */\nexport function TaskCard(){return <p/>;}',
    companion =
      '/** Предоставляет контекст. */\nexport function TaskCardProvider(){return <p/>;}\n';
  const before = await withSourceTree({ [file]: main }, (root) =>
    inspectSourceConventions({ root }),
  );
  const after = await withSourceTree({ [file]: companion + main }, (root) =>
    inspectSourceConventions({ root }),
  );
  assert.deepEqual(
    before.violations.map((value) => value.code),
    ['component-filename'],
  );
  assert.deepEqual(
    after.violations.map((value) => value.code),
    ['component-filename'],
  );
  assert.equal(before.violations[0].line, 2);
  assert.equal(after.violations[0].line, 4);
  const invalid = await withSourceTree(
    { 'components/new-card.tsx': main.replaceAll('TaskCard', 'NewCard') },
    (root) => inspectSourceConventions({ root }),
  );
  assert.deepEqual(
    invalid.violations.map((value) => value.code),
    ['component-filename'],
  );
});

test('quality historical ledger fails closed on drift and new growth', async (context) => {
  const text = '/** Старый контракт. */\nexport function legacy(value:any){return value;}\n';
  const finding = {
    tool: 'eslint' as const,
    code: '@typescript-eslint/no-explicit-any',
    line: 2,
    column: 30,
    message: 'Unexpected any.',
  };
  const report: QualityFileReport = {
    file: 'lib/legacy.ts',
    text,
    findings: [finding],
    formatted: false,
  };
  const legacy = { ...report, blob: 'a'.repeat(40) };
  const ledger = {
    version: 1,
    legacyRef: '3f8c986a8a5ddf272afc2ec8c08bc042b369d683',
    entries: [
      {
        kind: 'legacy',
        file: report.file,
        contentHash: qualitySourceHash(text),
        owner: 'core-maintainer',
        reason: 'Неизменённый исходный контракт до миграции.',
        disposition: 'retained-history',
        reviewCondition: 'Изменение этого участка требует закрытия или отдельного review.',
        formatDebt: true,
        origin: { file: report.file, blob: legacy.blob },
        findings: [
          {
            finding,
            proof: {
              currentOffset: 0,
              legacyOffset: 0,
              length: text.trimEnd().length,
              legacyLine: 2,
              legacyColumn: 30,
              fragmentHash: qualitySourceHash(text.trimEnd()),
            },
          },
        ],
      },
    ],
  };
  assert.deepEqual(
    auditQualityLedger([report], ledger, [legacy]),
    [],
    'Actual finite positive must pass before negative cases',
  );
  const fixtures = [
    {
      name: 'new violation',
      reports: [{ ...report, findings: [finding, { ...finding, line: 3 }] }],
      ledger,
    },
    { name: 'stale removed violation', reports: [{ ...report, findings: [] }], ledger },
    {
      name: 'changed source hash',
      reports: [{ ...report, text: text + 'export const next=1;\n' }],
      ledger,
    },
    {
      name: 'wildcard exception',
      reports: [report],
      ledger: { ...ledger, entries: [{ ...ledger.entries[0], file: 'lib/*.ts' }] },
    },
    {
      name: 'unknown source entry',
      reports: [report],
      ledger: {
        ...ledger,
        entries: [...ledger.entries, { ...ledger.entries[0], file: 'lib/missing.ts' }],
      },
    },
    {
      name: 'new migration path cannot become historical',
      reports: [{ ...report, file: 'packages/client/src/new.ts' }],
      ledger: {
        ...ledger,
        entries: [
          {
            ...ledger.entries[0],
            file: 'packages/client/src/new.ts',
            origin: { file: 'packages/client/src/new.ts', blob: legacy.blob },
          },
        ],
      },
    },
    {
      name: 'changed original blob',
      reports: [report],
      ledger: {
        ...ledger,
        entries: [{ ...ledger.entries[0], origin: { file: report.file, blob: 'b'.repeat(40) } }],
      },
    },
    {
      name: 'old finding must identify the same token inside the unchanged fragment',
      reports: [{ ...report, findings: [{ ...finding, column: 31 }] }],
      ledger: {
        ...ledger,
        entries: [
          {
            ...ledger.entries[0],
            findings: [{ ...ledger.entries[0].findings[0], finding: { ...finding, column: 31 } }],
          },
        ],
      },
    },
    {
      name: 'ambiguous old fragment',
      reports: [report],
      ledger,
      legacy: [{ ...legacy, text: text + text }],
    },
    {
      name: 'fixed formatter removes stale debt',
      reports: [{ ...report, formatted: true }],
      ledger,
    },
    {
      name: 'unlisted new source',
      reports: [
        report,
        { file: 'tools/new.ts', text: 'const value=1;', findings: [finding], formatted: true },
      ],
      ledger,
    },
  ];
  for (const fixture of fixtures)
    await context.test(fixture.name, () => {
      assert(
        auditQualityLedger(fixture.reports, fixture.ledger, fixture.legacy ?? [legacy]).length > 0,
      );
    });
  await context.test('the one Link default bridge cannot expand to another file or rule', () => {
    const finding = {
      tool: 'source' as const,
      code: 'component-default-export',
      line: 1,
      column: 1,
      message: 'Named exports required.',
    };
    const technical = {
      file: 'apps/web/src/app/LegacyNavigationLink.tsx',
      text: 'export default Link;',
      findings: [finding],
      formatted: true,
    };
    const entry = {
      ...ledger.entries[0],
      kind: 'next-link-default-bridge',
      file: technical.file,
      contentHash: qualitySourceHash(technical.text),
      disposition: 'remove-in-c6',
      formatDebt: false,
      origin: undefined,
      findings: [{ finding }],
    };
    const admitted = { ...ledger, entries: [entry] };
    assert.deepEqual(auditQualityLedger([technical], admitted, []), []);
    const foreign = { ...technical, file: 'apps/web/src/app/OtherLink.tsx' };
    assert(
      auditQualityLedger(
        [foreign],
        { ...admitted, entries: [{ ...entry, file: foreign.file }] },
        [],
      ).length > 0,
    );
    assert(
      auditQualityLedger(
        [{ ...technical, findings: [{ ...finding, code: 'line-comment' }] }],
        {
          ...admitted,
          entries: [{ ...entry, findings: [{ finding: { ...finding, code: 'line-comment' } }] }],
        },
        [],
      ).length > 0,
    );
  });
  await context.test('overlapping original fragments are not unique', () => {
    const finding = {
      tool: 'eslint' as const,
      code: 'fixture',
      line: 1,
      column: 1,
      message: 'Legacy fixture.',
    };
    const current = { file: 'lib/legacy.ts', text: 'ababa', findings: [finding], formatted: true };
    const entry = {
      ...ledger.entries[0],
      contentHash: qualitySourceHash(current.text),
      formatDebt: false,
      findings: [
        {
          finding,
          proof: {
            currentOffset: 0,
            legacyOffset: 0,
            length: 3,
            legacyLine: 1,
            legacyColumn: 1,
            fragmentHash: qualitySourceHash('aba'),
          },
        },
      ],
    };
    assert(
      auditQualityLedger([current], { ...ledger, entries: [entry] }, [
        { ...current, blob: legacy.blob },
      ]).length > 0,
    );
  });
});

test('agent adapters reference only local accepted requirements and preserve the Next block', async () => {
  const agents = await readFile('AGENTS.md', 'utf8');
  const cursor = await readFile('.cursor/rules/ouro.mdc', 'utf8');
  assert(agents.includes('<!-- BEGIN:nextjs-agent-rules -->'));
  assert(agents.includes('<!-- END:nextjs-agent-rules -->'));
  for (const text of [agents, cursor]) {
    for (const file of [
      'decisions.md',
      'react-stack.md',
      'target-architecture.md',
      'rules-portability.md',
    ]) {
      assert(text.includes(file), `Adapter must reference the local canonical contract: ${file}`);
    }
    assert(!text.includes('C:/Work/') && !text.includes('C:\\Work\\'));
  }
});
