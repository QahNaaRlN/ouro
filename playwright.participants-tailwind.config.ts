import {defineConfig} from '@playwright/test';

const port=Number(process.env.OURO_E2E_PORT??3368),dataDir=process.env.OURO_E2E_DATA_DIR;
if(!dataDir)throw new Error('Set an isolated OURO_E2E_DATA_DIR for participant style qualification.');
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid isolated HTTP port.');

/** Production-адаптер ограниченной проверки оформления и отдельных идентичностей участников. */
export default defineConfig({
 testDir:'./e2e',fullyParallel:false,workers:1,retries:0,
 use:{baseURL:`http://127.0.0.1:${port}`,headless:true,viewport:{width:1440,height:1000},reducedMotion:'reduce',trace:'retain-on-failure'},
 webServer:{command:`node scripts/local-next.mjs start --port ${port}`,url:`http://127.0.0.1:${port}`,reuseExistingServer:false,timeout:120000,gracefulShutdown:{signal:'SIGTERM',timeout:10000},env:{OURO_DATA_DIR:dataDir}},
});
