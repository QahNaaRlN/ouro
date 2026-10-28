import { defineConfig } from '@playwright/test';
const port=Number(process.env.OURO_E2E_PORT??3100);
const baseURL=`http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './e2e', fullyParallel:false, workers:1,
  use:{baseURL, headless:true, viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',args:['--no-sandbox']}},
  webServer:{command:`npm run dev -- --port ${port}`,url:baseURL,reuseExistingServer:!process.env.CI,timeout:120000,env:{OURO_DATA_DIR:process.env.OURO_E2E_DATA_DIR??'/tmp/ouro-e2e-postgres'}},
  reporter:'list',
});
