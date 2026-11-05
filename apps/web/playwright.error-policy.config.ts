import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url)),
  port = 3492;
/** Собственный renderer fixture проверяет реальные boundary/Query/capture без API профиля и production fault hooks. */
export default defineConfig({
  testDir: '../../tests/browser',
  testMatch: 'client-error-boundary.spec.ts',
  outputDir: path.join(root, 'test-results/client-errors'),
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
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
