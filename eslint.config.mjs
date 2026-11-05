import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

/** Полная область owned source, включая tests и новые source roots. */
const sourceFiles = ['**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'];

/** Только технические outputs и внешняя installation, без исключения owned source directories. */
const technicalIgnores = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.operations/**',
  '.next/**',
  'apps/web/dist/**',
  'apps/service/dist/**',
  'packages/protocol/dist/**',
  'artifacts/**',
  'playwright-report/**',
  'test-results/**',
  'next-env.d.ts',
  'packages/protocol/src/version.ts',
];

/** Конечные декларации контракта; callbacks и barrel reexports не становятся public functions. */
const declarations = [
  'ClassDeclaration',
  'FunctionDeclaration',
  'ArrowFunctionExpression',
  'FunctionExpression',
  'TSDeclareFunction',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'ExportNamedDeclaration[declaration.type="VariableDeclaration"]',
];

/** Проверяет принятые semantic rules без stylistic/recommended расширения исторического долга. */
export default [
  { ignores: technicalIgnores },
  {
    files: sourceFiles,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.es2022,
    },
    plugins: {
      js,
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
      jsdoc,
    },
    settings: { jsdoc: { mode: 'typescript' } },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: { esm: true, cjs: true, window: false, ancestorsOnly: false },
          require: {
            ClassDeclaration: true,
            FunctionDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
          contexts: ['TSDeclareFunction', 'TSInterfaceDeclaration', 'TSTypeAliasDeclaration'],
          enableFixer: false,
        },
      ],
      'jsdoc/require-description': ['error', { descriptionStyle: 'body', contexts: declarations }],
      'jsdoc/match-description': [
        'error',
        {
          contexts: declarations,
          matchDescription: '^(?=[\\s\\S]*[А-Яа-яЁё])[\\s\\S]+$',
          tags: {
            param: true,
            arg: true,
            argument: true,
            returns: true,
            return: true,
            throws: true,
            exception: true,
          },
        },
      ],
      'jsdoc/require-throws-type': 'error',
      'jsdoc/require-throws-description': 'error',
      'jsdoc/sort-tags': [
        'error',
        {
          tagSequence: [
            {
              tags: [
                'template',
                'param',
                'arg',
                'argument',
                'returns',
                'return',
                'throws',
                'exception',
                'example',
                'see',
                '-other',
              ],
            },
          ],
          reportTagGroupSpacing: false,
          reportIntraTagGroupSpacing: false,
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { '@typescript-eslint/no-explicit-any': 'error', 'jsdoc/no-types': 'error' },
  },
  {
    files: ['scripts/**', 'lib/**', 'tests/**', 'e2e/**', 'apps/service/**', '**/*.config.*'],
    languageOptions: { globals: globals.nodeBuiltin },
  },
  {
    files: ['apps/web/src/**', 'packages/frontend/src/**', 'app/**/*.tsx', 'components/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.{cjs,cts}'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
];
