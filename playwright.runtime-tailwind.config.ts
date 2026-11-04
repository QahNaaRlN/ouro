import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';

const dataDir=process.env.OURO_E2E_DATA_DIR,apiPort=Number(process.env.OURO_E2E_PORT??3376),webPort=apiPort+1;
if(!dataDir)throw new Error('Set an isolated OURO_E2E_DATA_DIR for runtime qualification.');
if(!Number.isInteger(apiPort)||apiPort<1||webPort>65535)throw new Error('Invalid isolated ports.');

/** Production oracle и renderer используют один собственный профиль и настоящий same-origin client transport. */
export default defineConfig({
 testDir:'./e2e',testMatch:'tailwind-runtime.spec.ts',fullyParallel:false,workers:1,retries:0,outputDir:`${dataDir}/runtime-results`,
 use:{baseURL:`http://127.0.0.1:${webPort}`,headless:true,viewport:{width:1440,height:1000},reducedMotion:'reduce',trace:'retain-on-failure',actionTimeout:10000},
 webServer:[
  {command:`node scripts/local-next.mjs start --port ${apiPort}`,url:`http://127.0.0.1:${apiPort}/api/health`,reuseExistingServer:false,timeout:120000,gracefulShutdown:{signal:'SIGTERM',timeout:10000},env:{OURO_DATA_DIR:dataDir}},
  {command:`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${webPort} --strictPort`,cwd:resolve(process.env.OURO_RUNTIME_RENDERER_ROOT??'apps/web'),url:`http://127.0.0.1:${webPort}/tests/fixtures/runtime-presentation.html`,reuseExistingServer:false,timeout:60000,gracefulShutdown:{signal:'SIGTERM',timeout:5000},env:{OURO_WEB_API_ORIGIN:`http://127.0.0.1:${apiPort}`}},
 ],
});
