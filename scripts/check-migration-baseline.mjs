import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';

const httpMethods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']);
const receiptAdaptationFiles = new Set([
  'app/api/commands/route.ts',
  'app/api/projects/[projectId]/commands/route.ts',
  'app/api/projects/[projectId]/tasks/route.ts',
]);

/** Утилита, которая читает объявления методов без загрузки обработчиков и хранилища. */
function exportedMethods(file, source) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  if (parsed.parseDiagnostics.length) throw new Error(`Cannot parse route: ${file}`);
  const methods = new Set();
  for (const statement of parsed.statements) {
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (
      exported &&
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      httpMethods.has(statement.name.text)
    )
      methods.add(statement.name.text);
    if (exported && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && httpMethods.has(declaration.name.text))
          methods.add(declaration.name.text);
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly && httpMethods.has(element.name.text))
          methods.add(element.name.text);
      }
    }
  }
  if (!methods.size) throw new Error(`Route has no explicit HTTP method: ${file}`);
  return [...methods].sort();
}

/** Утилита, которая описывает действующий контракт автоматических HTTP-методов Next. */
function implicitMethods(methods) {
  const implemented = new Set(methods);
  if (implemented.has('GET')) implemented.add('HEAD');
  return {
    head: methods.includes('HEAD') ? 'explicit' : methods.includes('GET') ? 'GET' : '405',
    options: methods.includes('OPTIONS')
      ? { kind: 'explicit' }
      : {
          kind: 'automatic',
          status: 204,
          allow: [...new Set([...implemented, 'OPTIONS'])].sort().join(', '),
        },
    unsupported: { status: 405, allowHeader: false },
  };
}

/** Утилита, которая собирает маршруты, методы и отпечатки исходников для проверки переноса. */
async function scanRoutes(root) {
  const directory = path.join(root, 'app', 'api');
  const routes = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && /^route\.[jt]sx?$/.test(entry.name)) {
        const bytes = await readFile(absolute);
        const file = path.relative(root, absolute).split(path.sep).join('/');
        const source = bytes.toString('utf8').replace(/\r\n?/g, '\n');
        const methods = exportedMethods(file, source);
        routes.push({
          file,
          path: '/' + file.slice(4, file.lastIndexOf('/')),
          methods,
          sha256: createHash('sha256').update(source, 'utf8').digest('hex'),
          implicit: implicitMethods(methods),
        });
      }
    }
  }
  await visit(directory);
  return routes.sort((a, b) => a.file.localeCompare(b.file, 'en'));
}

/** Утилита, которая выявляет устаревшие записи исходного HTTP-контракта. */
function compareBaseline(expected, actual, adaptations) {
  if (!expected || expected.contract !== 'ouro-http-baseline/v1' || !Array.isArray(expected.routes))
    return ['Invalid baseline contract or routes'];
  const issues = [],
    byFile = new Map(),
    paths = new Set();
  for (const route of expected.routes) {
    if (
      !route ||
      typeof route.file !== 'string' ||
      typeof route.path !== 'string' ||
      !Array.isArray(route.methods) ||
      !route.methods.length ||
      route.methods.some((method) => !httpMethods.has(method)) ||
      new Set(route.methods).size !== route.methods.length ||
      !/^[a-f0-9]{64}$/.test(route.sha256)
    ) {
      issues.push('Invalid route record');
      continue;
    }
    if (byFile.has(route.file) || paths.has(route.path))
      issues.push(`Duplicate route: ${route.file}`);
    byFile.set(route.file, route);
    paths.add(route.path);
    if (JSON.stringify(route.implicit) !== JSON.stringify(implicitMethods(route.methods)))
      issues.push(`Changed implicit method policy: ${route.file}`);
  }
  const authorized = new Map();
  if (adaptations !== undefined) {
    if (
      !adaptations ||
      Object.keys(adaptations).sort().join(',') !== 'contract,entries,phase' ||
      adaptations.contract !== 'ouro-http-source-adaptations/v1' ||
      adaptations.phase !== 'http-receipt-proof/v1' ||
      !Array.isArray(adaptations.entries) ||
      adaptations.entries.length > receiptAdaptationFiles.size
    )
      issues.push('Invalid source adaptations contract');
    else
      for (const entry of adaptations.entries) {
        const saved = byFile.get(entry?.file);
        if (
          !entry ||
          Object.keys(entry).sort().join(',') !==
            'acceptedSha256,file,originalSha256,owner,rationale,spec' ||
          !receiptAdaptationFiles.has(entry.file) ||
          !saved ||
          authorized.has(entry.file) ||
          entry.owner !== 'HRP' ||
          entry.spec !== 'docs/specs/http-receipt-proof.md' ||
          typeof entry.rationale !== 'string' ||
          !entry.rationale.trim() ||
          entry.rationale.length > 1000 ||
          entry.originalSha256 !== saved.sha256 ||
          !/^[a-f0-9]{64}$/.test(entry.acceptedSha256) ||
          entry.acceptedSha256 === entry.originalSha256
        )
          issues.push(`Invalid source adaptation: ${entry?.file ?? 'missing file'}`);
        else authorized.set(entry.file, entry.acceptedSha256);
      }
  }
  for (const route of actual) {
    const saved = byFile.get(route.file);
    if (!saved) {
      issues.push(`Added route: ${route.file}`);
      continue;
    }
    byFile.delete(route.file);
    if (
      saved.path !== route.path ||
      JSON.stringify([...saved.methods].sort()) !== JSON.stringify(route.methods) ||
      (saved.sha256 !== route.sha256 && authorized.get(route.file) !== route.sha256)
    )
      issues.push(`Changed route contract: ${route.file}`);
  }
  for (const file of byFile.keys()) issues.push(`Removed route: ${file}`);
  return issues;
}

/** Утилита, которая проверяет совместимость явно выбранного дерева исходников. */
async function main() {
  const args = process.argv.slice(2);
  let root = process.cwd(),
    baseline,
    print = false;
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (seen.has(option)) throw new Error('Do not repeat options');
    seen.add(option);
    if (option === '--print') print = true;
    else if (
      (option === '--root' || option === '--baseline') &&
      args[index + 1] &&
      !args[index + 1].startsWith('--')
    ) {
      const value = args[++index];
      if (option === '--root') root = path.resolve(value);
      else baseline = path.resolve(value);
    } else throw new Error('Use --root PATH, --baseline PATH or --print');
  }
  const routes = await scanRoutes(root);
  if (print) {
    process.stdout.write(JSON.stringify(routes, null, 2) + '\n');
    return;
  }
  const expected = JSON.parse(
    await readFile(
      baseline ?? path.join(root, 'docs/proposals/react-vite-migration/http-baseline.json'),
      'utf8',
    ),
  );
  let adaptations;
  try {
    adaptations = JSON.parse(
      await readFile(
        path.join(root, 'docs/proposals/react-vite-migration/http-source-adaptations.json'),
        'utf8',
      ),
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const issues = compareBaseline(expected, routes, adaptations);
  if (issues.length) throw new Error(issues.join('\n'));
  process.stdout.write(
    `Migration baseline passed: ${routes.length} routes, ${routes.reduce((count, route) => count + route.methods.length, 0)} explicit method exports.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `Migration baseline failed: ${error instanceof Error ? error.message : 'invalid baseline'}\n`,
  );
  process.exitCode = 1;
});
