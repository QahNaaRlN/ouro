import { defineConfig, mergeConfig, type Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import applicationConfig from './vite.config';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
/** Сохраняет реальную production resolution policy; меняется только test-only HTML entry. */
export default defineConfig((environment) =>
  mergeConfig(applicationConfig(environment), {
    plugins: [
      {
        name: 'ouro-i18n-qualification-module-inventory',
        generateBundle() {
          const modules = [...this.getModuleIds()]
            .map((file) => file.replaceAll('\\', '/'))
            .filter((file) => /\/node_modules\/(?:react-i18next|i18next)\//.test(file))
            .map((file) => path.relative(repositoryRoot, file).replaceAll('\\', '/'))
            .sort();
          this.emitFile({
            type: 'asset',
            fileName: 'i18n-module-graph.json',
            source: JSON.stringify({ modules }, null, 2) + '\n',
          });
        },
      } satisfies Plugin,
    ],
    build: {
      outDir: path.join(repositoryRoot, '.operations/i18n-production'),
      rollupOptions: {
        input: fileURLToPath(new URL('./tests/fixtures/typed-russian-i18n.html', import.meta.url)),
      },
    },
  }),
);
