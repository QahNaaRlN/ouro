import {defineConfig} from '@playwright/test';

const port=Number(process.env.OURO_E2E_PORT??3442),dataDir=process.env.OURO_E2E_DATA_DIR;
if(!dataDir||!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Нужны собственный профиль и корректный port.');
/** Сохраняет собственные visual fixtures отдельно от обычного functional CI. */
export default defineConfig({testDir:'./e2e',testMatch:['tailwind-agents.browser.ts','agents.spec.ts','agent-clients.spec.ts'],workers:1,fullyParallel:false,retries:0,use:{baseURL:`http://127.0.0.1:${port}`,headless:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'},webServer:{command:`node scripts/local-next.mjs start --port ${port}`,url:`http://127.0.0.1:${port}/api/health`,reuseExistingServer:false,timeout:120000,gracefulShutdown:{signal:'SIGTERM',timeout:10000},env:{OURO_DATA_DIR:dataDir}},reporter:'list'});
