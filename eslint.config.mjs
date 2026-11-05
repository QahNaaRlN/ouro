import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

/** Начальная область owned source; правила включаются после actual positive и meaningful RED. */
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

/** Bootstrap parser/plugins; это еще не действующий lint gate и не recommended preset. */
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
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {},
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
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
