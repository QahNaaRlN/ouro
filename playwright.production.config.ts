import {defineConfig} from '@playwright/test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const port=Number(process.env.OURO_E2E_PORT??3358);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('OURO_E2E_PORT must be a valid TCP port.');
const baseURL=`http://127.0.0.1:${port}`;
const dataDir=process.env.OURO_E2E_DATA_DIR??mkdtempSync(join(tmpdir(),'ouro-production-e2e-'));

export default defineConfig({
 testDir:'./e2e',fullyParallel:false,workers:1,retries:0,
 use:{baseURL,headless:true,viewport:{width:1440,height:1000},launchOptions:{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']}},
 webServer:{command:`node scripts/local-next.mjs start --port ${port}`,url:baseURL,reuseExistingServer:false,timeout:120000,gracefulShutdown:{signal:'SIGTERM',timeout:10000},env:{OURO_DATA_DIR:dataDir}},
 reporter:[['list'],['json',{outputFile:'test-results/production-results.json'}]],
});
