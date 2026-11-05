import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url)),
  port = 3483;
/** Проверяет реальные hooks в отдельном host fixture без API и без рабочего профиля. */
export default defineConfig({
  testDir: '../../tests/browser',
  testMatch: 'catalog-read.spec.ts',
  workers: 1,
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: path.join(root, 'apps/web'),
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
  reporter: 'list',
});
