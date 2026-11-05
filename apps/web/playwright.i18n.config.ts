import {defineConfig} from '@playwright/test';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../..',import.meta.url)),port=3493,production=process.env.OURO_I18N_PRODUCTION==='1';
/** Проверяет production Provider на двух реальных installation trees без SQL/profile. */
export default defineConfig({testDir:'../../tests/browser',testMatch:'typed-russian-i18n.spec.ts',outputDir:path.join(root,'test-results/typed-russian-i18n'+(production?'-production':'')),workers:1,retries:0,captureGitInfo:{commit:false,diff:false},use:{baseURL:`http://127.0.0.1:${port}`,headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},webServer:{command:production?'node tests/fixtures/i18n-preview-server.mjs':`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,cwd:path.join(root,'apps/web'),url:`http://127.0.0.1:${port}/tests/fixtures/typed-russian-i18n.html`,reuseExistingServer:false,timeout:30000,gracefulShutdown:{signal:'SIGTERM',timeout:5000}},reporter:'list'});
