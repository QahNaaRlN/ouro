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
export function inventoryStyles(root) {
  const css = [], inline = [], problems = [];
  for (const filename of files(root)) {
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
    const expressions = new Map();
    const add = (kind, node) => {
      const identity = kind + ':' + hash(printer.printNode(ts.EmitHint.Unspecified, node, parsed));
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
    if (expressions.size) inline.push({ file, sha256: hash(source), expressions: [...expressions.values()].sort((a, b) => (a.kind + a.sha256).localeCompare(b.kind + b.sha256)) });
  }
  return { css: css.sort((a, b) => a.file.localeCompare(b.file)), inline: inline.sort((a, b) => a.file.localeCompare(b.file)), problems };
}

/** Проверяет, что обычные стили не выходят за явно назначенный миграционный остаток. */
export function inspectStyles(options) {
  const inventory = inventoryStyles(options.root);
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
  for (const record of inventory.inline) {
    const debt = inlineDebt.get(record.file);
    if (!debt) { violations.push('Unowned inline styling: ' + record.file); continue; }
    consumedInline.add(record.file);
    if (record.sha256 !== debt.sha256 || JSON.stringify(record.expressions) !== JSON.stringify(debt.expressions)) violations.push('Changed inline styling debt requires review: ' + record.file);
  }
  for (const [file] of inlineDebt) if (!consumedInline.has(file)) violations.push('Stale inline styling debt: ' + file);
  if (options.final && (ordinaryCssFiles || inventory.inline.length)) violations.push('Unfinished ordinary styles: remove all CSS/inline debt before final qualification');
  return { violations, inventory, remaining: { cssFiles: ordinaryCssFiles, inlineFiles: inventory.inline.length } };
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
