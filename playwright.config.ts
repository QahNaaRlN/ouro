import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel:false, workers:1,
  use:{baseURL:'http://127.0.0.1:3100', headless:true, viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',args:['--no-sandbox']}},
  webServer:{command:'npm run dev -- --port 3100',url:'http://127.0.0.1:3100',reuseExistingServer:!process.env.CI,timeout:120000,env:{OURO_DATA_DIR:'/tmp/ouro-e2e-postgres'}},
  reporter:'list',
});
