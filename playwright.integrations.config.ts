import { defineConfig } from '@playwright/test';

const port = Number(process.env.OURO_E2E_PORT ?? 3392),
  dataDir = process.env.OURO_E2E_DATA_DIR;
if (!dataDir)
  throw new Error('Укажите отдельный OURO_E2E_DATA_DIR для проверки integration presentation.');
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Некорректный OURO_E2E_PORT.');

/** Проверяет production CSS на отдельном профиле без повторного изменения visual fixture через global setup. */
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `node scripts/local-next.mjs start --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
    env: { OURO_DATA_DIR: dataDir },
  },
  reporter: 'list',
});
