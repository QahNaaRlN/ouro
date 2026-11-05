import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** Реальные owned roots; frontend naming будет применяться отдельно от source scope. */
const ownedRoots = ['apps', 'packages', 'app', 'components', 'lib', 'scripts', 'tests', 'e2e'];
const sourceExtension = /\.(?:[cm]?[jt]sx?)$/;
const externalDirectories = new Set(['node_modules', '.git', '.operations']);
const technicalRoots = [
  '.next/',
  'apps/web/dist/',
  'apps/service/dist/',
  'packages/protocol/dist/',
  'artifacts/',
  'playwright-report/',
  'test-results/',
];
const generatedFiles = new Set(['next-env.d.ts', 'packages/protocol/src/version.ts']);
const slash = value => value.replaceAll('\\', '/');

/** Читает исходники без запуска модулей и без следования directory symlinks. */
function listSourceFiles(root, relative = '') {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = slash(path.join(relative, entry.name));
    if (externalDirectories.has(entry.name) || generatedFiles.has(filename)
      || technicalRoots.some(prefix => filename.startsWith(prefix))) return [];
    if (entry.isDirectory()) return listSourceFiles(root, filename);
    return entry.isFile() && sourceExtension.test(entry.name) ? [filename] : [];
  });
}

/**
 * Собирает actual source scope и читает AST для подготовки конечных source conventions.
 * Bootstrap пока не включает naming/comment rules; negative fixtures должны сначала дать RED.
 * @param options - Корень и явно выбранные относительные fixture entries.
 * @returns Прочитанные файлы и нарушения включенных проверок.
 * @example
 * inspectSourceConventions({ root: process.cwd() })
 */
export function inspectSourceConventions(options) {
  const root = path.resolve(options.root);
  const entries = options.entryFiles ?? [
    ...ownedRoots.flatMap(directory => listSourceFiles(root, directory)),
    ...fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isFile() && sourceExtension.test(entry.name)
        && !generatedFiles.has(entry.name))
      .map(entry => entry.name),
  ];
  const files = [...new Set(entries.map(slash))].sort();
  const sources = files.map(filename => ts.createSourceFile(
    filename,
    fs.readFileSync(path.join(root, filename), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  ));
  return { files: sources.map(source => source.fileName), filesChecked: sources.length, violations: [] };
}
