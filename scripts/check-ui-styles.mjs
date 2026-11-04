import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import postcss from 'postcss';
import ts from 'typescript';

const ignored = new Set(['node_modules', '.git', '.next', '.operations', '.turbo', 'dist', 'artifacts', 'test-results', 'playwright-report', 'coverage']);
const normalized = value => value.replace(/\r\n?/g, '\n');
const hash = value => createHash('sha256').update(normalized(value), 'utf8').digest('hex');
const slash = value => value.replaceAll('\\', '/');
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
const literalName = node => node && (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) ? node.text : undefined;
const memberName = node => ts.isPropertyAccessExpression(node) ? node.name.text : ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : undefined;
const isStyleAccess = node => !!node && memberName(node) === 'style';

/** Обходит собственные исходники, не загружая приложение или generated output. */
function files(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name)) return [];
    if (entry.isSymbolicLink()) throw new Error('Unverified symbolic source/junction: ' + path.join(root, entry.name));
    const filename = path.join(root, entry.name);
    return entry.isDirectory() ? files(filename) : [filename];
  });
}

/** Собирает точные CSS и frontend style expressions с нормализацией переносов строк. */
function collectStyles(root) {
  const css = [], inline = [], problems = [];
  const sourceFiles = files(root), contexts = new Map();
  for (const filename of sourceFiles) {
    const file = slash(path.relative(root, filename));
    if (filename.toLowerCase().endsWith('.css')) {
      const source = fs.readFileSync(filename, 'utf8'), parsed = postcss.parse(source, { from: file });
      let ordinaryRules = 0, legacyLayer = false;
      parsed.walkRules(rule => {
        let ancestor = rule.parent;
        while (ancestor && !(ancestor.type === 'atrule' && /(?:^|-)keyframes$/.test(ancestor.name))) ancestor = ancestor.parent;
        if (!ancestor) ordinaryRules++;
      });
      parsed.walkAtRules(rule => {
        if (rule.name === 'apply') problems.push(file + ': bulk @apply cannot complete this migration');
        if (rule.name === 'layer' && /\bouro-legacy\b/.test(rule.params)) legacyLayer = true;
      });
      css.push({ file, sha256: hash(source), ordinaryRules, legacyLayer });
    }
    if (!/\.(?:[cm]?[jt]sx?)$/.test(file) || !/^(?:app\/|components\/|packages\/frontend\/src\/|apps\/web\/src\/|lib\/workspace-graph\.ts$)/.test(file)) continue;
    const source = fs.readFileSync(filename, 'utf8'), parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    if (parsed.parseDiagnostics.length) throw new Error('Cannot parse UI source: ' + file);
    const expressions = new Map(), occurrences = new Map();
    const add = (kind, node) => {
      const identity = kind + ':' + hash(printer.printNode(ts.EmitHint.Unspecified, node, parsed));
      const nodes = occurrences.get(identity) ?? []; nodes.push(node); occurrences.set(identity, nodes);
      const old = expressions.get(identity);
      if (old) old.count++;
      else expressions.set(identity, { kind, sha256: identity.slice(kind.length + 1), count: 1 });
    };
    const visit = node => {
      if (ts.isJsxAttribute(node) && node.name.text === 'style') add('jsx', node.initializer ?? node);
      else if (ts.isPropertyAssignment(node) && ['style', 'labelStyle', 'labelBgStyle'].includes(literalName(node.name))) add('graph', node.initializer);
      else if (ts.isShorthandPropertyAssignment(node) && ['style', 'labelStyle', 'labelBgStyle'].includes(node.name.text)) add('graph', node.name);
      else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))) {
        const receiver = node.left.expression;
        if (isStyleAccess(node.left) || isStyleAccess(receiver)) add('dom', node);
      } else if (ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))) {
        const method = node.expression, name = memberName(method), attributeIndex = name === 'setAttributeNS' ? 1 : 0;
        if (name === 'setProperty' && isStyleAccess(method.expression)) add('dom', node);
        if (['setAttribute', 'setAttributeNS'].includes(name) && node.arguments[attributeIndex] && ts.isStringLiteralLike(node.arguments[attributeIndex]) && node.arguments[attributeIndex].text === 'style') add('dom', node);
        if (name === 'assign' && ts.isIdentifier(method.expression) && method.expression.text === 'Object' && isStyleAccess(node.arguments[0])) add('dom', node);
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
    contexts.set(file, { source, parsed, occurrences });
    if (expressions.size) inline.push({ file, sha256: hash(source), expressions: [...expressions.values()].sort((a, b) => (a.kind + a.sha256).localeCompare(b.kind + b.sha256)) });
  }
  return { inventory: { css: css.sort((a, b) => a.file.localeCompare(b.file)), inline: inline.sort((a, b) => a.file.localeCompare(b.file)), problems }, contexts, sourceFiles: new Set(sourceFiles.map(filename => slash(path.relative(root, filename)))) };
}

/** Сохраняет прежний JSON inventory; AST metadata не попадают в ledgers или --print. */
export function inventoryStyles(root) { return collectStyles(root).inventory; }

const exactKeys = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const customProperty = value => typeof value === 'string' && /^--[a-zA-Z_][a-zA-Z0-9_-]{0,197}$/.test(value);
const expressionId = value => value.kind + ':' + value.sha256;

/** Снимает только прозрачные TS-обёртки, не вычисляя приложение. */
function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}

/** Проверяет конечную форму geometry/custom-properties и явно хешированные helper chains. */
function technicalShape(root, file, entries, dependencies, collection) {
  const declared = new Map(dependencies.map(value => [value.file, value.sha256])), used = new Set(), infos = new Map(), active = new Set();
  let steps = 0, parameters = new Map();
  const rootName = node => { node = unwrap(node); while (node && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))) node = unwrap(node.expression); return node && ts.isIdentifier(node) ? node.text : undefined; };
  const safeMember = node => { node = unwrap(node); while (node && ts.isPropertyAccessExpression(node)) node = unwrap(node.expression); return !!node && ts.isIdentifier(node); };
  const info = current => {
    if (infos.has(current)) return infos.get(current);
    if (!collection.sourceFiles.has(current) || !/\.(?:[cm]?[jt]sx?)$/.test(current)) throw new Error('Unknown helper source');
    const cached = collection.contexts.get(current), source = cached?.source ?? fs.readFileSync(path.join(root, current), 'utf8'), parsed = cached?.parsed ?? ts.createSourceFile(current, source, ts.ScriptTarget.Latest, true);
    if (parsed.parseDiagnostics.length) throw new Error('Invalid helper source');
    if (current !== file) { if (declared.get(current) !== hash(source)) throw new Error('Missing or changed helper dependency'); used.add(current); }
    const bindings = new Map(), written = new Set(), escaped = new Set();
    const bind = (name, node) => { const found = bindings.get(name) ?? []; found.push(node); bindings.set(name, found); };
    const bindName = (name, node) => {
      if (ts.isIdentifier(name)) bind(name.text, node);
      else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) for (const entry of name.elements) if (ts.isBindingElement(entry)) bindName(entry.name, node);
    };
    const writeTarget = value => {
      const node = unwrap(value); if (!node) return;
      const name = rootName(node); if (name) { written.add(name); return; }
      if (ts.isObjectLiteralExpression(node)) for (const entry of node.properties) {
        if (ts.isShorthandPropertyAssignment(entry)) written.add(entry.name.text);
        else if (ts.isPropertyAssignment(entry)) writeTarget(entry.initializer);
        else if (ts.isSpreadAssignment(entry)) writeTarget(entry.expression);
      }
      if (ts.isArrayLiteralExpression(node)) for (const entry of node.elements) writeTarget(ts.isSpreadElement(entry) ? entry.expression : entry);
    };
    const visit = node => {
      if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) && node.name) bindName(node.name, node);
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(unwrap(node.initializer))) escaped.add(unwrap(node.initializer).text);
      if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node) || ts.isImportClause(node) && node.name) bind(node.name.text, node);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) writeTarget(node.left);
      if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && !ts.isVariableDeclarationList(node.initializer)) writeTarget(node.initializer);
      if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) { const name = rootName(node.operand); if (name) written.add(name); }
      if (ts.isCallExpression(node)) for (const argument of node.arguments) if (ts.isIdentifier(unwrap(argument))) escaped.add(unwrap(argument).text);
      ts.forEachChild(node, visit);
    };
    visit(parsed); const value = { source, parsed, bindings, written, escaped }; infos.set(current, value); return value;
  };
  const binding = (current, name) => { const source = info(current), found = source.bindings.get(name); if (found?.length !== 1 || source.written.has(name)) throw new Error('Ambiguous or mutable geometry binding'); return found[0]; };
  const constant = node => ts.isVariableDeclaration(node) && ts.isVariableDeclarationList(node.parent) && !!(node.parent.flags & ts.NodeFlags.Const) && node.initializer;
  const intrinsic = (node, current) => {
    if (!ts.isCallExpression(node) || node.arguments.some(ts.isSpreadElement)) return false;
    const target = unwrap(node.expression), source = info(current);
    if (ts.isIdentifier(target) && target.text === 'parseFloat' && !source.bindings.has('parseFloat')) { const argument = unwrap(node.arguments[0]); return node.arguments.length === 1 && !!argument && ts.isPropertyAccessExpression(argument) && /^border(?:Top|Bottom|Left|Right)Width$/.test(argument.name.text) && !!rootName(argument) && safeMember(argument); }
    return ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression) && target.expression.text === 'Math' && !source.bindings.has('Math') && ['max', 'min', 'round', 'ceil', 'floor', 'abs'].includes(target.name.text) && node.arguments.length > 0 && node.arguments.every(argument => numeric(argument, current));
  };
  const safeComputation = (node, current) => { let valid = true; const visit = value => { if (ts.isCallExpression(value) && !intrinsic(value, current) || ts.isArrowFunction(value) || ts.isFunctionExpression(value) || ts.isNewExpression(value) || ts.isSpreadElement(value) || ts.isSpreadAssignment(value) || ts.isMethodDeclaration(value) || ts.isGetAccessor(value) || ts.isSetAccessor(value)) valid = false; ts.forEachChild(value, visit); }; visit(node); return valid; };
  const guarded = (node, current, inspect) => { const key = current + ':' + node.pos; if (++steps > 128 || active.has(key)) throw new Error('Cyclic or oversized helper chain'); active.add(key); try { return inspect(); } finally { active.delete(key); } };
  const numeric = (value, current) => {
    const node = unwrap(value); if (!node) return false;
    if (ts.isNumericLiteral(node)) return Number.isFinite(Number(node.text));
    if (ts.isPropertyAccessExpression(node)) return safeMember(node);
    if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(node.operator)) return numeric(node.operand, current);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.AsteriskAsteriskToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) return numeric(node.left, current) && numeric(node.right, current);
    if (ts.isCallExpression(node)) return intrinsic(node, current);
    if (ts.isIdentifier(node)) { const found = binding(current, node.text); if (ts.isParameter(found)) return true; if (!constant(found)) return false; return guarded(found, current, () => numeric(found.initializer, current)); }
    return false;
  };
  const scalar = (value, current) => {
    const node = unwrap(value); if (!node) return false;
    if (ts.isStringLiteralLike(node)) return node.text === 'auto' || /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)$/.test(node.text);
    if (ts.isTemplateExpression(node)) return node.head.text === '' && node.templateSpans.length === 1 && /^(?:px|%)$/.test(node.templateSpans[0].literal.text) && numeric(node.templateSpans[0].expression, current);
    return numeric(node, current);
  };
  /** Отклоняет доказуемые literal-only значения, не выдавая оставшиеся runtime reads за numeric provenance. */
  const lexicalBinding = (current, name, reference) => {
    const matches = (info(current).bindings.get(name) ?? []).map(node => {
      let scope = node.parent;
      if (!ts.isParameter(node)) while (scope && !ts.isBlock(scope) && !ts.isSourceFile(scope) && !ts.isModuleBlock(scope)) scope = scope.parent;
      return { node, scope };
    }).filter(value => value.scope && reference.pos >= value.scope.pos && reference.end <= value.scope.end).sort((left, right) => (left.scope.end - left.scope.pos) - (right.scope.end - right.scope.pos));
    if (matches.length > 1 && matches[0].scope === matches[1].scope) throw new Error('Ambiguous constant geometry origin');
    return matches[0]?.node;
  };
  const origin = (value, current, environment, seen = new Set()) => {
    const node = unwrap(value); if (!node || !ts.isIdentifier(node)) return { node, file: current, environment };
    const found = lexicalBinding(current, node.text, node), argument = environment.get(node.text);
    if (found && ts.isParameter(found) && argument?.parameter === found) return origin(argument.node, argument.file, argument.environment, seen);
    if (found && ts.isVariableDeclaration(found)) {
      if (!constant(found)) throw new Error('Mutable geometry origin');
      const key = current + ':' + found.pos; if (seen.has(key) || seen.size > 32) throw new Error('Cyclic constant geometry origin');
      return origin(found.initializer, current, environment, new Set([...seen, key]));
    }
    return { node, file: current, environment };
  };
  const staticValue = (value, current, environment = parameters, depth = 0) => {
    if (depth > 64) throw new Error('Oversized constant geometry expression');
    const context = origin(value, current, environment), node = context.node; if (!node) return true;
    const next = child => staticValue(child, context.file, context.environment, depth + 1);
    if (ts.isNumericLiteral(node) || ts.isStringLiteralLike(node) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return true;
    if (ts.isIdentifier(node)) return ['undefined', 'NaN', 'Infinity'].includes(node.text) && !lexicalBinding(context.file, node.text, node);
    if (ts.isObjectLiteralExpression(node)) return node.properties.every(value => ts.isPropertyAssignment(value) && literalName(value.name) !== undefined && next(value.initializer));
    if (ts.isArrayLiteralExpression(node)) return node.elements.every(value => !ts.isSpreadElement(value) && next(value));
    if (ts.isTemplateExpression(node)) return node.templateSpans.every(value => next(value.expression));
    if (ts.isPrefixUnaryExpression(node)) return next(node.operand);
    if (ts.isBinaryExpression(node)) return next(node.left) && next(node.right);
    if (ts.isConditionalExpression(node)) return next(node.condition) && next(node.whenTrue) && next(node.whenFalse);
    if (ts.isCallExpression(node)) return intrinsic(node, context.file) && node.arguments.every(next);
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'Math' && !info(context.file).bindings.has('Math') && ['E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'PI', 'SQRT1_2', 'SQRT2'].includes(node.name.text)) return true;
      const target = origin(node.expression, context.file, context.environment);
      if (target.node && ts.isObjectLiteralExpression(target.node)) {
        if (target.node.properties.some(value => !ts.isPropertyAssignment(value) || literalName(value.name) === undefined)) throw new Error('Unknown literal geometry argument');
        const properties = target.node.properties.filter(value => literalName(value.name) === node.name.text);
        return properties.every(value => staticValue(value.initializer, target.file, target.environment, depth + 1));
      }
      if (target.node && ts.isArrayLiteralExpression(target.node) && node.name.text === 'length') return target.node.elements.every(value => !ts.isSpreadElement(value));
    }
    return false;
  };
  const imported = (node, current) => {
    if (!ts.isImportSpecifier(node) || node.isTypeOnly || node.parent.parent.isTypeOnly) throw new Error('Only named runtime helper imports are supported');
    const statement = node.parent.parent.parent, specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteralLike(specifier) || !/^\.{1,2}\//.test(specifier.text)) throw new Error('Only relative helper imports are supported');
    const base = path.resolve(root, path.dirname(current), specifier.text), candidates = [base, ...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].map(extension => base + extension), ...['index.ts', 'index.tsx', 'index.js'].map(name => path.join(base, name))].map(value => slash(path.relative(root, value))).filter(value => collection.sourceFiles.has(value));
    if (candidates.length !== 1) throw new Error('Unknown or ambiguous helper path');
    const target = candidates[0], name = (node.propertyName ?? node.name).text, found = binding(target, name);
    const declaration = ts.isVariableDeclaration(found) ? found.parent.parent : found;
    if (!declaration.modifiers?.some(value => value.kind === ts.SyntaxKind.ExportKeyword)) throw new Error('Helper is not a direct named export');
    return { file: target, node: found };
  };
  const helper = (node, current, argumentsInfo) => {
    if (ts.isImportSpecifier(node)) { const target = imported(node, current); return guarded(node, current, () => helper(target.node, target.file, argumentsInfo)); }
    let fn = node;
    if (ts.isVariableDeclaration(node)) { if (!constant(node)) return -1; fn = unwrap(node.initializer); }
    if (!ts.isFunctionDeclaration(fn) && !ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn) || !fn.body || fn.parameters.length !== argumentsInfo.nodes.length || fn.parameters.some(value => !ts.isIdentifier(value.name) || value.dotDotDotToken || value.initializer)) return -1;
    return guarded(node, current, () => {
      const previous = parameters; parameters = new Map(fn.parameters.map((parameter, index) => [parameter.name.text, { parameter, node: argumentsInfo.nodes[index], file: argumentsInfo.file, environment: argumentsInfo.environment }]));
      try {
        if (!ts.isBlock(fn.body)) return shape(fn.body, current);
        const statements = fn.body.statements, last = statements.at(-1);
        if (!last || !ts.isReturnStatement(last) || !last.expression || !statements.slice(0, -1).every(value => ts.isVariableStatement(value) && !!(value.declarationList.flags & ts.NodeFlags.Const) && value.declarationList.declarations.every(declaration => ts.isIdentifier(declaration.name) && declaration.initializer && safeComputation(declaration.initializer, current)))) return -1;
        return shape(last.expression, current);
      } finally { parameters = previous; }
    });
  };
  const shape = (value, current) => {
    const node = unwrap(value); if (!node) return -1;
    if (ts.isIdentifier(node) && node.text === 'undefined' && !info(current).bindings.has('undefined')) return 0;
    if (ts.isConditionalExpression(node)) { if (!safeComputation(node.condition, current)) return -1; const yes = shape(node.whenTrue, current), no = shape(node.whenFalse, current); return yes < 0 || no < 0 ? -1 : yes + no; }
    if (ts.isObjectLiteralExpression(node)) {
      const names = new Set(); let runtime = false; if (!node.properties.length) return -1;
      for (const property of node.properties) { if (!ts.isPropertyAssignment(property) || !ts.isStringLiteralLike(property.name) || !customProperty(property.name.text) || names.has(property.name.text) || !scalar(property.initializer, current)) return -1; names.add(property.name.text); }
      for (const property of node.properties) if (!staticValue(property.initializer, current)) runtime = true;
      return runtime ? 1 : -1;
    }
    if (ts.isIdentifier(node)) { const found = binding(current, node.text); if (!constant(found) || info(current).escaped.has(node.text)) return -1; return guarded(found, current, () => shape(found.initializer, current)); }
    if (ts.isCallExpression(node) && ts.isIdentifier(unwrap(node.expression)) && !node.arguments.some(ts.isSpreadElement) && node.arguments.every(value => safeComputation(value, current))) return helper(binding(current, unwrap(node.expression).text), current, { nodes: node.arguments, file: current, environment: parameters });
    return -1;
  };
  try {
    for (const entry of entries) {
      const occurrences = collection.contexts.get(file)?.occurrences.get(expressionId(entry)); if (occurrences?.length !== entry.count) return false;
      for (const occurrence of occurrences) {
        const node = unwrap(occurrence);
        if (entry.kind === 'dom') {
          if (!ts.isCallExpression(node) || !(ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression)) || memberName(node.expression) !== 'setProperty' || !isStyleAccess(node.expression.expression) || node.arguments.length !== 2 || !ts.isStringLiteralLike(node.arguments[0]) || !customProperty(node.arguments[0].text) || !scalar(node.arguments[1], file)) return false;
          const value = unwrap(node.arguments[1]), reset = ts.isStringLiteralLike(value) && value.text === 'auto';
          if (!reset && staticValue(value, file)) return false;
        } else {
          const value = ts.isJsxExpression(node) ? node.expression : node;
          if (shape(value, file) <= 0) return false;
        }
      }
    }
    return [...declared.keys()].every(value => used.has(value));
  } catch { return false; }
}

/** Проверяет, что обычные стили не выходят за явно назначенный миграционный остаток. */
export function inspectStyles(options) {
  const collection = collectStyles(options.root), inventory = collection.inventory;
  const violations = [...inventory.problems], ledger = options.ledger;
  const validPath = value => typeof value === 'string' && value && !value.includes('\\') && !/^[a-z]:/i.test(value) && !path.isAbsolute(value) && !value.split('/').some(part => part === '..') && !/[*?{}]/.test(value);
  const owned = record => record && validPath(record.file) && /^[a-f0-9]{64}$/.test(record.sha256) && typeof record.owner === 'string' && record.owner.trim();
  if (!ledger || ledger.contract !== 'ouro-style-debt/v1' || !Array.isArray(ledger.css) || !Array.isArray(ledger.inline) || !ledger.technicalCss || typeof ledger.technicalCss !== 'object' || Array.isArray(ledger.technicalCss)) {
    return { violations: [...violations, 'Invalid style-debt ledger'], inventory, remaining: { cssFiles: inventory.css.length, inlineFiles: inventory.inline.length } };
  }
  const cssDebt = new Map(), inlineDebt = new Map(), consumedCss = new Set(), consumedInline = new Set();
  for (const [records, table, label] of [[ledger.css, cssDebt, 'CSS'], [ledger.inline, inlineDebt, 'inline']]) {
    for (const record of records) {
      if (!owned(record) || table.has(record.file)) { violations.push('Invalid or duplicate owned ' + label + ' debt'); continue; }
      table.set(record.file, record);
    }
  }
  const technical = new Map();
  for (const [file, policy] of Object.entries(ledger.technicalCss)) {
    if (!validPath(file) || !policy || !['tailwind', 'base-theme', 'keyframes', 'fonts'].includes(policy.kind) || typeof policy.reason !== 'string' || !policy.reason.trim() || cssDebt.has(file)) { violations.push('Invalid technical CSS policy: ' + file); continue; }
    technical.set(file, policy);
  }
  const bodyProperties = new Set(['margin', 'min-height', 'background', 'color', 'font-family', 'font-size', 'line-height']);
  const baseRule = rule => {
    const selectors = rule.selector.split(',').map(value => value.trim());
    return selectors.every(selector => {
      if (/^:root(?:\[data-theme=["']light["']\])?$/.test(selector)) return (rule.nodes ?? []).every(node => node.type === 'comment' || node.type === 'decl' && (node.prop.startsWith('--') || node.prop === 'color-scheme') && !node.important);
      if (selector === '*') return (rule.nodes ?? []).every(node => node.type === 'comment' || node.type === 'decl' && node.prop === 'box-sizing' && !node.important);
      if (selector === 'html' || selector === 'body') return (rule.nodes ?? []).every(node => node.type === 'comment' || node.type === 'decl' && bodyProperties.has(node.prop) && !node.important);
      return false;
    });
  };
  let ordinaryCssFiles = 0;
  for (const record of inventory.css) {
    const policy = technical.get(record.file), debt = cssDebt.get(record.file);
    if (policy) {
      technical.delete(record.file);
      const parsed = postcss.parse(fs.readFileSync(path.join(options.root, record.file), 'utf8'));
      let valid = true;
      parsed.walkRules(rule => {
        let ancestor = rule.parent;
        while (ancestor && !(ancestor.type === 'atrule' && /(?:^|-)keyframes$/.test(ancestor.name))) ancestor = ancestor.parent;
        if (!ancestor && (policy.kind !== 'base-theme' || !baseRule(rule))) valid = false;
        if (ancestor && policy.kind !== 'keyframes') valid = false;
      });
      parsed.walkAtRules(rule => {
        const allowed = policy.kind === 'tailwind' ? ['layer', 'import', 'source', 'theme', 'custom-variant', 'media', 'slot'] : policy.kind === 'fonts' ? ['layer', 'font-face', 'import'] : policy.kind === 'keyframes' ? ['layer', 'keyframes', '-webkit-keyframes'] : ['layer'];
        if (!allowed.includes(rule.name)) valid = false;
        if (rule.name === 'import') {
          const target = /^(?:"([^"]+)"|'([^']+)')/.exec(rule.params)?.slice(1).find(Boolean);
          if (!target || !(policy.kind === 'tailwind' ? /^tailwindcss\/(?:theme|utilities)\.css$/.test(target) : /^@fontsource\/(?:inter|jetbrains-mono)\/[\w-]+\.css$/.test(target))) valid = false;
        }
      });
      if (policy.kind === 'tailwind') parsed.walkDecls(declaration => {
        if (declaration.parent?.type !== 'atrule' || declaration.parent.name !== 'theme' || !declaration.prop.startsWith('--') || declaration.important) valid = false;
      });
      if (!valid) violations.push('Invalid technical CSS content: ' + record.file);
    } else if (debt) {
      consumedCss.add(record.file); ordinaryCssFiles++;
      if (record.sha256 !== debt.sha256 || record.ordinaryRules !== debt.ordinaryRules || record.legacyLayer !== debt.legacyLayer) violations.push('Changed ordinary CSS debt requires review: ' + record.file);
    } else { ordinaryCssFiles++; violations.push('Unowned ordinary CSS: ' + record.file); }
    if (options.final && record.legacyLayer) violations.push('Unfinished legacy layer: ' + record.file);
  }
  for (const [file] of technical) violations.push('Stale technical CSS policy: ' + file);
  for (const [file] of cssDebt) if (!consumedCss.has(file)) violations.push('Stale ordinary CSS debt: ' + file);
  const technicalInline = new Map();
  if (ledger.technicalInline !== undefined && !Array.isArray(ledger.technicalInline)) violations.push('Invalid technical inline policies');
  for (const policy of Array.isArray(ledger.technicalInline) ? ledger.technicalInline : []) {
    const entries = new Set(), dependencyFiles = new Set();
    const valid = exactKeys(policy, ['file', 'sha256', 'kind', 'owner', 'reason', 'expressions', 'dependencies']) && owned(policy) && policy.file.split('/').every(value => value && value !== '.') && policy.kind === 'computed-geometry-custom-properties' && typeof policy.reason === 'string' && policy.reason.trim() && Array.isArray(policy.expressions) && policy.expressions.length > 0 && policy.expressions.every(value => {
      const id = value && expressionId(value); if (!exactKeys(value, ['kind', 'sha256', 'count']) || !['jsx', 'graph', 'dom'].includes(value.kind) || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.count) || value.count < 1 || entries.has(id)) return false; entries.add(id); return true;
    }) && Array.isArray(policy.dependencies) && policy.dependencies.every(value => {
      if (!exactKeys(value, ['file', 'sha256']) || !validPath(value.file) || !value.file.split('/').every(value => value && value !== '.') || value.file === policy.file || !/^[a-f0-9]{64}$/.test(value.sha256) || dependencyFiles.has(value.file)) return false; dependencyFiles.add(value.file); return true;
    });
    if (!valid || technicalInline.has(policy.file)) { violations.push('Invalid or duplicate technical inline policy: ' + (policy?.file ?? 'missing file')); continue; }
    technicalInline.set(policy.file, policy);
  }
  let ordinaryInlineFiles = 0;
  for (const record of inventory.inline) {
    const debt = inlineDebt.get(record.file), policy = technicalInline.get(record.file);
    let expressions = record.expressions;
    if (policy) {
      technicalInline.delete(record.file);
      const matches = policy.sha256 === record.sha256 && policy.expressions.every(value => record.expressions.some(actual => expressionId(value) === expressionId(actual) && value.count === actual.count));
      const overlap = debt?.expressions?.some(value => policy.expressions.some(technical => expressionId(value) === expressionId(technical)));
      if (!matches || overlap || !technicalShape(options.root, record.file, policy.expressions, policy.dependencies, collection)) violations.push('Invalid technical inline content/context/dependencies: ' + record.file);
      else expressions = expressions.filter(value => !policy.expressions.some(technical => expressionId(value) === expressionId(technical)));
    }
    if (expressions.length) ordinaryInlineFiles++;
    if (!debt) { if (expressions.length) violations.push('Unowned inline styling: ' + record.file); continue; }
    consumedInline.add(record.file);
    if (!expressions.length || record.sha256 !== debt.sha256 || JSON.stringify(expressions) !== JSON.stringify(debt.expressions)) violations.push('Changed inline styling debt requires review: ' + record.file);
  }
  for (const [file] of technicalInline) violations.push('Stale technical inline policy: ' + file);
  for (const [file] of inlineDebt) if (!consumedInline.has(file)) violations.push('Stale inline styling debt: ' + file);
  if (options.final && (ordinaryCssFiles || ordinaryInlineFiles)) violations.push('Unfinished ordinary styles: remove all CSS/inline debt before final qualification');
  return { violations, inventory, remaining: { cssFiles: ordinaryCssFiles, inlineFiles: ordinaryInlineFiles } };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), root = process.cwd();
    if (args.length === 1 && args[0] === '--print') process.stdout.write(JSON.stringify(inventoryStyles(root), null, 2) + '\n');
    else {
      if (args.some(arg => arg !== '--final') || args.length > 1) throw new Error('Use --print or --final');
      const ledger = JSON.parse(fs.readFileSync(path.join(root, 'docs/proposals/react-vite-migration/style-debt.json'), 'utf8'));
      const result = inspectStyles({ root, ledger, final: args.includes('--final') });
      for (const issue of result.violations) process.stderr.write(issue + '\n');
      process.stdout.write(`UI styles: ${result.remaining.cssFiles} ordinary CSS files, ${result.remaining.inlineFiles} inline-style files remain; ${result.violations.length} violation(s).\n`);
      process.exitCode = result.violations.length ? 1 : 0;
    }
  } catch (error) { process.stderr.write('UI styles failed: ' + (error instanceof Error ? error.message : 'invalid inventory') + '\n'); process.exitCode = 1; }
}
