import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir =
    process.env.OURO_E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'ouro-verification-tailwind-')),
  port = Number(process.env.OURO_E2E_PORT ?? 3390);
process.env.OURO_E2E_DATA_DIR = dataDir;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid isolated port.');

/** Только собственный production profile; global multiproject setup не запускается. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: `${dataDir}/verification-results`,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    actionTimeout: 10000,
  },
  webServer: {
    command: `node scripts/local-next.mjs start --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
    env: { OURO_DATA_DIR: dataDir },
  },
});
