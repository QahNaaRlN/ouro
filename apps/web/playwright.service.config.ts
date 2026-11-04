import {defineConfig} from '@playwright/test';

const port=Number(process.env.OURO_SERVICE_WEB_PORT??'3528');
if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid service web browser port.');
/** Выполняет прежние шесть browser cases на built Vite, обслуживаемом только ordinary service. */
export default defineConfig({testDir:'./tests',testMatch:'navigation.spec.ts',workers:1,fullyParallel:false,retries:0,globalSetup:'./tests/fixtures/service-web-setup.ts',use:{baseURL:`http://127.0.0.1:${port}`,headless:true,viewport:{width:1440,height:1000}},reporter:'list'});
