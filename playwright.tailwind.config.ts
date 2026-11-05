import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const port = Number(process.env.OURO_E2E_PORT ?? 3364);
const baseURL = `http://127.0.0.1:${port}`;
const dataDir = process.env.OURO_E2E_DATA_DIR;
if (!dataDir)
  throw new Error('Укажите отдельный OURO_E2E_DATA_DIR для проверки Tailwind-примитивов.');

/** Текущий Next adapter для изолированной проверки; webpack обходит Windows junction-ограничение Turbopack/PGlite. */
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL },
  webServer: {
    command: `npm run dev -- --webpack --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
    env: { OURO_DATA_DIR: dataDir },
  },
});
