import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const apiPort = 3467,
  webPort = 3468;
const dataDir = mkdtempSync(path.join(tmpdir(), 'ouro-vite-shell-'));

/** Квалифицирует собранный React shell на изолированном существующем API до service cutover. */
export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: `node scripts/local-next.mjs start --port ${apiPort}`,
      cwd: repositoryRoot,
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 120000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
      env: { OURO_DATA_DIR: dataDir },
    },
    {
      command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${webPort} --strictPort`,
      cwd: path.join(repositoryRoot, 'apps/web'),
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 30000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      env: { OURO_WEB_API_ORIGIN: `http://127.0.0.1:${apiPort}` },
    },
  ],
  reporter: 'list',
});
