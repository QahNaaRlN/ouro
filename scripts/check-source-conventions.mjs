import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import tseslint from 'typescript-eslint';

/** Реальные owned roots; frontend naming будет применяться отдельно от source scope. */
const ownedRoots = ['apps', 'packages', 'app', 'components', 'lib', 'scripts', 'tests', 'e2e'];
/** Конечные root config/bootstrap entries; новый root source требует явного назначения роли. */
const rootEntries = new Set([
  'eslint.config.mjs',
  'instrumentation.ts',
  'next.config.ts',
  'postcss.config.mjs',
  'playwright.config.ts',
  'playwright.agents-tailwind.config.ts',
  'playwright.binding-recovery.config.ts',
  'playwright.graph-tailwind.config.ts',
  'playwright.human-view-tailwind.config.ts',
  'playwright.impact-lessons.config.ts',
  'playwright.integrations.config.ts',
  'playwright.methodology-tailwind.config.ts',
  'playwright.participants-tailwind.config.ts',
  'playwright.preview-functional.config.ts',
  'playwright.preview-tailwind.config.ts',
  'playwright.process-tailwind.config.ts',
  'playwright.production.config.ts',
  'playwright.proposals-collaboration.config.ts',
  'playwright.receipt-proof.config.ts',
  'playwright.runtime-tailwind.config.ts',
  'playwright.tailwind.config.ts',
  'playwright.verification-tailwind.config.ts',
]);
const sourceExtension = /\.(?:[cm]?[jt]sx?)$/;
const externalDirectories = new Set([
  'node_modules',
  '.git',
  '.operations',
  '.ouro',
  '.ouro-runtime',
]);
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
const slash = (value) => value.replaceAll('\\', '/');
const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pascal = /^[A-Z][A-Za-z0-9]*$/;
const hookName = /^use[A-Z]/;
const queryCalls = new Set([
  'useQuery',
  'useSuspenseQuery',
  'useInfiniteQuery',
  'useSuspenseInfiniteQuery',
  'useQueries',
  'useSuspenseQueries',
]);
const mutationCalls = new Set(['useMutation']);
const frontendModule =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.(?:api|schema|types|query-keys|mutations-keys|mapper|formatter|const|query|port|presentation))?$/;

/** Читает исходники без запуска модулей и без следования directory symlinks. */
function listSourceFiles(root, relative = '') {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = slash(path.join(relative, entry.name));
    if (
      externalDirectories.has(entry.name) ||
      generatedFiles.has(filename) ||
      technicalRoots.some((prefix) => filename.startsWith(prefix))
    )
      return [];
    if (entry.isDirectory()) return listSourceFiles(root, filename);
    return entry.isFile() && sourceExtension.test(entry.name) ? [filename] : [];
  });
}

/** Различает frontend roles и оставшиеся временные Next route conventions. */
function role(file) {
  const frontend =
    /^(?:packages\/frontend\/src|apps\/web\/src|components|app)\//.test(file) &&
    !file.startsWith('app/api/');
  const basename = path.basename(file).replace(/(?:\.d)?\.[cm]?[jt]sx?$/, '');
  const route =
    file.startsWith('app/') &&
    /^(?:page|layout|template|loading|error|global-error|not-found|default|route)$/.test(basename);
  return { frontend, basename, route };
}

/** Выбирает публичные callable declarations без выполнения body и React adapters. */
function publicFunctions(source) {
  const declarations = new Map(),
    exports = [];
  for (const statement of source.statements) {
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    const isDefault =
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ??
      false;
    const reactClass =
      ts.isClassDeclaration(statement) &&
      statement.heritageClauses?.some(
        (clause) =>
          clause.token === ts.SyntaxKind.ExtendsKeyword &&
          clause.types.some((type) =>
            /^(?:React\.)?(?:PureComponent|Component)$/.test(type.expression.getText(source)),
          ),
      );
    if ((ts.isFunctionDeclaration(statement) || reactClass) && statement.name) {
      declarations.set(statement.name.text, statement);
      if (exported)
        exports.push({ name: statement.name.text, local: statement.name.text, isDefault });
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const initializer = declaration.initializer;
        if (
          ts.isArrowFunction(initializer) ||
          ts.isFunctionExpression(initializer) ||
          (ts.isCallExpression(initializer) && /^(?:forwardRef|memo)$/.test(callName(initializer)))
        ) {
          declarations.set(declaration.name.text, initializer);
          if (exported)
            exports.push({
              name: declaration.name.text,
              local: declaration.name.text,
              isDefault: false,
            });
        }
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const entry of statement.exportClause.elements) {
        if (!entry.isTypeOnly && !statement.isTypeOnly)
          exports.push({
            name: entry.name.text,
            local: (entry.propertyName ?? entry.name).text,
            isDefault: false,
          });
      }
    } else if (
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals &&
      ts.isIdentifier(statement.expression)
    ) {
      exports.push({
        name: statement.expression.text,
        local: statement.expression.text,
        isDefault: true,
      });
    }
  }
  return [
    ...new Map(
      exports.map((entry) => [entry.local + ':' + entry.name + ':' + entry.isDefault, entry]),
    ).values(),
  ]
    .filter((entry) => declarations.has(entry.local))
    .map((entry) => ({ ...entry, node: declarations.get(entry.local) }));
}

/** Получает статическое имя hook call, включая React.useState и React.use. */
function callName(node) {
  return ts.isIdentifier(node.expression)
    ? node.expression.text
    : ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name.text
      : '';
}

/** Читает реальное hook coupling; composite lifecycle hook не переименовывается в Query по одному внутреннему вызову. */
function hookCalls(node) {
  const calls = new Set();
  const visit = (child) => {
    if (ts.isCallExpression(child)) calls.add(callName(child));
    ts.forEachChild(child, visit);
  };
  visit(node);
  const returned =
    node.body && ts.isBlock(node.body)
      ? node.body.statements.filter(ts.isReturnStatement).map((statement) => statement.expression)
      : node.body
        ? [node.body]
        : [];
  return {
    coupled: [...calls].some((name) => /^use(?:$|[A-Z])/.test(name)),
    query: returned.some(
      (value) => value && ts.isCallExpression(value) && queryCalls.has(callName(value)),
    ),
    mutation: returned.some(
      (value) => value && ts.isCallExpression(value) && mutationCalls.has(callName(value)),
    ),
  };
}

/** Использует actual comment tokens поддерживаемого parser, включая comments после открывающей скобки. */
function comments(source) {
  const parsed = tseslint.parser.parseForESLint(source.text, {
    filePath: source.fileName,
    ecmaFeatures: { jsx: true },
    comment: true,
    range: true,
  }).ast;
  return parsed.comments
    .filter((comment) => /^\/[/\*]/.test(source.text.slice(comment.range[0], comment.range[1])))
    .map((comment) => ({
      pos: comment.range[0],
      end: comment.range[1],
      kind:
        comment.type === 'Line'
          ? ts.SyntaxKind.SingleLineCommentTrivia
          : ts.SyntaxKind.MultiLineCommentTrivia,
    }));
}

/** Проверяет конечные source/naming/comment contracts; semantic ownership остается у architecture/review. */
function inspectSource(source, file) {
  const violations = [],
    declared = role(file);
  const emit = (code, message, position = 0) => {
    const location = source.getLineAndCharacterOfPosition(position);
    violations.push({
      file,
      line: location.line + 1,
      column: location.character + 1,
      code,
      message,
    });
  };
  if (file.includes('/') ? !ownedRoots.includes(file.split('/')[0]) : !rootEntries.has(file))
    emit('unclassified-source-root', 'Owned source root requires an explicit role.');
  for (const range of comments(source)) {
    const comment = source.text.slice(range.pos, range.end);
    if (/^\/\*\s*(?:eslint\b|prettier-ignore\b)|^\/\/\s*eslint\b/.test(comment)) {
      emit(
        'lint-suppression',
        'Inline quality suppression cannot change the accepted source policy.',
        range.pos,
      );
    } else if (
      range.kind === ts.SyntaxKind.SingleLineCommentTrivia &&
      !/^\/\/\s*@ts-expect-error\s+[^\r\n]*[А-Яа-яЁё]/.test(comment) &&
      !/^\/\/\/\s*<reference\b[^>]*\/>\s*$/.test(comment)
    ) {
      emit(
        'line-comment',
        'Use a responsibility JSDoc or a precise documented technical directive.',
        range.pos,
      );
    }
  }
  if (!declared.frontend) return violations;
  const slice = /^(?:packages\/frontend|apps\/web)\/src\/(.*)\//.exec(file);
  if (slice && slice[1].split('/').some((directory) => !kebab.test(directory)))
    emit('frontend-directory-name', 'Frontend directories use kebab-case.');
  const functions = publicFunctions(source);
  /** Установленный jsdoc publicOnly не видит local Props и публичные memo/forwardRef declarations. */
  const requireContract = (node) => {
    if (!ts.getJSDocCommentsAndTags(node).some(ts.isJSDoc)) {
      emit(
        'missing-contract-jsdoc',
        'Document the responsibility of this React contract.',
        node.getStart(source),
      );
    }
  };
  for (const statement of source.statements) {
    if (
      (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
      statement.name.text.endsWith('Props') &&
      /\.tsx$/.test(file) &&
      !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    )
      requireContract(statement);
  }
  for (const entry of functions) {
    if (ts.isCallExpression(entry.node) && /^(?:memo|forwardRef)$/.test(callName(entry.node))) {
      requireContract(entry.node.parent.parent.parent);
    }
  }
  const components = functions.filter((entry) => pascal.test(entry.name));
  const filenameAnchor = [...components].sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  )[0];
  const hooks = functions
    .filter((entry) => hookName.test(entry.name))
    .map((entry) => ({ ...entry, ...hookCalls(entry.node) }));
  if (components.length && !declared.route) {
    if (!pascal.test(declared.basename) || !/\.tsx$/.test(file))
      emit(
        'component-filename',
        'React components use PascalCase.tsx.',
        filenameAnchor.node.getStart(source),
      );
    else if (!components.some((entry) => entry.name === declared.basename))
      emit(
        'component-export-name',
        'The primary component export matches its filename.',
        filenameAnchor.node.getStart(source),
      );
    if (components.some((entry) => entry.isDefault))
      emit(
        'component-default-export',
        'Owned components expose named exports.',
        components.find((entry) => entry.isDefault).node.getStart(source),
      );
  }
  if (!declared.route && !components.some((entry) => entry.isDefault)) {
    for (const statement of source.statements) {
      const defaultAssignment = ts.isExportAssignment(statement) && !statement.isExportEquals;
      const defaultDeclaration = statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      );
      const defaultReexport =
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.some((element) => element.name.text === 'default');
      if (defaultAssignment || defaultDeclaration || defaultReexport)
        emit(
          'component-default-export',
          'Owned frontend modules expose named exports.',
          statement.getStart(source),
        );
    }
  }
  if (hooks.length) {
    if (
      !components.length &&
      (!hooks.some((entry) => entry.name === declared.basename) || !/\.ts$/.test(file))
    )
      emit(
        'hook-filename',
        'The hook module matches its primary named hook export.',
        hooks[0].node.getStart(source),
      );
    for (const hook of hooks) {
      if (!hook.coupled)
        emit(
          'false-hook',
          'Pure helpers do not use a React hook prefix.',
          hook.node.getStart(source),
        );
      if (hook.query && !hook.name.endsWith('Query'))
        emit(
          'query-hook-name',
          'Direct query hooks expose their Query role.',
          hook.node.getStart(source),
        );
      if (hook.mutation && !hook.name.endsWith('Mutation'))
        emit(
          'mutation-hook-name',
          'Direct mutation hooks expose their Mutation role.',
          hook.node.getStart(source),
        );
    }
    if (hooks.filter((hook) => hook.query || hook.mutation).length > 1)
      emit('multiple-query-hooks', 'One query or mutation hook owns one module.');
  }
  if (
    !components.length &&
    !hooks.length &&
    !declared.route &&
    !frontendModule.test(declared.basename)
  )
    emit(
      'pure-module-filename',
      'Pure frontend modules use kebab-case and the accepted semantic suffixes.',
    );
  return violations;
}

/**
 * Проверяет actual owned source scope и конечные naming/comment contracts по AST.
 * @param options - Корень и явно выбранные относительные fixture entries.
 * @returns Прочитанные файлы и нарушения включенных проверок.
 * @example
 * inspectSourceConventions({ root: process.cwd() })
 */
export function inspectSourceConventions(options) {
  const root = path.resolve(options.root);
  const entries = options.entryFiles ?? [...listSourceFiles(root)];
  const files = [...new Set(entries.map(slash))].sort();
  return {
    files,
    filesChecked: files.length,
    violations: files.flatMap((filename) =>
      inspectSourceConventionText(filename, fs.readFileSync(path.join(root, filename), 'utf8')),
    ),
  };
}

/**
 * Проверяет immutable текст тем же AST reader для доказательства происхождения старого нарушения.
 * @param file - Относительный путь, определяющий роль исходника.
 * @param text - Полный текст текущего либо исходного Git blob.
 * @returns Нарушения тех же source rules, без чтения и выполнения модуля.
 */
export function inspectSourceConventionText(file, text) {
  return inspectSource(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), file);
}
