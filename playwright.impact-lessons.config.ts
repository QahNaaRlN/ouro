import { defineConfig } from '@playwright/test';

const port = Number(process.env.OURO_E2E_PORT ?? 3402),
  dataDir = process.env.OURO_E2E_DATA_DIR;
if (!dataDir) throw new Error('Укажите собственный OURO_E2E_DATA_DIR.');
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Некорректный port проверки.');

/** Статический HTML readiness не открывает SQL owner до закрытия fixture setup. */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'tailwind-impact-lessons.browser.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  globalSetup: './e2e/impact-lessons-global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  },
  webServer: {
    command: `node scripts/local-next.mjs start --port ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 120000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
    env: { OURO_DATA_DIR: dataDir },
  },
  reporter: 'list',
});
