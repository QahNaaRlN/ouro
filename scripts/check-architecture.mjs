import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const extensions = /\.(?:[cm]?[jt]sx?)$/;
const ignored = new Set(['node_modules', '.git', '.next', 'dist', '.operations']);
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
const frameworks = /^(?:react(?:-dom)?|next|@tauri-apps\/[^/]+)(?:\/|$)/;
const serverDependencies = /^(?:pg|nodemailer|@electric-sql\/pglite|@node-rs\/argon2|@modelcontextprotocol\/sdk)(?:\/|$)/;
const pureLegacyFiles = new Set([
  'lib/client-project.ts', 'lib/project-snapshot.ts', 'lib/project-subscription.ts',
  'lib/agent-client-config.ts', 'lib/workspace-graph.ts', 'lib/workspace-selection.ts',
  'lib/workspace-history-view.ts', 'lib/workspace-proposals-view.ts', 'lib/ouro-logo-geometry.ts', 'lib/select-availability.ts',
]);
const layerRanks = new Map(['shared', 'api', 'entities', 'features', 'widgets', 'pages', 'app'].map((name, index) => [name, index]));
const slash = value => value.replaceAll('\\', '/');
const inside = (root, filename) => {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
const actual = filename => { try { return fs.realpathSync(filename); } catch { return path.resolve(filename); } };
const readJSON = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const packageName = specifier => specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name)) return [];
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : extensions.test(entry.name) ? [filename] : [];
  });
}
function defaultEntries(root) {
  return ['packages', 'apps', 'app', 'components'].flatMap(directory => walk(path.join(root, directory))).filter(filename => {
    const relative = slash(path.relative(root, filename));
    return /^packages\/(?:client|core|protocol|collaboration|meridian|frontend)\/src\//.test(relative)
      || /^apps\/web\/src\//.test(relative) || /^(?:app|components)\/.*\.tsx$/.test(relative);
  });
}
function zone(relative) {
  if (/^packages\/client\/src\/ports\//.test(relative)) return 'ports';
  if (/^packages\/client\/src\/lifecycle\//.test(relative)) return 'lifecycle';
  const purePackage = /^packages\/(core|protocol|collaboration)\//.exec(relative);
  if (purePackage) return purePackage[1];
  if (/^packages\/meridian\/src\/context(?:\.ts|\/)/.test(relative)) return 'context';
  if (/^(?:packages\/frontend\/src|packages\/client\/src\/http|apps\/web\/src|app|components)\//.test(relative)) return 'browser';
  return undefined;
}
function permittedPureDependency(from, to, typeOnly) {
  if (from === 'browser' || !to || from === to) return true;
  if (from === 'protocol') return false;
  if (from === 'context') return to === 'protocol';
  if (from === 'core') return ['protocol', 'context'].includes(to);
  if (from === 'collaboration') return ['core', 'protocol'].includes(to);
  if (from === 'ports') return to === 'protocol' || to === 'core' && typeOnly;
  if (from === 'lifecycle') return ['ports', 'core', 'protocol', 'collaboration', 'context'].includes(to);
  return false;
}
function serverFile(relative) {
  return /^(?:apps\/service|packages\/mcp)\//.test(relative) || /^packages\/meridian\/src\/host\//.test(relative)
    || relative.startsWith('lib/') && !pureLegacyFiles.has(relative);
}
function frontendSlice(relative) {
  const match = /^(?:packages\/frontend|apps\/web)\/src\/(shared|api|entities|features|widgets|pages|app)(?:\/([^/]+))?/.exec(relative);
  return match ? { layer: match[1], slice: ['entities', 'features', 'widgets', 'pages'].includes(match[1]) ? match[2] : undefined } : undefined;
}
function exportTarget(value, conditions, subpath = '.') {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    for (const candidate of value) { const result = exportTarget(candidate, conditions, subpath); if (result !== undefined) return result; }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  if (Object.keys(value).some(key => key.startsWith('.'))) {
    if (Object.hasOwn(value, subpath)) return exportTarget(value[subpath], conditions, subpath);
    for (const pattern of Object.keys(value).filter(key => key.includes('*')).sort((left, right) => right.length - left.length)) {
      const [prefix, suffix] = pattern.split('*');
      if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
      const part = subpath.slice(prefix.length, suffix ? -suffix.length : undefined);
      const result = exportTarget(value[pattern], conditions, subpath);
      if (result !== undefined) return typeof result === 'string' ? result.replaceAll('*', part) : result;
    }
    return undefined;
  }
  for (const [condition, target] of Object.entries(value)) {
    if (condition === 'default' || conditions.has(condition)) { const result = exportTarget(target, conditions, subpath); if (result !== undefined) return result; }
  }
  return undefined;
}
function moduleEdges(source) {
  const edges = [];
  const add = (node, expression, kind, typeOnly = false) => edges.push({ node, specifier: expression && ts.isStringLiteralLike(expression) ? expression.text : null, kind, typeOnly });
  const visit = node => {
    if (ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings;
      const allTypes = bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every(element => element.isTypeOnly) && !node.importClause?.name;
      const typeOnly = !!node.importClause?.isTypeOnly || !!allTypes;
      add(node, node.moduleSpecifier, typeOnly ? 'type' : 'import', typeOnly);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const allTypes = node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every(element => element.isTypeOnly);
      const typeOnly = node.isTypeOnly || !!allTypes;
      add(node, node.moduleSpecifier, typeOnly ? 'type' : 'export', typeOnly);
    } else if (ts.isImportTypeNode(node)) add(node, ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, 'import-type', true);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node, node.moduleReference.expression, node.isTypeOnly ? 'type' : 'require', node.isTypeOnly);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) add(node, node.arguments[0], node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic' : 'require');
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edges;
}

/**
 * Утилита, которая проверяет разрешённые зависимости и контракты клиентских портов.
 * @param options - Корень проверки, входы fixtures и точечные исторические отклонения.
 * @returns Нарушения с исходными местами и использованные записи baseline.
 * @example
 * inspectArchitecture({ root: process.cwd() })
 */
export function inspectArchitecture(options) {
  const root = actual(options.root), relative = filename => slash(path.relative(root, filename));
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  const config = configPath ? ts.readConfigFile(configPath, ts.sys.readFile) : { config: {} };
  const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, root);
  const compilerOptions = { ...parsed.options, allowJs: true, noEmit: true, types: [] };
  const entryFiles = (options.entryFiles ?? defaultEntries(root)).map(filename => actual(path.resolve(root, filename)));
  const baselinePath = path.join(root, 'scripts/architecture-legacy-baseline.json');
  const baseline = options.baseline ?? (fs.existsSync(baselinePath) ? readJSON(baselinePath) : []);
  const violations = [], baselineMatches = [], consumed = new Set(), visited = new Set(), sources = new Map();
  const key = entry => [entry.source, entry.specifier, entry.kind, entry.code].join('\0');
  const validBaseline = new Map();
  for (const entry of baseline) {
    if (!entry || typeof entry.source !== 'string' || !/^(?:app|components)\/.*\.tsx$/.test(entry.source) || /[*?{}\[\]]/.test(entry.source) || !inside(root, path.resolve(root, entry.source))
      || typeof entry.specifier !== 'string' || /[*?{}\[\]]/.test(entry.specifier)
      || !['framework-boundary', 'server-boundary'].includes(entry.code) || !['import', 'type', 'export'].includes(entry.kind)
      || typeof entry.owner !== 'string' || !entry.owner || typeof entry.reason !== 'string' || !entry.reason || validBaseline.has(key(entry))) {
      violations.push({ source: 'scripts/architecture-legacy-baseline.json', specifier: '', kind: 'baseline', code: 'invalid-baseline', line: 1, message: 'Baseline requires one exact owned legacy edge.' });
      continue;
    }
    validBaseline.set(key(entry), entry);
  }
  const emit = (source, node, edge, code, message) => {
    const violation = { source: relative(source.fileName), specifier: edge.specifier ?? '<nonliteral>', kind: edge.kind, code, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, message };
    const accepted = validBaseline.get(key(violation));
    if (accepted) {
      consumed.add(key(violation));
      if (!baselineMatches.includes(accepted)) baselineMatches.push(accepted);
      return true;
    }
    violations.push(violation);
    return false;
  };
  const sourceFile = filename => {
    if (!sources.has(filename)) sources.set(filename, ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true));
    return sources.get(filename);
  };
  const workspacePackages = new Map();
  for (const directory of ['packages', 'apps']) {
    const base = path.join(root, directory);
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      const manifestPath = path.join(base, entry.name, 'package.json');
      if (!entry.isDirectory() || !fs.existsSync(manifestPath)) continue;
      const manifest = readJSON(manifestPath);
      if (typeof manifest.name === 'string') workspacePackages.set(manifest.name, { directory: path.dirname(manifestPath), manifest });
    }
  }
  const resolve = (specifier, importer, edge) => {
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('#')) {
      const name = packageName(specifier);
      let pkg = workspacePackages.get(name);
      if (!pkg) {
        let directory = path.dirname(importer);
        while (true) {
          const manifestPath = path.join(directory, 'node_modules', name, 'package.json');
          if (fs.existsSync(manifestPath)) { pkg = { directory: path.dirname(manifestPath), manifest: readJSON(manifestPath) }; break; }
          const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
        }
      }
      if (pkg && Object.hasOwn(pkg.manifest, 'exports')) {
        const conditions = new Set(edge.typeOnly ? ['types', 'import', 'node'] : edge.kind === 'require' ? ['require', 'node'] : ['import', 'browser']);
        const target = exportTarget(pkg.manifest.exports, conditions, '.' + specifier.slice(name.length));
        if (target) {
          const filename = path.resolve(pkg.directory, target);
          if (inside(pkg.directory, filename) && fs.existsSync(filename)) return actual(filename);
        }
        return undefined;
      }
    }
    const result = ts.resolveModuleName(specifier, importer, compilerOptions, ts.sys).resolvedModule?.resolvedFileName;
    return result ? actual(result) : undefined;
  };
  const checkPorts = (filename, parsedSource) => {
    if (!relative(filename).startsWith('packages/client/src/ports/')) return;
    const program = ts.createProgram([filename], compilerOptions), checker = program.getTypeChecker(), source = program.getSourceFile(filename);
    if (!source) return;
    const unsafeType = (type, seen = new Set(), depth = 0) => {
      if (depth > 5 || seen.has(type) || type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
      seen.add(type);
      if (type.flags & (ts.TypeFlags.Union | ts.TypeFlags.Intersection)) return type.types.some(member => unsafeType(member, seen, depth + 1));
      return type.getProperties().some(property => {
        if (/^(?:url|method|headers|requestInit|executable|shellCommand|commandLine)$/.test(property.name)) return true;
        const declaration = property.valueDeclaration ?? property.declarations?.[0];
        return declaration ? unsafeType(checker.getTypeOfSymbolAtLocation(property, declaration), seen, depth + 1) : false;
      });
    };
    const unsafeResult = (type, seen = new Set(), depth = 0) => {
      if (depth > 8 || seen.has(type) || type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
      seen.add(type);
      if ([type.symbol?.name, type.aliasSymbol?.name].some(name => ['Request', 'Response', 'Headers', 'RequestInit'].includes(name))) return true;
      if (type.flags & (ts.TypeFlags.Union | ts.TypeFlags.Intersection)) return type.types.some(member => unsafeResult(member, seen, depth + 1));
      const argumentsList = type.objectFlags & ts.ObjectFlags.Reference ? checker.getTypeArguments(type) : type.aliasTypeArguments ?? [];
      if (argumentsList.some(argument => unsafeResult(argument, seen, depth + 1))) return true;
      return type.getProperties().some(property => {
        const declaration = property.valueDeclaration ?? property.declarations?.[0];
        return declaration ? unsafeResult(checker.getTypeOfSymbolAtLocation(property, declaration), seen, depth + 1) : false;
      });
    };
    const visit = node => {
      if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name.text.endsWith('Port')) {
        for (const member of checker.getTypeAtLocation(node.name).getProperties()) {
          const name = member.name;
          const methodType = checker.getTypeOfSymbolAtLocation(member, node);
          const signatures = methodType.getCallSignatures();
          if (!signatures.length) continue;
          const unsafe = /^(?:request|fetch|invoke|executeShell|httpRequest|sendRequest)$/.test(name) || signatures.some(signature =>
            signature.parameters.some(parameter => unsafeType(checker.getTypeOfSymbolAtLocation(parameter, parameter.valueDeclaration ?? node)))
            || unsafeResult(checker.getReturnTypeOfSignature(signature)));
          if (unsafe) emit(parsedSource, node, { specifier: name, kind: 'method' }, 'transport-port', 'Client ports expose semantic operations, not generic transport templates.');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  };
  const inspect = (filename, inherited) => {
    if (!inside(root, filename) || !extensions.test(filename)) return;
    const boundary = zone(relative(filename)) ?? inherited;
    if (!boundary || visited.has(filename + '\0' + boundary)) return;
    visited.add(filename + '\0' + boundary);
    const source = sourceFile(filename), from = frontendSlice(relative(filename));
    checkPorts(filename, source);
    for (const edge of moduleEdges(source)) {
      if (edge.specifier === null) { emit(source, edge.node, edge, 'unresolved-dynamic-import', 'Protected modules require a statically inspectable module specifier.'); continue; }
      let code;
      if (edge.specifier.startsWith('node:') || builtins.has(edge.specifier)) code = 'node-boundary';
      else if (frameworks.test(edge.specifier) && (boundary !== 'browser' || edge.specifier === 'next' || edge.specifier.startsWith('next/'))) code = 'framework-boundary';
      else if (serverDependencies.test(edge.specifier)) code = 'server-boundary';
      if (code) { emit(source, edge.node, edge, code, 'Dependency is incompatible with this portable/browser boundary.'); continue; }
      if (/\.(?:css|svg|png|jpg|woff2?)(?:\?|$)/.test(edge.specifier)) {
        if (boundary !== 'browser') emit(source, edge.node, edge, 'asset-boundary', 'Portable contracts cannot import UI assets.');
        continue;
      }
      if (/^packages\/(?:client|frontend)\//.test(relative(filename)) && ts.isExportDeclaration(edge.node) && !edge.node.exportClause) emit(source, edge.node, edge, 'implicit-public-api', 'New public contracts require explicit named reexports.');
      const target = resolve(edge.specifier, filename, edge);
      if (!target) {
        emit(source, edge.node, edge, 'unresolved-module', 'Module could not be resolved; its boundary is unverified.');
        continue;
      }
      if (!inside(root, target)) continue;
      const destination = relative(target);
      if (serverFile(destination)) { emit(source, edge.node, edge, 'server-boundary', 'Browser and pure modules cannot depend on server implementation, including its types.'); continue; }
      const destinationZone = zone(destination);
      if (boundary !== 'browser' && destinationZone === 'browser') { emit(source, edge.node, edge, 'pure-browser-boundary', 'Pure packages cannot import browser/UI adapters or acquire their broader dependency permissions.'); continue; }
      if (boundary === 'context' && /^packages\/core\//.test(destination)) { emit(source, edge.node, edge, 'context-core-boundary', 'Portable Meridian context must not depend back on core.'); continue; }
      if (!permittedPureDependency(boundary, destinationZone, edge.typeOnly)) { emit(source, edge.node, edge, 'package-direction', 'Pure package imports must follow the declared contract/domain dependency direction.'); continue; }
      const to = frontendSlice(destination);
      if (from && to) {
        if (layerRanks.get(from.layer) < layerRanks.get(to.layer)) emit(source, edge.node, edge, 'hfsd-direction', 'Frontend imports point only toward lower layers.');
        else if (from.layer === to.layer && from.slice && to.slice && from.slice !== to.slice && !(from.layer === 'entities' && edge.typeOnly)) emit(source, edge.node, edge, 'cross-slice-dependency', 'Sibling slices require declared public type dependencies.');
        if (to.slice && (from.layer !== to.layer || from.slice !== to.slice) && !/\/index\.(?:[cm]?[jt]sx?)$/.test(destination)) emit(source, edge.node, edge, 'deep-slice-import', 'Other slices import only the explicit public API.');
      }
      inspect(target, boundary);
    }
  };
  for (const filename of entryFiles) inspect(filename, zone(relative(filename)));
  for (const [identity, entry] of validBaseline) if (!consumed.has(identity)) violations.push({ source: entry.source, specifier: entry.specifier, kind: 'baseline', code: 'stale-baseline', line: 1, message: 'Remove the unused legacy exception.' });
  return { violations, baselineMatches, filesChecked: sources.size };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = inspectArchitecture({ root: process.cwd() });
  for (const violation of result.violations) process.stderr.write(violation.source + ':' + violation.line + ' [' + violation.code + '] ' + violation.specifier + ': ' + violation.message + '\n');
  process.stdout.write('Architecture: ' + result.filesChecked + ' files; ' + result.violations.length + ' violation(s); ' + result.baselineMatches.length + ' exact legacy edge(s).\n');
  process.exitCode = result.violations.length ? 1 : 0;
}
